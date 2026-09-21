import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numPA, situacaoItem, situacaoItemLabel, STATUS_PLANO } from "@/lib/plano-acao";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { refFORM } from "@/lib/sgq-forms";

// Layout horizontal aprovado: 5W2H lado a lado, fonte de 10 pt e continuação paginada.
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

const W = PW - 2 * M;

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
  const BOTTOM = 52, LH = 14, PAD = 8;
  const widths = [.17, .13, .115, .13, .085, .235, .135].map((v) => v * W);
  const labels = ["O QUÊ", "POR QUÊ", "ONDE", "QUEM", "QUANDO", "COMO", "QUANTO"];
  const text = (value, x, yy, size = 10, f = font, color = DARK) => page.drawText(san(value), { x, y: yy, size, font: f, color });
  function novaPagina() {
    page = pdf.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: PH - 65, width: PW, height: 65, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - 68, width: PW, height: 3, color: ORANGE });
    if (logo) page.drawImage(logo, { x: M, y: PH - 50, width: logo.width * 36 / logo.height, height: 36 });
    text("PLANO DE AÇÃO 5W2H", M + 110, PH - 29, 18, bold, WHITE);
    text(numPA(p.numero), PW - M - wid(numPA(p.numero), bold, 13), PH - 30, 13, bold, WHITE);
    const status = STATUS_PLANO[p.status]?.label || p.status || "";
    text(status, PW - M - wid(status, font, 9), PH - 48, 9, font, WHITE);
    y = PH - 87;
    for (const ln of wrap(p.titulo || "Plano de ação", bold, 12, W)) { text(ln, M, y, 12, bold); y -= 16; }
    if (p.indicador && p.valor != null && p.metaValor != null) {
      const meta = INDICADORES_ISO.find((i) => i.id === p.indicador)?.meta;
      const bateu = meta?.dir === "max" ? Number(p.valor) <= Number(p.metaValor) : Number(p.valor) >= Number(p.metaValor);
      const num = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      const periodo = `${p.processo ? `${p.processo} · ` : ""}${p.mes != null && p.mes >= 0 ? `${String(p.mes + 1).padStart(2, "0")}/${p.ano}` : p.ano || ""}`;
      const resultado = `Resultado ${num(p.valor)}  ·  Meta ${num(p.metaValor)}`;
      page.drawRectangle({ x: M, y: y - 18, width: W, height: 23, color: HEADBG });
      text(periodo, M + PAD, y - 10, 9, font, GRAY);
      text(resultado, PW - M - PAD - wid(resultado, bold, 10), y - 10, 10, bold, bateu ? SIT_COR.CONCLUIDO : rgb(0.72, 0.22, 0.22));
      y -= 32;
    } else y -= 6;
  }
  novaPagina();
  for (const valor of [p.origem ? `Origem: ${p.origem}` : null, `Responsável pelo plano: ${p.responsavel || "Não informado"}`].filter(Boolean)) {
    for (const ln of wrap(valor, font, 10, W)) {
      if (y < BOTTOM + 20) novaPagina();
      text(ln, M, y); y -= LH;
    }
  }
  y -= 12;
  const itens = (Array.isArray(p.itens) ? p.itens : []).filter((i) => (i.oque || "").trim());
  if (!itens.length) text("Nenhuma ação cadastrada neste plano.", M, y);
  itens.forEach((it, idx) => {
    const sit = situacaoItem(it);
    const valores = [it.oque, it.porque, it.onde, it.quem, fmtD(it.quando), it.como, it.quanto];
    const linhas = valores.map((v, i) => wrap(v || "Não informado", font, 10, widths[i] - 2 * PAD));
    const total = Math.max(...linhas.map((v) => v.length));
    let offset = 0;
    while (offset < total) {
      // Cada continuação repete ação e cabeçalhos; nenhum texto atravessa o rodapé.
      if (y - BOTTOM < 28 + 28 + 16 + 3 * LH) novaPagina();
      const n = Math.min(total - offset, Math.floor((y - BOTTOM - 28 - 28 - 16) / LH));
      page.drawRectangle({ x: M, y: y - 28, width: W, height: 28, color: HEADBG, borderColor: LINE, borderWidth: .5 });
      text(`AÇÃO ${idx + 1}${offset ? " (continuação)" : ""}`, M + PAD, y - 18, 10, bold);
      const situacao = situacaoItemLabel(sit);
      text(situacao, PW - M - PAD - wid(situacao, bold, 10), y - 18, 10, bold, SIT_COR[sit] || GRAY);
      y -= 28;
      let x = M;
      const h = n * LH + 16;
      labels.forEach((label, c) => {
        page.drawRectangle({ x, y: y - 28, width: widths[c], height: 28, color: rgb(0, .431, .671), borderColor: LINE, borderWidth: .5 });
        text(label, x + PAD, y - 18, 9, bold, WHITE);
        page.drawRectangle({ x, y: y - 28 - h, width: widths[c], height: h, borderColor: LINE, borderWidth: .5 });
        linhas[c].slice(offset, offset + n).forEach((ln, k) => text(ln, x + PAD, y - 28 - PAD - 10 - k * LH));
        x += widths[c];
      });
      y -= 28 + h + 12;
      offset += n;
    }
    if (it.acompanhamento?.trim()) {
      const linhas = wrap(it.acompanhamento, font, 10, W - 2 * PAD);
      let offset = 0;
      while (offset < linhas.length) {
        if (y - BOTTOM < 54) novaPagina();
        text(`ACOMPANHAMENTO${offset ? " (continuação)" : ""}`, M + PAD, y - 10, 9, bold, GRAY);
        y -= 24;
        const n = Math.min(linhas.length - offset, Math.floor((y - BOTTOM) / LH));
        linhas.slice(offset, offset + n).forEach((ln, k) => text(ln, M + PAD, y - k * LH));
        offset += n; y -= n * LH + 12;
      }
    }
  });
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    pg.drawLine({ start: { x: M, y: 36 }, end: { x: PW - M, y: 36 }, thickness: .5, color: LINE });
    text(`${numPA(p.numero)} · Torg Metal · ${refFORM(28)} · plano de ação 5W2H`, M, 22, 8, font, GRAY);
    const num = `${i + 1}/${pages.length}`;
    text(num, PW - M - wid(num, font, 8), 22, 8, font, GRAY);
  });
  const bytes = await pdf.save();
  const slug = String(p.titulo || "plano").replace(/[^\w.-]+/g, "-").toLowerCase().slice(0, 40);
  return { bytes, filename: `${numPA(p.numero)}-${slug}.pdf` };
}
