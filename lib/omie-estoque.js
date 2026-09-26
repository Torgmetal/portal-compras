// Sincronização de estoque com o Omie ERP
//
// Endpoints usados (todos confirmados via documentação oficial Omie):
//   ListarPosEstoque     — posição de estoque por data (qtd, cmc, descricao)
//   ListarFamilias       — todas as famílias cadastradas no Omie
//   ListarProdutos       — lista produtos; filtrar_apenas_familia filtra por família
//   ConsultarProduto     — detalhe de um produto (família) via código externo
//   ListarLocaisEstoque  — locais de estoque (Fábrica, Almoxarifado…)
//
// As MOVIMENTAÇÕES (entradas/saídas) moram em lib/omie-estoque-movimentos.js — até 24/09/2026 elas
// ficavam aqui, chamando um método que não existe no Omie, e nunca gravaram uma linha.
//
// Fluxo de enriquecimento de família:
//   1ª opção: ListarProdutos(filtrar_apenas_familia) para cada família → rápido
//   Fallback: ConsultarProduto individual (20 paralelos, timeout 3s, budget 25s)

import { prisma, prismaDirect } from "@/lib/prisma";
import { omieCall } from "@/lib/omie-call";
import { log } from "@/lib/log";
import { listarLocais, listarPosicao, consolidarPosicao } from "@/lib/omie-estoque-posicao";

const registro = log("omie-estoque");

const URL_PRODUTO  = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_FAMILIAS = "https://app.omie.com.br/api/v1/geral/familias/";

// ⚠ Prazo da leitura de locais + posição quando quem chama não passa o seu. As rotas têm `maxDuration`
// de 300 s: sobram 2 min para gravar e bater o ponto do monitor. Com 40 s num limite de 60, a rodada de
// 26/09 às 12h foi morta pela Vercel no meio da gravação (ver app/api/cron/estoque-produtos/route.js).
const PRAZO_POSICAO_MS = 180_000;

// Timeout curto por chamada (3s) — evita que endpoint travado bloqueie o sync.
// retryTransport:false preserva esse "pula rápido" (não reintenta timeout), mas
// ainda reintenta faultstring transitória do Omie ("Broken response" etc.).
const CALL_TIMEOUT_MS = 3000;

const omie = (url, call, param) => omieCall(url, call, param, { timeout: CALL_TIMEOUT_MS, retryTransport: false });

const isMP = (s) => /mat[eé]ria[\s_-]*prima/i.test(s || "");

/** `locaisQtd` com algum local dentro (o JSON pode vir `null`, `{}` ou com locais). */
const temLocal = (locaisQtd) => !!locaisQtd && typeof locaisQtd === "object" && Object.keys(locaisQtd).length > 0;

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
export async function sincronizarProdutos({ ateMs = Date.now() + PRAZO_POSICAO_MS } = {}) {
  const cfg  = await getConfigEstoque();
  let criados = 0, atualizados = 0, zerados = 0, enriquecidos = 0, catalogo = 0;

  // 0. Catálogo completo (todos os produtos cadastrados, inclusive sem estoque)
  try { catalogo = (await sincronizarCatalogo()).catalogo; }
  catch (e) { registro.aviso("[sincronizarProdutos] catálogo falhou:", e?.message); }

  // Corrige produtos marcados N/A sem label (bug de versão anterior)
  await prisma.estoqueItem.updateMany({
    where: { categoriaOmie: "N/A", categoriaLabel: null },
    data:  { categoriaOmie: "" },
  });

  // ── 1. Locais e posição de TODOS os locais — inteiros, ou a sincronização para aqui ─────────
  // ⚠⚠ NADA ABAIXO GRAVA SALDO ANTES DE A POSIÇÃO ESTAR INTEIRA. Até 25/09/2026 cada falha do Omie
  // caía num `catch { break; }`: a lista de locais sumia, e uma página lenta deixava a posição pela
  // metade — o passo 3 zerava quem tinha ficado de fora. Agora a falha LANÇA e chega ao monitor.
  // Por que "TODOS", e qual soma é a Qtd: lib/omie-estoque-posicao.js.
  const locais = await listarLocais({ ateMs });
  const pos = consolidarPosicao(await listarPosicao({ ateMs }));

  // ── 2. Bulk DB upsert ──────────────────────────────────────────────────────
  const todosCods = [...pos.keys()];
  const atuais = await prisma.estoqueItem.findMany({
    select: { codigoOmie: true, qtdAtual: true, locaisQtd: true },
  });
  const existentes = new Set(atuais.map(e => e.codigoOmie));

  const novos = [...pos.values()]
    .filter(d => !existentes.has(d.codigoOmie))
    .map(d => ({
      codigoOmie: d.codigoOmie, descricao: d.descricao,
      unidade: "UN", // ⚠ a posição não traz unidade; o catálogo grava a certa na próxima rodada
      cmc: d.cmc, qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd,
      ativo: true, categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
      ultimaSincOmie: new Date(),
    }));
  if (novos.length > 0) {
    await prisma.estoqueItem.createMany({ data: novos, skipDuplicates: true });
    criados = novos.length;
  }

  // ⚠⚠ SEM `unidade`. O `ListarPosEstoque` não traz unidade (nem na doc, nem na resposta medida), e o
  // "UN" de fallback sobrescrevia, a cada hora, a que o catálogo tinha acabado de gravar: em
  // 24/09/2026 os 258 produtos da posição estavam como "UN" — 120 deles são KG, LATA, PC… no cadastro.
  const updates = [...pos.values()]
    .filter(d => existentes.has(d.codigoOmie))
    .map(d => prisma.estoqueItem.updateMany({
      where: { codigoOmie: d.codigoOmie },
      data:  { descricao: d.descricao, cmc: d.cmc,
               qtdAtual: d.qtdAtual, locaisQtd: d.locaisQtd, ativo: true,
               ultimaSincOmie: new Date() },
    }));
  for (let i = 0; i < updates.length; i += 4) await Promise.all(updates.slice(i, i + 4));
  atualizados = updates.length;

  // ── 3. Zera quem saiu da posição ───────────────────────────────────────────
  // ⚠⚠ Saldo zero NÃO vem na posição: sair dela é o jeito normal de um local zerar. Por isso zera
  // também o NEGATIVO (o `qtdAtual > 0` de antes o deixava de pé) e o detalhe de quem só tinha saldo
  // fora da Qtd (Qtd 0, mas `locaisQtd` ainda com o local velho).
  const aZerar = atuais
    .filter(e => !pos.has(e.codigoOmie) && (e.qtdAtual !== 0 || temLocal(e.locaisQtd)))
    .map(e => e.codigoOmie);
  if (aZerar.length > 0) {
    const r = await prisma.estoqueItem.updateMany({
      where: { codigoOmie: { in: aZerar } },
      data:  { qtdAtual: 0, locaisQtd: {} },
    });
    zerados = r.count;
  }

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

// ─── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
