// Conjuntos de um setor + apontamento do Syneco nesse setor e no PRÓXIMO (só
// peças da LPC). A fábrica corre unidades em vários setores ao mesmo tempo,
// então a tela considera:
//  - ADIANTADOS: apontamento > 0 aqui com status (pipeline) ainda anterior;
//  - SAÍDOS: status além do setor, ou apontamento completo + próximo iniciado
//    — ficam fora da lista e contam só no indicador geral (regra do Vitor);
//  - FUROS: mais unidades apontadas aqui do que em algum setor ANTERIOR da
//    cadeia — fisicamente impossível, é lançamento errado/faltando no Syneco.
//    Nesses casos a tela mostra alerta em vez de "adiantado" (regra do Vitor).
import { prisma } from "@/lib/prisma";

const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
// Setores do Syneco na ordem física da fábrica (nomes exatos do MesOrdem)
const CADEIA_SYNECO = ["Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

/**
 * @param {string} setorAtual - status do setor da aba (ex.: "SOLDA")
 * @param {string} setorSyneco - nome do setor no Syneco (ex.: "Solda")
 * @param {string|null} setorSynecoProximo - setor seguinte no Syneco (null se não há, ex.: pós-pintura)
 * @returns {{ pecas, apontamentos, apontamentosProximo, furos }}
 */
export async function buscarConjuntosComApontamento(setorAtual, setorSyneco, setorSynecoProximo) {
  const marcasLpc = (
    await prisma.pecaConjunto.findMany({
      where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
      select: { marca: true },
    })
  ).map((m) => m.marca);

  // A cadeia inteira numa busca só — os setores anteriores são necessários
  // para detectar furo de lançamento.
  const rows = marcasLpc.length
    ? await prisma.mesOrdem.findMany({
        where: { setor: { in: CADEIA_SYNECO }, item: { in: marcasLpc } },
        select: { setor: true, item: true, produzidoUn: true, planejadoUn: true, dataFim: true },
      })
    : [];

  const porSetor = {};
  for (const a of rows) {
    const mapa = (porSetor[a.setor] = porSetor[a.setor] || {});
    const acc = (mapa[a.item] = mapa[a.item] || { produzido: 0, planejado: 0, dataFim: null });
    acc.produzido += a.produzidoUn || 0;
    acc.planejado += a.planejadoUn || 0;
    if (a.dataFim && (!acc.dataFim || a.dataFim > acc.dataFim)) acc.dataFim = a.dataFim;
  }

  const apontamentos = porSetor[setorSyneco] || {};
  const apontamentosProximo = (setorSynecoProximo && porSetor[setorSynecoProximo]) || {};

  // Furo de lançamento: apontado aqui > produzido em algum setor anterior que
  // TEM registro no Syneco (setor sem registro nenhum = fluxo que pula etapa).
  const anteriores = CADEIA_SYNECO.slice(0, CADEIA_SYNECO.indexOf(setorSyneco));
  const furos = {};
  for (const [marca, ap] of Object.entries(apontamentos)) {
    if (!(ap.produzido > 0)) continue;
    const gargalos = anteriores
      .filter((s) => porSetor[s]?.[marca] && porSetor[s][marca].produzido < ap.produzido)
      .map((s) => ({ setor: s, produzido: porSetor[s][marca].produzido }));
    if (gargalos.length) furos[marca] = { apontado: ap.produzido, gargalos };
  }

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

  return { pecas, apontamentos, apontamentosProximo, furos };
}
