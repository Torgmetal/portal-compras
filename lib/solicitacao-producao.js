// Solicitação de início de produção (Planejamento → PCP/Produção).
// Uma por obra; datas necessárias por setor em `datasSetor` (JSON).
import { prisma } from "@/lib/prisma";
export { SETORES_SOLICITACAO, SETOR_LABEL_SOLIC, STATUS_SOLIC } from "@/lib/solicitacao-producao-const";

/**
 * Carrega as solicitações de produção com dados da OP (cliente/obra).
 * @param {string[]|null} status - filtra por status (null = todas)
 */
export async function carregarSolicitacoes(status = null) {
  const where = status ? { status: { in: status } } : {};
  const solics = await prisma.solicitacaoProducao.findMany({
    where,
    orderBy: [{ dataEntrega: "asc" }, { opNumero: "asc" }],
  });
  if (!solics.length) return [];

  const numeros = [...new Set(solics.map((s) => s.opNumero))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numeros } },
    select: { numero: true, cliente: true, obra: true },
  });
  const opMap = new Map(ops.map((o) => [o.numero, o]));

  return solics.map((s) => ({
    ...s,
    cliente: opMap.get(s.opNumero)?.cliente || null,
    obra: opMap.get(s.opNumero)?.obra || null,
  }));
}
