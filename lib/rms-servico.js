// Consulta das RMs de SERVIÇO (aluguel de equipamento e medição de montagem).
//
// Existe separado do componente porque `components/PainelServicosRM.jsx` é um
// componente compartilhado por duas telas, e componente não fala com o banco —
// fala com um módulo de dados. É a fronteira que `quality/no-direct-data-access`
// guarda.
import { prisma } from "@/lib/prisma";

const ATIVAS = ["ABERTA", "EM_COTACAO", "COTADA"];
const ARQUIVADAS = ["PEDIDO_GERADO", "CANCELADA"];

/**
 * @param {"ALUGUEL"|"MONTAGEM"} tipo
 * @param {boolean} verArquivadas  histórico em vez das RMs em andamento
 * @returns {Promise<{rms: any[], statusCount: Record<string, number>}>}
 */
export async function buscarRMsDeServico(tipo, verArquivadas) {
  const where = {
    tipoRM: tipo,
    status: { in: verArquivadas ? ARQUIVADAS : ATIVAS },
  };

  const [rms, totais] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        op: { select: { id: true, numero: true, cliente: true } },
        createdBy: { select: { name: true } },
        itens: {
          orderBy: { ordem: "asc" },
          select: { id: true, descricao: true, status: true, qtd: true, valorDiaria: true, qtdDias: true, valorTotal: true },
        },
      },
    }),
    prisma.rM.groupBy({ by: ["status"], where: { tipoRM: tipo }, _count: { _all: true } }),
  ]);

  const statusCount = totais.reduce((acc, t) => {
    acc[t.status] = t._count._all;
    return acc;
  }, {});

  return { rms, statusCount };
}
