import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fmtRev } from "@/lib/assinatura-doc";
import { dataBR } from "./data-br";

// PDF do CRONOGRAMA DE AUDITORIA INTERNA (padrão Torg). Tabela das auditorias previstas +
// revisão + bloco de ASSINATURAS ELETRÔNICAS (nome/setor/data/IP).

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

const STATUS_LABEL = { AGENDADA: "Agendada", REALIZADA: "Realizada", EMITIDO: "Emitido", FINALIZADO: "Finalizado" };
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const fmtDT = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : `${x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${x.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`; };
const fmtData = (d) => { if (!d) return "—"; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`; const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };
const rai = (n) => `RAI-${String(n ?? 0).padStart(3, "0")}`;

export async function gerarCronogramaAuditoriaPDF({ ano = new Date().getUTCFullYear(), revisao = 0, auditorias = [], assinaturas = null }) {
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
    page.drawText(`CRONOGRAMA DE AUDITORIA INTERNA ${ano}`, { x: x0, y: A4[1] - 40, size: 13, font: bold, color: WHITE });
    page.drawText(san(`Revisão ${fmtRev(revisao)} · emitido em ${dataBR(new Date())}`), { x: x0, y: A4[1] - 60, size: 9.5, font, color: rgb(0.8, 0.86, 0.94) });
    page.drawText("Torg Metal · Qualidade · SGQ ISO 9001", { x: x0, y: A4[1] - 76, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
    y = A4[1] - h - 24;
  };
  const espaco = (n) => { if (y - n < 60) banda(); };
  banda();

  // ⚠⚠ O CRONOGRAMA TEM DE DIZER ONDE ESTAMOS. Vitor (27/08/2026): "no PDF do cronograma de
  // auditorias você deve trazer os programados, atrasos se for o caso e os realizados". Uma lista
  // de datas com um status por linha não responde a pergunta que se faz na análise crítica — e é a
  // primeira coisa que a auditoria de certificação pergunta.
  //
  // ATRASADA é a que venceu e não foi realizada: data no passado e status ainda AGENDADA. Programada
  // é a que ainda não venceu. Realizada é tudo que saiu do papel (realizada, emitida ou finalizada).
  const hoje0 = new Date();
  const atrasada = (a) => a.status === "AGENDADA" && a.dataAuditoria && new Date(a.dataAuditoria) < hoje0;
  const feita = (a) => ["REALIZADA", "EMITIDO", "FINALIZADO"].includes(a.status);
  const nRealizadas = auditorias.filter(feita).length;
  const nAtrasadas = auditorias.filter(atrasada).length;
  const nProgramadas = auditorias.filter((a) => !feita(a) && !atrasada(a)).length;

  {
    espaco(46);
    const caixa = (x, larg, rot, valor, cor) => {
      page.drawRectangle({ x, y: y - 34, width: larg, height: 34, color: SOFT });
      page.drawRectangle({ x, y: y - 34, width: 3, height: 34, color: cor });
      page.drawText(String(valor), { x: x + 12, y: y - 17, size: 15, font: bold, color: cor });
      page.drawText(san(rot), { x: x + 12, y: y - 29, size: 7.5, font, color: GRAY });
    };
    const larg = (W - 16) / 3;
    caixa(M, larg, "PROGRAMADAS", nProgramadas, NAVY);
    caixa(M + larg + 8, larg, "ATRASADAS", nAtrasadas, nAtrasadas ? rgb(0.72, 0.11, 0.11) : GRAY);
    caixa(M + (larg + 8) * 2, larg, "REALIZADAS", nRealizadas, GREEN);
    y -= 46;
  }

  const cols = [{ t: "RAI", w: 52 }, { t: "Data", w: 60 }, { t: "Setor / processo", w: W - 52 - 60 - 130 - 78 }, { t: "Responsável", w: 130 }, { t: "Situação", w: 78 }];
  const drawHead = () => {
    espaco(24);
    page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: NAVY });
    let cx = M + 6; for (const c of cols) { page.drawText(c.t, { x: cx, y: y - 13, size: 8, font: bold, color: WHITE }); cx += c.w; } y -= 18;
  };
  drawHead();

  const ord = [...auditorias].sort((a, b) => new Date(a.dataAuditoria || 0) - new Date(b.dataAuditoria || 0));
  ord.forEach((a, i) => {
    const setorL = quebrar(a.setor || "", font, 8.5, cols[2].w - 8);
    const respL = quebrar(a.responsavelAcompanhamento || "—", font, 8, cols[3].w - 8);
    const rh = Math.max(15, Math.max(setorL.length, respL.length) * 10 + 6);
    espaco(rh + 2);
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rh, width: W, height: rh, color: SOFT });
    let cx = M + 6;
    page.drawText(rai(a.numero), { x: cx, y: y - 11, size: 8, font: bold, color: DARK }); cx += cols[0].w;
    page.drawText(fmtData(a.dataAuditoria), { x: cx, y: y - 11, size: 8, font, color: DARK }); cx += cols[1].w;
    setorL.forEach((ln, k) => page.drawText(ln, { x: cx, y: y - 11 - k * 10, size: 8.5, font, color: DARK })); cx += cols[2].w;
    respL.forEach((ln, k) => page.drawText(ln, { x: cx, y: y - 11 - k * 10, size: 8, font, color: DARK })); cx += cols[3].w;
    // ⚠ "Agendada" numa data que já passou é ATRASADA — e é isso que precisa saltar da folha.
    const sit = atrasada(a) ? "Atrasada" : (STATUS_LABEL[a.status] || a.status || "—");
    page.drawText(san(sit), { x: cx, y: y - 11, size: 7.5, font: atrasada(a) ? bold : font, color: atrasada(a) ? rgb(0.72, 0.11, 0.11) : GRAY });
    y -= rh;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
  });
  if (!ord.length) { espaco(20); page.drawText("Nenhuma auditoria no cronograma.", { x: M + 6, y: y - 12, size: 9, font, color: GRAY }); y -= 18; }
  else {
    espaco(16);
    const total = ord.length;
    const pct = total ? Math.round((nRealizadas / total) * 100) : 0;
    page.drawText(san(`${total} auditoria(s) no plano · ${nRealizadas} realizada(s) (${pct}%)`
      + `${nAtrasadas ? ` · ${nAtrasadas} atrasada(s)` : ""}${nProgramadas ? ` · ${nProgramadas} ainda programada(s)` : ""}`),
      { x: M, y: y - 10, size: 8.5, font, color: DARK });
    y -= 20;
  }

  // ── Assinaturas eletrônicas ──
  y -= 18; espaco(60);
  page.drawText("ASSINATURAS ELETRÔNICAS (VALIDAÇÃO POR SETOR)", { x: M, y, size: 9, font: bold, color: GRAY });
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 14;
  if (assinaturas && assinaturas.length) {
    const ac = [{ t: "Nome", w: 150 }, { t: "Setor", w: 110 }, { t: "Assinatura / data", w: 150 }, { t: "IP", w: W - 150 - 110 - 150 }];
    espaco(16); let cx = M + 6; for (const c of ac) { page.drawText(c.t, { x: cx, y, size: 7.5, font: bold, color: GRAY }); cx += c.w; } y -= 13;
    for (const a of assinaturas) {
      espaco(15); cx = M + 6;
      page.drawText(san(a.nome || "—"), { x: cx, y, size: 8, font, color: DARK }); cx += ac[0].w;
      page.drawText(san(a.setor || "—"), { x: cx, y, size: 8, font, color: DARK }); cx += ac[1].w;
      if (a.assinadoEm) page.drawText(san("Assinado " + fmtDT(a.assinadoEm)), { x: cx, y, size: 7.5, font: bold, color: GREEN });
      else page.drawText("Aguardando assinatura", { x: cx, y, size: 7.5, font, color: ORANGE });
      cx += ac[2].w;
      page.drawText(san(a.ip || "—"), { x: cx, y, size: 7.5, font, color: GRAY });
      y -= 13; page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.3, color: LINE });
    }
  } else {
    page.drawText("Documento para conferência. As assinaturas dos setores são coletadas eletronicamente no portal (confirmação + data/hora + IP).", { x: M, y, size: 8.5, font, color: GRAY });
    y -= 14;
  }

  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`Torg Metal · Cronograma de Auditoria Interna ${ano} · ${fmtRev(revisao)}`), { x: M, y: 28, size: 7.5, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: GRAY });
  });

  return pdf.save();
}
