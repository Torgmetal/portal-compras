// OS CÓDIGOS DO ENSAIO VISUAL DE SOLDA.
//
// Saem da legenda do formulário da Torg (aba "Visual Solda" do modelo) e do PO-06 — Procedimento de
// Ensaio Visual e Dimensional de Soldas, R1.
//
// ⚠ Isto é lista fechada de propósito. Descontinuidade digitada à mão vira "mordedura", "MORDEDURA",
// "mord." e "MO" no mesmo relatório, e aí não dá para responder "quantas mordeduras teve a OP-089".
// Com código, o relatório fica pesquisável e o laudo pode se sugerir sozinho.

export const DESCONTINUIDADES = [
  { c: "TL", nome: "Trinca Longitudinal", grave: true },
  { c: "TT", nome: "Trinca Transversal", grave: true },
  { c: "PO", nome: "Porosidade" },
  { c: "MO", nome: "Mordedura" },
  { c: "OV", nome: "Sobreposição (Overlap)" },
  { c: "FF", nome: "Falta de Fusão", grave: true },
  { c: "FP", nome: "Falta de Penetração", grave: true },
  { c: "RE", nome: "Respingo (Splash)" },
  { c: "CO", nome: "Concavidade" },
  { c: "AA", nome: "Abertura de Arco" },
  { c: "DI", nome: "Deposição Insuficiente" },
];

export const LAUDOS = [
  { c: "A", nome: "Aprovado", cor: "verde" },
  { c: "R", nome: "Reprovado", cor: "vermelho" },
  { c: "REC", nome: "Recomendação de exame complementar", cor: "laranja" },
];

/**
 * O laudo que o portal SUGERE a partir das descontinuidades marcadas.
 *
 * ⚠ SUGERE, não decide. Trinca e falta de fusão/penetração não têm tolerância na AWS D1.1 — achou,
 * é reprovado, e não faz sentido deixar alguém marcar "aprovado" sem perceber. As demais dependem
 * de medida (profundidade da mordedura, tamanho do poro), e aí quem julga é o inspetor com o
 * critério na mão.
 */
export function laudoSugerido(codigos) {
  const lista = Array.isArray(codigos) ? codigos : String(codigos || "").split(/[\s,;]+/).filter(Boolean);
  if (!lista.length) return "A";
  if (lista.some((c) => DESCONTINUIDADES.find((d) => d.c === c)?.grave)) return "R";
  return null; // tem defeito, mas o julgamento é do inspetor
}

/** Iluminação mínima do PO-06, item 6.2 — verificada na superfície com luxímetro calibrado. */
export const LUX_MINIMO = 1076;

/** Técnicas previstas no PO-06. */
export const TECNICAS = ["Visual direta", "Visual direta com espelho", "Visual remota"];

export const CONDICOES = [
  "Como soldado",
  "Escovada",
  "Esmerilhada",
  "Jateada",
  "Limpa, sem respingos",
];
