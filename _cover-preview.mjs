// Protótipo das 3 capas do Data Book — gera /tmp/dbcovers.pdf (3 páginas, 1 por conceito).
// Standalone (sem imports do projeto). Renderizar com: pdftoppm -png -r 110 /tmp/dbcovers.pdf /tmp/dbcover
import fs from "fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const [W, H] = A4;
const M = 48;
const navy = rgb(0 / 255, 41 / 255, 69 / 255);     // #002945
const blue = rgb(0 / 255, 110 / 255, 171 / 255);   // #006eab
const orange = rgb(244 / 255, 128 / 255, 31 / 255); // #f4801f
const gray = rgb(87 / 255, 109 / 255, 126 / 255);  // #576d7e
const light = rgb(0.945, 0.955, 0.965);
const white = rgb(1, 1, 1);
const lightBlue = rgb(0.62, 0.74, 0.9);

const data = {
  titulo: "DATA BOOK",
  subtitulo: "Documentos de Engenharia e Fabricação",
  cliente: "ACTEMIUM",
  empreendimento: "Replan — Base Bomba-2095A e Fund. Pipe-rack PPR-200A-00",
  fabricante: "TORG METAL",
  obra: "T065",
  codigo: "PQ-DB-065",
  revisao: "00",
  tipoLabel: "Padrão Torg",
  responsavel: "Guilherme Agnelli Corte Campos",
  dataLabel: "JAN/2026",
};

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

function readImg(name) { try { return fs.readFileSync("public/" + name); } catch { return null; } }
const whiteLogoBuf = readImg("torg-logo-white.png");
const darkLogoBuf = readImg("torg-logo.png") || whiteLogoBuf;
const logoWhite = whiteLogoBuf ? await pdf.embedPng(whiteLogoBuf) : null;
const logoDark = darkLogoBuf ? await pdf.embedPng(darkLogoBuf) : null;

