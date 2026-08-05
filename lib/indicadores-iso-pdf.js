import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { farol, FAROL_COR, metaTexto } from "@/lib/indicadores-iso";

// PDF de ACOMPANHAMENTO dos indicadores ISO (padrão Torg — faixa navy + filete laranja
// + logo). Matriz: indicador × Jan..Dez + Meta + Acumulado do ano, células coloridas
// pelo farol (verde/amarelo/vermelho). A4 paisagem.

const PW = 841.89, PH = 595.28, M = 28;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.05, 0.13, 0.21);
const GRAY = rgb(0.42, 0.47, 0.53);
const LINE = rgb(0.86, 0.89, 0.92);
const HEADBG = rgb(0.95, 0.96, 0.98);
const MES3 = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const hex = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
// Helvetica/WinAnsi não tem ≤ ≥ → e afins — troca/limpa pra não estourar o pdf-lib.
const san = (s) => String(s ?? "").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, "");
const fmtCell = (v, unidade) => (v == null ? "—" : `${String(Math.round(v * 10) / 10).replace(".", ",")}${unidade === "%" ? "%" : ""}`);

export async function gerarIndicadoresIsoPDF({ titulo = "Indicadores (ISO)", ano, indicadores = [], mesFim = 11 }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }
  const page = pdf.addPage([PW, PH]);
  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const txt = (s, x, y, { f = font, size = 9, color = DARK } = {}) => page.drawText(san(s), { x, y, size, font: f, color });
  const center = (s, cx, cw, y, o = {}) => txt(s, cx + (cw - wid(s, o.f || font, o.size || 9)) / 2, y, o);
  const fit = (s, f, sz, maxW) => { let t = san(s); if (f.widthOfTextAtSize(t, sz) <= maxW) return t; while (t.length > 1 && f.widthOfTextAtSize(t + "…", sz) > maxW) t = t.slice(0, -1); return t + "…"; };

  // ── Cabeçalho ──
  page.drawRectangle({ x: 0, y: PH - 62, width: PW, height: 62, color: NAVY });
  page.drawRectangle({ x: 0, y: PH - 66, width: PW, height: 4, color: ORANGE });
  if (logo) { const lh = 40, lw = lh / (logo.height / logo.width); page.drawImage(logo, { x: M, y: PH - 31 - lh / 2, width: lw, height: lh }); }
  const t1 = san(titulo);
  txt(t1, PW - M - wid(t1, bold, 14), PH - 28, { f: bold, size: 14, color: WHITE });
  const t2 = `Acompanhamento ISO 9001 · ${ano}`;
  txt(t2, PW - M - wid(t2, font, 8.5), PH - 44, { size: 8.5, color: rgb(0.72, 0.79, 0.88) });

  let y = PH - 62 - 22;
  txt("Cada indicador é calculado do dado real do portal, sem digitação manual. Verde = na meta · amarelo = atenção · vermelho = fora da meta.", M, y, { size: 8, color: GRAY });
  y -= 16;

  // Colunas
  const wInd = 232, wMeta = 78, wMes = 35, wAcum = 55;
  const xInd = M, xMeta = xInd + wInd, xMes0 = xMeta + wMeta, xAcum = xMes0 + 12 * wMes;

  // Cabeçalho da tabela
  const hh = 16;
  page.drawRectangle({ x: M, y: y - hh, width: PW - 2 * M, height: hh, color: HEADBG });
  txt("Indicador", xInd + 5, y - 11, { f: bold, size: 8, color: DARK });
  txt("Meta", xMeta + 5, y - 11, { f: bold, size: 8, color: DARK });
  for (let m = 0; m < 12; m++) center(MES3[m], xMes0 + m * wMes, wMes, y - 11, { f: bold, size: 7.5, color: m > mesFim ? rgb(0.75, 0.78, 0.82) : DARK });
  center("Acum.", xAcum, wAcum, y - 11, { f: bold, size: 8, color: DARK });
  y -= hh;

  // Linhas
  for (const ind of indicadores) {
    const rowH = 34;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: LINE });
    txt(fit(ind.nome, bold, 8.5, wInd - 8), xInd + 5, y - 13, { f: bold, size: 8.5, color: DARK });
    txt(fit(ind.oQueMede || "", font, 7, wInd - 8), xInd + 5, y - 24, { size: 7, color: GRAY });
    txt(fit(metaTexto(ind.meta), font, 7.5, wMeta - 8), xMeta + 5, y - 17, { size: 7.5, color: DARK });
    const un = ind.meta.unidade;
    for (let m = 0; m < 12; m++) {
      const cx = xMes0 + m * wMes;
      if (m > mesFim) continue;
      const v = ind.serie?.[m] ?? null;
      const f = v == null ? null : farol(v, ind.meta);
      const cor = f ? FAROL_COR[f] : null;
      if (cor) page.drawRectangle({ x: cx + 1.5, y: y - rowH + 6, width: wMes - 3, height: rowH - 12, color: hex(cor.bg) });
      center(fmtCell(v, un), cx, wMes, y - 17, { size: 7.8, f: bold, color: cor ? hex(cor.fg) : rgb(0.7, 0.73, 0.77) });
    }
    // Acumulado
    const va = ind.acumulado ?? null;
    const fa = va == null ? null : farol(va, ind.meta);
    const cora = fa ? FAROL_COR[fa] : null;
    page.drawRectangle({ x: xAcum + 1.5, y: y - rowH + 5, width: wAcum - 3, height: rowH - 10, color: cora ? hex(cora.bg) : rgb(0.96, 0.97, 0.98) });
    center(fmtCell(va, un), xAcum, wAcum, y - 18, { size: 10, f: bold, color: cora ? hex(cora.fg) : DARK });
    y -= rowH;
  }
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: LINE });

  // Rodapé
  const dt = new Date().toLocaleString("pt-BR");
  page.drawText(san(`Gerado pelo Workspace Torg em ${dt} · documento controlado (ISO 9001)`), { x: M, y: 20, size: 7, font, color: GRAY });

  return await pdf.save();
}
