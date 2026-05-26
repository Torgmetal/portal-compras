// Matching de descricoes de materiais extraidas pela IA com o cadastro Omie
// Busca no EstoqueItem local (sincronizado do Omie) por similaridade

import { prisma } from "@/lib/prisma";

// Normaliza texto para comparacao (remove acentos, lowercase, limpa)
function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9.,/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extrai tokens relevantes de uma descricao de material
function extrairTokens(descricao) {
  const norm = normalizar(descricao);
  // Separa por espaco e filtra tokens muito curtos
  return norm.split(" ").filter((t) => t.length >= 2);
}

// Mapeia tipoMaterial da IA para palavras-chave de busca no Omie
const TIPO_KEYWORDS = {
  PERFIL_W: ["perfil w", "perfil h"],
  PERFIL_U: ["perfil dobrado", "udc", "perfil u"],
  PERFIL_L: ["cantoneira"],
  TUBO_REDONDO: ["tubo"],
  TUBO_QUADRADO: ["tubo"],
  TUBO_RETANGULAR: ["tubo"],
  CHAPA: ["chapa"],
  BARRA_REDONDA: ["barra"],
  BARRA_CHATA: ["barra chata"],
  BARRA_QUADRADA: ["barra"],
  BARRA_ROSCADA: ["barra roscada"],
  GRADE_PISO: ["grade", "piso"],
  TELA: ["tela"],
  DEGRAU: ["degrau"],
};

// Extrai dimensao principal de uma descricao (ex: "W 150x18" -> "150", "U 200x50x3,8" -> "200")
function extrairDimensao(descricao) {
  const norm = normalizar(descricao);
  // Padroes: W150, W 150, 150x, Ø16, Ø 16
  const patterns = [
    /w\s*(\d+)/i,
    /h\s*(\d+)/i,
    /udc?\s*(\d+)/i,
    /u\s*(\d+)/i,
    /l\s*(\d+)/i,
    /(\d+)\s*x/i,
    /[oø]\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = norm.match(p);
    if (m) return m[1];
  }
  return null;
}

// Detecta a "familia" do produto Omie pela descricao
function detectarFamiliaOmie(descOmie) {
  const d = descOmie.toLowerCase();
  if (d.includes("perfil w ") || d.includes("perfil h ")) return "PERFIL_W";
  if (d.includes("perfil dobrado") || d.includes("udc")) return "PERFIL_U";
  if (d.includes("cantoneira")) return "PERFIL_L";
  if (d.includes("chapa")) return "CHAPA";
  if (d.includes("tubo")) return "TUBO";
  if (d.includes("barra roscada")) return "BARRA_ROSCADA";
  if (d.includes("barra chata")) return "BARRA_CHATA";
  if (d.includes("barra")) return "BARRA_REDONDA";
  if (d.includes("grade") || d.includes("piso")) return "GRADE_PISO";
  return "OUTRO";
}

