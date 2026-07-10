import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// COMPROVANTE DE RECEBIMENTO DE HOLERITES (pdf-lib) — prova de que cada
// funcionário visualizou e confirmou (deu ciência) o holerite dele, com data,
// hora e IP. Uma linha por funcionário da competência. A4 paisagem.

const PW = 841.89, PH = 595.28; // A4 paisagem
const M = 40;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.15, 0.19, 0.25);
const GRAY = rgb(0.36, 0.44, 0.5);
const LINE = rgb(0.82, 0.85, 0.89);
const GREEN = rgb(0.11, 0.47, 0.29);
const WHITE = rgb(1, 1, 1);
const W = PW - 2 * M;

const WINANSI_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);
const san = (s) => String(s ?? "").replace(/μ/g, "µ").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const compExtenso = (c) => { const m = /^(\d{4})-(\d{2})$/.exec(String(c || "")); return m ? `${MESES[Number(m[2]) - 1] || m[2]}/${m[1]}` : String(c || ""); };
const fmtDH = (d) => { if (!d) return "—"; const x = new Date(d); if (isNaN(x)) return "—"; const p = (n) => String(n).padStart(2, "0"); return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`; };
const STATUS = { CONFIRMADO: "Confirmado", VISUALIZADO: "Visualizado", ENVIADO: "Enviado", PENDENTE: "Pendente" };

export async function gerarComprovanteHoleritesPDF(competencia, holerites, now = new Date()) {
  const lista = Array.isArray(holerites) ? holerites : [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const fit = (str, f, size, maxW) => { let s = san(str); if (f.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1); return s + "…"; };

  const cols = [0.26, 0.2, 0.11, 0.15, 0.16, 0.12].map((f) => f * W); // Func | Empresa | Status | Visualizado | Confirmado | IP
  const cx = [M];
  for (let i = 1; i < cols.length; i++) cx[i] = cx[i - 1] + cols[i - 1];
  const th = 18;

  let page, y;
  const dataStr = fmtDH(now);
  const cabecalho = () => {
    page = pdf.addPage([PW, PH]);
    const bh = 50;
    page.drawRectangle({ x: 0, y: PH - bh, width: PW, height: bh, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - bh, width: PW, height: 3, color: ORANGE });
    if (logo) { const lw = 84, lh2 = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: PH - bh / 2 - lh2 / 2, width: lw, height: lh2 }); }
    const tit = "COMPROVANTE DE RECEBIMENTO DE HOLERITES";
    page.drawText(tit, { x: PW - M - wid(tit, bold, 12), y: PH - 24, size: 12, font: bold, color: WHITE });
    const sub = `Competência ${compExtenso(competencia)}`;
    page.drawText(san(sub), { x: PW - M - wid(sub, font, 9.5), y: PH - 40, size: 9.5, font, color: rgb(0.75, 0.82, 0.92) });
    y = PH - bh - 20;
  };
  const cell = (t, i, ty, f, color) => page.drawText(fit(t, f, 8.5, cols[i] - 8), { x: cx[i] + 5, y: ty, size: 8.5, font: f, color });
  const headerRow = () => {
    page.drawRectangle({ x: M, y: y - th, width: W, height: th, color: NAVY, borderColor: NAVY, borderWidth: 0.5 });
    const ty = y - th + 5.5;
    ["Funcionário", "Empresa", "Status", "Visualizado em", "Confirmado em", "IP"].forEach((t, i) => cell(t, i, ty, bold, WHITE));
    y -= th;
  };
  const dataRow = (h) => {
    if (y - th < M + 22) { cabecalho(); headerRow(); }
    const conf = !!h.confirmadoEm;
    page.drawRectangle({ x: M, y: y - th, width: W, height: th, color: WHITE, borderColor: LINE, borderWidth: 0.5 });
    const ty = y - th + 5.5;
    cell(h.funcionario?.nome || "—", 0, ty, font, DARK);
    cell(h.empresa || "—", 1, ty, font, GRAY);
    cell(STATUS[h.status] || h.status || "—", 2, ty, bold, conf ? GREEN : GRAY);
    cell(fmtDH(h.visualizadoEm), 3, ty, font, DARK);
    cell(fmtDH(h.confirmadoEm), 4, ty, conf ? bold : font, conf ? GREEN : GRAY);
    cell(h.confirmadoIp || "—", 5, ty, font, GRAY);
    y -= th;
  };

  cabecalho();
  const confirmados = lista.filter((h) => h.confirmadoEm).length;
  page.drawText(san(`Ciência eletrônica de ${confirmados} de ${lista.length} funcionário(s).`), { x: M, y, size: 10, font: bold, color: DARK });
  y -= 14;
  page.drawText(fit("Este documento comprova a ciência (recebimento) dos holerites pelos funcionários, registrada eletronicamente no portal com data, hora e endereço IP no ato da confirmação.", font, 8.5, W), { x: M, y, size: 8.5, font, color: GRAY });
  y -= 18;

  headerRow();
  if (!lista.length) { page.drawText("Nenhum holerite nesta competência.", { x: M + 5, y: y - th + 5.5, size: 8.5, font, color: GRAY }); y -= th; }
  lista.forEach(dataRow);

  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 30 }, end: { x: PW - M, y: 30 }, thickness: 0.5, color: LINE });
    pg.drawText(san(`TORG METAL — Emitido em ${dataStr}`), { x: M, y: 20, size: 7.5, font: bold, color: GRAY });
    const pn = `${i + 1} / ${pages.length}`;
    pg.drawText(pn, { x: PW - M - font.widthOfTextAtSize(pn, 7.5), y: 20, size: 7.5, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, filename: `comprovante-holerites-${competencia}.pdf` };
}