// tracking (espaçamento entre letras) p/ rótulos — pdf-lib não tem letterSpacing
function drawTracked(page, txt, x, y, size, f, color, track = 1.5) {
  let cx = x;
  for (const ch of txt) {
    page.drawText(ch, { x: cx, y, size, font: f, color });
    cx += f.widthOfTextAtSize(ch, size) + track;
  }
  return cx - x;
}
function trackedWidth(txt, size, f, track = 1.5) {
  let w = 0; for (const ch of txt) w += f.widthOfTextAtSize(ch, size) + track; return w - track;
}
const wText = (txt, size, f) => f.widthOfTextAtSize(txt, size);
function center(page, txt, y, size, f, color) {
  page.drawText(txt, { x: (W - wText(txt, size, f)) / 2, y, size, font: f, color });
}
// quebra em linhas que cabem em maxW
function wrap(txt, size, f, maxW) {
  const out = []; let cur = "";
  for (const w of String(txt).split(/\s+/)) {
    const t = cur ? cur + " " + w : w;
    if (f.widthOfTextAtSize(t, size) <= maxW) cur = t; else { if (cur) out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// ─────────────────────────────────────────────────────────────
// CONCEITO 1 — Faixa institucional
// ─────────────────────────────────────────────────────────────
{
  const page = pdf.addPage(A4);
  const bandH = 236;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: navy });
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: 4, color: orange });
  if (logoWhite) { const lw = 148, lh = (logoWhite.height / logoWhite.width) * lw; page.drawImage(logoWhite, { x: M, y: H - 44 - lh, width: lw, height: lh }); }
  drawTracked(page, "DOSSIÊ DA QUALIDADE", M, H - 150, 11, bold, lightBlue, 3);
  page.drawText("DATA BOOK", { x: M, y: H - 196, size: 42, font: bold, color: white });
  page.drawText(data.subtitulo, { x: M, y: H - bandH + 26, size: 12.5, font, color: rgb(0.8, 0.86, 0.95) });

  let by = H - bandH - 64;
  const row = (label, val) => {
    drawTracked(page, label, M, by, 9, bold, gray, 2); by -= 19;
    const lines = wrap(val, 16, bold, W - 2 * M);
    for (const ln of lines) { page.drawText(ln, { x: M, y: by, size: 16, font: bold, color: navy }); by -= 19; }
    by -= 8;
    page.drawLine({ start: { x: M, y: by }, end: { x: W - M, y: by }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    by -= 26;
  };
  row("CLIENTE", data.cliente);
  row("EMPREENDIMENTO", data.empreendimento);
  row("FABRICANTE", data.fabricante);
  row("OBRA", data.obra);

  const fH = 96;
  page.drawRectangle({ x: 0, y: 0, width: W, height: fH, color: light });
  page.drawRectangle({ x: 0, y: fH, width: W, height: 3, color: navy });
  const cellW = (W - 2 * M) / 3;
  const metas = [["CÓDIGO", data.codigo], ["REVISÃO", data.revisao], ["EMISSÃO", data.dataLabel]];
  metas.forEach(([l, v], i) => {
    const cx = M + i * cellW;
    drawTracked(page, l, cx, fH - 30, 8, bold, gray, 1.5);
    page.drawText(v, { x: cx, y: fH - 52, size: 13, font: bold, color: navy });
  });
  drawTracked(page, "RESPONSÁVEL TÉCNICO", M, 26, 8, bold, gray, 1.5);
  page.drawText(data.responsavel, { x: M + trackedWidth("RESPONSÁVEL TÉCNICO", 8, bold, 1.5) + 12, y: 23, size: 11, font, color: navy });
}

// ─────────────────────────────────────────────────────────────
// CONCEITO 2 — Editorial minimalista
// ─────────────────────────────────────────────────────────────
{
  const page = pdf.addPage(A4);
  page.drawRectangle({ x: 0, y: 0, width: 9, height: H, color: navy });
  page.drawRectangle({ x: 0, y: H * 0.5, width: 9, height: 150, color: orange });
  const LX = M + 22;
  if (logoDark) { const lw = 120, lh = (logoDark.height / logoDark.width) * lw; page.drawImage(logoDark, { x: LX, y: H - 70 - lh, width: lw, height: lh }); }

  let ty = H - 250;
  page.drawText("Data Book", { x: LX, y: ty, size: 50, font: bold, color: navy });
  ty -= 20;
  page.drawLine({ start: { x: LX, y: ty }, end: { x: LX + 120, y: ty }, thickness: 2.5, color: orange });
  ty -= 26;
  page.drawText(data.subtitulo, { x: LX, y: ty, size: 13, font, color: gray });

  let by = ty - 60;
  const row = (label, val) => {
    page.drawLine({ start: { x: LX, y: by + 14 }, end: { x: W - M, y: by + 14 }, thickness: 0.5, color: rgb(0.86, 0.88, 0.91) });
    drawTracked(page, label, LX, by - 4, 8.5, bold, gray, 2);
    const lines = wrap(val, 14, bold, W - M - (LX + 150));
    let vy = by - 4;
    for (const ln of lines) { page.drawText(ln, { x: LX + 150, y: vy, size: 14, font: bold, color: navy }); vy -= 17; }
    by -= Math.max(34, 17 * lines.length + 18);
  };
  row("CLIENTE", data.cliente);
  row("EMPREENDIMENTO", data.empreendimento);
  row("FABRICANTE", data.fabricante);
  row("OBRA", data.obra);

  page.drawLine({ start: { x: LX, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.6, color: rgb(0.86, 0.88, 0.91) });
  const metaTxt = `${data.codigo}   ·   Revisão ${data.revisao}   ·   ${data.dataLabel}   ·   ${data.responsavel}`;
  page.drawText(metaTxt, { x: LX, y: 52, size: 9.5, font, color: gray });
}

// ─────────────────────────────────────────────────────────────
// CONCEITO 3 — Engenharia técnica (title block)
// ─────────────────────────────────────────────────────────────
{
  const page = pdf.addPage(A4);
  const f = 30;
  const frame = (inset, thick, color) => {
    page.drawRectangle({ x: inset, y: inset, width: W - 2 * inset, height: H - 2 * inset, borderWidth: thick, borderColor: color, color: undefined });
  };
  frame(f, 1.4, navy);
  frame(f + 5, 0.6, blue);
  // corner ticks
  const tick = 16;
  const ticks = [[f, H - f], [W - f, H - f], [f, f], [W - f, f]];
  // top accent strip inside frame
  page.drawRectangle({ x: f + 5, y: H - f - 5 - 46, width: W - 2 * (f + 5), height: 46, color: navy });
  page.drawText("TORG METAL  ·  CONTROLE DA QUALIDADE", { x: f + 20, y: H - f - 5 - 30, size: 10, font: bold, color: white });
  if (logoWhite) { const lw = 92, lh = (logoWhite.height / logoWhite.width) * lw; page.drawImage(logoWhite, { x: W - f - 20 - lw, y: H - f - 5 - 38, width: lw, height: lh }); }

  // centered title block
  center(page, "DATA BOOK", H - 360, 44, bold, navy);
  page.drawLine({ start: { x: W / 2 - 90, y: H - 376 }, end: { x: W / 2 + 90, y: H - 376 }, thickness: 2.5, color: orange });
  center(page, data.subtitulo, H - 398, 12.5, font, gray);
  center(page, data.cliente + "   ·   OBRA " + data.obra, H - 426, 12, bold, blue);
  // empreendimento (wrapped, centered)
  let ey = H - 452;
  for (const ln of wrap(data.empreendimento, 11, font, W - 2 * (f + 40))) { center(page, ln, ey, 11, font, gray); ey -= 15; }

  // title block (carimbo) bottom
  const tbH = 76, tbY = f + 16, tbX = f + 16, tbW = W - 2 * (f + 16);
  page.drawRectangle({ x: tbX, y: tbY, width: tbW, height: tbH, borderWidth: 1, borderColor: navy, color: undefined });
  const cols = [
    ["FABRICANTE", data.fabricante],
    ["DOCUMENTO Nº", data.codigo],
    ["REV.", data.revisao],
    ["EMISSÃO", data.dataLabel],
  ];
  let cx = tbX;
  const colWs = [tbW * 0.34, tbW * 0.28, tbW * 0.12, tbW * 0.26];
  cols.forEach(([l, v], i) => {
    if (i > 0) page.drawLine({ start: { x: cx, y: tbY }, end: { x: cx, y: tbY + tbH }, thickness: 0.8, color: navy });
    page.drawRectangle({ x: cx, y: tbY + tbH - 16, width: colWs[i], height: 16, color: light });
    drawTracked(page, l, cx + 8, tbY + tbH - 12, 7.5, bold, gray, 1);
    for (const ln of wrap(v, 11, bold, colWs[i] - 14)) {
      page.drawText(ln, { x: cx + 8, y: tbY + tbH - 36, size: 11, font: bold, color: navy });
    }
    cx += colWs[i];
  });
  drawTracked(page, "RESPONSÁVEL TÉCNICO", tbX + 8, tbY + 24, 7.5, bold, gray, 1);
  page.drawText(data.responsavel, { x: tbX + 8, y: tbY + 8, size: 10, font, color: navy });
}

fs.writeFileSync("/tmp/dbcovers.pdf", await pdf.save());
console.log("OK /tmp/dbcovers.pdf");
