// Categorias de item de OP. Cada categoria tem um "tipo" default, mas o
// usuário pode mudar se precisar (Outro fica sempre como GENERICO).

export const CATEGORIAS_MATERIAL = [
  { codigo: "MATERIA_PRIMA",        label: "Matéria Prima",        tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TINTA",                label: "Tinta",                tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "PARAFUSOS",            label: "Parafusos",            tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TELHAS",               label: "Telhas",               tipo: "AREA",      unidade: "M²" },
  { codigo: "CALHAS_RUFOS",         label: "Calhas e Rufos",       tipo: "VERBA",     unidade: null },
  { codigo: "STEEL_DECK",           label: "Steel Deck",           tipo: "AREA",      unidade: "M²" },
  { codigo: "PLACA_WALL",           label: "Placa Wall",           tipo: "AREA",      unidade: "M²" },
  { codigo: "GALVANIZACAO",         label: "Galvanização",         tipo: "ESTRUTURA", unidade: "KG" },
];

// Servicos contratados de terceiros — engenharia, dobra, calandragem, etc.
// Codigos sao prefixados com SERV_ pra agrupar visualmente (igual ALUGUEL_).
export const CATEGORIAS_SERVICOS_TERCEIRIZADOS = [
  { codigo: "SERV_CALCULO_ESTRUTURAL",   label: "Cálculo Estrutural",   tipo: "VERBA", unidade: null },
  { codigo: "SERV_PROJETO_TERCEIRIZADO", label: "Projeto Terceirizado", tipo: "VERBA", unidade: null },
  { codigo: "SERV_DOBRA",                label: "Dobra",                tipo: "VERBA", unidade: null },
  { codigo: "SERV_CALANDRAGEM",          label: "Calandragem",          tipo: "VERBA", unidade: null },
  { codigo: "SERV_FRETES_ENTREGA",       label: "Fretes de Entrega",    tipo: "VERBA", unidade: null },
];

export const LOCAIS_ESTOQUE = [
  { codigo: "FABRICA",  label: "Fábrica" },
  { codigo: "TERCEIRO", label: "Terceiro" },
];

export const CATEGORIAS_ALUGUEL = [
  { codigo: "ALUGUEL_PLATAFORMA",        label: "Plataforma",                  tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MUNCK",             label: "Munck",                       tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GUINDASTE",         label: "Guindaste",                   tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GERADOR",           label: "Gerador",                     tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MACARICO",          label: "Maçarico",                    tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_PERFURATRIZ",       label: "Perfuratriz",                 tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_CONTAINER",         label: "Container",                   tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_BANHEIRO",          label: "Banheiro de Obra",            tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_SOLDA_STUDBOLT",    label: "Máquina de Solda Stud Bolt",  tipo: "ALUGUEL" },
];

export const CATEGORIA_OUTRO = { codigo: "OUTRO", label: "Outro (descrever)", tipo: "GENERICO", unidade: "UN" };

export const TODAS_CATEGORIAS = [
  ...CATEGORIAS_MATERIAL,
  ...CATEGORIAS_SERVICOS_TERCEIRIZADOS,
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

export function isServicoTerceirizado(categoria) {
  return categoria?.startsWith("SERV_");
}

export function labelCategoria(codigo) {
  const c = getCategoria(codigo);
  if (isAluguel(codigo)) return `Aluguel — ${c.label}`;
  if (isServicoTerceirizado(codigo)) return `Serviço — ${c.label}`;
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

// Retorna agrupamento {materiais, servicos, alugueis, outros}
export function agruparPorGrupo(itens) {
  const materiais = [];
  const servicos = [];
  const alugueis = [];
  const outros = [];
  for (const it of itens || []) {
    if (isAluguel(it.categoria)) alugueis.push(it);
    else if (isServicoTerceirizado(it.categoria)) servicos.push(it);
    else if (it.categoria === "OUTRO") outros.push(it);
    else materiais.push(it);
  }
  return { materiais, servicos, alugueis, outros };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PLANILHA COMERCIAL DO ESTUDO → ITENS CONTRATADOS DA OP.
//
// Vitor (19/08/2026): "você lê a planilha, coloca lá, mas me fala que não posso salvar a OP por
// não ter adicionado um item — você precisa preencher os campos de itens contratados também… o
// ideal é trazer exatamente as mesmas linhas da planilha comercial".
//
// As linhas da PLANILHA COMERCIAL já são os itens do contrato — mesma descrição, mesma unidade,
// mesma quantidade e mesmo valor. Digitar de novo é retrabalho e fonte de divergência entre o que
// foi vendido e o que a OP diz que foi vendido.

// ⚠ ORDEM IMPORTA: as regras ESPECÍFICAS vêm primeiro. "Cálculo estrutural, memorial e ART"
// contém "estrutural" e caía em MATÉRIA PRIMA quando a regra genérica vinha antes.
const RX_CATEGORIA = [
  [/c[áa]lculo\s+estrutural|memorial\s+e\s+art|\bart\b/i, "SERV_CALCULO_ESTRUTURAL"],
  [/projeto\s+terceiriz|detalhamento\s+terceiriz/i, "SERV_PROJETO_TERCEIRIZADO"],
  [/frete|transporte/i, "SERV_FRETES_ENTREGA"],
  [/telha|steel\s*deck/i, "TELHAS"],
  [/calha|rufo|cumeeira|pingadeira/i, "CALHAS_RUFOS"],
  [/tinta|pintura|primer/i, "TINTA"],
  [/parafus|fixador|chumbador/i, "PARAFUSOS"],
  [/galvaniza/i, "GALVANIZACAO"],
  [/\bdobra\b/i, "SERV_DOBRA"],
  [/calandra/i, "SERV_CALANDRAGEM"],
  [/estrutura|perfil|chapa/i, "MATERIA_PRIMA"],
];

/** Categoria da OP a partir da descrição do item comercial. Sem casar, cai em OUTRO. */
export function categoriaDoItemComercial(descricao) {
  const d = String(descricao || "");
  for (const [rx, cod] of RX_CATEGORIA) if (rx.test(d)) return cod;
  return "OUTRO";
}

/**
 * Converte as linhas da PLANILHA COMERCIAL nos itens contratados da OP.
 * ⚠ Mantém a UNIDADE e a QUANTIDADE da planilha, não a unidade default da categoria: o contrato
 * é o que a planilha diz (LANTERNIM em metro, não em kg).
 */
export function itensDaPlanilhaComercial(itensComerciais) {
  return (itensComerciais || [])
    .filter((i) => i?.descricao && (i.valor > 0 || i.quantidade > 0))
    .map((i) => {
      const codigo = categoriaDoItemComercial(i.descricao);
      const cat = getCategoria(codigo);
      return {
        categoria: codigo,
        tipo: i.verba ? "VERBA" : cat.tipo,
        descricao: String(i.descricao).slice(0, 200),
        localEstoque: "FABRICA",
        unidade: (i.unidade || cat.unidade || "").toUpperCase() || null,
        qtdContratada: i.verba ? 0 : Number(i.quantidade) || 0,
        cmcMedio: 0, meses: 0, valorPorMes: 0, capacidade: "",
        valorVerba: Math.round((Number(i.valor) || 0) * 100) / 100,
        faturamentoDireto: false,
        observacao: i.item ? `Item ${i.item} da planilha comercial do estudo` : null,
      };
    });
}
