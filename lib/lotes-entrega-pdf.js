import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";

// PLANO DE ENTREGAS (pdf-lib) — lista os lotes do orçamento de serviço, cada um
// com seu local de entrega, data prevista e os itens que vão naquele lote.
// Mesmo estilo dos outros PDFs do portal (navy/laranja).

const A4 = [595.28, 841.89];
const M = 48;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.15, 0.19, 0.25);
const GRAY = rgb(0.36, 0.44, 0.5);
const LINE = rgb(0.82, 0.85, 0.89);
const LIGHT = rgb(0.95, 0.96, 0.98);
const WHITE = rgb(1, 1, 1);
const LINKBLUE = rgb(0.11, 0.4, 0.75);

const WINANSI_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);
const san = (s) => String(s ?? "").replace(/μ/g, "µ").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const numero = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const osNum = (o) => (o.numero ? `OS-${String(o.numero).padStart(3, "0")}` : "OS");

// Anotação de link (URL clicável) sobre um retângulo da página. Envolvido em
// try/catch no chamador — se falhar, o texto continua renderizado.
function addLink(pdf, page, x, y, w, h, url) {
  const ref = pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(String(url)) } }));
  let annots = page.node.lookup(PDFName.of("Annots"));
  if (!annots) { annots = pdf.context.obj([]); page.node.set(PDFName.of("Annots"), annots); }
  annots.push(ref);
}

