// ─── A IDENTIDADE DO TRABALHO NUM POSTO ──────────────────────────────────────
//
// ⚠⚠ O QUE NÃO PODE EXISTIR DUAS VEZES ABERTO NO MESMO POSTO É (OBRA, MARCA) — não "uma sessão".
// Matheus (13/09/2026): *"tem que ser possível multi marcas ao mesmo tempo numa máquina"*. Mas a
// MESMA marca da MESMA obra aberta duas vezes no mesmo posto continua sendo o defeito antigo: os
// apontamentos se dividem entre as duas sessões e o monitor mostra a máquina em dois estados.
//
// ⚠⚠ E A CHAVE PRECISA DA OBRA (achado do Codex, 13/09/2026). `(recurso, marca)` misturaria a
// `T97A16` da obra 097 com a da 102 — duas peças diferentes que por acaso se chamam igual — e uma
// impediria a outra de abrir.
//
// ⚠ A obra tem 90 grafias no banco ("89", "089", "T89A", "T89C" são a mesma OP-89), o problema
// multi-chave do CLAUDE.md: a chave usa só os dígitos, senão a mesma obra abriria duas vezes.

/** Trabalho sem marca (o operador só abriu a máquina). ⚠ Identidade nula NÃO pode furar a trava. */
export const LIVRE = "—";

export function chaveDoTrabalho(opNumero, marca) {
  const m = String(marca ?? "").trim().toUpperCase();
  if (!m) return LIVRE;
  const obra = String(opNumero ?? "").replace(/\D/g, "").replace(/^0+/, "");
  // ⚠ Marca sem obra não vira `|MARCA`: sem obra não dá para saber de qual peça se trata, e deixar
  // passar faria duas obras diferentes disputarem a mesma trava.
  return obra ? `${obra}|${m}` : `?|${m}`;
}
