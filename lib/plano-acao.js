// Plano de Ação 5W2H (Qualidade) — constantes compartilhadas (puro JS).

export const numPA = (n) => `PA-${String(n).padStart(3, "0")}`;

// As 7 colunas do 5W2H, na ordem clássica.
export const COLUNAS_5W2H = [
  { key: "oque", w: "What", label: "O quê", desc: "A ação a executar", ph: "O que será feito" },
  { key: "porque", w: "Why", label: "Por quê", desc: "Justificativa", ph: "Por que fazer" },
  { key: "onde", w: "Where", label: "Onde", desc: "Local / setor", ph: "Onde" },
  { key: "quem", w: "Who", label: "Quem", desc: "Responsável", ph: "Responsável" },
  { key: "quando", w: "When", label: "Quando", desc: "Prazo", ph: "", tipo: "date" },
  { key: "como", w: "How", label: "Como", desc: "Método", ph: "Como será feito" },
  { key: "quanto", w: "How much", label: "Quanto", desc: "Custo", ph: "Custo (R$)" },
];

// Status de cada AÇÃO (item). "ATRASADO" é derivado do prazo, não é gravado.
export const STATUS_ITEM = {
  A_FAZER: { label: "A fazer", cor: "#576D7E", bg: "#f1f5f9" },
  EM_ANDAMENTO: { label: "Em andamento", cor: "#1e40af", bg: "#dbeafe" },
  CONCLUIDO: { label: "Concluído", cor: "#065f46", bg: "#d1fae5" },
};
export const SITUACAO_ITEM = { ...STATUS_ITEM, ATRASADO: { label: "Atrasado", cor: "#b91c1c", bg: "#fee2e2" } };
export const STATUS_ITEM_OPCOES = ["A_FAZER", "EM_ANDAMENTO", "CONCLUIDO"];

// Status do PLANO todo.
export const STATUS_PLANO = {
  EM_ANDAMENTO: { label: "Em andamento", cor: "bg-blue-100 text-blue-700" },
  CONCLUIDO: { label: "Concluído", cor: "bg-emerald-100 text-emerald-700" },
  CANCELADO: { label: "Cancelado", cor: "bg-gray-200 text-gray-600" },
};
export const STATUS_PLANO_OPCOES = ["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"];

const utc0 = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };

// Situação de exibição de uma ação: concluída/em andamento pelo status; a fazer
// com prazo vencido vira ATRASADO.
export function situacaoItem(it, agora = new Date()) {
  const s = it?.status || "A_FAZER";
  if (s === "CONCLUIDO" || s === "EM_ANDAMENTO") return s;
  if (it?.quando && utc0(agora) > utc0(it.quando)) return "ATRASADO";
  return "A_FAZER";
}
export const situacaoItemLabel = (s) => SITUACAO_ITEM[s]?.label || s;
