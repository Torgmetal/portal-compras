// ─── O PDF DO FOR-081, DESENHADO A PARTIR DA PRÓPRIA PLANILHA ────────────────────────────────────
//
// Vitor (15/10/2026): o romaneio da TMSA sai "tanto o excel e o pdf", e "exatamente esse mesmo modelo, não podemos
// mudar nada". O servidor (Vercel) não tem Excel nem LibreOffice para converter; então o PDF é DESENHADO lendo da
// planilha já preenchida (lib/romaneio-tmsa-excel.js) as larguras, alturas, mesclagens, bordas, preenchimentos,
// fontes, alinhamentos e o logo — uma fonte só para os dois arquivos, que nunca divergem.
//
// A4 paisagem, ajustado à largura (como o pageSetup do modelo: fitToWidth 1); as linhas 6–8 (cabeçalho da tabela) se
// repetem nas páginas seguintes, como o printTitlesRow "6:8" do modelo.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = { w: 841.89, h: 595.28 }, MARGEM = 18;
// ⚠ também desenha o Packing List da Valmet (lib/packing-valmet-excel.js): as linhas que se repetem e a última coluna
// vêm da PRÓPRIA planilha (printTitlesRow / printArea) — no FOR-081 são 6:8 e A:O; no da Valmet, 1:12 e A:R
const letraParaNum = (l) => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const numParaLetra = (n) => (n > 26 ? numParaLetra(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
function linhasTitulo(ws) {
  const m = String(ws.pageSetup.printTitlesRow || "").match(/(\d+)\s*:\s*\$?(\d+)/);
  if (!m) return [6, 7, 8];
  const out = []; for (let r = Number(m[1]); r <= Number(m[2]); r++) out.push(r);
  return out;
}

// as cores do tema que o modelo usa (amarelo claro = tema 7 com tint 0,6; branco = tema 0)
function corDoPreenchimento(fill) {
  const c = fill?.fgColor;
  if (!fill || fill.pattern !== "solid" || !c) return null;
  if (c.argb) { const h = c.argb.slice(-6); return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); }
  if (c.theme === 0) return null;
  if (c.theme === 7) return rgb(1, 0.902, 0.6);
  return rgb(0.95, 0.95, 0.95);
}
// só o vermelho de verdade (a coluna TAG do modelo); preto e "automático" ficam pretos
const corDaFonte = (f) => (String(f?.color?.argb || "").slice(-6).toUpperCase() === "FF0000" ? rgb(0.85, 0.1, 0.1) : rgb(0, 0, 0));
const espessura = (b) => (!b?.style ? 0 : b.style === "thin" || b.style === "hair" ? 0.5 : b.style === "medium" ? 1.2 : 1.8);

function textoDaCelula(c) {
  const v = c.value;
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const casas = /0\.00/.test(c.numFmt || "") ? 2 : /#,##0/.test(c.numFmt || "") ? 0 : null;
    return casas == null ? String(v).replace(".", ",") : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  if (v instanceof Date) return v.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  if (typeof v === "object" && v.richText) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
}

function quebrar(texto, fonte, tam, largura) {
  const linhas = [];
  for (const par of String(texto).split(/\n/)) {
    let atual = "";
    for (const p of par.split(/\s+/)) {
      const t = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(t, tam) <= largura || !atual) atual = t; else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** @param {Buffer} xlsx  o FOR-081 preenchido  @returns {Promise<Uint8Array>} */
export async function gerarRomaneioTmsaPdf(xlsx) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx);
  const ws = wb.worksheets[0];
  const area = String(ws.pageSetup.printArea || "A1:O24").replace(/\$/g, "");
  const ultima = Number(area.match(/(\d+)$/)?.[1]) || 24;
  const COLS = Array.from({ length: letraParaNum(area.match(/:([A-Z]+)\d+$/)?.[1] || "O") }, (_, i) => numParaLetra(i + 1));
  const LINHAS_TITULO = linhasTitulo(ws);

  // larguras (unidade do Excel → pt) e alturas
  const larg = COLS.map((c) => (Math.trunc((ws.getColumn(c).width || 8.43) * 7 + 5)) * 0.75);
  const alt = (r) => ws.getRow(r).height || 15;
  const escala = Math.min(1, (A4.w - 2 * MARGEM) / larg.reduce((s, v) => s + v, 0));
  const x0 = [0]; larg.forEach((w, i) => x0.push(x0[i] + w));

  // mesclagens: mestre → { r1, c1, r2, c2 }; célula de dentro → mestre
  const mescla = new Map(), dentro = new Set();
  for (const m of ws.model.merges) {
    const [a, b] = m.split(":");
    const ca = ws.getCell(a), cb = ws.getCell(b);
    mescla.set(`${ca.row}:${ca.col}`, { r1: ca.row, c1: ca.col, r2: cb.row, c2: cb.col });
    for (let r = ca.row; r <= cb.row; r++) for (let c = ca.col; c <= cb.col; c++) if (r !== ca.row || c !== ca.col) dentro.add(`${r}:${c}`);
  }

  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const imgs = [];
  for (const im of ws.getImages()) {
    const dado = wb.getImage(im.imageId);
    imgs.push({ im, png: dado.extension === "png" ? await pdf.embedPng(dado.buffer) : await pdf.embedJpg(dado.buffer) });
  }

  // páginas: linhas 1..última, cortando em linhas inteiras; da 2ª em diante repete 6–8
  const hUtil = (A4.h - 2 * MARGEM) / escala;
  const paginas = [];
  let atual = [], usado = 0;
  for (let r = 1; r <= ultima; r++) {
    // não corta no meio de um volume mesclado na vertical
    const bloco = [r];
    const m = mescla.get(`${r}:1`);
    if (m && m.r2 > r) for (let k = r + 1; k <= m.r2; k++) bloco.push(k);
    const hb = bloco.reduce((s, k) => s + alt(k), 0);
    if (usado + hb > hUtil && atual.length) {
      paginas.push(atual);
      atual = [...LINHAS_TITULO];
      usado = LINHAS_TITULO.reduce((s, k) => s + alt(k), 0);
    }
    atual.push(...bloco); usado += hb; r = bloco[bloco.length - 1];
  }
  paginas.push(atual);

  for (const linhas of paginas) {
    const pg = pdf.addPage([A4.w, A4.h]);
    const yDe = new Map(); let y = 0;
    for (const r of linhas) { yDe.set(r, y); y += alt(r); }
    const X = (v) => MARGEM + v * escala, Y = (v) => A4.h - MARGEM - v * escala;

    for (const r of linhas) {
      for (let c = 1; c <= COLS.length; c++) {
        if (dentro.has(`${r}:${c}`)) continue;
        const m = mescla.get(`${r}:${c}`) || { r1: r, c1: c, r2: r, c2: c };
        const rs = []; for (let k = m.r1; k <= m.r2; k++) if (yDe.has(k)) rs.push(k);
        const top = yDe.get(r), h = rs.reduce((s, k) => s + alt(k), 0);
        const left = x0[m.c1 - 1], w = x0[m.c2] - x0[m.c1 - 1];
        const cel = ws.getCell(r, c);
        const fundo = corDoPreenchimento(cel.fill);
        if (fundo) pg.drawRectangle({ x: X(left), y: Y(top + h), width: w * escala, height: h * escala, color: fundo });
        // bordas da região: as de cima/esquerda do mestre, as de baixo/direita das células da borda
        const bTop = cel.border?.top, bLeft = cel.border?.left;
        const bBottom = ws.getCell(m.r2, c).border?.bottom || cel.border?.bottom;
        const bRight = ws.getCell(r, m.c2).border?.right || cel.border?.right;
        const linha = (x1, y1, x2, y2, b) => { const t = espessura(b); if (t) pg.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: t * escala, color: rgb(0, 0, 0) }); };
        linha(left, top, left + w, top, bTop); linha(left, top + h, left + w, top + h, bBottom);
        linha(left, top, left, top + h, bLeft); linha(left + w, top, left + w, top + h, bRight);

        const txt = textoDaCelula(cel);
        if (!txt) continue;
        const f = cel.font?.bold ? negrito : fonte;
        const tam = (cel.font?.size || 11) * 0.95;
        const al = cel.alignment || {};
        const mesclada = m.c2 > m.c1 || m.r2 > m.r1;
        let tam2 = tam;
        let ls = al.wrapText || mesclada ? quebrar(txt, f, tam, w - 4) : [txt];
        // ⚠ quebrado que não cabe na ALTURA da célula invadia a linha de baixo (motorista e endereço do Packing List da
        // Valmet): aí vai numa linha só, com a letra reduzida até caber na largura — no máximo à metade
        if (ls.length > 1 && ls.length * tam * 1.15 > h - 2) {
          ls = [txt.replace(/\s+/g, " ")];
          tam2 = Math.max(tam * 0.5, Math.min(tam, (tam * (w - 6)) / f.widthOfTextAtSize(ls[0], tam)));
        }
        const lh = tam2 * 1.15, bloco = ls.length * lh;
        let ty = al.vertical === "top" ? top + 2 + tam2 : al.vertical === "bottom" ? top + h - 3 - bloco + tam2 : top + (h - bloco) / 2 + tam2 * 0.85;
        for (const t of ls) {
          const tw = f.widthOfTextAtSize(t, tam2);
          const tx = al.horizontal === "center" ? left + (w - tw) / 2 : al.horizontal === "right" ? left + w - tw - 3 : left + 3;
          pg.drawText(t, { x: X(tx), y: Y(ty), size: tam2 * escala, font: f, color: corDaFonte(cel.font) });
          ty += lh;
        }
      }
    }
    for (const { im, png } of imgs) {
      const tl = im.range.tl, br = im.range.br;
      if (!br || !yDe.has(Math.floor(tl.nativeRow) + 1)) continue;
      const px = (col, off) => x0[col] + (off || 0) / 12700;
      const py = (row, off) => (yDe.get(row + 1) ?? 0) + (off || 0) / 12700;
      const xa = px(tl.nativeCol, tl.nativeColOff), ya = py(tl.nativeRow, tl.nativeRowOff);
      const xb = px(br.nativeCol, br.nativeColOff), yb = py(br.nativeRow, br.nativeRowOff);
      pg.drawImage(png, { x: X(xa), y: Y(yb), width: (xb - xa) * escala, height: (yb - ya) * escala });
    }
  }
  return pdf.save();
}
