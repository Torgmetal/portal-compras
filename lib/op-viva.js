// ─── OP VIVA: o que ainda conta para a fábrica ────────────────────────────────
// Vitor (23/08/2026), no pente-fino do fluxo: a Carga do Corte mostrava um backlog
// em que a maior parte era de obra já entregue.
//
// ⚠⚠ PEÇA NÃO SAI DE "CORTE" QUANDO A OP ENCERRA. O status da peça só avança por apontamento no
// Syneco; encerrar a OP não varre as peças. Então toda obra que fecha deixa o seu resíduo dentro
// da fila de corte para sempre — e a fila filtrava só pelo status da PEÇA, nunca pelo da OP.
//
// Medido em 24/08/2026: dos 9.769 itens em corte (872.216 kg), **2.631 peças / 399.178 kg são de
// OP ENCERRADA** — quase metade do peso. O PCP planejava a carga e o "quando cabe obra nova" em
// cima de trabalho que ninguém vai fazer.
//
// ⚠ A REGRA MORA AQUI, num lugar só. Três telas perguntavam "o que está na fila" cada uma do seu
// jeito; foi assim que a mesma grandeza passou a ter números diferentes em telas diferentes.

/** Status de OP que já saíram do jogo — peça delas não entra em fila, carga nem meta. */
export const STATUS_OP_MORTA = ["ENCERRADA", "CANCELADA"];

/**
 * Fragmento de `where` do Prisma para "a OP desta peça ainda está viva".
 *
 * ⚠ peça SEM OP passa: existe peça legítima de obra antiga sem vínculo, e excluí-la esconderia
 * trabalho real. O que se corta é o que se sabe estar morto, não o que não se sabe.
 */
export const OP_VIVA = { OR: [{ opId: null }, { op: { status: { notIn: STATUS_OP_MORTA } } }] };

/** true se a OP (objeto ou status) ainda conta. Para filtrar em memória. */
export function opViva(op) {
  const s = typeof op === "string" ? op : op?.status;
  return !s || !STATUS_OP_MORTA.includes(String(s));
}
