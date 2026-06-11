// Query compartilhada da fila/kanban de corte (página server + API).
// Universo: peças liberadas para corte (status CORTE) + concluídas nos
// últimos 30 dias — manualmente (corteConcluidoEm) OU pelo Syneco
// (qteProduzida/dataProducao, gravados pelo "Importar Syneco").
import { prisma } from "@/lib/prisma";

// Peça cortada: conclusão manual no kanban OU baixa total no Syneco
export function pecaCortada(p) {
  return !!p.corteConcluidoEm || (Number(p.qte) > 0 && Number(p.qteProduzida) >= Number(p.qte));
}

export async function buscarFilaCorte() {
  const corte30d = new Date();
  corte30d.setDate(corte30d.getDate() - 30);
  return prisma.pecaConjunto.findMany({
    where: {
      OR: [
        { status: "CORTE" },
        { corteConcluidoEm: { gte: corte30d } },
        { dataProducao: { gte: corte30d }, qteProduzida: { gt: 0 } },
      ],
    },
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true,
      pesoTotalKg: true, perfil: true, material: true, maquina: true,
      tipoPeca: true, status: true, dataPrevista: true, statusEstoque: true,
      corteOrdem: true, corteDataMetaInicio: true, corteDataMetaFim: true,
      corteIniciadoEm: true, corteConcluidoEm: true,
      qteProduzida: true, dataProducao: true,
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
