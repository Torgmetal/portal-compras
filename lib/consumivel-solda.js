import "server-only";
import { prisma } from "./prisma";
import { normalizeSetorSyneco } from "./syneco-dia";

// CONSUMÍVEL DE SOLDA — qual arame estava valendo numa data.
//
// Vitor (19/08/2026): "o consumível de solda geralmente usa a mesma rastreabilidade por vários
// dias ou semanas; se atentar quando for indicado nova entrada na CMR, mudar os números de
// rastreabilidade". Então a regra é: vale a ENTRADA MAIS RECENTE recebida ATÉ a data — quando
// chega um lote novo no CMR, o R muda dali pra frente sozinho.
//
// O arame entra no CMR SEM OP (é estoque geral, não é comprado por obra), diferente do aço.

// Arame de solda de verdade. ⚠ "MEIA LUVA … ENC.SOLDA", "COLAR … MSC SOLDA" são CONEXÕES de
// tubulação — a palavra "solda" no nome não faz delas consumível.
const RX_CONSUMIVEL = /\b(arame|eletrodo|vareta|fluxo)\b/i;
const RX_NAO = /\b(luva|colar|niple|flange|conex)/i;

// ⚠⚠ A GRANALHA É O MESMO CASO DO ARAME. Vitor (28/08/2026): "a granalha possui certificado
// também e está listado na CMR". É comprada para ESTOQUE — entra no CMR com lote, certificado e
// PDF, e sem OP —, e o que vale para uma obra é o lote que estava na máquina quando ELA foi
// jateada. Mesma regra do arame, outro setor.
const RX_ABRASIVO = /\b(granalha|abrasiv|microesfer)\b/i;

/** Entradas do CMR de uma família de consumível, mais recentes primeiro. */
async function entradasPorFamilia(rx, rxNao = null) {
  const linhas = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL" },
    select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, dataRecebimento: true, pesoKg: true },
    orderBy: [{ dataRecebimento: "desc" }],
  });
  return linhas
    .filter((l) => rx.test(l.nome || "") && !(rxNao && rxNao.test(l.nome || "")))
    .map((l) => ({
      rastreio: l.importRef, material: l.nome, lote: l.numeroCorrida, certificado: l.numeroDocumento,
      norma: l.norma, fornecedor: l.fornecedor, pesoKg: l.pesoKg,
      recebidoEm: l.dataRecebimento ? l.dataRecebimento.toISOString() : null,
      _data: l.dataRecebimento,
    }));
}

/** Todas as entradas de consumível de solda do CMR, mais recentes primeiro. */
export async function entradasConsumivelSolda() {
  return entradasPorFamilia(RX_CONSUMIVEL, RX_NAO);
}

/** Todas as entradas de abrasivo (granalha/microesfera) do CMR, mais recentes primeiro. */
export async function entradasAbrasivo() {
  return entradasPorFamilia(RX_ABRASIVO);
}

/**
 * O consumível VIGENTE numa data (a entrada mais recente recebida até ela).
 * Sem data, vale hoje. Devolve null se o CMR não tem consumível lançado.
 */
export async function consumivelVigenteEm(data = new Date(), entradasCache = null) {
  const entradas = entradasCache || (await entradasConsumivelSolda());
  const alvo = data instanceof Date ? data : new Date(data);
  const valido = entradas.filter((e) => !e._data || e._data <= alvo);
  const e = (valido.length ? valido : entradas)[0];
  if (!e) return null;
  // aviso quando o lote vigente é antigo: pode ter chegado arame novo sem lançar no CMR
  const dias = e._data ? Math.round((alvo - e._data) / 86400000) : null;
  return { ...e, _data: undefined, diasDesdeEntrada: dias, antigo: dias != null && dias > 60 };
}

/**
 * O consumível de um CONJUNTO — pela data em que ele foi SOLDADO, não pela data da emissão.
 *
 * Vitor (19/08/2026): "para os apontamentos posterior a essa data usar nos conjuntos essa
 * rastreabilidade; para os apontamentos antes dessa data usar a rastreabilidade anterior a essa".
 * Um desenho reemitido hoje de um conjunto soldado em julho tem de sair com o arame de JULHO —
 * senão o carimbo registra um lote que nunca encostou naquela peça, que é o oposto de rastrear.
 *
 * A data sai do `MesOrdem` da marca (o `MesApontamento` não guarda a marca, só a obra).
 * **Só CONJUNTO tem consumível.** Vitor (19/08): *"não faz sentido conter solda nem nos croquis e
 * nem nas peças avulsas"* — croqui só é cortado, avulsa vai do corte pro acabamento. Hoje eles já
 * caíam fora por não terem apontamento de solda, mas isso é acidente: a ordem do Syneco **nasce
 * pra rota inteira**, então bastava um apontamento errado num croqui pra aparecer arame no
 * carimbo dele. A checagem é do TIPO da peça, não da falta de dado.
 *
 * Sem apontamento de solda ainda, vale o lote vigente na DATA DA EMISSÃO. Vitor (19/08): "se eu
 * emiti a primeira hoje, você precisa já vincular o R que será usado nessa data". Não é chute: o
 * desenho está indo pro chão de fábrica agora e o arame que está na máquina agora é esse. O que
 * ele vetou foi o RÓTULO "(PREVISTO)" no carimbo, não a informação.
 *
 * Quando a solda atravessa a troca de lote, devolve todos em `janela` — aí são lotes que de fato
 * passaram pela máquina durante aquela solda.
 */
