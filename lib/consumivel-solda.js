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
 * Sem apontamento de solda devolve **null** — e o carimbo sai sem a linha. Vitor (19/08): "sobre o
 * consumível de solda previsto não precisa aparecer esse previsto nos carimbos, apenas a
 * rastreabilidade que de fato foi usado". Chutar o lote de hoje num conjunto que ainda não foi
 * soldado é o mesmo "provável" que não entra em documento de auditoria. Efeito colateral bom:
 * croqui e peça avulsa não têm apontamento de solda, então param de receber a linha sozinhos.
 *
 * Quando a solda atravessa a troca de lote, devolve todos em `janela` — aí são lotes que de fato
 * passaram pela máquina durante aquela solda.
 */
export async function consumivelDoConjunto({ opId, marca, entradas = null }) {
  const lista = entradas || (await entradasConsumivelSolda());
  let ordens = [];
  if (opId && marca) {
    ordens = await prisma.mesOrdem.findMany({
      where: { opId, item: String(marca), produzidoUn: { gt: 0 } },
      select: { setor: true, dataInicio: true, dataFim: true },
    });
  }
  const solda = ordens.filter((o) => ["SOLDA", "MONTAGEM"].includes(normalizeSetorSyneco(o.setor)));
  const datas = solda.flatMap((o) => [o.dataInicio, o.dataFim]).filter(Boolean).sort((a, b) => a - b);

  if (!datas.length) return null; // ainda não soldado: não há consumível usado pra carimbar

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
