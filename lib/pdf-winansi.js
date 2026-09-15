// ─── TEXTO QUE A HELVETICA DO pdf-lib ACEITA ──────────────────────────────────
// As fontes base-14 (Helvetica…) escrevem WinAnsi/CP1252 e o pdf-lib LEVANTA ERRO num caractere
// de fora — inclusive num acento DECOMPOSTO: "Inspeção" salvo por macOS/SharePoint vem como
// "c" + U+0327 e "a" + U+0303, e foi assim que a geração do data book da OP-089 morreu com
// `WinAnsi cannot encode "̃" (0x0303)` (Geraldo, 15/09/2026) — 187 anexos na fila, zero páginas.
//
// ⚠ NFC PRIMEIRO. Compor o acento devolve o "ã" que o CP1252 tem; só depois se trata o que sobrar
// (símbolo, travessão, emoji), como o carimbo do desenho já fazia (lib/carimbo-desenho).
const TROCAS = { "⚠": "!", "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "×": "x", "•": "·", "™": "TM", "≠": "!=", "…": "..." };

export function winAnsi(t) {
  return String(t ?? "").normalize("NFC").replace(/[^\u0020-\u00FF\t\n]/gu, (c) => {
    if (TROCAS[c]) return TROCAS[c];
    if ("‘’‚‛".includes(c)) return "'";
    if ("“”„".includes(c)) return '"';
    if ("–—―".includes(c)) return "-";
    const base = c.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return /^[\u0020-\u00FF]*$/.test(base) ? base : "";
  });
}

/**
 * Blinda um PDFDocument do pdf-lib: toda página criada por `addPage` passa a sanear o texto de
 * `drawText`, e as fontes passadas saneiam `widthOfTextAtSize` — um nome de arquivo com acento
 * decomposto deixa de derrubar o documento inteiro. Chame logo depois de embutir as fontes.
 */
export function blindarPdf(pdf, fontes = []) {
  for (const f of fontes) {
    if (!f || f.__winAnsi) continue;
    const w = f.widthOfTextAtSize.bind(f);
    f.widthOfTextAtSize = (t, s) => w(winAnsi(t), s);
    f.__winAnsi = true;
  }
  const addPage = pdf.addPage.bind(pdf);
  pdf.addPage = (...a) => {
    const page = addPage(...a);
    const draw = page.drawText.bind(page);
    page.drawText = (t, o) => draw(winAnsi(t), o);
    return page;
  };
  return pdf;
}
