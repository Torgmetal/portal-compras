/**
 * Calculo de area de pintura para perfis de aco estrutural.
 * Modulo puro JS — pode ser importado em client e server components.
 *
 * Formula geral: areaPintura(m²) = As(m²/m) × comprimento(m)
 * Para chapas: areaPintura(m²) = comprimento(m²) × 2 (ambas faces)
 *
 * NOTA: O campo `comprimento` em PesoProjetoItem já representa o comprimento TOTAL
 * (não por peça). Portanto NÃO multiplicamos por `quantidade`.
 *
 * Valores As (area de superficie, m²/m) conforme tabela oficial Gerdau.
 * Fonte: Catalogo Gerdau Perfis Estruturais / calculistadeaco.com.br
 */

// ── Area de superficie (As, m²/m) — Perfis W e HP — Tabela Gerdau ──
// Chave normalizada: "WdXp" ou "HPdXp" sem espacos, maiusculo
const GERDAU_AS = {
  // W150
  "W150X13": 0.67, "W150X18": 0.69, "W150X22.5": 0.88,
  "W150X24": 0.69, "W150X29.8": 0.90, "W150X37.1": 0.91,
  // W200
  "W200X15": 0.77, "W200X19.3": 0.79, "W200X22.5": 0.79,
  "W200X26.6": 0.92, "W200X31.3": 0.93, "W200X35.9": 1.03,
  "W200X41.7": 1.04, "W200X46.1": 1.19, "W200X52": 1.19,
  "W200X59": 1.20, "W200X71": 1.22, "W200X86": 1.23,
  // HP200
  "HP200X53": 1.20,
  // W250
  "W250X17.9": 0.88, "W250X22.3": 0.89, "W250X25.3": 0.89,
  "W250X28.4": 0.90, "W250X32.7": 1.07, "W250X38.5": 1.08,
  "W250X44.8": 1.09, "W250X73": 1.48, "W250X80": 1.49,
  "W250X89": 1.50, "W250X101": 1.51, "W250X115": 1.53,
  // HP250
  "HP250X62": 1.47, "HP250X85": 1.50,
  // W310
  "W310X21": 0.98, "W310X23.8": 0.99, "W310X28.3": 1.00,
  "W310X32.7": 1.00, "W310X38.7": 1.25, "W310X44.5": 1.26,
  "W310X52": 1.27, "W310X97": 1.79, "W310X107": 1.80,
  "W310X117": 1.80,
  // HP310
  "HP310X79": 1.77, "HP310X93": 1.78, "HP310X110": 1.80, "HP310X125": 1.81,
  // W360
  "W360X32.9": 1.17, "W360X39": 1.18, "W360X44": 1.35,
  "W360X51": 1.36, "W360X57.8": 1.37, "W360X64": 1.46,
  "W360X72": 1.47, "W360X79": 1.48, "W360X91": 1.68,
  "W360X101": 1.68, "W360X110": 1.69, "W360X122": 1.70,
  // W410
  "W410X38.8": 1.32, "W410X46.1": 1.33, "W410X53": 1.48,
  "W410X60": 1.49, "W410X67": 1.50, "W410X75": 1.51,
  "W410X85": 1.52,
  // W460
  "W460X52": 1.47, "W460X60": 1.49, "W460X68": 1.50,
  "W460X74": 1.64, "W460X82": 1.64, "W460X89": 1.65,
  "W460X97": 1.66, "W460X106": 1.67,
  // W530
  "W530X66": 1.67, "W530X72": 1.84, "W530X74": 1.68,
  "W530X82": 1.85, "W530X85": 1.69, "W530X92": 1.86,
  "W530X101": 1.86, "W530X109": 1.87,
  // W610
  "W610X101": 2.07, "W610X113": 2.08, "W610X125": 2.09,
  "W610X140": 2.10, "W610X155": 2.47, "W610X174": 2.48,
};

// Perfis U: sem tabela fixa — calculo direto por dimensoes (d×bf×tw)
// Formula: As = (2×d + 4×bf - 2×tw) / 1000  (m²/m)

/**
 * Normaliza descricao de perfil para lookup.
 * Remove espacos extras, converte para maiusculo, substitui virgula por ponto.
 */
function normalizar(desc) {
  return desc
    .toUpperCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/#/g, "")
    .trim();
}

/**
 * Extrai dimensoes numericas de uma string de perfil.
 * Ex: "W200X15" → [200, 15]
 * Ex: "TUBO RED 2" → [2]
 * Ex: "L100X100X8" → [100, 100, 8]
 * Ex: "CHAPA#9,50" → [9.5]
 */
