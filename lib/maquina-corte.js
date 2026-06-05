// lib/maquina-corte.js
// Classificação automática de peças para máquinas de corte.
// 4 máquinas: Laser Chapa, Laser Perfil, Laser Tubo, Laser Cantoneira.

export const MAQUINAS = {
  LASER_CHAPA: "LASER_CHAPA",
  LASER_PERFIL: "LASER_PERFIL",
  LASER_TUBO: "LASER_TUBO",
  LASER_CANTONEIRA: "LASER_CANTONEIRA",
};

export const MAQUINA_LABEL = {
  LASER_CHAPA: "Laser Chapa",
  LASER_PERFIL: "Laser Perfil",
  LASER_TUBO: "Laser Tubo",
  LASER_CANTONEIRA: "Laser Cantoneira",
};

export const MAQUINA_COR = {
  LASER_CHAPA:      { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400" },
  LASER_PERFIL:     { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  LASER_TUBO:       { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  LASER_CANTONEIRA: { bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500" },
};

/**
 * Perdas por máquina (em mm).
 * - alinhamento: corte inicial para alinhar o perfil na máquina
 * - retalhoMinimo: retalho mínimo que a máquina não consegue trabalhar (Laser Tubo)
 * - limiarSemRetalho: peças acima deste comprimento não sofrem perda de retalho
 * - zonamorta: comprimento mínimo que a máquina não consegue cortar
 */
export const PERDA_MAQUINA = {
  LASER_TUBO: {
    alinhamento: 5,
    retalhoMinimo: 1000,
    limiarSemRetalho: 1500,
    zonamorta: 0,
  },
  LASER_PERFIL: {
    alinhamento: 5,
    retalhoMinimo: 0,
    limiarSemRetalho: 0,
    zonamorta: 0,
  },
  LASER_CANTONEIRA: {
    alinhamento: 5,
    retalhoMinimo: 0,
    limiarSemRetalho: 0,
    zonamorta: 80,
  },
  LASER_CHAPA: {
    alinhamento: 0,
    retalhoMinimo: 0,
    limiarSemRetalho: 0,
    zonamorta: 0,
  },
};

// Comprimento padrão das barras brutas (mm) por tipo de perfil
const BARRA_PADRAO_MM = {
  W: 12000,
  U: 6000,
  L: 6000,
  TB: 6000,
  FR: 6000,
  FC: 6000,
  XADREZ: 6000,
};

/**
 * Extrai tipo e dimensões do perfil a partir da descrição do croqui.
 * Ex: "W150X13" → { tipo: "W", bitolaMm: 150, pesoLinear: 13 }
 *     "CH6.40X102" → { tipo: "CH", espessuraMm: 6.4, larguraMm: 102 }
 *     "L2''X3/16''" → { tipo: "L", bitolaMm: 50.8 }
 *     "TB 1.1/2\"X2.65" → { tipo: "TB", bitolaMm: 38.1 }
 *     "FRØ5/8\"" → { tipo: "FR", bitolaMm: 15.875 }
 */
export function parsePerfil(descricao) {
  if (!descricao) return null;
  const d = descricao.trim().toUpperCase();

  // Chapa: CHespessuraXlargura
  const mCH = d.match(/^CH\s*([\d.]+)\s*X\s*([\d.]+)/);
  if (mCH) {
    return { tipo: "CH", espessuraMm: parseFloat(mCH[1]), larguraMm: parseFloat(mCH[2]) };
  }

  // Perfil W: WbitolaXpeso
  const mW = d.match(/^W\s*(\d+)\s*X\s*([\d.]+)/);
  if (mW) {
    return { tipo: "W", bitolaMm: parseInt(mW[1]), pesoLinearKgM: parseFloat(mW[2]) };
  }

  // Perfil U: U200X60X9.5 ou U4"X7.95 ou U6"X12.20
  const mU1 = d.match(/^U\s*(\d+)\s*X/);
  if (mU1) {
    return { tipo: "U", bitolaMm: parseInt(mU1[1]) };
  }
  const mU2 = d.match(/^U\s*([\d.]+)[""]/);
  if (mU2) {
    return { tipo: "U", bitolaMm: parseFloat(mU2[1]) * 25.4 };
  }

  // Cantoneira L: L2''X3/16'' ou L1.1/2''X3/16''
  const mL = d.match(/^L\s*([\d.]+(?:\.?\d*\/\d+)?)[''""]/);
  if (mL) {
    return { tipo: "L", bitolaMm: parseFracao(mL[1]) * 25.4 };
  }
  const mL2 = d.match(/^L\s*(\d+)\s*X/);
  if (mL2) {
    return { tipo: "L", bitolaMm: parseInt(mL2[1]) };
  }

  // Tubo: TB 1.1/2"X2.65 ou TB 3/4"
  const mTB = d.match(/^TB\s*([\d.]+(?:\.?\d*\/\d+)?)[''""]/);
  if (mTB) {
    return { tipo: "TB", bitolaMm: parseFracao(mTB[1]) * 25.4 };
  }

  // Barra redonda: FRØ5/8" ou FRØ1"
  const mFR = d.match(/^FR\s*[ØO]?\s*([\d.]+(?:\.?\d*\/\d+)?)[''""]/);
  if (mFR) {
    return { tipo: "FR", bitolaMm: parseFracao(mFR[1]) * 25.4 };
  }

  // Ferro chato: FC2.1/2''X3/8''
  const mFC = d.match(/^FC\s*([\d.]+(?:\.?\d*\/\d+)?)[''""]/);
  if (mFC) {
    return { tipo: "FC", bitolaMm: parseFracao(mFC[1]) * 25.4 };
  }

  // Xadrez (chapa xadrez)
  if (d.includes("XADREZ")) {
    const mx = d.match(/([\d.]+)\s*MM/i);
    return { tipo: "CH", espessuraMm: mx ? parseFloat(mx[1]) : 0, larguraMm: 0, xadrez: true };
  }

  return { tipo: "OUTRO" };
}

// Converte frações mistas tipo "1.1/2" ou "3/4" ou "2" para decimal
function parseFracao(str) {
  if (!str) return 0;
  // "1.1/2" → 1 + 1/2 = 1.5
  const mMista = str.match(/^(\d+)\.\s*(\d+)\s*\/\s*(\d+)$/);
  if (mMista) return parseInt(mMista[1]) + parseInt(mMista[2]) / parseInt(mMista[3]);
  // "3/4" → 0.75
  const mFrac = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (mFrac) return parseInt(mFrac[1]) / parseInt(mFrac[2]);
  // "2" → 2
  return parseFloat(str) || 0;
}

/**
 * Classifica a máquina ideal para uma peça.
 * Retorna o código da máquina (LASER_CHAPA, LASER_PERFIL, etc.)
 */
export function classificarMaquina(descricao, pesoUnitKg, comprimentoMm) {
  const perfil = parsePerfil(descricao);
  if (!perfil) return null;

  // Chapas → Laser Chapa (sempre)
  if (perfil.tipo === "CH") return MAQUINAS.LASER_CHAPA;

  // Peso linear (kg/m) — usado pra decidir entre Laser Tubo e Laser Perfil
  const pesoLinear = comprimentoMm > 0 ? (pesoUnitKg / (comprimentoMm / 1000)) : (perfil.pesoLinearKgM || 0);

  // Cantoneiras, ferro redondo, ferro chato → Laser Cantoneira
  if (perfil.tipo === "L" || perfil.tipo === "FR" || perfil.tipo === "FC") {
    return MAQUINAS.LASER_CANTONEIRA;
  }

  // Tubos → Laser Tubo (cabe até 500mm) ou Laser Cantoneira (se ≤6m)
  if (perfil.tipo === "TB") {
    if (perfil.bitolaMm <= 500) return MAQUINAS.LASER_TUBO;
    return MAQUINAS.LASER_CANTONEIRA;
  }

  // Perfis W
  if (perfil.tipo === "W") {
    // W > 250mm ou peso > 50 kg/m → só Laser Perfil aguenta
    if (perfil.bitolaMm > 250 || pesoLinear > 50) return MAQUINAS.LASER_PERFIL;
    // W ≤ 250mm e ≤ 50 kg/m → Laser Tubo (mais eficiente pra carregar)
    return MAQUINAS.LASER_TUBO;
  }

  // Perfis U
  if (perfil.tipo === "U") {
    if (perfil.bitolaMm <= 350 && pesoLinear <= 50) return MAQUINAS.LASER_TUBO;
    return MAQUINAS.LASER_PERFIL;
  }

  return null;
}

/**
 * Calcula resumo de barras necessárias por perfil, agrupado por máquina.
 * Recebe array de peças (com descricao, comprimentoMm, qte, maquina).
 * Retorna { [maquina]: { pecas, pesoTotal, perfis: { [perfil]: { qte, compTotal, barras, comprimentoBarra } } } }
 */
export function calcularResumoBarras(pecas) {
  const resultado = {};

  for (const p of pecas) {
    const maq = p.maquina;
    if (!maq) continue;
    if (!resultado[maq]) resultado[maq] = { pecas: 0, pesoTotal: 0, perfis: {} };
    const r = resultado[maq];

    // Quantidade restante (total - produzida)
    const qtdTotal = p.qte || 1;
    const qtdProd = p.qteProduzida || 0;
    const qtdFalta = Math.max(0, qtdTotal - qtdProd);
    if (qtdFalta === 0) continue; // peça 100% produzida — não precisa de barra

    const pesoFalta = qtdTotal > 0 ? (p.pesoTotalKg || 0) * (qtdFalta / qtdTotal) : 0;

    const perfil = parsePerfil(p.descricao);
    if (!perfil || perfil.tipo === "CH") {
      r.pecas += qtdFalta;
      r.pesoTotal += pesoFalta;
      continue;
    }

    const chave = p.descricao || "Sem perfil";
    if (!r.perfis[chave]) {
      const compBarra = BARRA_PADRAO_MM[perfil.tipo] || 6000;
      r.perfis[chave] = { qte: 0, compTotalMm: 0, comprimentoBarraMm: compBarra, tipo: perfil.tipo, compMinMm: Infinity };
    }
    const pf = r.perfis[chave];
    pf.qte += qtdFalta;
    pf.compTotalMm += (p.comprimentoMm || 0) * qtdFalta;
    if ((p.comprimentoMm || 0) > 0 && p.comprimentoMm < pf.compMinMm) {
      pf.compMinMm = p.comprimentoMm;
    }
    r.pecas += qtdFalta;
    r.pesoTotal += pesoFalta;
  }

  // Calcula barras por perfil — com perdas por máquina
  for (const [maqCode, maqData] of Object.entries(resultado)) {
    const perda = PERDA_MAQUINA[maqCode] || {};
    for (const pf of Object.values(maqData.perfis)) {
      const temPequena = (perda.retalhoMinimo || 0) > 0 && (perda.limiarSemRetalho || 0) > 0
        && pf.compMinMm !== Infinity && pf.compMinMm < perda.limiarSemRetalho;
      const perdaTotal = (perda.alinhamento || 0) + (perda.zonamorta || 0) + (temPequena ? perda.retalhoMinimo : 0);
      const barraUtil = pf.comprimentoBarraMm - perdaTotal;
      pf.barras = barraUtil > 0 ? Math.ceil(pf.compTotalMm / barraUtil) : 0;
      pf.barraUtilMm = barraUtil;
      pf.perdaMm = perdaTotal;
    }
  }

  return resultado;
}

/**
 * Aloca peças em barras usando First Fit Decreasing (bin-packing simples).
 * Recebe array de peças com { marca, descricao, comprimentoMm, qte, pesoUnitKg, pesoTotalKg, opNumero }.
 * Retorna array de barras: { numero, pecas: [...], usadoMm, sobraMm, comprimentoBarraMm, aproveitamento }.
 */
export function alocarBarras(pecas, comprimentoBarraMm, maquina) {
  const perda = PERDA_MAQUINA[maquina] || {};

  // Expandir por quantidade e ordenar por comprimento decrescente
  const expandidas = [];
  for (const p of pecas) {
    const comp = p.comprimentoMm || 0;
    if (comp <= 0) continue;
    for (let i = 0; i < (p.qte || 1); i++) {
      expandidas.push({ marca: p.marca, descricao: p.descricao, comprimentoMm: comp, pesoUnitKg: p.pesoUnitKg, opNumero: p.opNumero });
    }
  }
  expandidas.sort((a, b) => b.comprimentoMm - a.comprimentoMm);

  // Determinar se há peças pequenas (< limiar) para reservar retalho (Laser Tubo)
  const temPecaPequena = (perda.retalhoMinimo || 0) > 0 && (perda.limiarSemRetalho || 0) > 0
    && expandidas.some(p => p.comprimentoMm < perda.limiarSemRetalho);

  // Comprimento útil = barra - alinhamento - zona morta - retalho (se necessário)
  const perdaTotal = (perda.alinhamento || 0) + (perda.zonamorta || 0) + (temPecaPequena ? (perda.retalhoMinimo || 0) : 0);
  const barraUtil = comprimentoBarraMm - perdaTotal;

  if (barraUtil <= 0) return [];

  const barras = [];
  for (const peca of expandidas) {
    let colocou = false;
    for (const barra of barras) {
      if (barra.restante >= peca.comprimentoMm) {
        barra.pecas.push(peca);
        barra.usadoMm += peca.comprimentoMm;
        barra.restante -= peca.comprimentoMm;
        colocou = true;
        break;
      }
    }
    if (!colocou) {
      barras.push({
        numero: barras.length + 1,
        pecas: [peca],
        usadoMm: peca.comprimentoMm,
        restante: barraUtil - peca.comprimentoMm,
        comprimentoBarraMm,
      });
    }
  }

  // Calcular aproveitamento (baseado na barra útil)
  for (const b of barras) {
    b.sobraMm = b.restante;
    b.barraUtilMm = barraUtil;
    b.perdaMm = perdaTotal;
    b.aproveitamento = barraUtil > 0 ? ((b.usadoMm / barraUtil) * 100) : 0;
    delete b.restante;
  }

  return barras;
}

/**
 * Gera programa completo de corte para um conjunto de peças.
 * Agrupa por máquina → perfil, aloca peças em barras com bin-packing.
 * Retorna { maquinas: { [maq]: { label, perfis: { [desc]: { barras, totalPecas, totalBarras, aproveitamentoMedio, comprimentoBarraMm } } } } }
 */
export function gerarProgramaCorte(pecas) {
  const programa = {};

  // Agrupar por maquina → descricao (perfil)
  for (const p of pecas) {
    const maq = p.maquina;
    if (!maq) continue;

    const perfil = parsePerfil(p.descricao);
    if (!perfil) continue;

    // Chapas nao usam barras — tratar separado
    if (perfil.tipo === "CH") {
      if (!programa[maq]) programa[maq] = { label: MAQUINA_LABEL[maq] || maq, perfis: {}, chapas: [] };
      programa[maq].chapas = programa[maq].chapas || [];
      programa[maq].chapas.push(p);
      continue;
    }

    if (!programa[maq]) programa[maq] = { label: MAQUINA_LABEL[maq] || maq, perfis: {}, chapas: [] };

    const chave = p.descricao || "Sem perfil";
    if (!programa[maq].perfis[chave]) {
      const compBarra = BARRA_PADRAO_MM[perfil.tipo] || 6000;
      programa[maq].perfis[chave] = { tipo: perfil.tipo, comprimentoBarraMm: compBarra, pecas: [] };
    }
    programa[maq].perfis[chave].pecas.push(p);
  }

  // Alocar barras para cada perfil — com perdas por máquina
  for (const [maqCode, maq] of Object.entries(programa)) {
    for (const [desc, grupo] of Object.entries(maq.perfis)) {
      const barras = alocarBarras(grupo.pecas, grupo.comprimentoBarraMm, maqCode);
      grupo.barras = barras;
      grupo.totalPecas = barras.reduce((s, b) => s + b.pecas.length, 0);
      grupo.totalBarras = barras.length;
      grupo.aproveitamentoMedio = barras.length > 0
        ? barras.reduce((s, b) => s + b.aproveitamento, 0) / barras.length
        : 0;
      grupo.barraUtilMm = barras.length > 0 ? barras[0].barraUtilMm : grupo.comprimentoBarraMm;
      grupo.perdaMm = barras.length > 0 ? barras[0].perdaMm : 0;
      delete grupo.pecas;
    }
    maq.perda = PERDA_MAQUINA[maqCode] || null;
  }

  return programa;
}
