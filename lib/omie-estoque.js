// Sincronização de estoque com o Omie ERP — reescrita limpa
//
// Endpoints que FUNCIONAM para esta conta:
//   ListarPosEstoque  — produtos com posição de estoque hoje (qtd, cmc, descricao)
//   ObterEstoqueProduto — busca produtos por código (max 50/chamada)
//   ConsultarProduto  — detalhes de um produto (família, categoria) via codigo_integracao
//
// Endpoint QUEBRADO para esta conta (erro 4474 silencioso):
//   ListarProdutos / ListarProdutosResumido — retornam [] sem mensagem de erro

import { prisma } from "@/lib/prisma";
import { aplicarAlocacaoMovimentacao } from "@/lib/estoque-alocacao";

const URL_ESTOQUE  = "https://app.omie.com.br/api/v1/estoque/consulta/";
const URL_RESUMO   = "https://app.omie.com.br/api/v1/estoque/resumo/";
const URL_PRODUTO  = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_MOV      = "https://app.omie.com.br/api/v1/estoque/movestoque/";

// Chamada genérica à API do Omie
async function omie(url, call, param) {
  const key    = process.env.OMIE_APP_KEY;
  const secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("OMIE_APP_KEY/SECRET não configurados");

  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
  });
  const data = await res.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

// Helper — formata data como dd/mm/yyyy (formato Omie)
function hoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// Lê ou cria a configuração de estoque (singleton)
export async function getConfigEstoque() {
  return (await prisma.configEstoque.findFirst())
    ?? (await prisma.configEstoque.create({ data: { categoriasOmie: [] } }));
}

// ─── sincronizarProdutos ───────────────────────────────────────────────────────
// Fluxo:
//   1. ListarPosEstoque   → todos os produtos com estoque hoje (200/página)
//   2. ObterEstoqueProduto → produtos fora do posEstoque (qtd=0 historicamente)
//   3. Bulk DB: createMany novos + updateMany em lotes de 4 (respeita pool)
//   4. Zera qtd dos que saíram do posEstoque hoje
//   5. ConsultarProduto → enriquece família para até 15 sem família por sync
export async function sincronizarProdutos() {
  const cfg  = await getConfigEstoque();
  const data = hoje();
  let criados = 0, atualizados = 0, zerados = 0, enriquecidos = 0;

  // ── 1. ListarPosEstoque ────────────────────────────────────────────────────
  // Coleta todos os produtos com posição de estoque hoje em um Map.
  const pos = new Map(); // codigoOmie → { descricao, unidade, cmc, qtdAtual }
  for (let pg = 1; ; pg++) {
    let resp;
    try {
      resp = await omie(URL_ESTOQUE, "ListarPosEstoque", {
        nPagina: pg, nRegPorPagina: 200, dDataPosicao: data,
      });
    } catch { break; }

    for (const p of (resp.produtos || [])) {
      const cod = String(p.cCodigo || "").trim();
      if (!cod) continue;
      pos.set(cod, {
        codigoOmie: cod,
        descricao:  String(p.cDescricao || "").trim(),
        unidade:    String(p.cUnidade   || "UN").trim().toUpperCase(),
        cmc:        Number(p.nCMC   || 0),
        qtdAtual:   Number(p.nSaldo ?? p.nFisico ?? 0),
      });
    }
    const totalPags = Number(resp.nTotPaginas || resp.total_de_paginas || 1);
    if (pg >= totalPags || (resp.produtos || []).length === 0) break;
    await sleep(100); // pequena pausa entre páginas
  }

  // ── 2. ObterEstoqueProduto — descoberta de produtos fora do posEstoque ─────
  // Extrai prefixos de 3 caracteres dos produtos já no banco para guiar a busca.
  // Cada chamada retorna até 50 produtos cujo código contém o prefixo.
  const codsNoBanco = (await prisma.estoqueItem.findMany({ select: { codigoOmie: true } }))
    .map(e => e.codigoOmie);

  const prefixos = [...new Set([
    ...codsNoBanco.map(c => c.slice(0, 3)).filter(p => /^\w{3}$/.test(p)),
    "DV0", "DV1", "ARM", "SRV", "MLB", "101", "102", "103", "104", "105",
  ])].slice(0, 25);

  const fora = new Map(); // produtos descobertos fora do posEstoque
  for (const pref of prefixos) {
    let resp;
    try {
      resp = await omie(URL_RESUMO, "ObterEstoqueProduto", { xCodigo: pref });
    } catch { continue; } // endpoint opcional — ignora falhas individuais

    for (const p of (resp.listaProduto || [])) {
      const cod = String(p.cCodigo || "").trim();
      if (!cod || pos.has(cod) || fora.has(cod)) continue;
      fora.set(cod, {
        codigoOmie: cod,
        descricao:  String(p.cDescricao || "").trim(),
        unidade:    String(p.cUnidade   || "UN").trim().toUpperCase(),
      });
    }
  }

  // ── 3. Bulk DB upsert ──────────────────────────────────────────────────────
  const todosCods = [...pos.keys(), ...fora.keys()];
  const existentes = new Set(
    (await prisma.estoqueItem.findMany({
      where:  { codigoOmie: { in: todosCods } },
      select: { codigoOmie: true },
    })).map(e => e.codigoOmie)
  );

  // Cria produtos novos em batch
  const novos = [
    ...[...pos.entries()].filter(([c]) => !existentes.has(c)).map(([, d]) => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao, unidade: d.unidade,
      cmc: d.cmc, qtdAtual: d.qtdAtual, ativo: true,
      categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    })),
    ...[...fora.entries()].filter(([c]) => !existentes.has(c)).map(([, d]) => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao, unidade: d.unidade,
      cmc: 0, qtdAtual: 0, ativo: true,
      categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    })),
  ];
  if (novos.length > 0) {
    await prisma.estoqueItem.createMany({ data: novos, skipDuplicates: true });
    criados = novos.length;
  }

  // Atualiza existentes do posEstoque — lotes de 4 (connection_limit = 5)
  const updates = [...pos.entries()]
    .filter(([c]) => existentes.has(c))
    .map(([, d]) => prisma.estoqueItem.updateMany({
      where: { codigoOmie: d.codigoOmie },
      data:  { descricao: d.descricao, unidade: d.unidade, cmc: d.cmc,
               qtdAtual: d.qtdAtual, ativo: true, ultimaSincOmie: new Date() },
    }));
  for (let i = 0; i < updates.length; i += 4) {
    await Promise.all(updates.slice(i, i + 4));
  }
  atualizados = updates.length;

  // ── 4. Zera produtos que saíram do posEstoque ──────────────────────────────
  const r = await prisma.estoqueItem.updateMany({
    where: { codigoOmie: { notIn: [...pos.keys()] }, qtdAtual: { gt: 0 } },
    data:  { qtdAtual: 0 },
  });
  zerados = r.count;

  // ── 5. Enriquecimento de família via ConsultarProduto ──────────────────────
  // Usa codigo_integracao (= codigoOmie externo) para identificar o produto.
  // Processa 100 por sync em lotes de 10 paralelos (~4s) — os mais antigos primeiro.
  const semFamilia = await prisma.estoqueItem.findMany({
    where:   { categoriaOmie: "" },
    select:  { codigoOmie: true },
    take:    100,
    orderBy: { ultimaSincOmie: "asc" },
  });

  for (let i = 0; i < semFamilia.length; i += 10) {
    await Promise.all(semFamilia.slice(i, i + 10).map(async ({ codigoOmie }) => {
      try {
        const det = await omie(URL_PRODUTO, "ConsultarProduto", {
          codigo_produto: 0, codigo_integracao: codigoOmie,
        });
        const familiaLabel = String(det.descricao_familia || "").trim();
        const familiaCode  = String(det.codigo_familia   || "").trim();

        await prisma.estoqueItem.updateMany({
          where: { codigoOmie },
          data:  {
            categoriaOmie:  familiaCode  || "N/A",
            categoriaLabel: familiaLabel || null,
            estoqueTorg:    /mat[eé]ria[\s_-]*prima/i.test(familiaLabel),
          },
        });
        if (familiaLabel) enriquecidos++;
      } catch { /* produto indisponível ou sem família — ignora */ }
    }));
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data:  { ultimaSincProd: new Date() },
  });

  return { total: pos.size + fora.size, criados, atualizados, zerados, enriquecidos,
           fonteUsada: "ListarPosEstoque+ObterEstoque" };
}