export async function gerarLotesPDF(o, now = new Date()) {
  const lotes = Array.isArray(o.lotes) ? o.lotes : [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0] - 2 * M;
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const fit = (str, f, size, maxW) => { let s = san(str); if (f.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1); return s + "…"; };
  const quebrar = (txt, f, size, maxW) => { const out = []; let l = ""; for (const wd of san(txt).split(/\s+/)) { const t = l ? l + " " + wd : wd; if (f.widthOfTextAtSize(t, size) <= maxW) l = t; else { if (l) out.push(l); l = wd; } } if (l) out.push(l); return out.length ? out : [""]; };

  let page, y;
  const dataStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const rodape = () => {
    page.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.6, color: LINE });
    page.drawText("TORG METAL — Plano de Entregas", { x: M, y: 30, size: 7.5, font: bold, color: GRAY });
    page.drawText(san(osNum(o)), { x: A4[0] - M - font.widthOfTextAtSize(san(osNum(o)), 7.5), y: 30, size: 7.5, font, color: GRAY });
  };
  const novaPagina = () => { if (page) rodape(); page = pdf.addPage(A4); y = A4[1] - M; return page; };
  const espaco = (h) => { if (y - h < 52) novaPagina(); };
  const para = (texto, size = 9.5, cor = DARK, x0 = M, maxW = W) => { for (const bloco of san(texto).split(/\n/)) { for (const ln of quebrar(bloco, font, size, maxW)) { espaco(size + 4); page.drawText(ln, { x: x0, y, size, font, color: cor }); y -= size + 4; } } };

  // ── Cabeçalho ──
  novaPagina();
  const bh = 60;
  page.drawRectangle({ x: 0, y: A4[1] - bh, width: A4[0], height: bh, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - bh, width: A4[0], height: 3, color: ORANGE });
  if (logo) { const lw = 92, lh2 = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - bh / 2 - lh2 / 2, width: lw, height: lh2 }); }
  const tit = "PLANO DE ENTREGAS";
  page.drawText(tit, { x: A4[0] - M - bold.widthOfTextAtSize(tit, 14), y: A4[1] - 30, size: 14, font: bold, color: WHITE });
  page.drawText(san(`${osNum(o)} · ${dataStr}`), { x: A4[0] - M - font.widthOfTextAtSize(san(`${osNum(o)} · ${dataStr}`), 9.5), y: A4[1] - 46, size: 9.5, font, color: rgb(0.75, 0.82, 0.92) });
  y = A4[1] - bh - 22;

  // ── Identificação ──
  const kv = (k, v) => { if (!v) return; page.drawText(san(k), { x: M, y, size: 9, font: bold, color: GRAY }); page.drawText(fit(v, font, 9, W - 70), { x: M + 62, y, size: 9, font, color: DARK }); y -= 14; };
  kv("Cliente:", o.cliente);
  kv("Obra:", o.obra);
  y -= 4;
  para("Entrega das peças em lotes, conforme locais e datas abaixo. As quantidades por lote devem ser conferidas no ato do recebimento. A coluna Documento traz o arquivo de referência de cada peça, quando anexado.", 9, GRAY);
  y -= 6;

  if (!lotes.length) { para("Nenhum lote cadastrado.", 10, GRAY); }

  // ── Lotes ──
  const cols = [0.42 * W, 0.1 * W, 0.13 * W, 0.35 * W]; // Descrição | Qtd | Unid | Documento
  const cx = [M, M + cols[0], M + cols[0] + cols[1], M + cols[0] + cols[1] + cols[2]];
  lotes.forEach((lote, li) => {
    // cabeçalho do lote (faixa navy)
    const h = 22; espaco(h + 60);
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: NAVY });
    page.drawRectangle({ x: M, y: y - h, width: 4, height: h, color: ORANGE });
    page.drawText(fit(lote.nome || `Lote ${li + 1}`, bold, 11, W - 120), { x: M + 12, y: y - h + 6.5, size: 11, font: bold, color: WHITE });
    if (lote.data) page.drawText(san("Entrega: " + lote.data), { x: A4[0] - M - font.widthOfTextAtSize(san("Entrega: " + lote.data), 9) - 10, y: y - h + 7, size: 9, font, color: rgb(0.8, 0.86, 0.94) });
    y -= h + 8;
    // local de entrega
    if (lote.local) { page.drawText("Local de entrega:", { x: M, y, size: 9, font: bold, color: GRAY }); y -= 12; para(lote.local, 9.5, DARK); y -= 2; }
    // tabela de itens
    const itens = Array.isArray(lote.itens) ? lote.itens : [];
    const th = 18;
    const cell = (t, i2, ty, f, color, right, link) => { const s = fit(t, f, 8.5, cols[i2] - 8); const tx = right ? cx[i2] + cols[i2] - 5 - f.widthOfTextAtSize(s, 8.5) : cx[i2] + 5; page.drawText(s, { x: tx, y: ty, size: 8.5, font: f, color }); if (link) { try { addLink(pdf, page, tx - 1, ty - 2, f.widthOfTextAtSize(s, 8.5) + 2, 11, link); } catch {} } };
    const row = (c, header) => {
      espaco(th + 2);
      page.drawRectangle({ x: M, y: y - th, width: W, height: th, color: header ? LIGHT : WHITE, borderColor: LINE, borderWidth: 0.5 });
      const ty = y - th + 5.5, f = header ? bold : font;
      cell(c.d, 0, ty, f, DARK); cell(c.q, 1, ty, f, DARK, true); cell(c.u, 2, ty, f, DARK);
      cell(c.doc, 3, ty, f, header ? DARK : (c.url ? LINKBLUE : GRAY), false, header ? null : (c.url || null));
      y -= th;
    };
    row({ d: "Descrição", q: "Qtd.", u: "Unid.", doc: "Documento", url: "" }, true);
    if (!itens.length) { espaco(th); page.drawText("(sem itens neste lote)", { x: M + 5, y: y - th + 5.5, size: 8.5, font, color: GRAY }); y -= th; }
    else itens.forEach((it) => row({ d: it.descricao || "—", q: it.qtd || "", u: it.unidade || "", doc: it.nomeArquivo || "—", url: it.url || "" }));
    y -= 16;
  });

  rodape();
  const bytes = await pdf.save();
  return { bytes, filename: `${osNum(o)}-plano-entregas.pdf` };
}
