// ─── GRAVAÇÃO DA LPC EM LOTE ─────────────────────────────────────────────────────────────────────
//
// ⚠⚠ O SERVIDOR DO PORTAL NÃO ESTÁ NO BRASIL. As funções da Vercel rodam em Washington (iad1 — o
// cabeçalho `x-vercel-id` diz `gru1::iad1::…`) e o banco do Neon está em São Paulo: cada consulta é
// uma ida e volta de ~120 ms. A importação gravava PEÇA A PEÇA (uma busca + uma gravação, ~240 ms por
// peça) e, com a LPC da T118B (1.240 peças), esgotou os 300 s antes das ligações conjunto → croqui:
// ficaram 22 gravadas e a lista, pela metade (Mike, Engenharia, 25/09/2026 — "HTTP 504").
//
// Agora: UMA leitura das que já existem, as novas num `createManyAndReturn`, as existentes em
// paralelo com teto (`PARALELO`), e as ligações num `createMany`. Os campos de cada gravação são os
// mesmos de antes — só o número de idas e voltas mudou.
//
// ⚠ O teto do paralelo protege o banco: a compute do Neon é pequena e já estourou memória com escrita
// em massa (ver CLAUDE.md, "Neon compute pequena"). 12 gravações simultâneas é leve para ele e corta o
// tempo em ~12×.

const PARALELO = 12;
const LOTE = 500;

