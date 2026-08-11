import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fmtRev } from "@/lib/assinatura-doc";

// PDF do PLANO ANUAL DE TREINAMENTOS (padrão Torg). Tabela de treinamentos + revisão +
// bloco de ASSINATURAS ELETRÔNICAS (nome/setor/data/IP), quando houver.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const SOFT = rgb(0.965, 0.975, 0.985);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.02, 0.47, 0.34);

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const fmtDT = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : `${x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${x.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`; };
const fmtData = (d) => { if (!d) return "—"; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`; const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };

export async function gerarPlanoTreinamentoPDF({ ano = new Date().getUTCFullYear(), revisao = 0, treinamentos = [], assinaturas = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }
  const W = A4[0] - 2 * M;

  const quebrar = (t, f, tam, larg) => { const out = []; for (const par of san(t).split(/\n+/)) { let l = ""; for (const p of par.split(/\s+/)) { const cand = l ? `${l} ${p}` : p; if (f.widthOfTextAtSize(cand, tam) <= larg) l = cand; else { if (l) out.push(l); l = p; } } if (l) out.push(l); } return out.length ? out : [""]; };
  let page, y;
  const paginas = [];
  const banda = () => {
    page = pdf.addPage(A4); paginas.push(page);
    const h = 92;
    page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
    if (logo) { const lw = 88, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh }); }
    const x0 = M + (logo ? 112 : 0);
    page.drawText(`PLANO ANUAL DE TREINAMENTOS ${ano}`, { x: x0, y: A4[1] - 40, size: 14, font: bold, color: WHITE });
    page.drawText(san(`Revisão ${fmtRev(revisao)} · emitido em ${new Date().toLocaleDateString("pt-BR")}`), { x: x0, y: A4[1] - 60, size: 9.5, font, color: rgb(0.8, 0.86, 0.94) });
    page.drawText("Torg Metal · Recursos Humanos · SGQ ISO 9001", { x: x0, y: A4[1] - 76, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
    y = A4[1] - h - 24;
  };
  const espaco = (n) => { if (y - n < 60) banda(); };

  banda();

  // Cabeçalho da tabela
  const cols = [{ t: "#", w: 24 }, { t: "Data", w: 66 }, { t: "Treinamento", w: W - 24 - 66 - 60 - 46 }, { t: "NR", w: 60 }, { t: "Carga", w: 46 }];
  const drawHead = () => {
    espaco(24);
    page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: NAVY });
    let cx = M + 6;
    for (const c of cols) { page.drawText(c.t, { x: cx, y: y - 13, size: 8, font: bold, color: WHITE }); cx += c.w; }
    y -= 18;
  };
  drawHead();

  const ordenados = [...treinamentos].sort((a, b) => new Date(a.dataInicio || 0) - new Date(b.dataInicio || 0));
  ordenados.forEach((t, i) => {
    const nomeL = quebrar(t.titulo || "", font, 8.5, cols[2].w - 8);
    const rh = Math.max(15, nomeL.length * 10 + 6);
    espaco(rh + 2);
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rh, width: W, height: rh, color: SOFT });
    let cx = M + 6;
    page.drawText(String(i + 1), { x: cx, y: y - 11, size: 8, font, color: GRAY }); cx += cols[0].w;
    page.drawText(fmtData(t.dataInicio), { x: cx, y: y - 11, size: 8, font, color: DARK }); cx += cols[1].w;
    nomeL.forEach((ln, k) => page.drawText(ln, { x: cx, y: y - 11 - k * 10, size: 8.5, font, color: DARK })); cx += cols[2].w;
    page.drawText(san(t.nrRelacionada || "—"), { x: cx, y: y - 11, size: 8, font: bold, color: DARK }); cx += cols[3].w;
    page.drawText(t.cargaHoraria ? `${t.cargaHoraria}h` : "—", { x: cx, y: y - 11, size: 8, font, color: GRAY });
    y -= rh;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
  });
  if (!ordenados.length) { espaco(20); page.drawText("Nenhum treinamento cadastrado.", { x: M + 6, y: y - 12, size: 9, font, color: GRAY }); y -= 18; }

  // ── Bloco de assinaturas eletrônicas ──
  y -= 18; espaco(60);
  page.drawText("ASSINATURAS ELETRÔNICAS (VALIDAÇÃO POR SETOR)", { x: M, y, size: 9, font: bold, color: GRAY });
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 14;

  if (assinaturas && assinaturas.length) {
    const ac = [{ t: "Nome", w: 150 }, { t: "Setor", w: 110 }, { t: "Assinatura / data", w: 150 }, { t: "IP", w: W - 150 - 110 - 150 }];
    espaco(16);
    let cx = M + 6; for (const c of ac) { page.drawText(c.t, { x: cx, y, size: 7.5, font: bold, color: GRAY }); cx += c.w; } y -= 13;
    for (const a of assinaturas) {
      espaco(15);
      cx = M + 6;
      page.drawText(san(a.nome || "—"), { x: cx, y, size: 8, font, color: DARK }); cx += ac[0].w;
      page.drawText(san(a.setor || "—"), { x: cx, y, size: 8, font, color: DARK }); cx += ac[1].w;
      if (a.assinadoEm) { page.drawText(san("Assinado " + fmtDT(a.assinadoEm)), { x: cx, y, size: 7.5, font: bold, color: GREEN }); }
      else { page.drawText("Aguardando assinatura", { x: cx, y, size: 7.5, font, color: ORANGE }); }
      cx += ac[2].w;
      page.drawText(san(a.ip || "—"), { x: cx, y, size: 7.5, font, color: GRAY });
      y -= 13;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.3, color: LINE });
    }
  } else {
    page.drawText("Documento para conferência. As assinaturas dos setores são coletadas eletronicamente no portal (confirmação + data/hora + IP).", { x: M, y, size: 8.5, font, color: GRAY });
    y -= 14;
  }

  // rodapé
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`Torg Metal · Plano de Treinamentos ${ano} · ${fmtRev(revisao)}`), { x: M, y: 28, size: 7.5, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: GRAY });
  });

  return pdf.save();
}
