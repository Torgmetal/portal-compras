// Query compartilhada da fila/kanban de corte (página server + API).
// Universo: peças liberadas para corte (status CORTE) + concluídas nos
// últimos 30 dias (mesmo que o pipeline já tenha avançado de setor).
import { prisma } from "@/lib/prisma";

export async function buscarFilaCorte() {
  const corte30d = new Date();
  corte30d.setDate(corte30d.getDate() - 30);
  return prisma.pecaConjunto.findMany({
    where: {
      OR: [
        { status: "CORTE" },
        { corteConcluidoEm: { gte: corte30d } },
      ],
    },
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true,
      pesoTotalKg: true, perfil: true, material: true, maquina: true,
      tipoPeca: true, status: true, dataPrevista: true, statusEstoque: true,
      corteOrdem: true, corteDataMetaInicio: true, corteDataMetaFim: true,
      corteIniciadoEm: true, corteConcluidoEm: true,
      qteProduzida: true,
      op: { select: { cliente: true, obra: true } },
    },
    orderBy: [
      { corteOrdem: { sort: "asc", nulls: "last" } },
      { dataPrevista: { sort: "asc", nulls: "last" } },
      { opNumero: "asc" },
      { marca: "asc" },
    ],
  });
}
