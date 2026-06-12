// Conjuntos de um setor + apontamento do Syneco NESSE setor (só peças da LPC).
// A fábrica corre unidades em vários setores ao mesmo tempo, então a tela do
// setor também mostra conjuntos ADIANTADOS: apontamento > 0 aqui mesmo que o
// status (pipeline) ainda esteja num setor anterior.
import { prisma } from "@/lib/prisma";

const INCLUDE_PADRAO = {
  op: { select: { id: true, numero: true, cliente: true, obra: true } },
  conjuntoCroquis: {
    include: {
      croqui: { select: { id: true, marca: true, descricao: true, qte: true, qteProduzida: true, status: true } },
    },
  },
};

/**
 * @param {string[]} statusList - status do pipeline exibidos (ex.: ["SOLDA","ACABAMENTO"])
 * @param {string} setorSyneco - nome do setor no Syneco (ex.: "Solda")
 * @returns {{ pecas, apontamentos: { [marca]: { produzido, planejado, dataFim } } }}
 */
export async function buscarConjuntosComApontamento(statusList, setorSyneco) {
  const marcasLpc = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
    select: { marca: true },
  });

  const aponts = marcasLpc.length
    ? await prisma.mesOrdem.findMany({
        where: {
          setor: { contains: setorSyneco, mode: "insensitive" },
          item: { in: marcasLpc.map((m) => m.marca) },
        },
        select: { item: true, produzidoUn: true, planejadoUn: true, dataFim: true },
      })
    : [];

  const apontamentos = {};
  for (const a of aponts) {
    const acc = apontamentos[a.item] || { produzido: 0, planejado: 0, dataFim: null };
    acc.produzido += a.produzidoUn || 0;
    acc.planejado += a.planejadoUn || 0;
    if (a.dataFim && (!acc.dataFim || a.dataFim > acc.dataFim)) acc.dataFim = a.dataFim;
    apontamentos[a.item] = acc;
  }
  const adiantadas = Object.keys(apontamentos).filter((m) => apontamentos[m].produzido > 0);

  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      tipoPeca: "CONJUNTO",
      OR: [
        { status: { in: statusList } },
        ...(adiantadas.length ? [{ marca: { in: adiantadas }, fonte: "LPC_IMPORT" }] : []),
      ],
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: INCLUDE_PADRAO,
    take: 3000,
  });

  return { pecas, apontamentos };
}
