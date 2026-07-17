import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numPA, situacaoItem, situacaoItemLabel, STATUS_PLANO } from "@/lib/plano-acao";

// PLANO DE AÇÃO 5W2H em PDF (pdf-lib) — A4 PAISAGEM, tabela com as 7 colunas do
// 5W2H + situação, e o acompanhamento como sublinha. Padrão Torg (navy + filete
// laranja + logo). Rodapé paginado com selo ISO.

const PW = 841.89, PH = 595.28;
const M = 28;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LINE = rgb(0.82, 0.86, 0.9);
const HEADBG = rgb(0.93, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);
const SIT_COR = { A_FAZER: rgb(0.34, 0.43, 0.49), EM_ANDAMENTO: rgb(0.12, 0.25, 0.69), CONCLUIDO: rgb(0.02, 0.4, 0.27), ATRASADO: rgb(0.7, 0.11, 0.11) };

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

// colunas (largura soma ~ PW-2M = 786)
const COLS = [
  { key: "oque", h: "O QUÊ", w: 168 },
  { key: "porque", h: "POR QUÊ", w: 118 },
  { key: "onde", h: "ONDE", w: 66 },
  { key: "quem", h: "QUEM", w: 84 },
  { key: "quando", h: "QUANDO", w: 58, data: true },
  { key: "como", h: "COMO", w: 128 },
  { key: "quanto", h: "QUANTO", w: 62 },
  { key: "sit", h: "SITUAÇÃO", w: 72, sit: true },
];

export async function gerarPlanoAcaoPDF(p) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const wrap = (str, f, size, maxW) => {
    const out = [];
    for (const par of san(str).split("\n")) {
      const words = par.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let l = "";
      for (const w of words) {
        const t = l ? `${l} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) <= maxW) { l = t; continue; }
        if (l) out.push(l);
        let ww = w;
        while (f.widthOfTextAtSize(ww, size) > maxW && ww.length > 1) { let cut = ww.length; while (cut > 1 && f.widthOfTextAtSize(ww.slice(0, cut), size) > maxW) cut--; out.push(ww.slice(0, cut)); ww = ww.slice(cut); }
        l = ww;
      }
      if (l) out.push(l);
    }
    return out.length ? out : [""];
  };

  let page, y;
  const HEADH = 74;

  const chrome = () => {
    page = pdf.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: PH - 62, width: PW, height: 62, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - 66, width: PW, height: 4, color: ORANGE });
    if (logo) { const lw = 96, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: PH - 22 - lh, width: lw, height: lh }); }
    const t = "PLANO DE AÇÃO 5W2H";
    page.drawText(san(t), { x: PW - M - wid(t, bold, 14), y: PH - 30, size: 14, font: bold, color: WHITE });
    const cod = `${numPA(p.numero)}${p.origem ? ` · ${p.origem}` : ""}`;
    page.drawText(san(cod), { x: PW - M - wid(cod, font, 8.5), y: PH - 46, size: 8.5, font, color: rgb(0.72, 0.79, 0.88) });
    // título + responsável
    for (const ln of wrap(p.titulo || "Plano de ação", bold, 12, PW - 2 * M - 240)) { page.drawText(ln, { x: M + 110, y: PH - 30, size: 12, font: bold, color: WHITE }); break; }
    y = PH - HEADH;
    cabecalhoTabela();
  };

  const cabecalhoTabela = () => {
    page.drawRectangle({ x: M, y: y - 16, width: PW - 2 * M, height: 16, color: HEADBG });
    let x = M;
    for (const c of COLS) { page.drawText(san(c.h), { x: x + 4, y: y - 11, size: 7, font: bold, color: GRAY }); x += c.w; }
    y -= 16;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.6, color: LINE });
  };

  chrome();

  const itens = (Array.isArray(p.itens) ? p.itens : []).filter((i) => (i.oque || "").trim());
  if (!itens.length) { page.drawText("Nenhuma ação cadastrada neste plano.", { x: M, y: y - 16, size: 9, font, color: GRAY }); }

  let alt = false;
  for (const it of itens) {
    const sit = situacaoItem(it);
    // mede as linhas de cada coluna
    const cells = COLS.map((c) => {
      let val = c.sit ? situacaoItemLabel(sit) : c.data ? fmtD(it[c.key]) : (it[c.key] || "");
      return wrap(String(val || "—"), font, 7.5, c.w - 8);
    });
    const acomp = (it.acompanhamento || "").trim();
    const acompLines = acomp ? wrap(`Acompanhamento: ${acomp}`, font, 7, PW - 2 * M - 12) : [];
    const linhasCel = Math.max(...cells.map((c) => c.length));
    const rowH = linhasCel * 9.5 + 8 + (acompLines.length ? acompLines.length * 9 + 4 : 0);

    if (y - rowH < M + 22) { chrome(); alt = false; }

    const topo = y;
    if (alt) page.drawRectangle({ x: M, y: y - rowH, width: PW - 2 * M, height: rowH, color: rgb(0.985, 0.988, 0.992) });
    let x = M;
    cells.forEach((lines, ci) => {
      const c = COLS[ci];
      const cor = c.sit ? (SIT_COR[sit] || GRAY) : DARK;
      const f = c.sit ? bold : font;
      lines.forEach((ln, k) => page.drawText(ln, { x: x + 4, y: y - 10 - k * 9.5, size: 7.5, font: f, color: cor }));
      x += c.w;
    });
    let yy = y - 8 - linhasCel * 9.5;
    if (acompLines.length) { yy -= 2; acompLines.forEach((ln, k) => page.drawText(ln, { x: M + 6, y: yy - k * 9, size: 7, font, color: GRAY })); }
    y -= rowH;
    // divisórias
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.4, color: LINE });
    alt = !alt;
    void topo;
  }

  // grades verticais em cada página (por cima do conteúdo, finas)
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    let x = M;
    for (const c of COLS) { pg.drawLine({ start: { x, y: PH - HEADH }, end: { x, y: M + 16 }, thickness: 0.3, color: LINE }); x += c.w; }
    pg.drawLine({ start: { x, y: PH - HEADH }, end: { x, y: M + 16 }, thickness: 0.3, color: LINE });
    pg.drawLine({ start: { x: M, y: M + 12 }, end: { x: PW - M, y: M + 12 }, thickness: 0.5, color: LINE });
    pg.drawText(san(`${numPA(p.numero)} · Torg Metal · plano de ação 5W2H · ${STATUS_PLANO[p.status]?.label || p.status} · documento controlado (ISO)`), { x: M, y: 15, size: 7, font, color: GRAY });
    const pgn = `${i + 1}/${pages.length}`;
    pg.drawText(pgn, { x: PW - M - wid(pgn, font, 7), y: 15, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  const slug = String(p.titulo || "plano").replace(/[^\w.-]+/g, "-").toLowerCase().slice(0, 40);
  return { bytes, filename: `${numPA(p.numero)}-${slug}.pdf` };
}
