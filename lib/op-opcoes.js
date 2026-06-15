// Opções selecionáveis na abertura da OP (estoque do material + tipo de data book).
// Plano JS puro — usado no form de abertura, na edição e no módulo de Qualidade.

export const ESTOQUE_MATERIAL_OPCOES = [
  { value: "PROPRIO_TORG", label: "Próprio (Torg)" },
  { value: "CLIENTE_TERCEIRO", label: "Cliente / Terceiro" },
];

export const TIPO_DATABOOK_OPCOES = [
  { value: "PADRAO_TORG", label: "Padrão Torg" },
  { value: "SNQC", label: "SNQC" },
  { value: "RELATORIO_ACOMPANHAMENTO", label: "Apenas Relatório de Acompanhamento" },
];

export const ESTOQUE_MATERIAL_LABEL = Object.fromEntries(ESTOQUE_MATERIAL_OPCOES.map((o) => [o.value, o.label]));
export const TIPO_DATABOOK_LABEL = Object.fromEntries(TIPO_DATABOOK_OPCOES.map((o) => [o.value, o.label]));

export const ESTOQUE_MATERIAL_VALUES = ESTOQUE_MATERIAL_OPCOES.map((o) => o.value);
export const TIPO_DATABOOK_VALUES = TIPO_DATABOOK_OPCOES.map((o) => o.value);
