// Conjuntos de um setor + apontamento do Syneco nesse setor e no PRÓXIMO (só
// peças da LPC). A fábrica corre unidades em vários setores ao mesmo tempo,
// então a tela considera:
//  - ADIANTADOS: apontamento > 0 aqui com status (pipeline) ainda anterior;
//  - SAÍDOS: status além do setor, ou apontamento completo + próximo iniciado
//    — ficam fora da lista e contam só no indicador geral (regra do Vitor).
import { prisma } from "@/lib/prisma";

const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

async function apontamentosDoSetor(setorSyneco, marcas) {
  if (!setorSyneco || !marcas.length) return {};
  const rows = await prisma.mesOrdem.findMany({
    where: {
      setor: { contains: setorSyneco, mode: "insensitive" },
      item: { in: marcas },
    },
    select: { item: true, produzidoUn: true, planejadoUn: true, dataFim: true },
  });
  const map = {};
  for (const a of rows) {
    const acc = map[a.item] || { produzido: 0, planejado: 0, dataFim: null };
    acc.produzido += a.produzidoUn || 0;
    acc.planejado += a.planejadoUn || 0;
    if (a.dataFim && (!acc.dataFim || a.dataFim > acc.dataFim)) acc.dataFim = a.dataFim;
    map[a.item] = acc;
  }
  return map;
}

/**
 * @param {string} setorAtual - status do setor da aba (ex.: "SOLDA")
 * @param {string} setorSyneco - nome do setor no Syneco (ex.: "Solda")
 * @param {string|null} setorSynecoProximo - setor seguinte no Syneco (null se não há, ex.: pós-pintura)
 * @returns {{ pecas, apontamentos, apontamentosProximo }}
 */
export async function buscarConjuntosComApontamento(setorAtual, setorSyneco, setorSynecoProximo) {
  const marcasLpc = (
    await prisma.pecaConjunto.findMany({
      where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
      select: { marca: true },
    })
  ).map((m) => m.marca);

  const [apontamentos, apontamentosProximo] = await Promise.all([
    apontamentosDoSetor(setorSyneco, marcasLpc),
    apontamentosDoSetor(setorSynecoProximo, marcasLpc),
  ]);

  // Do setor em diante: quem já passou conta no "Total geral" da tela.
  const statusList = ORDEM.slice(ORDEM.indexOf(setorAtual));
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
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
    take: 3000,
  });

  return { pecas, apontamentos, apontamentosProximo };
}
