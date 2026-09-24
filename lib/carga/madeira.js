// Madeira de cada volume: caibros de apoio, sarrafos e tábuas de caixa/engradado (metros lineares e
// peças de 3 m). Premissas do protótipo validado na OP-118 (set/2026).
const hyp = (a, b) => Math.hypot(a, b);
const COBERTURA_CAIXA = 0.6; // fundo fechado, laterais e tampa ripadas

/**
 * @param {object} u  unidade posicionada (C, L, A em mm; girada; embalagem; tipo)
 * @param {object} veic  veículo da carga (L em mm)
 * @returns {{ caibro:number, sarrafo:number, tabua:number, nCaibro:number, compCaibro:number }} metros lineares por seção
 */
export function madeiraDaUnidade(u, veic) {
  const m = { caibro: 0, sarrafo: 0, tabua: 0 };
  const along = (u.fx || (u.girada ? u.L : u.C)) / 1000, across = Math.min((u.fz || (u.girada ? u.C : u.L)) / 1000, veic.L / 1000);
  m.nCaibro = Math.max(2, Math.round(along / 1.5) + 1); m.compCaibro = across; m.caibro += m.nCaibro * across;
  const C = u.C / 1000, L = u.L / 1000, A = u.A / 1000, emb = u.embalagem?.tipo;
  // pacote: caibro entre as camadas, na mesma batida dos de baixo (Vitor, 24/09/2026: "travar com madeiras no meio")
  if (u.tipo === "PACOTE" && u.madeiraEntre) m.caibro += (new Set((u.membros || []).map((p) => p.dy || 0)).size - 1) * m.nCaibro * L;
  if (u.emPe && emb === "engradado") { m.sarrafo += 2 * (2 * C + 2 * A) + 2 * hyp(C, A) + 4 * L + 3 * C; m.caibro += 2 * C + 3 * L; }
  else if (emb === "engradado" && u.embalagem?.deitado) { m.sarrafo += 2 * (2 * C + 2 * L) + 4 * A; m.tabua += C * L; m.caibro += 3 * L; }
  else if (u.tipo === "CAIXA") { m.tabua += COBERTURA_CAIXA * 2 * (C * L + C * A + L * A); m.sarrafo += 4 * A + 2 * (2 * C + 2 * L); m.caibro += 3 * L; }
  return m;
}

/** Peças de 3 m (caibro 5×6, sarrafo 2,5×5) e tábuas 2,5×30 cm de 3 m (0,9 m² cada). */
export const pecasDeMadeira = (m) => ({ caibro: Math.ceil(m.caibro / 3), sarrafo: Math.ceil(m.sarrafo / 3), tabua: Math.ceil(m.tabua / 0.9) });

export function madeiraDaCarga(itens, veic) {
  const tot = { caibro: 0, sarrafo: 0, tabua: 0 };
  for (const u of itens) { const m = madeiraDaUnidade(u, veic); for (const k in tot) tot[k] += m[k]; }
  return { metros: tot, pecas: pecasDeMadeira(tot) };
}
