// ─── O FORMATO (A0–A4) DE UMA FOLHA, PELO TAMANHO REAL DA PÁGINA ─────────────────────────────
// Vitor (16/09/2026): "tem folha A1 que vc está colocando como A4". O portal lia o formato pelo
// NOME DA PASTA-MÃE do PDF ("…/2.5.2.3 Conjunto/A/A1/T94A1.pdf"); a OP-094 veio sem as subpastas
// A1–A4 (o PDF direto em "Conjunto/A") e tudo caiu no "A4" de reserva — 354 GRDs, lotes "A4" com
// A3 e A1 dentro, e a plotter ficou sem os desenhos dela. A pasta é convenção que a engenharia
// nem sempre segue; o tamanho da página está no próprio arquivo e não depende de ninguém.
//
// ⚠ MEDE A PÁGINA, IGNORA A ORIENTAÇÃO: A3 deitado (420 × 297) e em pé (297 × 420) são a mesma
// bandeja. O /Rotate também não muda a folha — por isso ordena (menor, maior) antes de comparar.
//
// ⚠ TOLERÂNCIA de 6 %: MediaBox arredondado, margem de plotagem ou um "A3 estendido" continuam
// A3. Fora disso devolve null — o chamador decide o que fazer (o lote cai na pasta-mãe, como era).
const PT_POR_MM = 72 / 25.4;

/** ISO 216, em mm (lado menor, lado maior). */
export const FORMATOS_MM = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297] };

/**
 * @param {number} larguraPt largura da página em pontos (1/72")
 * @param {number} alturaPt altura em pontos
 * @returns {"A0"|"A1"|"A2"|"A3"|"A4"|null}
 */
export function formatoDaFolha(larguraPt, alturaPt) {
  const w = Number(larguraPt) / PT_POR_MM, h = Number(alturaPt) / PT_POR_MM;
  if (!(w > 0) || !(h > 0)) return null;
  const [menor, maior] = w <= h ? [w, h] : [h, w];
  for (const [nome, [a, b]] of Object.entries(FORMATOS_MM)) {
    if (Math.abs(menor - a) <= a * 0.06 && Math.abs(maior - b) <= b * 0.06) return nome;
  }
  return null;
}

/**
 * Formato de um PDF já aberto no pdf-lib: o da PRIMEIRA página (desenho de fabricação tem uma).
 * @param {{ getPage: (i:number)=>{ getSize: ()=>{width:number,height:number} }, getPageCount: ()=>number }} pdfDoc
 */
export function formatoDoPdf(pdfDoc) {
  try {
    if (!pdfDoc || pdfDoc.getPageCount() < 1) return null;
    const { width, height } = pdfDoc.getPage(0).getSize();
    return formatoDaFolha(width, height);
  } catch { return null; }
}