// Calcula score de similaridade entre item IA e produto Omie
function calcularScore(itemIA, produtoOmie) {
  let score = 0;
  const descIA = normalizar(itemIA.descricao);
  const descOmie = normalizar(produtoOmie.descricao);
  const familiaOmie = detectarFamiliaOmie(produtoOmie.descricao);

  // 0. Penalidade forte se a familia do produto Omie nao combina
  const tipoIA = itemIA.tipoMaterial || "OUTRO";
  const familiasCompativeis = {
    PERFIL_W: ["PERFIL_W"],
    PERFIL_U: ["PERFIL_U"],
    PERFIL_L: ["PERFIL_L"],
    TUBO_REDONDO: ["TUBO"],
    TUBO_QUADRADO: ["TUBO"],
    TUBO_RETANGULAR: ["TUBO"],
    CHAPA: ["CHAPA"],
    BARRA_REDONDA: ["BARRA_REDONDA"],
    BARRA_CHATA: ["BARRA_CHATA"],
    BARRA_QUADRADA: ["BARRA_REDONDA"],
    BARRA_ROSCADA: ["BARRA_ROSCADA"],
    GRADE_PISO: ["GRADE_PISO"],
  };
  const compativeis = familiasCompativeis[tipoIA] || [tipoIA];
  if (!compativeis.includes(familiaOmie)) {
    // Tipo incompativel — penaliza fortemente
    return -100;
  }

  // 1. Match por tipo de material (peso alto)
  const keywords = TIPO_KEYWORDS[itemIA.tipoMaterial] || [];
  for (const kw of keywords) {
    if (descOmie.includes(kw)) {
      score += 30;
      break;
    }
  }

  // 2. Match por dimensao principal
  const dimIA = extrairDimensao(itemIA.descricao);
  if (dimIA) {
    // Procura a dimensao no nome do Omie (ex: W150, W 150, DN. W150, UDC 200)
    const dimPattern = new RegExp(`(w|h|udc|dn\\.?\\s*)${dimIA}\\b`, "i");
    if (descOmie.match(dimPattern)) {
      score += 40;
    } else {
      // Match generico por dimensao — exige word boundary para evitar falsos positivos
      // (ex: "75" nao deve casar com "4,75" que e espessura)
      const dimGenerico = new RegExp(`(?:^|[\\sx])${dimIA}(?:[x,\\s]|$)`, "i");
      if (descOmie.match(dimGenerico)) {
        score += 15;
      }
    }
  }

  // 3. Match por norma
  if (itemIA.norma) {
    const normaIA = normalizar(itemIA.norma);
    if (normaIA.includes("a572") && descOmie.includes("a 572")) score += 15;
    else if (normaIA.includes("a36") && descOmie.includes("a-36")) score += 15;
    else if (normaIA.includes("a36") && descOmie.includes("a 36")) score += 15;
  }

  // 4. Match por tokens em comum
  const tokensIA = extrairTokens(itemIA.descricao);
  const tokensOmie = extrairTokens(produtoOmie.descricao);
  let tokenMatches = 0;
  for (const t of tokensIA) {
    if (tokensOmie.some((to) => to.includes(t) || t.includes(to))) {
      tokenMatches++;
    }
  }
  score += tokenMatches * 5;

  return score;
}

/**
 * Busca o melhor match do Omie para uma lista de itens da IA
 * @param {Array} itensIA - itens extraidos pela IA
 * @returns {Array} mesmos itens com campos codigoOmie, descricaoOmie, custoUnitario adicionados
 */
