import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numRAI, tipoLabel } from "@/lib/auditoria-interna";

// RELATÓRIO DE AUDITORIA INTERNA em PDF (pdf-lib) — layout padrão Torg (navy +
// filete laranja + logo, mesma linguagem de lib/relatorio-status-pdf.js /
// lib/ata-pdf.js). Modelo ENXUTO: identificação, constatações (com tipo),
// plano de ação e conclusão. A4 retrato, paginado, rodapé com selo ISO.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LINE = rgb(0.85, 0.88, 0.91);
const LIGHT = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.02, 0.45, 0.33);
const RED = rgb(0.7, 0.11, 0.11);
const AMBER = rgb(0.65, 0.38, 0.03);

const TIPO_COR = { CONFORME: GREEN, NAO_CONFORME: RED, MELHORIA: AMBER };

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("")
  .map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * @param {object} a AuditoriaInterna (constatacoes/acoes já como arrays)
 * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
 */
export async function gerarAuditoriaInternaPDF(a) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const W = A4[0] - 2 * M;
  let page, y;
  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; };
  const espaco = (h) => { if (y - h < M + 26) novaPagina(); };
  const txt = (s, x, yy, { f = font, size = 9, color = DARK } = {}) => page.drawText(san(s), { x, y: yy, size, font: f, color });
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
        while (f.widthOfTextAtSize(ww, size) > maxW && ww.length > 1) {
          let cut = ww.length;
          while (cut > 1 && f.widthOfTextAtSize(ww.slice(0, cut), size) > maxW) cut--;
          out.push(ww.slice(0, cut)); ww = ww.slice(cut);
        }
        l = ww;
      }
      if (l) out.push(l);
    }
    return out.length ? out : [""];
  };
  const paragrafo = (str, x, maxW, { f = font, size = 9, color = DARK, lh = 12 } = {}) => {
    for (const ln of wrap(str, f, size, maxW)) { espaco(lh); txt(ln, x, y - size, { f, size, color }); y -= lh; }
  };
  const secao = (titulo) => { espaco(30); txt(titulo, M, y - 9, { f: bold, size: 9, color: NAVY }); y -= 15; page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.5, color: LINE }); y -= 10; };

  /* ── Cabeçalho ──────────────────────────────────────────────── */
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 104, width: A4[0], height: 104, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - 110, width: A4[0], height: 6, color: ORANGE });
  if (logo) { const lw = 118, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 34 - lh, width: lw, height: lh }); }
  else txt("TORG METAL", M, A4[1] - 56, { f: bold, size: 18, color: WHITE });
  const tit1 = "RELATÓRIO DE AUDITORIA";
  const tit2 = "INTERNA";
  txt(tit1, A4[0] - M - wid(tit1, bold, 15), A4[1] - 44, { f: bold, size: 15, color: WHITE });
  txt(tit2, A4[0] - M - wid(tit2, bold, 15), A4[1] - 60, { f: bold, size: 15, color: WHITE });
  const cod = numRAI(a.numero);
  txt(cod, A4[0] - M - wid(cod, bold, 11), A4[1] - 78, { f: bold, size: 11, color: ORANGE });
  if (a.norma) txt(a.norma, A4[0] - M - wid(a.norma, font, 8), A4[1] - 92, { size: 8, color: rgb(0.72, 0.79, 0.88) });
  y = A4[1] - 128;

  /* ── Identificação ──────────────────────────────────────────── */
  txt(`Setor auditado: ${a.setor}`, M, y - 12, { f: bold, size: 13, color: NAVY });
  y -= 20;
  const linhas = [
    ["Data da auditoria", fmtD(a.dataAuditoria)],
    ["Responsável pelo acompanhamento", a.responsavelAcompanhamento || "—"],
    ["Auditor", a.auditor || "—"],
    ["Norma / referência", a.norma || "—"],
  ];
  for (const [k, v] of linhas) {
    espaco(15);
    txt(k, M, y - 9, { size: 8.5, color: GRAY });
    txt(v, M + 210, y - 9, { f: bold, size: 8.5, color: DARK });
    y -= 15;
  }
  if (a.escopo) { y -= 4; secao("OBJETIVO / ESCOPO"); paragrafo(a.escopo, M, W, { size: 9 }); }
  y -= 6;

  /* ── Constatações ───────────────────────────────────────────── */
  const consts = Array.isArray(a.constatacoes) ? a.constatacoes : [];
  secao("CONSTATAÇÕES");
  if (!consts.length) { txt("Nenhuma constatação registrada.", M, y - 9, { size: 9, color: GRAY }); y -= 14; }
  consts.forEach((c, i) => {
    const cor = TIPO_COR[c.tipo] || GRAY;
    const rot = tipoLabel(c.tipo).toUpperCase();
    const descLines = wrap(c.descricao || "", font, 9, W - 14);
    espaco(14 + descLines.length * 11 + 8);
    const topo = y;
    txt(`${i + 1}.`, M, y - 9, { f: bold, size: 9, color: DARK });
    txt(rot, M + 16, y - 9, { f: bold, size: 7.5, color: cor });
    y -= 12;
    for (const ln of descLines) { espaco(11); txt(ln, M + 16, y - 8, { size: 9, color: DARK }); y -= 11; }
    page.drawRectangle({ x: M, y: y + 2, width: 2.5, height: topo - y - 2, color: cor });
    y -= 7;
  });
  y -= 4;

  /* ── Plano de ação ──────────────────────────────────────────── */
  const acoes = Array.isArray(a.acoes) ? a.acoes : [];
  if (acoes.length) {
    secao("PLANO DE AÇÃO");
    const cAcao = M + 4, cResp = M + 300, cPrazo = M + 430;
    espaco(15);
    page.drawRectangle({ x: M, y: y - 13, width: W, height: 15, color: LIGHT });
    txt("Ação", cAcao, y - 9, { f: bold, size: 7.5, color: GRAY });
    txt("Responsável", cResp, y - 9, { f: bold, size: 7.5, color: GRAY });
    txt("Prazo", cPrazo, y - 9, { f: bold, size: 7.5, color: GRAY });
    y -= 17;
    for (const ac of acoes) {
      const oqueLines = wrap(ac.oque || "—", font, 8.5, cResp - cAcao - 10);
      espaco(oqueLines.length * 11 + 10);
      oqueLines.forEach((ln, k) => { txt(ln, cAcao, y - 9, { size: 8.5 }); if (k === 0) { txt(ac.responsavel || "—", cResp, y - 9, { size: 8.5, color: GRAY }); txt(ac.prazo ? fmtD(ac.prazo) : "—", cPrazo, y - 9, { size: 8.5, color: GRAY }); } y -= 11; });
      y -= 5; // respiro antes do filete divisor
      page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.4, color: LINE });
      y -= 4;
    }
    y -= 6;
  }

  /* ── Conclusão ──────────────────────────────────────────────── */
  if (a.conclusao) { secao("CONCLUSÃO"); paragrafo(a.conclusao, M, W, { size: 9, lh: 12.5 }); }

  /* ── Rodapé ─────────────────────────────────────────────────── */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: LINE });
    p.drawText(san(`${numRAI(a.numero)} · Torg Metal · auditoria interna${a.divulgadoEm ? ` · emitido em ${fmtDT(a.divulgadoEm)}` : ""} · documento controlado (ISO)`), { x: M, y: 19, size: 7, font, color: GRAY });
    const pg = `${i + 1}/${pages.length}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 19, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  const slug = String(a.setor || "auditoria").replace(/[^\w.-]+/g, "-").toLowerCase();
  return { bytes, filename: `${numRAI(a.numero)}-${slug}.pdf` };
}
