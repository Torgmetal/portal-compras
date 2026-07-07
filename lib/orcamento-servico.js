// Tipos de serviço do orçamento de serviço (Comercial → Central de Orçamentos).
export const SERVICOS = [
  { key: "CORTE_FURACAO", label: "Corte e furação de vigas" },
  { key: "JATEAMENTO", label: "Jateamento" },
  { key: "PINTURA", label: "Pintura" },
  { key: "SOLDA", label: "Solda" },
];
export const SERVICO_KEYS = SERVICOS.map((s) => s.key);
export const SERVICO_LABEL = Object.fromEntries(SERVICOS.map((s) => [s.key, s.label]));

export const STATUS_SERVICO = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};
