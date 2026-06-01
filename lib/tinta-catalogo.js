/**
 * Catálogo de tintas industriais para cálculo de quantidades.
 * Dados extraídos da planilha de referência Torg + normas Petrobras.
 *
 * Fórmula principal:
 *   Rendimento Teórico (m²/L) = (SV% × 10) / Espessura_µm
 *   Rendimento Prático (m²/L) = Rt × (1 - %Perdas)
 *   Litros necessários = Área / Rp
 *   Galões (3,6L) = ROUNDUP(Litros / 3.6)
 *   Diluente (L) = Litros × diluentePct
 */

// Tipos de resina com % de diluente padrão
export const RESINAS = {
  EPOXI:          { label: "Epoxi",          diluentePct: 10 },
  PU:             { label: "Poliuretano",     diluentePct: 10 },
  ETIL_SILICATO:  { label: "Etil-Silicato",   diluentePct: 5 },
  ACRILICA:       { label: "Acrílica",        diluentePct: 15 },
  ESMALTE:        { label: "Esmalte",         diluentePct: 15 },
  VERNIZ:         { label: "Verniz",          diluentePct: 10 },
  SILICONE:       { label: "Silicone",        diluentePct: 5 },
  ANTIFOULING:    { label: "Antifouling",     diluentePct: 10 },
  ALQUIDICA:      { label: "Alquídica",       diluentePct: 15 },
  EPOXI_MASTIC:   { label: "Epoxi Mastic",   diluentePct: 10 },
  EPOXI_AMIDA:    { label: "Epoxi Amida",    diluentePct: 10 },
};

// Métodos de aplicação com faixa de perdas padrão
export const METODOS_APLICACAO = {
  PINCEL:       { label: "Pincel",              perdaMin: 10, perdaMax: 20, perdaPadrao: 15 },
  ROLO:         { label: "Rolo",                perdaMin: 10, perdaMax: 30, perdaPadrao: 20 },
  PISTOLA_CONV: { label: "Pistola convencional", perdaMin: 30, perdaMax: 50, perdaPadrao: 40 },
  AIRLESS:      { label: "Airless",             perdaMin: 9,  perdaMax: 20, perdaPadrao: 15 },
};

// Etapas do esquema de pintura
export const ETAPAS = {
  PRIMER:        { label: "Primer",        ordem: 1 },
  INTERMEDIARIO: { label: "Intermediário", ordem: 2 },
  ACABAMENTO:    { label: "Acabamento",    ordem: 3 },
};

// Volume padrão do galão (litros)
export const VOLUME_GALAO = 3.6;

/**
 * Calcula rendimento e quantidades para uma camada de pintura.
 * @param {Object} params
 * @param {number} params.svPct - Sólidos por Volume (%)
 * @param {number} params.espessuraMicra - Espessura seca por demão (µm)
 * @param {number} params.areaM2 - Área total (m²)
 * @param {number} params.demaos - Número de demãos
 * @param {number} params.percPerdas - % de perda (0-100)
 * @param {number} params.diluentePct - % de diluente sobre volume de tinta
 * @returns {Object} Cálculos derivados
 */
export function calcularQuantidadeTinta({ svPct, espessuraMicra, areaM2, demaos = 1, percPerdas = 15, diluentePct = 10 }) {
  if (!svPct || !espessuraMicra || espessuraMicra <= 0 || !areaM2 || areaM2 <= 0) {
    return { rendimentoTeorico: 0, rendimentoPratico: 0, litros: 0, galoes: 0, diluente: 0 };
  }

  const rendimentoTeorico = (svPct * 10) / espessuraMicra; // m²/L
  const rendimentoPratico = rendimentoTeorico * (1 - (percPerdas / 100)); // m²/L

  if (rendimentoPratico <= 0) {
    return { rendimentoTeorico, rendimentoPratico: 0, litros: 0, galoes: 0, diluente: 0 };
  }

  const litrosPorDemao = areaM2 / rendimentoPratico;
  const litros = litrosPorDemao * demaos;
  const galoes = Math.ceil(litros / VOLUME_GALAO);
  const diluente = litros * (diluentePct / 100);

  return {
    rendimentoTeorico: Math.round(rendimentoTeorico * 100) / 100,
    rendimentoPratico: Math.round(rendimentoPratico * 100) / 100,
    litros: Math.round(litros * 100) / 100,
    galoes,
    diluente: Math.round(diluente * 100) / 100,
  };
}

