import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dataBR } from "./data-br";

// PDF do ORGANOGRAMA (RH) em ESTRUTURA de organograma (caixas + linhas), A3 paisagem, 3 níveis:
// Diretoria → ADMINISTRATIVO | FÁBRICA → setores (cada um com gestor + equipe).

const PAGE = [1190.55, 841.89]; // A3 paisagem
const M = 30;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const CONN = rgb(0.62, 0.68, 0.74);
const WHITE = rgb(1, 1, 1);

const BOXW = 172;
const GAPX = 14;
const GAPY = 28;
const HEAD = 25;
const LINEH = 9.6;
const PAD = 9;

// Fábrica × Administrativo — mesma regra do portal do cliente (auditorias/portal).
const RX_FABRICA = /(produ|f[áa]bric|montag|solda|prepar|corte|pintura|jato|jatea|almox|expedi|caldeir|acabamento|usinag|oficina|manuten|ferrament|serralher|estoque)/i;

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return BLUE;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const primUlt = (nome) => { const p = String(nome || "").trim().split(/\s+/); return p.length <= 2 ? nome : `${p[0]} ${p[p.length - 1]}`; };

export async function gerarOrganogramaPDF({ empresa = "Torg Metal", totalFuncionarios = 0, setores = [] }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  const trunc = (t, larg, tam, f = font) => { let s = san(t); while (f.widthOfTextAtSize(s, tam) > larg && s.length > 3) s = s.slice(0, -2); return s.length < san(t).length ? s + ".." : s; };
  const linhasSetor = (s) => { const g = s.gestor; const time = (s.funcionarios || []).filter((f) => !g || f.nome !== g.nome); return (g ? 1 : 0) + time.length; };
  const alturaBox = (s) => HEAD + Math.max(1, linhasSetor(s)) * LINEH + PAD;

  const page = pdf.addPage(PAGE);

  // cabeçalho
  const hb = 66;
  page.drawRectangle({ x: 0, y: PAGE[1] - hb, width: PAGE[0], height: hb, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE[1] - hb - 3, width: PAGE[0], height: 3, color: ORANGE });
  if (logo) { const lw = 78, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: PAGE[1] - hb + (hb - lh) / 2, width: lw, height: lh }); }
  page.drawText("ORGANOGRAMA", { x: M + 100, y: PAGE[1] - 32, size: 15, font: bold, color: WHITE });
  page.drawText(san(`${empresa} · ${totalFuncionarios} colaboradores ativos · emitido em ${dataBR(new Date())}`), { x: M + 100, y: PAGE[1] - 50, size: 9, font, color: rgb(0.8, 0.86, 0.94) });

  const desenhaBox = (x, yTop, s) => {
    const cor = hexRgb(s.cor);
    const g = s.gestor;
    const time = (s.funcionarios || []).filter((f) => !g || f.nome !== g.nome);
    const h = alturaBox(s);
    page.drawRectangle({ x, y: yTop - h, width: BOXW, height: h, color: WHITE, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: yTop - 4, width: BOXW, height: 4, color: cor });
    page.drawText(trunc(s.nome, BOXW - 32, 8.5, bold), { x: x + 8, y: yTop - 17, size: 8.5, font: bold, color: DARK });
    const cnt = String((s.funcionarios || []).length);
    page.drawText(cnt, { x: x + BOXW - 8 - font.widthOfTextAtSize(cnt, 8), y: yTop - 16, size: 8, font, color: GRAY });
    let yy = yTop - HEAD - 1;
    if (g) { page.drawText(trunc("Gestor: " + primUlt(g.nome), BOXW - 14, 7.3, bold), { x: x + 8, y: yy, size: 7.3, font: bold, color: BLUE }); yy -= LINEH; }
    for (const f of time) { page.drawText(trunc("- " + primUlt(f.nome), BOXW - 14, 7.3), { x: x + 8, y: yy, size: 7.3, font, color: DARK }); yy -= LINEH; }
    if (!g && !time.length) page.drawText("Sem colaboradores", { x: x + 8, y: yy, size: 7.3, font, color: GRAY });
  };

  // Diretoria no topo
  const dir = setores.find((s) => /diretoria|diretor/i.test(s.nome));
  const demais = setores.filter((s) => s !== dir);
  const fabrica = demais.filter((s) => RX_FABRICA.test(s.nome));
  const adm = demais.filter((s) => !RX_FABRICA.test(s.nome));

  let dirBottom;
  {
    const dw = 320, dx = (PAGE[0] - dw) / 2, topo = PAGE[1] - hb - 20;
    const time = dir ? (dir.funcionarios || []) : [];
    const h = HEAD + Math.max(1, time.length) * LINEH + PAD;
    page.drawRectangle({ x: dx, y: topo - h, width: dw, height: h, color: WHITE, borderColor: NAVY, borderWidth: 1.4 });
    page.drawRectangle({ x: dx, y: topo - 5, width: dw, height: 5, color: NAVY });
    page.drawText(san(dir ? dir.nome : "Diretoria"), { x: dx + 12, y: topo - 18, size: 10.5, font: bold, color: DARK });
    let yy = topo - HEAD - 1;
    for (const f of time) { page.drawText(trunc((f.cargo?.nome ? f.cargo.nome + ": " : "") + f.nome, dw - 20, 8), { x: dx + 12, y: yy, size: 8, font, color: DARK }); yy -= LINEH; }
    dirBottom = topo - h;
  }

  const boxes = [];
  // Nó de grupo (ADMINISTRATIVO / FÁBRICA) + comb dos seus setores numa região [x0,x1].
  const desenhaGrupo = (label, lista, x0, x1, nodeTop) => {
    const centerX = (x0 + x1) / 2;
    const regionW = x1 - x0;
    const gnW = 190, gnH = 26, gnX = centerX - gnW / 2;
    // nó do grupo (navy)
    page.drawRectangle({ x: gnX, y: nodeTop - gnH, width: gnW, height: gnH, color: NAVY });
    page.drawText(san(label), { x: gnX + 12, y: nodeTop - 17, size: 10, font: bold, color: WHITE });
    const cn = `${lista.length} setores`;
    page.drawText(cn, { x: gnX + gnW - 10 - font.widthOfTextAtSize(cn, 8, bold), y: nodeTop - 17, size: 8, font, color: rgb(0.75, 0.82, 0.9) });
    const gnBottom = nodeTop - gnH;

    const perRow = Math.max(1, Math.floor((regionW + GAPX) / (BOXW + GAPX)));
    const rows = [];
    for (let i = 0; i < lista.length; i += perRow) rows.push(lista.slice(i, i + perRow));

    let rowTop = gnBottom - GAPY;
    let ultimoBus = gnBottom;
    for (const row of rows) {
      const rowH = Math.max(...row.map(alturaBox));
      const rowW = row.length * BOXW + (row.length - 1) * GAPX;
      let x = centerX - rowW / 2;
      const busY = rowTop + 14;
      const firstC = x + BOXW / 2, lastC = x + (row.length - 1) * (BOXW + GAPX) + BOXW / 2;
      page.drawLine({ start: { x: Math.min(firstC, centerX), y: busY }, end: { x: Math.max(lastC, centerX), y: busY }, thickness: 1, color: CONN });
      for (const s of row) {
        const cx = x + BOXW / 2;
        page.drawLine({ start: { x: cx, y: busY }, end: { x: cx, y: rowTop }, thickness: 1, color: CONN });
        boxes.push({ x, rowTop, s });
        x += BOXW + GAPX;
      }
      ultimoBus = busY;
      rowTop = rowTop - rowH - GAPY;
    }
    page.drawLine({ start: { x: centerX, y: gnBottom }, end: { x: centerX, y: ultimoBus }, thickness: 1, color: CONN });
    return { centerX, nodeTop };
  };

  // Bus da Diretoria p/ os dois grupos
  const nodeTop = dirBottom - GAPY;
  const busY = nodeTop + 14;
  const admCenter = M + (PAGE[0] / 2 - 10 - M) / 2;
  const fabCenter = PAGE[0] / 2 + 10 + (PAGE[0] - M - (PAGE[0] / 2 + 10)) / 2;
  page.drawLine({ start: { x: admCenter, y: busY }, end: { x: fabCenter, y: busY }, thickness: 1, color: CONN });
  page.drawLine({ start: { x: PAGE[0] / 2, y: dirBottom }, end: { x: PAGE[0] / 2, y: busY }, thickness: 1, color: CONN });
  page.drawLine({ start: { x: admCenter, y: busY }, end: { x: admCenter, y: nodeTop }, thickness: 1, color: CONN });
  page.drawLine({ start: { x: fabCenter, y: busY }, end: { x: fabCenter, y: nodeTop }, thickness: 1, color: CONN });

  desenhaGrupo("ADMINISTRATIVO", adm, M, PAGE[0] / 2 - 10, nodeTop);
  desenhaGrupo("FÁBRICA", fabrica, PAGE[0] / 2 + 10, PAGE[0] - M, nodeTop);

  // caixas por último (cobrem as linhas)
  for (const b of boxes) desenhaBox(b.x, b.rowTop, b.s);

  // rodapé
  page.drawText(san(`${empresa} · RH · Organograma`), { x: M, y: 20, size: 8, font, color: GRAY });
  const pg = "Página 1 de 1";
  page.drawText(pg, { x: PAGE[0] - M - font.widthOfTextAtSize(pg, 8), y: 20, size: 8, font, color: GRAY });

  return pdf.save();
}
