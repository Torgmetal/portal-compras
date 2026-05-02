// Categorias de item de OP. Cada categoria tem um "tipo" default, mas o
// usuário pode mudar se precisar (Outro fica sempre como GENERICO).

export const CATEGORIAS_MATERIAL = [
  { codigo: "MATERIA_PRIMA",  label: "Matéria Prima",     tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TINTA",          label: "Tinta",             tipo: "VERBA",     unidade: null },
  { codigo: "PARAFUSOS",      label: "Parafusos",         tipo: "VERBA",     unidade: null },
  { codigo: "TELHAS",         label: "Telhas",            tipo: "AREA",      unidade: "M²" },
  { codigo: "CALHAS_RUFOS",   label: "Calhas e Rufos",    tipo: "VERBA",     unidade: null },
  { codigo: "STEEL_DECK",     label: "Steel Deck",        tipo: "AREA",      unidade: "M²" },
  { codigo: "PLACA_WALL",     label: "Placa Wall",        tipo: "AREA",      unidade: "M²" },
  { codigo: "GALVANIZACAO",   label: "Galvanização",      tipo: "VERBA",     unidade: null },
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