export async function consumivelDoConjunto({ opId, marca, quando = new Date(), entradas = null }) {
  if (!opId || !marca) return null;

  // 1) é conjunto? (croqui e avulsa não soldam — nem consultam o CMR à toa)
  const peca = await prisma.pecaConjunto.findFirst({
    where: { opId, marca: String(marca) },
    select: { tipoPeca: true, _count: { select: { conjuntoCroquis: true } } },
  });
  const ehConjunto = peca?.tipoPeca === "CONJUNTO" || (peca?._count?.conjuntoCroquis || 0) > 0;
  if (!ehConjunto) return null;

  // 2) quando ele foi soldado
  const lista = entradas || (await entradasConsumivelSolda());
  const ordens = await prisma.mesOrdem.findMany({
    where: { opId, item: String(marca), produzidoUn: { gt: 0 } },
    select: { setor: true, dataInicio: true, dataFim: true },
  });
  const solda = ordens.filter((o) => ["SOLDA", "MONTAGEM"].includes(normalizeSetorSyneco(o.setor)));
  const datas = solda.flatMap((o) => [o.dataInicio, o.dataFim]).filter(Boolean).sort((a, b) => a - b);

  if (!datas.length) {
    // ainda não soldado: o lote de hoje é o que vai ser usado
    const c = await consumivelVigenteEm(quando, lista);
    return c ? { ...c, origem: "emissao", soldadoEm: null } : null;
  }

  const ini = datas[0];
  const fim = datas[datas.length - 1];
  const noInicio = await consumivelVigenteEm(ini, lista);
  if (!noInicio) return null;
  // A ordem quase sempre abre e fecha no mesmo dia (mediana 1 dia, p90 2), mas 2% arrastam por
  // semanas e aí passa mais de um lote pela máquina. Lista TODOS os que estavam valendo na
  // janela — mostrar só o primeiro esconderia lote que encostou na peça.
  const naJanela = lista
    .filter((e) => e._data && e._data > ini && e._data <= fim)
    .map((e) => ({ rastreio: e.rastreio, lote: e.lote, recebidoEm: e.recebidoEm }))
    .reverse();
  return {
    ...noInicio,
    origem: "apontamento",
    soldadoEm: ini.toISOString(),
    soldadoAte: fim > ini ? fim.toISOString() : null,
    janela: naJanela.length ? naJanela : null,
  };
}

/**
 * Os consumíveis que REALMENTE foram usados numa OP — um por conjunto, pela data em que ele foi
 * soldado, unidos por R.
 *
 * Vitor (20/08/2026): "na parte dos certificados dos consumíveis de solda já trazer o certificado
 * do consumível de solda; lembra que precisamos ter certeza desses certificados de acordo com o
 * que está marcado nos croquis, conforme alinhamos na página do PCP".
 *
 * É o MESMO cálculo que escreve o R do arame no carimbo do desenho do conjunto — então a seção 06 do
 * data book afirma exatamente o que está no papel que foi pro chão de fábrica.
 *
 * ⚠ Por que não dá pra filtrar por OP como no aço: o arame entra no CMR SEM OP (é estoque geral).
 * Uma busca por `opNumero` volta vazia — era por isso que a seção 06 nunca trazia nada — e trazer as 17
 * entradas do CMR colocaria no livro lotes que nunca encostaram nesta obra.
 *
 * @returns {Promise<Array<{rastreio, material, lote, certificado, conjuntos:number, marcas:string[]}>>}
 */
