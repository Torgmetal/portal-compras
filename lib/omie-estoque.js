// Sincronização de estoque com o Omie ERP
//
// Endpoints usados (todos confirmados via documentação oficial Omie):
//   ListarPosEstoque     — posição de estoque por data (qtd, cmc, descricao)
//   ListarFamilias       — todas as famílias cadastradas no Omie
//   ListarProdutos       — lista produtos; filtrar_apenas_familia filtra por família
//   ConsultarProduto     — detalhe de um produto (família) via código externo
//   ListarLocaisEstoque  — locais de estoque (Fábrica, Almoxarifado…)
//
// Fluxo de enriquecimento de família:
//   1ª opção: ListarProdutos(filtrar_apenas_familia) para cada família → rápido
//   Fallback: ConsultarProduto individual (20 paralelos, timeout 3s, budget 25s)

import { prisma, prismaDirect } from "@/lib/prisma";
import { aplicarAlocacaoMovimentacao } from "@/lib/estoque-alocacao";

const URL_ESTOQUE  = "https://app.omie.com.br/api/v1/estoque/consulta/";
const URL_PRODUTO  = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_FAMILIAS = "https://app.omie.com.br/api/v1/geral/familias/";
const URL_LOCAL    = "https://app.omie.com.br/api/v1/estoque/localestoque/";
const URL_MOV      = "https://app.omie.com.br/api/v1/estoque/movestoque/";

// Timeout curto por chamada (3s) — evita que endpoint travado bloqueie o sync
const CALL_TIMEOUT_MS = 3000;

