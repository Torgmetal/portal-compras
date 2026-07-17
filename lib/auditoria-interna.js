// Constantes da Auditoria Interna da Qualidade (puro JS — client e server).

export const numRAI = (n) => `RAI-${String(n).padStart(3, "0")}`;

// Setores/processos passíveis de auditoria interna (sugestão; o campo é livre).
export const SETORES_AUDITORIA = [
  "Comercial", "Engenharia", "Suprimentos / Compras", "PCP", "Planejamento",
  "Preparação / Corte", "Montagem", "Solda", "Pintura / Jateamento",
  "Expedição", "Almoxarifado", "Qualidade", "RH", "Financeiro", "Diretoria",
];

// Tipo de cada constatação do relatório enxuto.
export const TIPO_CONSTATACAO = {
  CONFORME: { label: "Conformidade", curto: "Conforme", cor: "#059669", bg: "#ecfdf5", borda: "#a7f3d0" },
  NAO_CONFORME: { label: "Não-conformidade", curto: "Não-conforme", cor: "#b91c1c", bg: "#fef2f2", borda: "#fecaca" },
  MELHORIA: { label: "Oportunidade de melhoria", curto: "Melhoria", cor: "#b45309", bg: "#fffbeb", borda: "#fde68a" },
};
export const TIPOS = ["CONFORME", "NAO_CONFORME", "MELHORIA"];
export const tipoLabel = (t) => TIPO_CONSTATACAO[t]?.label || t;

export const STATUS_AI = {
  AGENDADA: { label: "Agendada", cor: "bg-blue-100 text-blue-700" },
  REALIZADA: { label: "Relatório em elaboração", cor: "bg-amber-100 text-amber-700" },
  EMITIDO: { label: "Emitido", cor: "bg-emerald-100 text-emerald-700" },
};
export const statusAiLabel = (s) => STATUS_AI[s]?.label || s;