export async function consumiveisPorConjunto(opId, quando = new Date()) {
  const out = new Map();
  if (!opId) return out;

  // ⚠ EM LOTE, de propósito. `consumivelDoConjunto` faz duas consultas por marca; a OP-067 tem
  // 1.330 conjuntos, o que daria ~2.700 idas ao banco só pra montar a seção 02 do data book. Aqui são
  // três consultas no total e o resto é memória.
  const [conjuntos, ordens, entradas] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opId },
      select: { marca: true, tipoPeca: true, _count: { select: { conjuntoCroquis: true } } },
    }),
    prisma.mesOrdem.findMany({
      where: { opId, produzidoUn: { gt: 0 } },
      select: { item: true, setor: true, dataInicio: true, dataFim: true },
    }),
    entradasConsumivelSolda(),
  ]);
  if (!entradas.length) return out;

  // só CONJUNTO solda — croqui é cortado, avulsa vai do corte pro acabamento
  const ehConjunto = new Set(
    conjuntos.filter((p) => p.tipoPeca === "CONJUNTO" || (p._count?.conjuntoCroquis || 0) > 0).map((p) => p.marca),
  );

  const datasPorMarca = new Map();
  for (const o of ordens) {
    if (!o.item || !ehConjunto.has(o.item)) continue;
    if (!["SOLDA", "MONTAGEM"].includes(normalizeSetorSyneco(o.setor))) continue;
    const lista = datasPorMarca.get(o.item) || [];
    if (o.dataInicio) lista.push(o.dataInicio);
    if (o.dataFim) lista.push(o.dataFim);
    datasPorMarca.set(o.item, lista);
  }

  // mesma regra do `consumivelDoConjunto`, resolvida sobre as entradas já carregadas
  const vigenteEm = (data) => {
    const valido = entradas.filter((e) => !e._data || e._data <= data);
    const e = (valido.length ? valido : entradas)[0];
    if (!e) return null;
    const dias = e._data ? Math.round((data - e._data) / 86400000) : null;
    return { ...e, _data: undefined, diasDesdeEntrada: dias, antigo: dias != null && dias > 60 };
  };

  for (const marca of ehConjunto) {
    const datas = (datasPorMarca.get(marca) || []).sort((a, b) => a - b);
    if (!datas.length) {
      // ainda não soldado: vale o lote de hoje — é o que vai pra máquina
      const c = vigenteEm(quando);
      if (c) out.set(marca, { ...c, origem: "emissao", soldadoEm: null });
      continue;
    }
    const ini = datas[0], fim = datas[datas.length - 1];
    const noInicio = vigenteEm(ini);
    if (!noInicio) continue;
    const naJanela = entradas
      .filter((e) => e._data && e._data > ini && e._data <= fim)
      .map((e) => ({ rastreio: e.rastreio, lote: e.lote, recebidoEm: e.recebidoEm }))
      .reverse();
    out.set(marca, {
      ...noInicio, origem: "apontamento",
      soldadoEm: ini.toISOString(), soldadoAte: fim > ini ? fim.toISOString() : null,
      janela: naJanela.length ? naJanela : null,
    });
  }
  return out;
}

export async function consumiveisDaOP(opId) {
  const porConjunto = await consumiveisPorConjunto(opId);
  const porR = new Map();
  for (const [marca, r] of porConjunto) {
    if (!r?.rastreio) continue;
    const g = porR.get(r.rastreio) || {
      rastreio: r.rastreio, material: r.material, lote: r.lote, certificado: r.certificado,
      norma: r.norma, fornecedor: r.fornecedor, recebidoEm: r.recebidoEm,
      // "emissao" = conjunto ainda não soldado, vale o lote vigente hoje. É informação, não fato
      // consumado — a seção 06 mostra a diferença.
      origens: new Set(), marcas: [],
    };
    g.origens.add(r.origem);
    g.marcas.push(marca);
    porR.set(r.rastreio, g);
  }
  return [...porR.values()]
    .map((g) => ({ ...g, origens: [...g.origens], conjuntos: g.marcas.length }))
    .sort((a, b) => b.conjuntos - a.conjuntos);
}

/**
 * OS ABRASIVOS QUE ESTA OBRA USOU — o lote vigente em cada dia em que ela foi JATEADA.
 *
 * Mesma regra do arame (a entrada mais recente recebida até a data), com o setor JATO no lugar de
 * SOLDA/MONTAGEM. Sem apontamento de jato ainda, devolve o lote vigente hoje marcado como PREVISTO:
 * o data book precisa dizer qual granalha está na máquina, mas não pode afirmar que a peça passou
 * por ela antes de passar.
 */
export async function abrasivosDaOP(opId) {
  if (!opId) return [];
  const [ordens, entradas] = await Promise.all([
    prisma.mesOrdem.findMany({
      where: { opId, produzidoUn: { gt: 0 } },
      select: { setor: true, dataInicio: true },
    }).catch(() => []),
    entradasAbrasivo(),
  ]);
  if (!entradas.length) return [];

  const dias = [...new Set(
    ordens
      .filter((o) => normalizeSetorSyneco(o.setor) === "JATO" && o.dataInicio)
      .map((o) => o.dataInicio.toISOString().slice(0, 10)),
  )].sort();

  const vigenteEm = (data) => {
    const valido = entradas.filter((e) => !e._data || e._data <= data);
    return (valido.length ? valido : entradas)[0] || null;
  };

  const porR = new Map();
  if (!dias.length) {
    const e = vigenteEm(new Date());
    if (e) porR.set(e.rastreio, { ...e, _data: undefined, origem: "emissao", dias: [] });
  } else {
    for (const d of dias) {
      const e = vigenteEm(new Date(`${d}T23:59:59.000Z`));
      if (!e?.rastreio) continue;
      if (!porR.has(e.rastreio)) porR.set(e.rastreio, { ...e, _data: undefined, origem: "apontamento", dias: [] });
      porR.get(e.rastreio).dias.push(d);
    }
  }
  return [...porR.values()].sort((a, b) => b.dias.length - a.dias.length);
}