export async function matchItensComOmie(itensIA) {
  // Buscar todos os produtos de estoque relevantes (materiais estruturais)
  const produtos = await prisma.estoqueItem.findMany({
    where: {
      OR: [
        { descricao: { contains: "PERFIL", mode: "insensitive" } },
        { descricao: { contains: "CHAPA", mode: "insensitive" } },
        { descricao: { contains: "BARRA", mode: "insensitive" } },
        { descricao: { contains: "CANTONEIRA", mode: "insensitive" } },
        { descricao: { contains: "TUBO", mode: "insensitive" } },
        { descricao: { contains: "GRADE", mode: "insensitive" } },
        { descricao: { contains: "TELA", mode: "insensitive" } },
        { descricao: { contains: "DEGRAU", mode: "insensitive" } },
        { descricao: { contains: "DOBRADO", mode: "insensitive" } },
      ],
    },
    select: {
      codigoOmie: true,
      descricao: true,
      cmc: true,
      unidade: true,
    },
  });

  if (produtos.length === 0) {
    // Sem produtos no cadastro, retorna itens sem match
    return itensIA.map((item) => ({
      ...item,
      codigoOmie: null,
      descricaoOmie: null,
      custoUnitario: null,
      matchScore: 0,
    }));
  }

  // Calcular CMC mediano por familia (fallback para itens sem match exato)
  // Usa mediana em vez de media para evitar distorcao por outliers (ex: itens com CMC por unidade em vez de por kg)
  const cmcValoresPorFamilia = {};
  for (const p of produtos) {
    const fam = detectarFamiliaOmie(p.descricao);
    if (!cmcValoresPorFamilia[fam]) cmcValoresPorFamilia[fam] = [];
    if (p.cmc > 0 && p.cmc < 50) {
      // Filtro: CMC > 50 R$/kg e quase certamente um erro (preco por unidade, nao por kg)
      // Aco estrutural tipicamente custa entre R$5-15/kg
      cmcValoresPorFamilia[fam].push(p.cmc);
    }
  }

  // Funcao para calcular mediana
  function mediana(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  const cmcPorFamilia = {};
  for (const [fam, valores] of Object.entries(cmcValoresPorFamilia)) {
    cmcPorFamilia[fam] = { mediana: mediana(valores), n: valores.length };
  }

  // CMC mediano global de aco (perfis W que sao referencia de mercado)
  const cmcAcoRef = cmcPorFamilia["PERFIL_W"]?.n > 0
    ? cmcPorFamilia["PERFIL_W"].mediana
    : 7.49; // fallback hardcoded (~R$7,50/kg referencia aco estrutural)

  // Mapa tipo IA → familia Omie para fallback de CMC
  const tipoParaFamilia = {
    PERFIL_W: "PERFIL_W", PERFIL_U: "PERFIL_U", PERFIL_L: "PERFIL_L",
    TUBO_REDONDO: "TUBO", TUBO_QUADRADO: "TUBO", TUBO_RETANGULAR: "TUBO",
    CHAPA: "CHAPA", BARRA_REDONDA: "BARRA_REDONDA", BARRA_CHATA: "BARRA_CHATA",
    BARRA_QUADRADA: "BARRA_REDONDA", BARRA_ROSCADA: "BARRA_ROSCADA",
    GRADE_PISO: "GRADE_PISO", TELA: "OUTRO", DEGRAU: "OUTRO",
  };

  return itensIA.map((item) => {
    let melhorScore = 0;
    let melhorMatch = null;

    for (const produto of produtos) {
      const score = calcularScore(item, produto);
      if (score > melhorScore) {
        melhorScore = score;
        melhorMatch = produto;
      }
    }

    // So vincula se o score for razoavel (>= 40 = pelo menos tipo + dimensao)
    const vinculou = melhorScore >= 40 && melhorMatch;

    if (vinculou) {
      return {
        ...item,
        codigoOmie: melhorMatch.codigoOmie,
        descricaoOmie: melhorMatch.descricao,
        custoUnitario: melhorMatch.cmc,
        matchScore: melhorScore,
      };
    }

    // Fallback: sem match exato, usar CMC mediano da familia ou referencia de aco
    const famFallback = tipoParaFamilia[item.tipoMaterial] || "OUTRO";
    const cmcFallback = cmcPorFamilia[famFallback]?.n > 0
      ? cmcPorFamilia[famFallback].mediana
      : cmcAcoRef;

    return {
      ...item,
      codigoOmie: null,
      descricaoOmie: null,
      custoUnitario: cmcFallback > 0 ? cmcFallback : null,
      matchScore: melhorScore,
      matchFallback: true, // flag indicando que o CMC e estimado
    };
  });
}

/**
 * Busca produtos no cadastro Omie por texto (para busca manual)
 * @param {string} query - texto de busca
 * @returns {Array} produtos encontrados
 */
export async function buscarProdutosOmie(query) {
  if (!query || query.length < 2) return [];

  const produtos = await prisma.estoqueItem.findMany({
    where: {
      descricao: { contains: query, mode: "insensitive" },
    },
    select: {
      codigoOmie: true,
      descricao: true,
      cmc: true,
      unidade: true,
      categoriaLabel: true,
    },
    take: 10,
    orderBy: { descricao: "asc" },
  });

  return produtos;
}
