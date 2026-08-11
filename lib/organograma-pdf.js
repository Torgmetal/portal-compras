import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// PDF do ORGANOGRAMA (RH) em ESTRUTURA de organograma (caixas + linhas, hierárquico),
// A3 paisagem. Diretoria no topo → setores conectados por um "pente" (espinha central +
// barramento por linha). Cada caixa: barra da cor do setor + nome/sigla + gestor + equipe.

const PAGE = [1190.55, 841.89]; // A3 paisagem
const M = 30;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const CONN = rgb(0.62, 0.68, 0.74); // linhas de conexão
const WHITE = rgb(1, 1, 1);

const BOXW = 178;
const GAPX = 14;
const GAPY = 30;      // espaço vertical entre linhas (p/ os conectores)
const HEAD = 26;      // altura do cabeçalho da caixa
const LINEH = 10;     // altura de cada pessoa
const PAD = 10;

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
  const linhasSetor = (s) => {
    const g = s.gestor;
    const time = (s.funcionarios || []).filter((f) => !g || f.nome !== g.nome);
    return (g ? 1 : 0) + time.length;
  };
  const alturaBox = (s) => HEAD + Math.max(1, linhasSetor(s)) * LINEH + PAD;

  // Diretoria vai pro topo; o resto é o "corpo" do organograma.
  const dir = setores.find((s) => /diretoria|diretor/i.test(s.nome));
  const demais = setores.filter((s) => s !== dir);

  const usable = PAGE[0] - 2 * M;
  const perRow = Math.max(1, Math.floor((usable + GAPX) / (BOXW + GAPX)));
  const rows = [];
  for (let i = 0; i < demais.length; i += perRow) rows.push(demais.slice(i, i + perRow));

  const paginas = [];
  const spineX = PAGE[0] / 2;

  const desenhaBox = (page, x, yTop, s) => {
    const cor = hexRgb(s.cor);
    const g = s.gestor;
    const time = (s.funcionarios || []).filter((f) => !g || f.nome !== g.nome);
    const h = alturaBox(s);
    page.drawRectangle({ x, y: yTop - h, width: BOXW, height: h, color: WHITE, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: yTop - 4, width: BOXW, height: 4, color: cor });
    page.drawText(trunc(s.nome, BOXW - 34, 8.5, bold), { x: x + 8, y: yTop - 17, size: 8.5, font: bold, color: DARK });
    const cnt = String((s.funcionarios || []).length);
    page.drawText(cnt, { x: x + BOXW - 8 - font.widthOfTextAtSize(cnt, 8), y: yTop - 16, size: 8, font, color: GRAY });
    let yy = yTop - HEAD - 1;
    if (g) { page.drawText(trunc("Gestor: " + primUlt(g.nome), BOXW - 14, 7.5, bold), { x: x + 8, y: yy, size: 7.5, font: bold, color: BLUE }); yy -= LINEH; }
    for (const f of time) { page.drawText(trunc("- " + primUlt(f.nome), BOXW - 14, 7.5), { x: x + 8, y: yy, size: 7.5, font, color: DARK }); yy -= LINEH; }
    if (!g && !time.length) { page.drawText("Sem colaboradores", { x: x + 8, y: yy, size: 7.5, font, color: GRAY }); }
    return h;
  };

  const cabecalho = (page) => {
    const hb = 66;
    page.drawRectangle({ x: 0, y: PAGE[1] - hb, width: PAGE[0], height: hb, color: NAVY });
    page.drawRectangle({ x: 0, y: PAGE[1] - hb - 3, width: PAGE[0], height: 3, color: ORANGE });
    if (logo) { const lw = 78, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: PAGE[1] - hb + (hb - lh) / 2, width: lw, height: lh }); }
    page.drawText("ORGANOGRAMA", { x: M + 100, y: PAGE[1] - 32, size: 15, font: bold, color: WHITE });
    page.drawText(san(`${empresa} · ${totalFuncionarios} colaboradores ativos · emitido em ${new Date().toLocaleDateString("pt-BR")}`), { x: M + 100, y: PAGE[1] - 50, size: 9, font, color: rgb(0.8, 0.86, 0.94) });
    return PAGE[1] - hb - 22;
  };

  // ── Página 1: Diretoria no topo + espinha ──
  let page = pdf.addPage(PAGE); paginas.push(page);
  let topo = cabecalho(page);

  let spineDe = topo; // onde a espinha começa (fundo da Diretoria)
  if (dir) {
    const dw = 320, dx = (PAGE[0] - dw) / 2;
    const g = dir.gestor;
    const time = (dir.funcionarios || []);
    const h = HEAD + Math.max(1, time.length) * LINEH + PAD;
    page.drawRectangle({ x: dx, y: topo - h, width: dw, height: h, color: WHITE, borderColor: NAVY, borderWidth: 1.4 });
    page.drawRectangle({ x: dx, y: topo - 5, width: dw, height: 5, color: NAVY });
    page.drawText(san(dir.nome), { x: dx + 12, y: topo - 19, size: 10.5, font: bold, color: DARK });
    let yy = topo - HEAD - 1;
    for (const f of time) { page.drawText(trunc((f.cargo?.nome ? f.cargo.nome + ": " : "") + f.nome, dw - 20, 8), { x: dx + 12, y: yy, size: 8, font, color: DARK }); yy -= LINEH; }
    spineDe = topo - h;
  } else {
    page.drawText("Torg Metal", { x: spineX - 30, y: topo - 14, size: 12, font: bold, color: DARK });
    spineDe = topo - 22;
  }

  // ── Linhas de setores (pente) ──
  // Desenha conectores primeiro e guarda as caixas p/ desenhar POR ÚLTIMO (cobrem a espinha).
  const boxesToDraw = [];
  let rowTop = spineDe - GAPY;
  let ultimoBus = spineDe;
  for (const row of rows) {
    const rowH = Math.max(...row.map(alturaBox));
    // quebra de página se a linha não couber
    if (rowTop - rowH < M + 24) {
      // fecha a espinha na página atual
      page.drawLine({ start: { x: spineX, y: spineDe }, end: { x: spineX, y: ultimoBus }, thickness: 1, color: CONN });
      page = pdf.addPage(PAGE); paginas.push(page);
      topo = cabecalho(page);
      spineDe = topo - 6; ultimoBus = spineDe; rowTop = topo - GAPY - 6;
    }
    const rowW = row.length * BOXW + (row.length - 1) * GAPX;
    let x = (PAGE[0] - rowW) / 2;
    const busY = rowTop + 15;
    const firstC = x + BOXW / 2;
    const lastC = x + (row.length - 1) * (BOXW + GAPX) + BOXW / 2;
    page.drawLine({ start: { x: Math.min(firstC, spineX), y: busY }, end: { x: Math.max(lastC, spineX), y: busY }, thickness: 1, color: CONN });
    for (const s of row) {
      const cx = x + BOXW / 2;
      page.drawLine({ start: { x: cx, y: busY }, end: { x: cx, y: rowTop }, thickness: 1, color: CONN });
      boxesToDraw.push({ page, x, rowTop, s });
      x += BOXW + GAPX;
    }
    ultimoBus = busY;
    rowTop = rowTop - rowH - GAPY;
  }
  // espinha final (Diretoria → último barramento)
  page.drawLine({ start: { x: spineX, y: spineDe }, end: { x: spineX, y: ultimoBus }, thickness: 1, color: CONN });

  // caixas por último — cobrem a espinha onde ela passa por trás
  for (const b of boxesToDraw) desenhaBox(b.page, b.x, b.rowTop, b.s);

  // rodapé
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`${empresa} · RH · Organograma`), { x: M, y: 20, size: 8, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: PAGE[0] - M - font.widthOfTextAtSize(pg, 8), y: 20, size: 8, font, color: GRAY });
  });

  return pdf.save();
}
