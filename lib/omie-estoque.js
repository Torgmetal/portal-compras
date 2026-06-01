// Sincronização de estoque com o Omie ERP
//
// Endpoints que FUNCIONAM para esta conta:
//   ListarLocalEstoque   — locais de estoque (Fábrica, Almoxarifado, etc.)
//   ListarPosEstoque     — posição de estoque por data, filtrável por nCodLocal
//   ObterEstoqueProduto  — busca produtos por código (max 50/chamada)
//   ConsultarProduto     — detalhes de um produto (família) via codigo_integracao
//
// Endpoint QUEBRADO para esta conta (erro 4474 silencioso):
//   ListarProdutos / ListarProdutosResumido — retornam [] sem mensagem de erro

import { prisma } from "@/lib/prisma";
import { aplicarAlocacaoMovimentacao } from "@/lib/estoque-alocacao";

const URL_LOCAL    = "https://app.omie.com.br/api/v1/estoque/localestoque/";
const URL_ESTOQUE  = "https://app.omie.com.br/api/v1/estoque/consulta/";
const URL_RESUMO   = "https://app.omie.com.br/api/v1/estoque/resumo/";
const URL_PRODUTO  = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_FAMILIAS = "https://app.omie.com.br/api/v1/geral/familias/";
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
//   0. ListarLocalEstoque → locais disponíveis (Fábrica, Almoxarifado…)
//   1a. ListarPosEstoque (aggregate) → qtdAtual + cmc + descricao de todos os produtos
//   1b. ListarPosEstoque por local → qtd em cada local (locaisQtd)
//   2. ObterEstoqueProduto → descobre produtos fora do posEstoque (qtd=0)
//   3. Bulk DB: createMany novos + updateMany em lotes de 4 (respeita pool)
//   4. Zera qtd dos que saíram do posEstoque hoje
//   5. Enriquecimento de família — duas estratégias:
//      5a. ListarProdutos (paginado, filtro de data) → todas as famílias de uma vez
//      5b. Fallback: ConsultarProduto individual para os que ainda não têm família
export async function sincronizarProdutos() {
  const cfg  = await getConfigEstoque();
  const data = hoje();
  let criados = 0, atualizados = 0, zerados = 0, enriquecidos = 0;

  // Reset de produtos com "N/A" que podem ter sido marcados erroneamente
  // (bug na versão anterior que usava parâmetro "codigo_integracao" errado)
  await prisma.estoqueItem.updateMany({
    where: { categoriaOmie: "N/A", categoriaLabel: null },
    data:  { categoriaOmie: "" },
  });

  // ── 0. ListarLocalEstoque ──────────────────────────────────────────────────
  // Busca todos os locais de estoque cadastrados no Omie.
  let locais = []; // [{ cod: 1, nome: "01 - Fábrica" }, ...]
  try {
    const resp = await omie(URL_LOCAL, "ListarLocalEstoque", { nPagina: 1, nRegPorPagina: 50 });
    const lista = resp.lista_local_estoque || resp.localEstoque || resp.cadastros || [];
    locais = lista
      .map(l => ({
        cod:  Number(l.nCodLocal  || l.nCodigo || 0),
        nome: String(l.cDescricao || l.cNome   || "").trim(),
      }))
      .filter(l => l.cod > 0 && l.nome);
  } catch { /* endpoint opcional — ignora se falhar */ }

  // ── 1a. ListarPosEstoque (aggregate, sem nCodLocal) ────────────────────────
  // Coleta qtdAtual total, cmc e descricao de todos os produtos com saldo hoje.
  const pos = new Map(); // codigoOmie → { descricao, unidade, cmc, qtdAtual, locaisQtd: {} }
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
        locaisQtd:  {},
      });
    }
    const totalPags = Number(resp.nTotPaginas || resp.total_de_paginas || 1);
    if (pg >= totalPags || (resp.produtos || []).length === 0) break;
    await sleep(100);
  }

  // ── 1b. ListarPosEstoque por local ─────────────────────────────────────────
  // Para cada local de estoque, registra a qtd individual no produto.
  for (const local of locais) {
    for (let pg = 1; ; pg++) {
      let resp;
      try {
        resp = await omie(URL_ESTOQUE, "ListarPosEstoque", {
          nPagina: pg, nRegPorPagina: 200, dDataPosicao: data, nCodLocal: local.cod,
        });
      } catch { break; }

      for (const p of (resp.produtos || [])) {
        const cod = String(p.cCodigo || "").trim();
        const qtd = Number(p.nSaldo ?? p.nFisico ?? 0);
        if (cod && qtd > 0) {
          if (!pos.has(cod)) continue; // só registra locais de produtos já no aggregate
          pos.get(cod).locaisQtd[String(local.cod)] = qtd;
        }
      }
      const totalPags = Number(resp.nTotPaginas || resp.total_de_paginas || 1);
      if (pg >= totalPags || (resp.produtos || []).length === 0) break;
      await sleep(50);
    }
  }

  // ── 2. ObterEstoqueProduto — descoberta de produtos fora do posEstoque ─────
  const codsNoBanco = (await prisma.estoqueItem.findMany({ select: { codigoOmie: true } }))
    .map(e => e.codigoOmie);

  const prefixos = [...new Set([
    ...codsNoBanco.map(c => c.slice(0, 3)).filter(p => /^\w{3}$/.test(p)),
    "DV0", "DV1", "ARM", "SRV", "MLB", "101", "102", "103", "104", "105",
  ])].slice(0, 25);

  const fora = new Map();
  for (const pref of prefixos) {
    let resp;
    try {
      resp = await omie(URL_RESUMO, "ObterEstoqueProduto", { xCodigo: pref });
    } catch { continue; }

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

  const novos = [
    ...[...pos.entries()].filter(([c]) => !existentes.has(c)).map(([, d]) => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao, unidade: d.unidade,
      cmc: d.cmc, qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd, ativo: true,
      categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    })),
    ...[...fora.entries()].filter(([c]) => !existentes.has(c)).map(([, d]) => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao, unidade: d.unidade,
      cmc: 0, qtdAtual: 0, locaisQtd: {}, ativo: true,
      categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    })),
  ];
  if (novos.length > 0) {
    await prisma.estoqueItem.createMany({ data: novos, skipDuplicates: true });
    criados = novos.length;
  }

  // Atualiza existentes do posEstoque em lotes de 4 (connection_limit = 5)
  const updates = [...pos.entries()]
    .filter(([c]) => existentes.has(c))
    .map(([, d]) => prisma.estoqueItem.updateMany({
      where: { codigoOmie: d.codigoOmie },
      data:  { descricao: d.descricao, unidade: d.unidade, cmc: d.cmc,
               qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd, ativo: true,
               ultimaSincOmie: new Date() },
    }));
  for (let i = 0; i < updates.length; i += 4) {
    await Promise.all(updates.slice(i, i + 4));
  }
  atualizados = updates.length;

  // ── 4. Zera produtos que saíram do posEstoque ──────────────────────────────
  const r = await prisma.estoqueItem.updateMany({
    where: { codigoOmie: { notIn: [...pos.keys()] }, qtdAtual: { gt: 0 } },
    data:  { qtdAtual: 0, locaisQtd: {} },
  });
  zerados = r.count;

  // ── 5. Enriquecimento de família ───────────────────────────────────────────

  // 5a. ListarFamilias → mapa código → label (para lookup rápido)
  const familiasMap = {}; // { "123": "Matéria Prima", ... }
  try {
    const resp = await omie(URL_FAMILIAS, "ListarFamilias", { pagina: 1, registros_por_pagina: 200 });
    const lista = resp.familia_cadastro || resp.familias_cadastro || resp.lista_familias || resp.familias || [];
    for (const f of lista) {
      const cod   = String(f.cCodFamilia || f.nCodFamilia || f.codigo || f.codigo_familia || "").trim();
      const label = String(f.cDesFamilia || f.descricao   || f.cDescricao || f.descricao_familia || "").trim();
      if (cod && label) familiasMap[cod] = label;
    }
  } catch { /* ignora — lookup apenas */ }

  // 5b. ListarProdutos paginado (filtro de data) → famílias de todos os produtos
  // Estratégia principal: mais rápida que 1000 ConsultarProduto individuais.
  const dtFinal = data; // reutiliza o "hoje" já calculado
  const dtInicio = "01/01/2010";
  const prodFamilias = {}; // { codigoOmie: { cod, label } }
  let usouListarProdutos = false;

  for (let pg = 1; ; pg++) {
    let resp;
    try {
      resp = await omie(URL_PRODUTO, "ListarProdutos", {
        pagina: pg, registros_por_pagina: 200,
        filtrar_por_data_de: dtInicio, filtrar_por_data_ate: dtFinal,
      });
    } catch { break; }

    const lista = resp.produto_servico_cadastro || resp.produto_cadastro || resp.registros || [];
    if (lista.length === 0) break;

    for (const p of lista) {
      const cod       = String(p.codigo || p.codigo_produto_integracao || "").trim();
      const codFamilia = String(p.codigo_familia || "").trim();
      const labelDireto = String(p.descricao_familia || "").trim();
      if (!cod) continue;
      prodFamilias[cod] = {
        cod:   codFamilia || "N/A",
        label: labelDireto || familiasMap[codFamilia] || null,
      };
    }

    usouListarProdutos = true;
    const totalPags = Number(resp.total_de_paginas || resp.nTotPaginas || 1);
    if (pg >= totalPags || lista.length === 0) break;
    await sleep(100);
  }

  // 5c. Aplica famílias vindas do ListarProdutos no banco (lotes de 4)
  if (usouListarProdutos && Object.keys(prodFamilias).length > 0) {
    const famUpdates = Object.entries(prodFamilias).map(([cod, { cod: categoriaOmie, label: categoriaLabel }]) =>
      prisma.estoqueItem.updateMany({
        where: { codigoOmie: cod },
        data: {
          categoriaOmie,
          categoriaLabel: categoriaLabel || null,
          estoqueTorg: /mat[eé]ria[\s_-]*prima/i.test(categoriaLabel || ""),
        },
      })
    );
    for (let i = 0; i < famUpdates.length; i += 4) {
      await Promise.all(famUpdates.slice(i, i + 4));
    }
    enriquecidos = Object.values(prodFamilias).filter(f => f.label).length;

    // Marca como N/A os que não estão em ListarProdutos (sem família no Omie)
    await prisma.estoqueItem.updateMany({
      where: { categoriaOmie: "" },
      data:  { categoriaOmie: "N/A", categoriaLabel: null },
    });
  } else {
    // 5d. Fallback: ConsultarProduto individual — parâmetro correto é "codigo"
    // Processa TODOS os sem família, em lotes de 20 paralelos
    const semFamilia = await prisma.estoqueItem.findMany({
      where:   { categoriaOmie: "" },
      select:  { codigoOmie: true },
    });

    for (let i = 0; i < semFamilia.length; i += 20) {
      await Promise.all(semFamilia.slice(i, i + 20).map(async ({ codigoOmie }) => {
        try {
          const det = await omie(URL_PRODUTO, "ConsultarProduto", {
            codigo: codigoOmie, // parâmetro correto para busca por código externo
          });
          const familiaLabel = String(det.descricao_familia || "").trim();
          const familiaCode  = String(det.codigo_familia   || "").trim();

          await prisma.estoqueItem.updateMany({
            where: { codigoOmie },
            data:  {
              categoriaOmie:  familiaCode  || "N/A",
              categoriaLabel: familiaLabel || familiasMap[familiaCode] || null,
              estoqueTorg:    /mat[eé]ria[\s_-]*prima/i.test(familiaLabel),
            },
          });
          if (familiaLabel) enriquecidos++;
        } catch { /* produto indisponível ou sem família — ignora */ }
      }));
    }
  }

  // Salva locais descobertos na config para uso na UI
  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data:  {
      ultimaSincProd: new Date(),
      ...(locais.length > 0 && { locaisOmie: locais }),
    },
  });

  return {
    total: pos.size + fora.size, criados, atualizados, zerados, enriquecidos,
    locais: locais.length,
    fonteUsada: "ListarPosEstoque+ObterEstoque",
  };
}

// ─── sincronizarMovimentacoes ──────────────────────────────────────────────────
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
