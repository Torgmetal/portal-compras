// Solicitação de início de produção (Planejamento → PCP/Produção).
// Uma por obra; datas necessárias por setor em `datasSetor` (JSON).
import { prisma } from "@/lib/prisma";
export { SETORES_SOLICITACAO, SETOR_LABEL_SOLIC, STATUS_SOLIC } from "@/lib/solicitacao-producao-const";

const POS_CORTE_STATUS = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

/**
 * Status EFETIVO = reflete a produção real, não só o gravado:
 *  - todos os conjuntos EXPEDIDO → CONCLUIDA
 *  - algum conjunto em montagem+ (já produzindo) → EM_PRODUCAO
 *  - senão mantém o gravado (SOLICITADA / PROGRAMADA).
 * Evita que obra já em produção fique presa em "Solicitada" só porque a LPC
 * foi importada antes da solicitação existir.
 */
function statusEfetivo(gravado, estado) {
  if (gravado === "CONCLUIDA") return "CONCLUIDA";
  if (estado && estado.total > 0 && estado.exp === estado.total) return "CONCLUIDA";
  if (estado && estado.prod > 0) return "EM_PRODUCAO";
  return gravado;
}

/**
 * Carrega as solicitações com dados da OP (cliente/obra) e status EFETIVO.
 * @param {string[]|null} status - filtra pelo status efetivo (null = todas)
 */
export async function carregarSolicitacoes(status = null) {
  const solics = await prisma.solicitacaoProducao.findMany({
    orderBy: [{ dataEntrega: "asc" }, { opNumero: "asc" }],
  });
  if (!solics.length) return [];

  const numeros = [...new Set(solics.map((s) => s.opNumero))];
  const [ops, pipe] = await Promise.all([
    prisma.oP.findMany({ where: { numero: { in: numeros } }, select: { numero: true, cliente: true, obra: true } }),
    prisma.pecaConjunto.groupBy({
      by: ["opNumero", "status"],
      where: { fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", opNumero: { in: numeros } },
      _count: { id: true },
    }),
  ]);

  const estado = {};
  for (const r of pipe) {
    const e = (estado[r.opNumero] = estado[r.opNumero] || { total: 0, prod: 0, exp: 0 });
    e.total += r._count.id;
    if (POS_CORTE_STATUS.includes(r.status)) e.prod += r._count.id;
    if (r.status === "EXPEDIDO") e.exp += r._count.id;
  }

  const opMap = new Map(ops.map((o) => [o.numero, o]));
  let lista = solics.map((s) => ({
    ...s,
    status: statusEfetivo(s.status, estado[s.opNumero]),
    statusArmazenado: s.status,
    cliente: opMap.get(s.opNumero)?.cliente || null,
    obra: opMap.get(s.opNumero)?.obra || null,
  }));
  if (status) lista = lista.filter((s) => status.includes(s.status));
  return lista;
}
