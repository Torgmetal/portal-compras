// Categorias de fornecedores (Vendor List). Diferente das categorias de
// itens da OP — aqui agrupa fornecedores por TIPO DE PRODUTO/SERVICO
// que eles atendem.

export const CATEGORIAS_FORNECEDOR = [
  { codigo: "MATERIA_PRIMA",     label: "Matéria Prima",     color: "blue" },
  { codigo: "TINTA",             label: "Tinta",             color: "purple" },
  { codigo: "PARAFUSOS",         label: "Parafusos",         color: "slate" },
  { codigo: "MATERIAL_AUXILIAR", label: "Material Auxiliar", color: "amber" },
  { codigo: "EPI",               label: "EPI",               color: "red" },
  { codigo: "FERRAMENTAS",       label: "Ferramentas",       color: "emerald" },
  { codigo: "SERVICOS",          label: "Serviços",          color: "orange" },
];

export function getCategoriaFornecedor(codigo) {
  return CATEGORIAS_FORNECEDOR.find((c) => c.codigo === codigo) || null;
}

export function labelCategoriaFornecedor(codigo) {
  return getCategoriaFornecedor(codigo)?.label || codigo;
}

// Classes Tailwind por cor da categoria — usadas nos chips/badges
export const CHIP_CLASSES = {
  blue:    "bg-torg-blue-50 text-torg-blue border-torg-blue-200",
  purple:  "bg-purple-50 text-purple-700 border-purple-200",
  slate:   "bg-slate-100 text-slate-700 border-slate-300",
  amber:   "bg-amber-50 text-amber-800 border-amber-200",
  red:     "bg-red-50 text-red-700 border-red-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  orange:  "bg-torg-orange-50 text-torg-orange-700 border-torg-orange-200",
};

export function chipCategoriaFornecedor(codigo) {
  const cat = getCategoriaFornecedor(codigo);
  if (!cat) return CHIP_CLASSES.slate;
  return CHIP_CLASSES[cat.color] || CHIP_CLASSES.slate;
}