const pedacos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/** Roda `fn` em cada item com no máximo `limite` ao mesmo tempo. */
export async function emParalelo(itens, limite, fn) {
  let proximo = 0;
  const trabalhador = async () => { while (proximo < itens.length) { const i = proximo++; await fn(itens[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

// ─── os campos — os MESMOS da rota antiga, tipo a tipo ─────────────────────────────────────────

function dadosCriacao(tipo, x, { opId, opNumero }, maq) {
  const base = { opId: opId || null, opNumero, marca: x.marca, descricao: x.descricao };
  if (tipo === "CONJUNTO") {
    return { ...base, qte: x.qte, pesoUnitKg: x.pesoUnitKg, pesoTotalKg: x.pesoTotalKg, tipoPeca: "CONJUNTO", areaPinturaM2: x.areaPinturaM2,
      observacao: x.observacao ?? undefined, status: "PENDENTE", fonte: "LPC_IMPORT", naLPC: true };
  }
  const comum = { ...base, material: x.material, perfil: x.perfil, qte: x.qte, comprimentoMm: x.comprimentoMm, pesoUnitKg: x.pesoUnitKg, pesoTotalKg: x.pesoTotalKg };
  if (tipo === "CROQUI") {
    return { ...comum, tipoPeca: "CROQUI", areaPinturaM2: x.areaPinturaM2, observacao: x.observacao ?? undefined,
      statusPrep: "PENDENTE", status: "PENDENTE", fonte: "LPC_IMPORT", naLPC: true, maquina: maq };
  }
  return { ...comum, areaPinturaM2: x.areaPinturaM2, observacao: x.observacao ?? undefined, status: "PENDENTE", fonte: "LPC_IMPORT", naLPC: true, maquina: maq };
}

// `estado` = o que a linha já tem de preparação e máquina (a leitura, ou o que a gravação anterior deixou)
function dadosAtualizacao(tipo, x, estado, maq) {
  if (tipo === "CONJUNTO") {
    return { descricao: x.descricao, qte: x.qte, pesoUnitKg: x.pesoUnitKg, pesoTotalKg: x.pesoTotalKg, tipoPeca: "CONJUNTO",
      areaPinturaM2: x.areaPinturaM2, observacao: x.observacao ?? undefined, naLPC: true, fonte: "LPC_IMPORT" };
  }
  const comum = { descricao: x.descricao, material: x.material, perfil: x.perfil, qte: x.qte, comprimentoMm: x.comprimentoMm,
    pesoUnitKg: x.pesoUnitKg, pesoTotalKg: x.pesoTotalKg };
  if (tipo === "CROQUI") {
    return { ...comum, tipoPeca: "CROQUI", areaPinturaM2: x.areaPinturaM2, observacao: x.observacao ?? undefined,
      statusPrep: estado.statusPrep || "PENDENTE", maquina: maq || estado.maquina, naLPC: true, fonte: "LPC_IMPORT" };
  }
  // ⚠ A LINHA PASSA A PERTENCER À LPC (caso da OP-113): marca que a LE criou primeiro continuava
  // carimbada LE e sumia da lista de produção. Avulsa nunca recebe `tipoPeca`.
  return { ...comum, areaPinturaM2: x.areaPinturaM2, observacao: x.observacao ?? undefined, maquina: maq || estado.maquina, naLPC: true, fonte: "LPC_IMPORT" };
}

const depois = (estado, data) => ({ statusPrep: data.statusPrep !== undefined ? data.statusPrep : estado.statusPrep, maquina: data.maquina !== undefined ? data.maquina : estado.maquina });

const VAZIO = { statusPrep: null, maquina: null };

// ⚠ a mesma marca em duas listas (conjunto e avulsa) era gravada duas vezes em sequência: nasce na
// primeira e a segunda a ATUALIZA. Mantido: a segunda ocorrência fica para depois do lote.
function separarRepetidas(parsed) {
  const primeiras = new Map(), repetidas = [];
  const todas = [
    ...parsed.conjuntos.map((item) => ({ tipo: "CONJUNTO", item })),
    ...parsed.croquis.map((item) => ({ tipo: "CROQUI", item })),
    ...parsed.avulsas.map((item) => ({ tipo: "AVULSA", item })),
  ];
  for (const x of todas) (primeiras.has(x.item.marca) ? repetidas.push(x) : primeiras.set(x.item.marca, x));
  return { primeiras, repetidas };
}

async function lerExistentes(db, opNumero, marcas) {
  const existentes = new Map();
  for (const lote of pedacos(marcas, 1000)) {
    for (const p of await db.pecaConjunto.findMany({ where: { opNumero, marca: { in: lote } }, select: { id: true, marca: true, statusPrep: true, maquina: true } })) {
      existentes.set(p.marca, p);
    }
  }
  return existentes;
}

async function criarEmLote(db, novas, ctx) {
  for (const lote of pedacos(novas, LOTE)) {
    try {
      for (const p of await db.pecaConjunto.createManyAndReturn({ data: lote, select: { id: true, marca: true } })) { ctx.pieceIds.set(p.marca, p.id); ctx.criados++; }
      for (const d of lote) ctx.estados.set(d.marca, depois(VAZIO, d));
    } catch {
      // lote recusado (ex.: outra importação criou uma marca no meio do caminho): uma a uma, como antes
      await emParalelo(lote, PARALELO, async (d) => {
        try { const p = await db.pecaConjunto.create({ data: d }); ctx.pieceIds.set(d.marca, p.id); ctx.estados.set(d.marca, depois(VAZIO, d)); ctx.criados++; }
        catch { ctx.ignorados++; }
      });
    }
  }
}

async function atualizarEmParalelo(db, atualizacoes, ctx) {
  await emParalelo(atualizacoes, PARALELO, async (u) => {
    try { await db.pecaConjunto.update({ where: { id: u.id }, data: u.data }); ctx.pieceIds.set(u.marca, u.id); ctx.estados.set(u.marca, depois(u.ex, u.data)); ctx.atualizados++; }
    catch { ctx.ignorados++; }
  });
}

// as repetidas, na ordem do arquivo, sobre o que a gravação anterior deixou
async function aplicarRepetidas(db, repetidas, maqDe, ctx) {
  for (const x of repetidas) {
    const id = ctx.pieceIds.get(x.item.marca);
    if (!id) { ctx.ignorados++; continue; }
    const estado = ctx.estados.get(x.item.marca) || VAZIO;
    const data = dadosAtualizacao(x.tipo, x.item, estado, maqDe(x));
    try { await db.pecaConjunto.update({ where: { id }, data }); ctx.estados.set(x.item.marca, depois(estado, data)); ctx.atualizados++; }
    catch { ctx.ignorados++; }
  }
}

/**
 * Grava conjuntos, croquis e avulsas da LPC já interpretada.
 * @param {object} db prisma
 * @param {{opId:string|null, opNumero:string, parsed:{conjuntos:object[], croquis:object[], avulsas:object[]}, maquinaDe:(x:object)=>string|null}} op
 * @returns {Promise<{pieceIds:Map<string,string>, criados:number, atualizados:number, ignorados:number}>}
 */
export async function gravarPecasLpc(db, { opId, opNumero, parsed, maquinaDe }) {
  const ctx = { pieceIds: new Map(), estados: new Map(), criados: 0, atualizados: 0, ignorados: 0 };
  const maqDe = ({ tipo, item }) => (tipo === "CONJUNTO" ? null : maquinaDe(item));
  const { primeiras, repetidas } = separarRepetidas(parsed);
  const existentes = await lerExistentes(db, opNumero, [...primeiras.keys()]);

  const novas = [], atualizacoes = [];
  for (const x of primeiras.values()) {
    const ex = existentes.get(x.item.marca), maq = maqDe(x);
    if (ex) atualizacoes.push({ marca: x.item.marca, id: ex.id, data: dadosAtualizacao(x.tipo, x.item, ex, maq), ex });
    else novas.push(dadosCriacao(x.tipo, x.item, { opId, opNumero }, maq));
  }
  await criarEmLote(db, novas, ctx);
  await atualizarEmParalelo(db, atualizacoes, ctx);
  await aplicarRepetidas(db, repetidas, maqDe, ctx);

  const { pieceIds, criados, atualizados, ignorados } = ctx;
  return { pieceIds, criados, atualizados, ignorados };
}

/**
 * Refaz as ligações conjunto → croqui dos conjuntos importados. Devolve quantas foram gravadas.
 * @param {object} db prisma
 * @param {{parsed:{conjuntos:object[], relacoes:object[]}, pieceIds:Map<string,string>}} op
 */
export async function gravarRelacoesLpc(db, { parsed, pieceIds }) {
  const conjuntoIds = parsed.conjuntos.map((c) => pieceIds.get(c.marca)).filter(Boolean);
  for (const lote of pedacos(conjuntoIds, 1000)) await db.conjuntoCroqui.deleteMany({ where: { conjuntoId: { in: lote } } });

  const dados = [], vistos = new Set();
  for (const rel of parsed.relacoes || []) {
    const conjuntoId = pieceIds.get(rel.conjuntoMarca), croquiId = pieceIds.get(rel.croquiMarca);
    if (!conjuntoId || !croquiId) continue;
    const k = `${conjuntoId}|${croquiId}`;
    if (vistos.has(k)) continue; // a ligação é única por (conjunto, croqui) no banco
    vistos.add(k);
    dados.push({ conjuntoId, croquiId, qtdNoConjunto: rel.qtdNoConjunto });
  }
  let gravadas = 0;
  for (const lote of pedacos(dados, 1000)) gravadas += (await db.conjuntoCroqui.createMany({ data: lote, skipDuplicates: true })).count;
  return gravadas;
}

export { PARALELO };