function extrairDimensoes(desc) {
  const norm = desc.toUpperCase().replace(/,/g, ".");
  const matches = norm.match(/[\d]+\.?\d*/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Converte polegadas para mm.
 * Ex: '2"' → 50.8, '3/4"' → 19.05
 */
function polegadasParaMm(desc) {
  const norm = desc.replace(/[""]/g, '"');
  // Fracao: 3/4"
  const frac = norm.match(/([\d]+)\/([\d]+)/);
  if (frac) return (Number(frac[1]) / Number(frac[2])) * 25.4;
  // Inteiro: 2"
  const inteiro = norm.match(/([\d.]+)/);
  if (inteiro) return Number(inteiro[1]) * 25.4;
  return null;
}

/**
 * Busca As (m²/m) para um perfil W ou HP na tabela Gerdau.
 * Primeiro tenta lookup exato, depois busca aproximada, depois estima.
 */
function buscarAsGerdau(descricao) {
  const norm = normalizar(descricao);

  // Lookup exato
  if (GERDAU_AS[norm]) return { perimetro: GERDAU_AS[norm], metodo: "tabela Gerdau" };

  // Busca parcial: tenta encontrar o perfil mais proximo no nome
  for (const key of Object.keys(GERDAU_AS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return { perimetro: GERDAU_AS[key], metodo: "tabela Gerdau" };
    }
  }

  // Fallback: interpolar pela profundidade nominal usando valores conhecidos
  const dims = extrairDimensoes(descricao);
  if (dims.length >= 1) {
    const d = dims[0]; // profundidade nominal em mm
    const p = dims[1] || d * 0.1; // peso por metro
    // Estimativa conservadora baseada nos dados Gerdau:
    // Perfis de aba estreita: As ≈ 0.003×d + 0.22
    // Perfis de aba larga:    As ≈ 0.005×d + 0.20
    const abaLarga = p > d * 0.2;
    const asEstimado = abaLarga
      ? 0.005 * d + 0.20
      : 0.003 * d + 0.22;
    return { perimetro: Math.round(asEstimado * 100) / 100, metodo: "estimado" };
  }

  return null;
}

/**
 * Calcula As (m²/m) de perfil U/C (canal).
 * Formula: As = (2×d + 4×bf - 2×tw) / 1000
 * Superficies: alma (2 faces) + abas (2 faces cada) - juncao alma/aba
 */
function perimetroU(descricao) {
  const dims = extrairDimensoes(descricao);

  if (dims.length >= 3) {
    // U{d}X{bf}X{tw} — formato completo
    const d = dims[0];   // altura alma (mm)
    const bf = dims[1];  // largura aba (mm)
    const tw = dims[2];  // espessura alma (mm)
    const as = (2 * d + 4 * bf - 2 * tw) / 1000;
    return { perimetro: Math.round(as * 1000) / 1000, metodo: "calculado" };
  }

  if (dims.length >= 2) {
    // U{d}X{peso} — formato resumido, estimar bf
    const d = dims[0];
    const p = dims[1];
    // Se segundo valor e muito pequeno (< d/5), provavelmente e peso (kg/m)
    if (p < d / 5) {
      // Estimar bf pela relacao tipica para canais: bf ≈ 0.35*d
      const bf = d * 0.35;
      const tw = p > 0 ? Math.max(4, p * 0.5) : 5; // estimativa grosseira
      const as = (2 * d + 4 * bf - 2 * tw) / 1000;
      return { perimetro: Math.round(as * 1000) / 1000, metodo: "estimado" };
    }
    // Senao, segundo valor e bf (sem tw informado)
    const bf = p;
    const tw = Math.max(4, d * 0.05); // estimar tw
    const as = (2 * d + 4 * bf - 2 * tw) / 1000;
    return { perimetro: Math.round(as * 1000) / 1000, metodo: "calculado" };
  }

  if (dims.length === 1) {
    // So a altura: U{d} — estimar tudo
    const d = dims[0];
    const bf = d * 0.35;
    const tw = Math.max(4, d * 0.05);
    const as = (2 * d + 4 * bf - 2 * tw) / 1000;
    return { perimetro: Math.round(as * 1000) / 1000, metodo: "estimado" };
  }

  return null;
}

/**
 * Calcula perimetro de cantoneira L.
 */
function perimetroL(descricao) {
  const dims = extrairDimensoes(descricao);
  if (dims.length >= 2) {
    const a = dims[0]; // aba 1 em mm
    const b = dims[1]; // aba 2 em mm (ou espessura se so 2 valores)
    if (dims.length >= 3) {
      // L{a}X{b}X{t} — cantoneira desigual
      const t = dims[2];
      const perim = (2 * (a + b) - 2 * t) / 1000;
      return { perimetro: perim, metodo: "calculado" };
    } else {
      // L{a}X{t} — cantoneira igual
      const t = b;
      const perim = (4 * a - 2 * t) / 1000;
      return { perimetro: perim, metodo: "calculado" };
    }
  }
  return null;
}

/**
 * Calcula perimetro de tubo redondo.
 */
function perimetroTuboRedondo(descricao) {
  // Tentar extrair diametro
  const norm = descricao.toUpperCase();

  // Schedule: SCH40 2" → diametro externo em polegadas
  const schedMatch = norm.match(/([\d/.]+)\s*[""]/);
  if (schedMatch) {
    const dMm = polegadasParaMm(schedMatch[1] + '"');
    if (dMm) {
      const perim = Math.PI * dMm / 1000;
      return { perimetro: perim, metodo: "calculado" };
    }
  }

  // Diametro em mm
  const dims = extrairDimensoes(descricao);
  if (dims.length >= 1) {
    // Encontrar o diametro (geralmente o primeiro numero significativo)
    let dMm = dims[0];
    // Se muito pequeno, provavelmente e polegadas
    if (dMm <= 24) dMm = dMm * 25.4;
    const perim = Math.PI * dMm / 1000;
    return { perimetro: perim, metodo: "calculado" };
  }
  return null;
}

/**
 * Calcula perimetro de tubo retangular ou quadrado.
 */
function perimetroTuboRetangular(descricao) {
  const dims = extrairDimensoes(descricao);
  if (dims.length >= 2) {
    const h = dims[0]; // mm
    const w = dims[1]; // mm
    const perim = 2 * (h + w) / 1000;
    return { perimetro: perim, metodo: "calculado" };
  }
  return null;
}

/**
 * Calcula perimetro de barra chata.
 */
function perimetroBarraChata(descricao) {
  const dims = extrairDimensoes(descricao);
  const norm = descricao.toUpperCase();

  // Pode estar em polegadas: '1/2"X3"'
  if (norm.includes('"') || norm.includes('"')) {
    const parts = norm.split(/X/i);
    if (parts.length >= 2) {
      const w = polegadasParaMm(parts[0]) || 0;
      const h = polegadasParaMm(parts[1]) || 0;
      if (w && h) {
        const perim = 2 * (w + h) / 1000;
        return { perimetro: perim, metodo: "calculado" };
      }
    }
  }

  if (dims.length >= 2) {
    const w = dims[0]; // mm
    const h = dims[1]; // mm
    const perim = 2 * (w + h) / 1000;
    return { perimetro: perim, metodo: "calculado" };
  }
  return null;
}

/**
 * Calcula perimetro de barra redonda.
 */
function perimetroBarraRedonda(descricao) {
  const dims = extrairDimensoes(descricao);
  const norm = descricao.toUpperCase();

  if (norm.includes('"') || norm.includes('"')) {
    const dMm = polegadasParaMm(descricao);
    if (dMm) return { perimetro: Math.PI * dMm / 1000, metodo: "calculado" };
  }

  if (dims.length >= 1) {
    let d = dims[0];
    if (d <= 10) d = d * 25.4; // provavelmente polegadas
    return { perimetro: Math.PI * d / 1000, metodo: "calculado" };
  }
  return null;
}

// ── Funcao principal ──

/**
 * Calcula a area de pintura (m²) de um item PesoProjetoItem.
 *
 * @param {Object} item - PesoProjetoItem com descricao, tipoMaterial, comprimento, quantidade, pesoTotal, pesoUnitario
 * @returns {{ areaPintura: number, perimetro: number|null, metodo: string }}
 */
export function calcularAreaPintura(item) {
  const { descricao, tipoMaterial, comprimento, pesoTotal, pesoUnitario } = item;
  const comp = comprimento || 0;

  // Chapas: comprimento e area em m², pintar ambas faces
  if (tipoMaterial === "CHAPA") {
    return {
      areaPintura: comp * 2,
      perimetro: null,
      metodo: "chapa (2 faces)",
    };
  }

  // Grade piso / Tela / Degrau: usar area = comprimento * 1 face (superficie superior)
  if (["GRADE_PISO", "TELA", "DEGRAU"].includes(tipoMaterial)) {
    return {
      areaPintura: comp,
      perimetro: null,
      metodo: "superficie",
    };
  }

  // Perfis lineares: area = perimetro(m²/m) × comprimento(m)
  let result = null;

  switch (tipoMaterial) {
    case "PERFIL_W":
      result = buscarAsGerdau(descricao);
      break;
    case "PERFIL_U":
      result = perimetroU(descricao);
      break;
    case "PERFIL_L":
      result = perimetroL(descricao);
      break;
    case "TUBO_REDONDO":
      result = perimetroTuboRedondo(descricao);
      break;
    case "TUBO_QUADRADO":
    case "TUBO_RETANGULAR":
      result = perimetroTuboRetangular(descricao);
      break;
    case "BARRA_CHATA":
      result = perimetroBarraChata(descricao);
      break;
    case "BARRA_REDONDA":
    case "BARRA_QUADRADA":
      result = perimetroBarraRedonda(descricao);
      break;
    default:
      // Tenta detectar pelo nome da descricao
      const upper = (descricao || "").toUpperCase();
      if (/^W\d/.test(upper) || /^HP\d/.test(upper)) result = buscarAsGerdau(descricao);
      else if (/^U\d/.test(upper) || /^UE\d/.test(upper)) result = perimetroU(descricao);
      else if (/^L\d/.test(upper) || /CANTONEIRA/.test(upper)) result = perimetroL(descricao);
      else if (/TUBO.*RED/.test(upper)) result = perimetroTuboRedondo(descricao);
      else if (/TUBO/.test(upper)) result = perimetroTuboRetangular(descricao);
      else if (/CHAPA/.test(upper)) {
        return { areaPintura: comp * 2, perimetro: null, metodo: "chapa (2 faces)" };
      }
      break;
  }

  if (result) {
    return {
      areaPintura: result.perimetro * comp,
      perimetro: result.perimetro,
      metodo: result.metodo,
    };
  }

  // Fallback: estimativa por peso linear
  // Para perfis genericos, As ≈ pesoUnitario(kg/m) * fator
  // Fator medio observado na tabela Gerdau: ~0.035 m²/m por kg/m para perfis leves, ~0.020 para pesados
  if (comp > 0 && pesoUnitario > 0) {
    const fator = pesoUnitario < 30 ? 0.035 : pesoUnitario < 60 ? 0.028 : 0.022;
    const asEstimado = pesoUnitario * fator;
    return {
      areaPintura: asEstimado * comp,
      perimetro: Math.round(asEstimado * 1000) / 1000,
      metodo: "estimado (peso)",
    };
  }

  return { areaPintura: 0, perimetro: null, metodo: "indisponivel" };
}

/**
 * Calcula areas de pintura para todos os itens e retorna resumo.
 *
 * @param {Array} itens - Array de PesoProjetoItem
 * @returns {{ areaTotal: number, detalhes: Array<{id, descricao, tipoMaterial, areaPintura, perimetro, metodo, comprimento, quantidade}> }}
 */
export function calcularAreasTodosItens(itens) {
  const detalhes = (itens || []).map((item) => {
    const calc = calcularAreaPintura(item);
    return {
      id: item.id,
      descricao: item.descricao,
      tipoMaterial: item.tipoMaterial,
      comprimento: item.comprimento,
      quantidade: item.quantidade,
      pesoTotal: item.pesoTotal,
      ...calc,
    };
  });

  const areaTotal = detalhes.reduce((sum, d) => sum + (d.areaPintura || 0), 0);

  return { areaTotal, detalhes };
}

/**
 * Labels legíveis para TipoMaterial.
 */
export const TIPO_MATERIAL_LABEL = {
  PERFIL_W: "Perfil W/HP",
  PERFIL_U: "Perfil U",
  PERFIL_L: "Cantoneira",
  TUBO_REDONDO: "Tubo Red.",
  TUBO_QUADRADO: "Tubo Quad.",
  TUBO_RETANGULAR: "Tubo Ret.",
  CHAPA: "Chapa",
  BARRA_REDONDA: "Barra Red.",
  BARRA_CHATA: "Barra Chata",
  BARRA_QUADRADA: "Barra Quad.",
  BARRA_ROSCADA: "Barra Rosc.",
  TELA: "Tela",
  GRADE_PISO: "Grade Piso",
  DEGRAU: "Degrau",
  OUTRO: "Outro",
};
