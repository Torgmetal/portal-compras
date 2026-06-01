// Constantes de setores compartilhadas entre PCP, Produção e Rastreabilidade.
// Extraído de MesClient.jsx pra evitar duplicação.

/** Hierarquia de referência — setor mais avançado primeiro.
 *  Usado pra determinar o "setor de referência" (peso real da OP). */
export const HIERARQUIA_REF = [
  "Expedição", "Pintura", "Jato", "Acabamento",
  "Solda", "Montagem", "Dobra", "Corte", "Usinagem",
];

/** Ordem visual do fluxo produtivo (esquerda → direita) */
export const FLUXO_VISUAL = [
  "Corte", "Dobra", "Montagem", "Solda",
  "Acabamento", "Jato", "Pintura", "Expedição",
];

/** Mapa setor → status do PecaConjunto */
export const SETOR_STATUS_MAP = {
  corte: "CORTE",
  dobra: "CORTE",
  montagem: "MONTAGEM",
  solda: "SOLDA",
  acabamento: "ACABAMENTO",
  jato: "JATO",
  pintura: "PINTURA",
  expedicao: "EXPEDIDO",
};

/** Cores por setor (Tailwind classes) */
export const SETOR_CORES = {
  corte:      { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200",    hex: "#b91c1c" },
  dobra:      { bg: "bg-pink-100",   text: "text-pink-700",   border: "border-pink-200",   hex: "#be185d" },
  montagem:   { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-200",   hex: "#1d4ed8" },
  solda:      { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200", hex: "#c2410c" },
  acabamento: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", hex: "#7e22ce" },
  jato:       { bg: "bg-cyan-100",   text: "text-cyan-700",   border: "border-cyan-200",   hex: "#0e7490" },
  pintura:    { bg: "bg-green-100",  text: "text-green-700",  border: "border-green-200",  hex: "#15803d" },
  expedicao:  { bg: "bg-teal-100",   text: "text-teal-700",   border: "border-teal-200",   hex: "#0f766e" },
  usinagem:   { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200", hex: "#a16207" },
};

/** Normaliza nome de setor pra chave de lookup (sem acento, lowercase) */
export function normSetor(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

/** Retorna objeto de cores pra um setor */
export function corSetor(setor) {
  const key = normSetor(setor);
  return SETOR_CORES[key] || { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", hex: "#6b7280" };
}

/** Retorna classe Tailwind combinada (bg + text + border) pra badges */
export function badgeSetor(setor) {
  const c = corSetor(setor);
  return `${c.bg} ${c.text} ${c.border}`;
}
