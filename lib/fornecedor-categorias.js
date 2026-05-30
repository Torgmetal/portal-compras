// Categorias de fornecedores (Vendor List). Diferente das categorias de
// itens da OP — aqui agrupa fornecedores por TIPO DE PRODUTO/SERVICO
// que eles atendem.
//
// As 7 categorias abaixo sao BUILT-IN (sempre presentes, nao podem ser
// removidas). Categorias adicionais sao cadastradas no banco pelo
// admin/compras via UI (model CategoriaFornecedor).

export const CATEGORIAS_FORNECEDOR_BUILTIN = [
  { codigo: "MATERIA_PRIMA",         label: "Matéria Prima",         color: "blue",    builtin: true },
  { codigo: "TINTA",                 label: "Tinta",                 color: "purple",  builtin: true },
  { codigo: "PARAFUSOS",             label: "Parafusos",             color: "slate",   builtin: true },
  { codigo: "MATERIAL_AUXILIAR",     label: "Material Auxiliar",     color: "amber",   builtin: true },
  { codigo: "EPI",                   label: "EPI",                   color: "red",     builtin: true },
  { codigo: "FERRAMENTAS",           label: "Ferramentas",           color: "emerald", builtin: true },
  { codigo: "SERVICOS",              label: "Serviços",              color: "orange",  builtin: true },
  // Promovidas pra built-in (eram custom no banco)
  { codigo: "GRADE_DE_PISO",         label: "Grade de Piso",         color: "cyan",    builtin: true },
  { codigo: "TELHAS_CALHAS_E_RUFOS", label: "Telhas, Calhas e Rufos", color: "indigo",  builtin: true },
  { codigo: "TRANSPORTE",            label: "Transporte",            color: "teal",    builtin: true },
];

// Alias pra compatibilidade com codigo existente — antes era a lista
// completa, agora e so as built-in. Pra ter a lista completa, use
// mergeCategorias(custom) onde custom vem do banco.
export const CATEGORIAS_FORNECEDOR = CATEGORIAS_FORNECEDOR_BUILTIN;

// Mescla built-in com categorias customizadas (do banco)
export function mergeCategorias(custom = []) {
  const codigosBuiltin = new Set(CATEGORIAS_FORNECEDOR_BUILTIN.map((c) => c.codigo));
  const customLimpas = (custom || [])
    .filter((c) => !codigosBuiltin.has(c.codigo)) // evita conflito de codigo
    .map((c) => ({ ...c, builtin: false }));
  return [...CATEGORIAS_FORNECEDOR_BUILTIN, ...customLimpas];
}

// Lookup considerando lista (built-in + custom) — passa a lista mesclada
// quando precisar de codigos customizados. Sem argumento usa so built-in.
export function getCategoriaFornecedor(codigo, lista = CATEGORIAS_FORNECEDOR_BUILTIN) {
  return lista.find((c) => c.codigo === codigo) || null;
}

export function labelCategoriaFornecedor(codigo, lista = CATEGORIAS_FORNECEDOR_BUILTIN) {
  return getCategoriaFornecedor(codigo, lista)?.label || codigo;
}

// Classes Tailwind por cor da categoria — usadas nos chips/badges.
// Paleta ampla pra diversificar tipos de material/servico.
export const CHIP_CLASSES = {
  // Cores principais (das categorias built-in)
  blue:    "bg-torg-blue-50 text-torg-blue border-torg-blue-200",
  purple:  "bg-purple-50 text-purple-700 border-purple-200",
  slate:   "bg-slate-100 text-slate-700 border-slate-300",
  amber:   "bg-amber-50 text-amber-800 border-amber-200",
  red:     "bg-red-50 text-red-700 border-red-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  orange:  "bg-torg-orange-50 text-torg-orange-700 border-torg-orange-200",
  cyan:    "bg-cyan-50 text-cyan-700 border-cyan-200",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  // Cores extras pra categorias customizadas
  pink:    "bg-pink-50 text-pink-700 border-pink-200",
  teal:    "bg-teal-50 text-teal-700 border-teal-200",
  yellow:  "bg-yellow-50 text-yellow-800 border-yellow-300",
  green:   "bg-green-50 text-green-700 border-green-200",
  rose:    "bg-rose-50 text-rose-700 border-rose-200",
  violet:  "bg-violet-50 text-violet-700 border-violet-200",
  sky:     "bg-sky-50 text-sky-700 border-sky-200",
  lime:    "bg-lime-50 text-lime-800 border-lime-300",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  stone:   "bg-stone-100 text-stone-700 border-stone-300",
  zinc:    "bg-zinc-100 text-zinc-700 border-zinc-300",
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

// Lista exposta no seletor de cores (ordenada pra grupos visuais legais).
// Frias → quentes → neutras.
export const CORES_DISPONIVEIS = [
  // Frias/azuis
  "blue", "sky", "cyan", "teal",
  // Verdes
  "emerald", "green", "lime",
  // Quentes/amarelas
  "yellow", "amber", "orange",
  // Vermelhas/rosas
  "red", "rose", "pink", "fuchsia",
  // Roxas
  "purple", "violet", "indigo",
  // Neutras
  "slate", "stone", "zinc", "neutral",
];

export function chipCategoriaFornecedor(codigo, lista = CATEGORIAS_FORNECEDOR_BUILTIN) {
  const cat = getCategoriaFornecedor(codigo, lista);
  if (!cat) return CHIP_CLASSES.slate;
  return CHIP_CLASSES[cat.color] || CHIP_CLASSES.slate;
}

// Gera codigo SLUG a partir de um label (ex: "Pintura Automotiva" → "PINTURA_AUTOMOTIVA")
export function slugifyCategoria(label) {
  return String(label || "")
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 50);
}