// ─── sincronizarMovimentacoes ──────────────────────────────────────────────────
// Nota: ListarMovEstoque está com problema nesta conta (retorna {status, message}).
// A função tenta mas retorna 0 entradas/saídas sem lançar exceção.
export async function sincronizarMovimentacoes(diasAtras = 7) {
  const cfg = await getConfigEstoque();
  const ate = new Date();
  const de  = new Date(); de.setDate(de.getDate() - diasAtras);
  const fmt = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  let entradas = 0, saidas = 0;

  for (let pg = 1; ; pg++) {
    let resp;
    try {
      resp = await omie(URL_MOV, "ListarMovEstoque", {
        nPagina: pg, nRegPorPagina: 200,
        dDtInicial: fmt(de), dDtFinal: fmt(ate),
      });
    } catch { break; }

    const movs = resp.movimentos || [];
    if (movs.length === 0) break;

    for (const mov of movs) {
      const codigoOmie = String(mov.cCodProd || mov.codigo_produto || "");
      if (!codigoOmie) continue;

      const item = await prisma.estoqueItem.findUnique({ where: { codigoOmie } });
      if (!item) continue;

      const idMov = String(mov.nIdMov || mov.cCodIntMov || "");
      if (!idMov) continue;

      const syncCod = `omie-${idMov}`;
      const existe  = await prisma.estoqueMovimentacao.findUnique({ where: { syncCodigoOmie: syncCod } }).catch(() => null);
      if (existe) continue;

      const tipoOmie = String(mov.cTipoMov || mov.cMovimento || "").toUpperCase();
      const tipo     = tipoOmie.startsWith("E") ? "ENTRADA" : tipoOmie.startsWith("S") ? "SAIDA" : "AJUSTE";
      const qtd      = Math.abs(Number(mov.nQtde || mov.quantidade || 0));
      if (qtd <= 0) continue;

      try {
        const created = await prisma.estoqueMovimentacao.create({
          data: {
            itemEstoqueId:   item.id,
            tipo,
            origem:          tipo === "ENTRADA" ? "OMIE_NF" : tipo === "SAIDA" ? "OMIE_BAIXA" : "MANUAL",
            quantidade:      qtd,
            cmcMomento:      Number(mov.nCMC || item.cmc || 0),
            observacao:      mov.cObservacao || null,
            syncCodigoOmie:  syncCod,
            createdAt:       parseDateOmie(mov.dData),
          },
        });
        if (tipo === "ENTRADA") entradas++;
        else if (tipo === "SAIDA") {
          saidas++;
          await aplicarAlocacaoMovimentacao(created.id).catch(() => {});
        }
      } catch { /* dedup ou constraint — ignora */ }
    }

    const totalPags = Number(resp.nTotPaginas || 1);
    if (pg >= totalPags) break;
    await sleep(200);
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data:  { ultimaSincMov: new Date() },
  });

  return { entradas, saidas, total: entradas + saidas };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDateOmie(s) {
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : new Date();
}
