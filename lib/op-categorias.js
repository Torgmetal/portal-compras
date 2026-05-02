// Categorias de item de OP. Cada categoria tem um "tipo" default, mas o
// usuário pode mudar se precisar (Outro fica sempre como GENERICO).

export const CATEGORIAS_MATERIAL = [
  { codigo: "MATERIA_PRIMA",  label: "Matéria Prima",     tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TINTA",          label: "Tinta",             tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "PARAFUSOS",      label: "Parafusos",         tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TELHAS",         label: "Telhas",            tipo: "AREA",      unidade: "M²" },
  { codigo: "CALHAS_RUFOS",   label: "Calhas e Rufos",    tipo: "VERBA",     unidade: null },
  { codigo: "STEEL_DECK",     label: "Steel Deck",        tipo: "AREA",      unidade: "M²" },
  { codigo: "PLACA_WALL",     label: "Placa Wall",        tipo: "AREA",      unidade: "M²" },
  { codigo: "GALVANIZACAO",   label: "Galvanização",      tipo: "ESTRUTURA", unidade: "KG" },
];

export const LOCAIS_ESTOQUE = [
  { codigo: "FABRICA",  label: "Fábrica" },
  { codigo: "TERCEIRO", label: "Terceiro" },
];

export const CATEGORIAS_ALUGUEL = [
  { codigo: "ALUGUEL_PLATAFORMA",   label: "Plataforma",      tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MUNCK",        label: "Munck",            tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GUINDASTE",    label: "Guindaste",        tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GERADOR",      label: "Gerador",          tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MACARICO",     label: "Maçarico",         tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_PERFURATRIZ",  label: "Perfuratriz",      tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_CONTAINER",    label: "Container",        tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_BANHEIRO",     label: "Banheiro de Obra", tipo: "ALUGUEL" },
];

export const CATEGORIA_OUTRO = { codigo: "OUTRO", label: "Outro (descrever)", tipo: "GENERICO", unidade: "UN" };

export const TODAS_CATEGORIAS = [
  ...CATEGORIAS_MATERIAL,
  ...CATEGORIAS_ALUGUEL,
  CATEGORIA_OUTRO,
];

export const TIPOS_ITEM = ["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"];

export function getCategoria(codigo) {
  return TODAS_CATEGORIAS.find((c) => c.codigo === codigo) || CATEGORIA_OUTRO;
}

export function isAluguel(categoria) {
  return categoria?.startsWith("ALUGUEL_");
}

export function labelCategoria(codigo) {
  const c = getCategoria(codigo);
  if (isAluguel(codigo)) return `Aluguel — ${c.label}`;
  return c.label;
}

// Categorias unicas presentes nos itens da OP (base + aditivos)
export function categoriasUnicasOP(op) {
  const set = new Set();
  for (const it of op?.itens || []) set.add(it.categoria);
  for (const ad of op?.aditivos || []) {
    for (const it of ad.itens || []) set.add(it.categoria);
  }
  return Array.from(set);
}

// Retorna agrupamento {label: "Materiais"|"Aluguéis"|"Outros", itens: [...]}
export function agruparPorGrupo(itens) {
  const materiais = [];
  const alugueis = [];
  const outros = [];
  for (const it of itens || []) {
    if (isAluguel(it.categoria)) alugueis.push(it);
    else if (it.categoria === "OUTRO") outros.push(it);
    else materiais.push(it);
  }
  return { materiais, alugueis, outros };
}
