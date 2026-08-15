import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SECOES_AUDITORIA, ordenarSecoes, labelRequisito } from "@/lib/auditoria-secoes";

// ÍNDICE / CAPA dos documentos da auditoria (o que vai PUBLICADO no portal do auditor).
// PDF leve (padrão Torg navy + filete laranja + logo): lista os documentos publicados por
// seção/item + evidências adicionais, e aponta pro LINK do portal (onde ele baixa os
// arquivos, sempre atualizados). Decisão do Vitor: capa/índice + link, não docs embutidos.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LINE = rgb(0.85, 0.88, 0.91);
const BLUE = rgb(0, 0.43, 0.67);
const WHITE = rgb(1, 1, 1);
const LIGHT = rgb(0.96, 0.97, 0.98);

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("")
  .map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export async function gerarAuditoriaPortalPDF(a, { portalUrl } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const W = A4[0] - 2 * M;
  let page, y;
  const topo = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 70, width: A4[0], height: 70, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 74, width: A4[0], height: 4, color: ORANGE });
    if (logo) { const h = 26, w = h * (logo.width / logo.height); page.drawImage(logo, { x: M, y: A4[1] - 50, width: w, height: h }); }
    const t = "DOCUMENTOS DA AUDITORIA";
    page.drawText(t, { x: A4[0] - M - bold.widthOfTextAtSize(t, 13), y: A4[1] - 44, size: 13, font: bold, color: WHITE });
    y = A4[1] - 74 - 22;
  };
  const nova = () => { page = pdf.addPage(A4); topo(); };
  const espaco = (h) => { if (y - h < M + 22) nova(); };
  const txt = (s, x, yy, { f = font, size = 9, color = DARK } = {}) => page.drawText(san(s), { x, y: yy, size, font: f, color });
  const wrap = (s, f, size, maxW) => {
    const words = san(s).split(/\s+/); const lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  };
  const linhaDoc = (nome) => {
    const lines = wrap(nome, font, 8.5, W - 44);
    espaco(11 * lines.length);
    page.drawCircle({ x: M + 24, y: y + 3, size: 1.5, color: ORANGE });
    txt(lines[0], M + 32, y, { size: 8.5, color: GRAY }); y -= 11;
    for (let i = 1; i < lines.length; i++) { txt(lines[i], M + 32, y, { size: 8.5, color: GRAY }); y -= 11; }
  };
  const cabSecao = (label) => {
    espaco(24);
    page.drawRectangle({ x: M, y: y - 5, width: W, height: 16, color: LIGHT });
    txt(label.toUpperCase(), M + 6, y, { f: bold, size: 9, color: NAVY }); y -= 22;
  };

  nova();

  // Identificação
  txt(a.empresa || "—", M, y, { f: bold, size: 13, color: NAVY }); y -= 16;
  if (a.titulo) { txt(a.titulo, M, y, { size: 10, color: GRAY }); y -= 14; }
  txt(`Emitido em ${fmtDT(new Date())}`, M, y, { size: 8, color: GRAY }); y -= 20;

  // Caixa com o link do portal
  if (portalUrl) {
    const boxH = 48;
    espaco(boxH + 8);
    page.drawRectangle({ x: M, y: y - boxH, width: W, height: boxH, color: rgb(0.95, 0.97, 0.99), borderColor: LINE, borderWidth: 1 });
    txt("Acesse o portal para visualizar e baixar os documentos:", M + 12, y - 17, { f: bold, size: 9.5, color: NAVY });
    txt(portalUrl, M + 12, y - 33, { size: 9, color: BLUE });
    y -= boxH + 20;
  }

  // Documentos publicados
  const docs = (a.documentos || []).filter((d) => d.tipo === "EVIDENCIA" && d.publicar);
  const adicionalIds = new Set((a.itensAdicionais || []).map((i) => i.id));
  const padrao = docs.filter((d) => !(d.requisito && adicionalIds.has(d.requisito)));

  const porSecao = {};
  for (const d of padrao) { const s = SECOES_AUDITORIA.includes(d.secao) ? d.secao : "Outros"; (porSecao[s] ||= []).push(d); }
  for (const s of ordenarSecoes(Object.keys(porSecao))) {
    cabSecao(s);
    const porReq = {};
    for (const d of porSecao[s]) { const k = d.requisito || "__sem__"; (porReq[k] ||= []).push(d); }
    for (const [reqId, ds] of Object.entries(porReq)) {
      const lbl = reqId === "__sem__" ? "Outros documentos" : (labelRequisito(reqId) || reqId);
      espaco(15); txt(lbl, M + 14, y, { f: bold, size: 9, color: DARK }); y -= 13;
      for (const d of ds) linhaDoc(d.nome);
      y -= 3;
    }
    y -= 4;
  }

  // Evidências adicionais (pedido a mais)
  const adic = (a.itensAdicionais || []).map((i) => ({ ...i, docs: docs.filter((d) => d.requisito === i.id) })).filter((x) => x.docs.length);
  if (adic.length) {
    cabSecao("Evidências adicionais (pedido a mais)");
    for (const g of adic) {
      espaco(15); txt(g.titulo || "Evidência adicional", M + 14, y, { f: bold, size: 9, color: DARK }); y -= 13;
      for (const d of g.docs) linhaDoc(d.nome);
      y -= 3;
    }
  }

  if (!padrao.length && !adic.length) { espaco(16); txt("Nenhum documento publicado ainda.", M, y, { size: 9, color: GRAY }); }

  const bytes = await pdf.save();
  const slug = String(a.empresa || "auditoria").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "auditoria";
  return { bytes, filename: `documentos-auditoria-${slug}.pdf` };
}
