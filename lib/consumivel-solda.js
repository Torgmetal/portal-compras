import "server-only";
import { prisma } from "./prisma";

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