/**
 * Catálogo completo de tintas (para seed).
 * Cada entrada: { nome, fabricante, norma, resinaTipo, svPct, diluentePct }
 */
export const CATALOGO_TINTAS = [
  // ── Normas Petrobras ──
  { nome: "Tinta Epoxi Óxido de Ferro (Tie Coat)", norma: "N-1202", resinaTipo: "EPOXI", svPct: 30 },
  { nome: "Tinta de Fundo Epóxi-Zinco Poliamida", norma: "N-1277", resinaTipo: "EPOXI", svPct: 53 },
  { nome: "Tinta Indicadora de Alta Temperatura", norma: "N-1514", resinaTipo: "ACRILICA", svPct: 45 },
  { nome: "Tinta de Zinco Etil-Silicato", norma: "N-1661", resinaTipo: "ETIL_SILICATO", svPct: 54 },
  { nome: "Shop Primer de Zinco Etil-Silicato", norma: "N-1841", resinaTipo: "ETIL_SILICATO", svPct: 40 },
  { nome: "Tinta de Aderência Epóxi-Isocianato-Óxido de Ferro", norma: "N-2198", resinaTipo: "EPOXI", svPct: 20 },
  { nome: "Tinta de Etil-Silicato de Zinco-Alumínio", norma: "N-2231", resinaTipo: "ETIL_SILICATO", svPct: 55 },
  { nome: "Tinta de Fundo Epóxi Pigmentada com Alumínio", norma: "N-2288", resinaTipo: "EPOXI", svPct: 75 },
  { nome: "Esmalte Sintético Brilhante", norma: "N-2492", resinaTipo: "ESMALTE", svPct: 38 },
  { nome: "Tinta Epóxi Poliamida de Alta Espessura", norma: "N-2628", resinaTipo: "EPOXI", svPct: 80 },
  { nome: "Tinta de Acabamento Epóxi sem Solvente", norma: "N-2629", resinaTipo: "EPOXI", svPct: 90 },
  { nome: "Tinta Epóxi Fosfato de Zinco de Alta Espessura", norma: "N-2630", resinaTipo: "EPOXI", svPct: 80 },
  { nome: "Tinta de Poliuretano Acrílico (Cores)", norma: "N-2677", resinaTipo: "PU", svPct: 63 },
  { nome: "Tinta de Poliuretano Acrílico (Alumínio)", norma: "N-2677", resinaTipo: "PU", svPct: 50 },
  { nome: "Tinta Epóxi Poliamida Pigmentada com Alumínio", norma: "N-2678", resinaTipo: "EPOXI", svPct: 75 },
  { nome: "Tinta Epóxi Tolerante a Superfícies Molhadas", norma: "N-2680", resinaTipo: "EPOXI", svPct: 95 },
  { nome: "Tinta Epóxi Modificada Isenta de Alcatrão", norma: "N-2851", resinaTipo: "EPOXI", svPct: 70 },
  { nome: "Tinta Epóxi Novolac Tipo I", norma: "N-2912", resinaTipo: "EPOXI", svPct: 75 },
  { nome: "Tinta Epóxi Novolac Tipo II e III", norma: "N-2912", resinaTipo: "EPOXI", svPct: 95 },

  // ── Akzo Nobel / International ──
  { nome: "Interzinc 52 - Epoxi Rico em Zinco", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 59 },
  { nome: "Interseal 670HS - Epóxi Tolerante", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 82 },
  { nome: "Interthane 990 - Poliuretano", fabricante: "Akzo Nobel", resinaTipo: "PU", svPct: 57 },
  { nome: "Intertherm 228 - Epoxi Fenólico", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 67 },
  { nome: "Interline 399 - Epoxi Novolac", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 67 },
  { nome: "Interzone 954 - Epoxi Isento de Alcatrão", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 85 },
  { nome: "Intergard 475HS", fabricante: "Akzo Nobel", resinaTipo: "EPOXI", svPct: 80 },

  // ── Jotun ──
  { nome: "Epoxy HR - Epoxi Fenólico", fabricante: "Jotun", resinaTipo: "EPOXI", svPct: 63 },
  { nome: "Penguard Primer (Aderência em Não Ferrosos)", fabricante: "Jotun", resinaTipo: "EPOXI", svPct: 51 },
  { nome: "Jotacote Universal", fabricante: "Jotun", resinaTipo: "EPOXI", svPct: 72 },
  { nome: "Hardtop Flexi", fabricante: "Jotun", resinaTipo: "PU", svPct: 64 },
  { nome: "Barrier 80", fabricante: "Jotun", resinaTipo: "EPOXI", svPct: 61 },
  { nome: "Penguard Express", fabricante: "Jotun", resinaTipo: "EPOXI", svPct: 74 },
  { nome: "Hardtop AX", fabricante: "Jotun", resinaTipo: "PU", svPct: 63 },
  { nome: "Jotamastic 80", fabricante: "Jotun", resinaTipo: "EPOXI_MASTIC", svPct: 80 },
  { nome: "Resist 78", fabricante: "Jotun", resinaTipo: "ETIL_SILICATO", svPct: 72 },
  { nome: "Solvalitt Alu", fabricante: "Jotun", resinaTipo: "SILICONE", svPct: 40 },

  // ── Sumaré / Sherwin-Williams ──
  { nome: "Sumatane HB Semi-Brilho", fabricante: "Sumaré SW", resinaTipo: "PU", svPct: 70 },
  { nome: "MACROPOXY 646 Fast Cure Epoxy", fabricante: "Sumaré SW", resinaTipo: "EPOXI", svPct: 84 },
  { nome: "Sumatane 355", fabricante: "Sumaré SW", resinaTipo: "PU", svPct: 83 },
  { nome: "SUMATERM 550 HS Alumínio", fabricante: "Sumaré SW", resinaTipo: "SILICONE", svPct: 55 },
  { nome: "SUMATERM 400 Alumínio", fabricante: "Sumaré SW", resinaTipo: "SILICONE", svPct: 28 },
  { nome: "Copper Bottom #60", fabricante: "Sumaré SW", resinaTipo: "ANTIFOULING", svPct: 60 },
  { nome: "Primer Epoxi 177", fabricante: "Sumaré SW", resinaTipo: "EPOXI", svPct: 49 },
  { nome: "KEM HI-TEMP CUI", fabricante: "Sumaré SW", resinaTipo: "SILICONE", svPct: 57 },
  { nome: "Sumadur Óxido de Ferro Micáceo HS", fabricante: "Sumaré SW", resinaTipo: "EPOXI", svPct: 78 },

  // ── WEG ──
  { nome: "WEG TAR FREE HSD 302 HT", fabricante: "Weg", resinaTipo: "EPOXI", svPct: 97 },
  { nome: "Wegpoxi Zinco", fabricante: "Weg", resinaTipo: "EPOXI", svPct: 57 },
  { nome: "Wegpoxi CVD 323", fabricante: "Weg", resinaTipo: "EPOXI", svPct: 80 },
  { nome: "Wegthane HPA 501", fabricante: "Weg", resinaTipo: "PU", svPct: 56 },
  { nome: "WEG TAR FREE WT", fabricante: "Weg", resinaTipo: "EPOXI", svPct: 84 },
  { nome: "TINTA EP CVP 315 CINZA", fabricante: "Weg", resinaTipo: "EPOXI_AMIDA", svPct: 60 },
  { nome: "TINTA EP CVA 311 R BRANCO", fabricante: "Weg", resinaTipo: "EPOXI_AMIDA", svPct: 60 },

  // ── Renner ──
  { nome: "Rethane FHS 651", fabricante: "Renner", resinaTipo: "PU", svPct: 67 },

  // ── PPG ──
  { nome: "Sigmadur ClearCoat", fabricante: "PPG", resinaTipo: "VERNIZ", svPct: 50 },

  // ── Advance ──
  { nome: "ADEPOXI AWWA DF TAR FREE", fabricante: "Advance", resinaTipo: "EPOXI", svPct: 74 },
  { nome: "Hotvance 2600", fabricante: "Advance", resinaTipo: "SILICONE", svPct: 26 },
  { nome: "ADEPOXI 86 DF", fabricante: "Advance", resinaTipo: "EPOXI", svPct: 78 },
  { nome: "ADLUX", fabricante: "Advance", resinaTipo: "ALQUIDICA", svPct: 45 },
  { nome: "ADEPOXI 70 TL DF", fabricante: "Advance", resinaTipo: "EPOXI", svPct: 68 },

  // ── Carboline ──
  { nome: "Bitumastic 300M", fabricante: "Carboline", resinaTipo: "EPOXI", svPct: 74 },
];