async function omie(url, call, param) {
  const key    = process.env.OMIE_APP_KEY;
  const secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("OMIE_APP_KEY/SECRET não configurados");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const data = await res.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

function hoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

const isMP = (s) => /mat[eé]ria[\s_-]*prima/i.test(s || "");

// Bulk UPDATE de família/categoria seguindo o padrão anti-OOM do CLAUDE.md:
// prismaDirect (sem pooler) + statement CONSTANTE com UNNEST + arrays passados
// como literais de texto (não gera 1 plano cacheado por tamanho de lote).
// rows: [{ cod, cat, label, torg }]
const SQL_FAMILIAS = `
  UPDATE "EstoqueItem" AS e
  SET "categoriaOmie" = v.cat,
      "categoriaLabel" = v.label,
      "estoqueTorg"    = v.torg
  FROM UNNEST($1::text[], $2::text[], $3::text[], $4::boolean[]) AS v(cod, cat, label, torg)
  WHERE e."codigoOmie" = v.cod
`;
const litTxt = (e) => e == null ? "NULL" : `"${String(e).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const pgText = (vals) => `{${vals.map(litTxt).join(",")}}`;
const pgBool = (vals) => `{${vals.map((b) => b == null ? "NULL" : b ? "true" : "false").join(",")}}`;

async function aplicarFamiliasBulk(rows) {
  if (!rows || rows.length === 0) return;
  await prismaDirect.$executeRawUnsafe(
    SQL_FAMILIAS,
    pgText(rows.map((r) => r.cod)),
    pgText(rows.map((r) => r.cat)),
    pgText(rows.map((r) => r.label)),
    pgBool(rows.map((r) => r.torg)),
  );
}

export async function getConfigEstoque() {
  return (await prisma.configEstoque.findFirst())
    ?? (await prisma.configEstoque.create({ data: { categoriasOmie: [] } }));
}

// ─── sincronizarCatalogo ─────────────────────────────────────────────────────
// Catálogo COMPLETO do Omie (ListarProdutos) → EstoqueItem, p/ a busca por nome
// achar TODOS os produtos cadastrados, inclusive os SEM estoque.
//
// PEGADINHA: filtrar_apenas_omiepdv é OBRIGATÓRIO e default "S" (só PDV). A Torg
// não tem produtos de PDV, então sem "N" o ListarProdutos retorna 0 (era o bug
// de "produto novo não aparece"). Com "N" vêm os ~2.3k produtos, com família.
// Saldo NÃO é tocado aqui (é do ListarPosEstoque); produto novo entra com qtd 0.
const SQL_CATALOGO = `
  INSERT INTO "EstoqueItem"
    ("id","codigoOmie","descricao","categoriaOmie","categoriaLabel","unidade","estoqueTorg","ativo","qtdAtual","cmc","ultimaSincOmie","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, t.cod, t.descr, t.famcod, t.famlabel, t.un, t.torg, t.ativo, 0, 0, NOW(), NOW(), NOW()
  FROM UNNEST($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::boolean[],$7::boolean[]) AS t(cod,descr,famcod,famlabel,un,torg,ativo)
  ON CONFLICT ("codigoOmie") DO UPDATE SET
    "descricao"      = EXCLUDED."descricao",
    "categoriaOmie"  = EXCLUDED."categoriaOmie",
    "categoriaLabel" = EXCLUDED."categoriaLabel",
    "unidade"        = EXCLUDED."unidade",
    "estoqueTorg"    = EXCLUDED."estoqueTorg",
    "ativo"          = EXCLUDED."ativo",
    "ultimaSincOmie" = NOW(),
    "updatedAt"      = NOW()
`;

export async function sincronizarCatalogo() {
  const cat = [];
  const vistos = new Set();
  for (let pg = 1; pg <= 60; pg++) {
    let resp;
    try {
      resp = await omie(URL_PRODUTO, "ListarProdutos", { pagina: pg, registros_por_pagina: 500, filtrar_apenas_omiepdv: "N" });
    } catch { break; }
    const lista = resp.produto_servico_cadastro || resp.produto_cadastro || [];
    for (const p of lista) {
      const cod = String(p.codigo || "").trim();
      if (!cod || vistos.has(cod)) continue;
      vistos.add(cod);
      const famLabel = String(p.descricao_familia || "").trim() || null;
      cat.push({
        cod,
        desc: (String(p.descricao || "").trim() || cod),
        un: (String(p.unidade || "UN").trim().toUpperCase() || "UN"),
        famCod: (String(p.codigo_familia || "").trim() || "N/A"),
        famLabel,
        torg: isMP(famLabel),
        ativo: String(p.inativo || "N").toUpperCase() !== "S",
      });
    }
    const totalPags = Number(resp.total_de_paginas || 1);
    if (pg >= totalPags || lista.length === 0) break;
    await sleep(150);
  }
  if (!cat.length) return { catalogo: 0 };
  const SUB = 500;
  for (let i = 0; i < cat.length; i += SUB) {
    const lote = cat.slice(i, i + SUB);
    await prismaDirect.$executeRawUnsafe(
      SQL_CATALOGO,
      pgText(lote.map((r) => r.cod)),
      pgText(lote.map((r) => r.desc)),
      pgText(lote.map((r) => r.famCod)),
      pgText(lote.map((r) => r.famLabel)),
      pgText(lote.map((r) => r.un)),
      pgBool(lote.map((r) => r.torg)),
      pgBool(lote.map((r) => r.ativo)),
    );
    await sleep(40);
  }
  return { catalogo: cat.length };
}

// ─── sincronizarProdutos ───────────────────────────────────────────────────────
export async function sincronizarProdutos() {
  const cfg  = await getConfigEstoque();
  const data = hoje();
  let criados = 0, atualizados = 0, zerados = 0, enriquecidos = 0, catalogo = 0;

  // 0. Catálogo completo (todos os produtos cadastrados, inclusive sem estoque)
  try { catalogo = (await sincronizarCatalogo()).catalogo; }
  catch (e) { console.warn("[sincronizarProdutos] catálogo falhou:", e?.message); }

  // Corrige produtos marcados N/A sem label (bug de versão anterior)
  await prisma.estoqueItem.updateMany({
    where: { categoriaOmie: "N/A", categoriaLabel: null },
    data:  { categoriaOmie: "" },
  });

  // ── 1. ListarLocaisEstoque ─────────────────────────────────────────────────
  // Nome correto documentado: ListarLocaisEstoque (não ListarLocalEstoque)
  let locais = [];
  try {
    const resp = await omie(URL_LOCAL, "ListarLocaisEstoque", { pagina: 1, registros_por_pagina: 50 });
    const lista = resp.listaLocaisEstoque || resp.lista_local_estoque || resp.cadastros || [];
    locais = lista
      .map(l => ({ cod: Number(l.nCodLocal || l.codigo || 0), nome: String(l.cDescricao || l.cNome || "").trim() }))
      .filter(l => l.cod > 0 && l.nome);
  } catch { /* ignora — endpoint opcional */ }

  // ── 2. ListarPosEstoque (aggregate) ───────────────────────────────────────
  const pos = new Map();
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

  // ── 2b. ListarPosEstoque por local ─────────────────────────────────────────
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
        if (cod && qtd > 0 && pos.has(cod)) {
          pos.get(cod).locaisQtd[String(local.cod)] = qtd;
        }
      }
      const totalPags = Number(resp.nTotPaginas || resp.total_de_paginas || 1);
      if (pg >= totalPags || (resp.produtos || []).length === 0) break;
    }
  }

  // ── 3. Bulk DB upsert ──────────────────────────────────────────────────────
  const todosCods = [...pos.keys()];
  const existentes = new Set(
    (await prisma.estoqueItem.findMany({
      where:  { codigoOmie: { in: todosCods } },
      select: { codigoOmie: true },
    })).map(e => e.codigoOmie)
  );

  const novos = [...pos.entries()]
    .filter(([c]) => !existentes.has(c))
    .map(([, d]) => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao, unidade: d.unidade,
      cmc: d.cmc, qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd,
      ativo: true, categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    }));
  if (novos.length > 0) {
    await prisma.estoqueItem.createMany({ data: novos, skipDuplicates: true });
    criados = novos.length;
  }

  const updates = [...pos.entries()]
    .filter(([c]) => existentes.has(c))
    .map(([, d]) => prisma.estoqueItem.updateMany({
      where: { codigoOmie: d.codigoOmie },
      data:  { descricao: d.descricao, unidade: d.unidade, cmc: d.cmc,
               qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd, ativo: true,
               ultimaSincOmie: new Date() },
    }));
  for (let i = 0; i < updates.length; i += 4) await Promise.all(updates.slice(i, i + 4));
  atualizados = updates.length;

  // ── 4. Zera produtos fora do posEstoque ────────────────────────────────────
  const r = await prisma.estoqueItem.updateMany({
    where: { codigoOmie: { notIn: [...pos.keys()] }, qtdAtual: { gt: 0 } },
    data:  { qtdAtual: 0, locaisQtd: {} },
  });
  zerados = r.count;

  // ── 5. Enriquecimento de família — só quando o catálogo NÃO veio (o catálogo
  //    de produtos já traz a família por produto). Evita chamadas extras/timeout.
  if (catalogo === 0) {
  // 5a. ListarFamilias → mapa e lista de códigos
  const familiasMap  = {}; // { cod: label }
  const familiaCods  = []; // ["3.1", "5.2", ...]
  try {
    const resp = await omie(URL_FAMILIAS, "ListarFamilias", { pagina: 1, registros_por_pagina: 200 });
    const lista = resp.familia_cadastro || resp.familias_cadastro || resp.familias || [];
    for (const f of lista) {
      const cod   = String(f.cCodFamilia || f.nCodFamilia || f.codigo || f.codigo_familia || "").trim();
      const label = String(f.cDesFamilia || f.descricao   || f.cDescricao || "").trim();
      if (cod && label) { familiasMap[cod] = label; familiaCods.push(cod); }
    }
  } catch { /* ignora */ }

  // 5b. ListarProdutos por família (abordagem documentada Omie)
  // filtrar_apenas_familia = código da família → retorna todos os produtos dessa família
  const prodFamilias = {}; // { codigoExterno: { cat, label } }
  let listaProdutosOk = false;

  for (const famCod of familiaCods) {
    try {
      const resp = await omie(URL_PRODUTO, "ListarProdutos", {
        pagina: 1, registros_por_pagina: 500,
        filtrar_apenas_familia: famCod,
      });
      const lista = resp.produto_servico_cadastro || resp.produto_cadastro || resp.registros || [];
      if (lista.length > 0) {
        listaProdutosOk = true;
        for (const p of lista) {
          // codigo = código de integração externo (campo documentado)
          const cod = String(p.codigo || p.codigo_produto_integracao || "").trim();
          if (cod) {
            prodFamilias[cod] = { cat: famCod, label: familiasMap[famCod] || "" };
          }
        }
      }
    } catch { /* continua para próxima família */ }
  }

  // 5c. Aplica famílias via bulk SQL UPDATE (único query, sem loop de updateMany)
  if (listaProdutosOk && Object.keys(prodFamilias).length > 0) {
    const todosCodigos = new Set(todosCods);
    const rows = [];
    for (const [cod, { cat, label }] of Object.entries(prodFamilias)) {
      if (!todosCodigos.has(cod)) continue;
      rows.push({ cod, cat: cat || "N/A", label: label || null, torg: isMP(label) });
      if (label) enriquecidos++;
    }
    await aplicarFamiliasBulk(rows);
    // Marca como N/A os que não estão em nenhuma família do Omie
    await prisma.estoqueItem.updateMany({
      where: { categoriaOmie: "" },
      data:  { categoriaOmie: "N/A", categoriaLabel: null },
    });

  } else {
    // 5d. Fallback: ConsultarProduto individual (20 paralelos, budget 25s)
    // Parâmetro correto: { codigo: codigoExterno } — documentado como campo de integração
    const semFamilia = await prisma.estoqueItem.findMany({
      where:   { categoriaOmie: "" },
      select:  { codigoOmie: true },
    });

    const enrichBudget = Date.now() + 25_000; // 25s budget para não estourar os 60s do Vercel

    for (let i = 0; i < semFamilia.length; i += 20) {
      if (Date.now() > enrichBudget) break; // para quando acabar o budget

      const lote = semFamilia.slice(i, i + 20);
      const resultados = await Promise.all(lote.map(async ({ codigoOmie }) => {
        try {
          const det = await omie(URL_PRODUTO, "ConsultarProduto", { codigo: codigoOmie });
          return {
            cod:   codigoOmie,
            cat:   String(det.codigo_familia   || "").trim() || "N/A",
            label: String(det.descricao_familia || "").trim() || null,
          };
        } catch { return { cod: codigoOmie, cat: "N/A", label: null }; }
      }));

      const rows = resultados.map(({ cod, cat, label }) => ({ cod, cat, label, torg: isMP(label) }));
      await aplicarFamiliasBulk(rows);
      enriquecidos += resultados.filter(r => r.label).length;
    }
  }

  } // fim do enriquecimento de família (só quando catalogo === 0)

  // Salva locais e timestamp
  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: {
      ultimaSincProd: new Date(),
      ...(locais.length > 0 && { locaisOmie: locais }),
    },
  });

  return {
    total: pos.size, catalogo, criados, atualizados, zerados, enriquecidos,
    locais: locais.length,
    fonteUsada: catalogo > 0 ? "Catálogo (ListarProdutos omiepdv=N)" : "ConsultarProduto",
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
            itemEstoqueId:  item.id,
            tipo,
            origem:         tipo === "ENTRADA" ? "OMIE_NF" : tipo === "SAIDA" ? "OMIE_BAIXA" : "MANUAL",
            quantidade:     qtd,
            cmcMomento:     Number(mov.nCMC || item.cmc || 0),
            observacao:     mov.cObservacao || null,
            syncCodigoOmie: syncCod,
            createdAt:      parseDateOmie(mov.dData),
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
