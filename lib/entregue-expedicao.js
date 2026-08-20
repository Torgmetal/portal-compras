import "server-only";

// ONDE O PCP SE DESPEDE DA PEÇA.
//
// Vitor (19/08/2026): *"acho que uma das coisas que falta para o portal é justamente o fim. Na
// minha opinião a despedida do PCP para a peça é justamente na liberação da pintura para a
// expedição. Minha sugestão: fez o romaneio prévio, ou emitiu o romaneio, sim essa peça deve sair
// do portal do PCP e a responsabilidade passa a ser do próximo setor"*.
//
// A régua é essa e faz sentido: PCP entrega a peça, não a acompanha até a nota fiscal. Sem um fim
// definido, a raia de Expedição virava depósito — a peça ficava lá para sempre, ninguém sabia se
// era pendência de quem produz ou de quem embarca, e o número "a liberar" nunca fechava.
//
// O CORTE É O ROMANEIO, prévio ou emitido:
//   · `RomaneioPrevio` (status ≠ CANCELADO) — a Expedição já montou a carga. Vale mesmo sem estar
//     emitido: o compromisso de embarcar aquela peça já existe.
//   · `RomaneioItem` — a peça entrou num romaneio consolidado. Não tem volta.
//
// ⚠ O PRÉVIO CASA POR MARCA, não por id: `RomaneioPrevio.itens` é Json
// (`[{frente, marca, descricao, qte, pesoTotal}]`), sem FK pra PecaConjunto. Por isso a função
// devolve um Set de MARCAS normalizadas (trim + maiúscula) — comparar cru erra em espaço e caixa.
//
// 🚫 Isto NÃO apaga nem muda nada na peça: é só quem a lista do PCP deixa de mostrar. Quem
// consumir deve dizer quantas saíram por esse motivo, em vez de deixar o total encolher sozinho —
// peça que some sem explicação é a mesma dor que essa regra veio resolver.

/**
 * Marcas da OP que já foram entregues à Expedição (romaneio prévio ou emitido).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} opId
 * @returns {Promise<Set<string>>} marcas em MAIÚSCULA, sem espaço nas pontas
 */
export async function marcasEntreguesAExpedicao(prisma, opId) {
  const marcas = new Set();
  if (!opId) return marcas;
  const add = (m) => { const k = String(m || "").trim().toUpperCase(); if (k) marcas.add(k); };

  const [previos, itens] = await Promise.all([
    prisma.romaneioPrevio.findMany({
      where: { opId, status: { not: "CANCELADO" } },
      select: { itens: true },
    }),
    prisma.romaneioItem.findMany({
      where: { pecaConjunto: { opId } },
      select: { pecaConjunto: { select: { marca: true } } },
    }),
  ]);

  for (const p of previos) for (const i of Array.isArray(p.itens) ? p.itens : []) add(i?.marca);
  for (const i of itens) add(i.pecaConjunto?.marca);
  return marcas;
}

/** true se a peça já saiu da mão do PCP. */
export function entregueAExpedicao(peca, marcasEntregues) {
  return marcasEntregues.has(String(peca?.marca || "").trim().toUpperCase());
}
