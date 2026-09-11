import "server-only";
import { prisma } from "./prisma";
import { chavesNoTerceiro, noTerceiro } from "./terceiros-retorno";

/* ─── O QUE NÃO ESTÁ NA FÁBRICA ────────────────────────────────────────────────────────────────
   Vitor (08/09/2026): "as marcas que estão nos romaneios de terceiros não devem aparecer na
   programação de nenhum setor" — e, depois de a regra por marca entrar: "eu sei que já estavam
   fora, porém as marcas para a preparação ainda ficam aparecendo na fila".

   ⚠⚠ O ROMANEIO LISTA O CONJUNTO; QUEM ESPERA NO CORTE É O CROQUI. Essa é a razão de a primeira
   versão não ter resolvido a preparação: a RT-04 manda 65 conjuntos (T97B2, T97B3…) para a RV, mas
   a fila de corte é feita de CROQUIS (T97B-P7, T97B-P49…), cujas marcas não aparecem em romaneio
   nenhum. Medido no dia: 260 croquis da RT-04 e 143 da RT-01 continuavam na fila de corte — e são
   exatamente os 260 desenhos que ele tentou imprimir de uma vez. Peça que o terceiro FABRICA sai
   daqui como barra, não como peça cortada: as RT-01/RT-02 têm o 2º romaneio de material provando
   isso ("TB 3/4\" — 220 barras de 6m"). Cortar de novo aqui seria cortar duas vezes.

   ⚠ CROQUI COMPARTILHADO NÃO SAI. O mesmo croqui pode compor um conjunto que foi para o terceiro e
   outro que fica aqui; nesse caso ele continua sendo trabalho nosso. Só sai o croqui cujos
   conjuntos estão TODOS fora. Hoje não há nenhum compartilhado (conferido nas quatro remessas), mas
   a regra sem a guarda apagaria trabalho de verdade no dia em que houver.

   ⚠ DEVOLVE `id`, não marca. Marca não é única entre OPs [[torg_marca_nao_unica]] e o croqui não
   tem como ser encontrado por marca nenhuma — o vínculo é a tabela ConjuntoCroqui. */

/** @returns {Promise<Set<string>>} ids de PecaConjunto que estão com terceiro (conjuntos + croquis exclusivos). */
export async function pecasNoTerceiro(banco = prisma) {
  const remessas = await banco.romaneioTerceiro.findMany({
    where: { status: { not: "CANCELADO" } },
    select: { status: true, opRefNumero: true, itens: true, retornos: true },
  });
  const fora = chavesNoTerceiro(remessas);
  if (!fora.size) return new Set();

  const marcas = [...new Set(remessas.flatMap((r) => (Array.isArray(r.itens) ? r.itens : [])
    .map((i) => String(i?.marca || "").trim())).filter(Boolean))];
  if (!marcas.length) return new Set();

  const candidatos = await banco.pecaConjunto.findMany({
    where: { marca: { in: marcas } },
    select: { id: true, marca: true, opNumero: true, op: { select: { numero: true } },
              conjuntoCroquis: { select: { croquiId: true } } },
  });
  const conjuntos = candidatos.filter((p) => noTerceiro(fora, p.op?.numero || p.opNumero, p.marca));
  const ids = new Set(conjuntos.map((p) => p.id));

  const croquiIds = [...new Set(conjuntos.flatMap((c) => c.conjuntoCroquis.map((x) => x.croquiId)))];
  if (croquiIds.length) {
    const usos = await banco.conjuntoCroqui.findMany({
      where: { croquiId: { in: croquiIds } },
      select: { croquiId: true, conjuntoId: true },
    });
    const porCroqui = new Map();
    for (const u of usos) {
      if (!porCroqui.has(u.croquiId)) porCroqui.set(u.croquiId, []);
      porCroqui.get(u.croquiId).push(u.conjuntoId);
    }
    for (const [croquiId, donos] of porCroqui) if (donos.every((id) => ids.has(id))) ids.add(croquiId);
  }
  return ids;
}
