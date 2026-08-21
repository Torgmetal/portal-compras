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

/** Todas as entradas de consumível de solda do CMR, mais recentes primeiro. */
export async function entradasConsumivelSolda() {
  const linhas = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL" },
    select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, dataRecebimento: true, pesoKg: true },
    orderBy: [{ dataRecebimento: "desc" }],
  });
  return linhas
    .filter((l) => RX_CONSUMIVEL.test(l.nome || "") && !RX_NAO.test(l.nome || ""))
    .map((l) => ({
      rastreio: l.importRef, material: l.nome, lote: l.numeroCorrida, certificado: l.numeroDocumento,
      norma: l.norma, fornecedor: l.fornecedor, pesoKg: l.pesoKg,
      recebidoEm: l.dataRecebimento ? l.dataRecebimento.toISOString() : null,
      _data: l.dataRecebimento,
    }));
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
 * É o MESMO cálculo que escreve o R do arame no carimbo do desenho do conjunto — então a §06 do
 * data book afirma exatamente o que está no papel que foi pro chão de fábrica.
 *
 * ⚠ Por que não dá pra filtrar por OP como no aço: o arame entra no CMR SEM OP (é estoque geral).
 * Uma busca por `opNumero` volta vazia — era por isso que a §06 nunca trazia nada — e trazer as 17
 * entradas do CMR colocaria no livro lotes que nunca encostaram nesta obra.
 *
 * @returns {Promise<Array<{rastreio, material, lote, certificado, conjuntos:number, marcas:string[]}>>}
 */
export async function consumiveisDaOP(opId) {
  if (!opId) return [];
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { opId, tipoPeca: "CONJUNTO" },
    select: { marca: true },
    distinct: ["marca"],
  });
  if (!conjuntos.length) return [];

  const entradas = await entradasConsumivelSolda();
  if (!entradas.length) return [];

  const porR = new Map();
  for (const c of conjuntos) {
    const r = await consumivelDoConjunto({ opId, marca: c.marca, entradas });
    if (!r?.rastreio) continue;
    const g = porR.get(r.rastreio) || {
      rastreio: r.rastreio, material: r.material, lote: r.lote, certificado: r.certificado,
      norma: r.norma, fornecedor: r.fornecedor, recebidoEm: r.recebidoEm,
      // "emissao" = conjunto ainda não soldado, vale o lote vigente hoje. É informação, não fato
      // consumado — a §06 mostra a diferença.
      origens: new Set(), marcas: [],
    };
    g.origens.add(r.origem);
    g.marcas.push(c.marca);
    porR.set(r.rastreio, g);
  }

  return [...porR.values()]
    .map((g) => ({ ...g, origens: [...g.origens], conjuntos: g.marcas.length }))
    .sort((a, b) => b.conjuntos - a.conjuntos);
}
