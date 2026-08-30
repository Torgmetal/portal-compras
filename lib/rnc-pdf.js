import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numRNC, ORIGEM_NC, DISPOSICAO_NC, NECESSITA_ACAO } from "@/lib/nao-conformidade";
import { refFORM } from "@/lib/sgq-forms";

// RELATÓRIO DE NÃO CONFORMIDADE (FORM 20) em PDF — padrão Torg (navy + filete
// laranja + logo), mesma linguagem de lib/auditoria-interna-pdf.js. A4 retrato,
// paginado, com identificação, descrição, causa raiz (5 porquês), plano de ação
// 5W2H, acompanhamento, eficácia, encerramento e registro fotográfico.

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

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[\r\t]/g, " ").split("")
  .map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export async function gerarRncPDF(a, plano) {
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
        while (f.widthOfTextAtSize(ww, size) > maxW && ww.length > 1) { let cut = ww.length; while (cut > 1 && f.widthOfTextAtSize(ww.slice(0, cut), size) > maxW) cut--; out.push(ww.slice(0, cut)); ww = ww.slice(cut); }
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
  // grade de campos (label/valor), 2 por linha
  const campos = (pares) => {
    const colW = W / 2;
    for (let i = 0; i < pares.length; i += 2) {
      espaco(24);
      for (let j = 0; j < 2; j++) {
        const p = pares[i + j]; if (!p) continue;
        const x = M + j * colW;
        txt(p[0], x, y - 8, { size: 7.5, color: GRAY });
        const lines = wrap(p[1] || "—", bold, 8.5, colW - 14);
        lines.slice(0, 2).forEach((ln, k) => txt(ln, x, y - 18 - k * 10, { f: bold, size: 8.5, color: DARK }));
      }
      y -= 24 + (pares.slice(i, i + 2).some((p) => p && wrap(p[1] || "", bold, 8.5, colW - 14).length > 1) ? 10 : 0);
    }
  };

  const embedFoto = async (url) => { try { const r = await fetch(url); if (!r.ok) return null; const buf = Buffer.from(await r.arrayBuffer()); try { return await pdf.embedJpg(buf); } catch {} try { return await pdf.embedPng(buf); } catch {} return null; } catch { return null; } };
  const desenharFotos = async (fotos) => {
    const gap = 14;
    for (let i = 0; i < fotos.length;) {
      const cols = fotos.length - i === 1 ? 1 : 2;
      const cellW = cols === 1 ? Math.min(W, 360) : (W - gap) / 2;
      const cells = [];
      for (const f of fotos.slice(i, i + cols)) { const img = await embedFoto(f.url); let dw = cellW, dh = cols === 1 ? 190 : 150; if (img) { const sc = Math.min(cellW / img.width, (cols === 1 ? 260 : 180) / img.height); dw = img.width * sc; dh = img.height * sc; } cells.push({ f, img, dw, dh }); }
      const boxH = Math.max(...cells.map((c) => c.dh));
      espaco(boxH + 14);
      let x = cols === 1 ? M + (W - cellW) / 2 : M;
      for (const c of cells) { page.drawRectangle({ x, y: y - boxH, width: cellW, height: boxH, color: LIGHT }); if (c.img) page.drawImage(c.img, { x: x + (cellW - c.dw) / 2, y: y - boxH + (boxH - c.dh) / 2, width: c.dw, height: c.dh }); x += cellW + gap; }
      y -= boxH + 14; i += cols;
    }
  };

  /* Cabeçalho */
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 104, width: A4[0], height: 104, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - 110, width: A4[0], height: 6, color: ORANGE });
  if (logo) { const lw = 118, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 34 - lh, width: lw, height: lh }); }
  else txt("TORG METAL", M, A4[1] - 56, { f: bold, size: 18, color: WHITE });
  const tit1 = "RELATÓRIO DE NÃO", tit2 = "CONFORMIDADE";
  txt(tit1, A4[0] - M - wid(tit1, bold, 15), A4[1] - 44, { f: bold, size: 15, color: WHITE });
  txt(tit2, A4[0] - M - wid(tit2, bold, 15), A4[1] - 60, { f: bold, size: 15, color: WHITE });
  const cod = numRNC(a.numero, a.ano);
  txt(cod, A4[0] - M - wid(cod, bold, 11), A4[1] - 78, { f: bold, size: 11, color: ORANGE });
  const refRnc = refFORM(20);
  txt(refRnc, A4[0] - M - wid(refRnc, font, 8), A4[1] - 92, { size: 8, color: rgb(0.72, 0.79, 0.88) });
  y = A4[1] - 128;

  /* Identificação */
  const ident = [
    ["Cliente", a.cliente], ["OP / Obra", a.opNumero],
    ["Desenho / Projeto / Marca", a.desenhoProjetoMarca], ["Processo / Área da ocorrência", a.processoArea],
    ["Origem", ORIGEM_NC[a.origem] || a.origem], ["Data", fmtD(a.data)],
    ["Prazo para resposta", a.prazoResposta ? fmtD(a.prazoResposta) : "—"], ["Situação", a.status === "ENCERRADA" ? "Encerrada" : a.status === "EM_ACAO" ? "Em ação" : a.status === "RESPONDIDA" ? "Respondida" : "Aberta"],
  ];
  if (a.tipo === "CLIENTE") ident.push(["Nº da RNC do cliente", a.numeroCliente], ["Programa", a.programa], ["Job do cliente", a.jobCliente]);
  campos(ident);
  y -= 6;

  secao("DESCRIÇÃO DA NÃO CONFORMIDADE");
  paragrafo(a.descricao || "—", M, W, { size: 9, lh: 12.5 });
  y -= 4;

  const disp = [];
  if (a.disposicao) disp.push(["Disposição", DISPOSICAO_NC[a.disposicao] || a.disposicao]);
  if (a.necessitaAcao) disp.push(["Necessita de ação", NECESSITA_ACAO[a.necessitaAcao] || a.necessitaAcao]);
  if (a.elaborador) disp.push(["Elaborador / responsável", a.elaborador]);
  if (a.abrangencia) disp.push(["Abrangência", a.abrangencia]);
  if (disp.length) { secao("DISPOSIÇÃO"); campos(disp); y -= 4; }

  /* Causa raiz — a ferramenta dos 5 porquês sempre traz os 5 (linha em branco onde falta). */
  const raw = Array.isArray(a.cincoPorques) ? a.cincoPorques : [];
  const pqs = Array.from({ length: 5 }, (_, i) => (raw[i]?.resposta || "").trim());
  const temPorque = pqs.some(Boolean);
  if (a.causas || temPorque || a.necessitaAcao === "CORRETIVA" || a.necessitaAcao === "PREVENTIVA") {
    secao("ANÁLISE DE CAUSA RAIZ");
    if (a.causas) { txt("Causas da não conformidade", M, y - 8, { size: 7.5, color: GRAY }); y -= 14; paragrafo(a.causas, M, W, { size: 9 }); y -= 4; }
    txt("Ferramenta dos 5 porquês", M, y - 8, { size: 7.5, color: GRAY }); y -= 14;
    pqs.forEach((resp, i) => {
      espaco(13);
      txt(`${i + 1}º`, M, y - 8, { f: bold, size: 8.5, color: NAVY });
      if (resp) { for (const ln of wrap(resp, font, 9, W - 22)) { txt(ln, M + 22, y - 8, { size: 9 }); y -= 11; } }
      else { page.drawLine({ start: { x: M + 22, y: y - 10 }, end: { x: A4[0] - M, y: y - 10 }, thickness: 0.4, color: LINE }); y -= 13; }
      y -= 2;
    });
    y -= 4;
  }

  /* Plano de ação 5W2H */
  const item = plano && Array.isArray(plano.itens) && plano.itens.length ? plano.itens[0] : null;
  if (item) {
    secao("PLANO DE AÇÃO (5W2H)");
    const linhas = [["O quê (What)", item.oque], ["Por quê (Why)", item.porque], ["Onde (Where)", item.onde], ["Quem (Who)", item.quem], ["Quando (When)", item.quando], ["Como (How)", item.como], ["Quanto (How much)", item.quanto]];
    for (const [k, v] of linhas) { if (!(v || "").toString().trim()) continue; espaco(13); txt(k, M, y - 8, { size: 7.5, color: GRAY }); for (const ln of wrap(String(v), font, 9, W - 130)) { txt(ln, M + 130, y - 8, { size: 9, color: DARK }); y -= 11; } y -= 2; }
    if (plano.numero) { txt(`Plano de Ação PA-${String(plano.numero).padStart(3, "0")}${plano.status === "CONCLUIDO" ? " · concluído" : ""}`, M, y - 8, { size: 7.5, color: GRAY }); y -= 12; }
    y -= 4;
  }

  /* Registro fotográfico — fotos do FORM 20 + imagens anexadas */
  const anexos = Array.isArray(a.anexos) ? a.anexos.filter((x) => x && x.url) : [];
  const fotos = [
    ...(Array.isArray(a.fotos) ? a.fotos : []),
    ...anexos.filter((x) => String(x.tipo || "").startsWith("image/")),
  ].filter((f) => f && f.url);
  if (fotos.length) { secao("REGISTRO FOTOGRÁFICO"); await desenharFotos(fotos); y -= 4; }

  /* Anexos (documentos não-imagem) */
  const docs = anexos.filter((x) => !String(x.tipo || "").startsWith("image/"));
  if (docs.length) { secao("ANEXOS"); for (const x of docs) { espaco(12); txt("• " + (x.nome || x.url), M, y - 8, { size: 8.5, color: DARK }); y -= 12; } y -= 4; }

  /* Acompanhamento e eficácia */
  if (a.acompanhamento || a.avaliacaoEficacia || a.realizadoEm || a.acompanhadoPor) {
    secao("ACOMPANHAMENTO E EFICÁCIA");
    const ac = [];
    if (a.realizadoEm) ac.push(["Realizado em", fmtD(a.realizadoEm)]);
    if (a.acompanhadoPor) ac.push(["Acompanhado por", a.acompanhadoPor]);
    if (ac.length) campos(ac);
    if (a.acompanhamento) { txt("Acompanhamento da implementação", M, y - 8, { size: 7.5, color: GRAY }); y -= 14; paragrafo(a.acompanhamento, M, W, { size: 9 }); y -= 3; }
    if (a.avaliacaoEficacia) { txt("Avaliação da eficácia", M, y - 8, { size: 7.5, color: GRAY }); y -= 14; paragrafo(a.avaliacaoEficacia, M, W, { size: 9 }); }
    y -= 4;
  }

  /* Encerramento */
  if (a.encerradaPor || a.encerradaEm) {
    espaco(24);
    page.drawRectangle({ x: M, y: y - 22, width: W, height: 22, color: rgb(0.9, 0.96, 0.93) });
    txt(`Não conformidade encerrada por ${a.encerradaPor || "—"}${a.encerradaEm ? ` em ${fmtD(a.encerradaEm)}` : ""}.`, M + 10, y - 14, { f: bold, size: 9, color: GREEN });
    y -= 30;
  }

  /* Rodapé */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: LINE });
    p.drawText(san(`${numRNC(a.numero, a.ano)} · Torg Metal · ${refFORM(20)} · relatório de não conformidade · documento controlado (ISO 9001)`), { x: M, y: 19, size: 7, font, color: GRAY });
    const pg = `${i + 1}/${pages.length}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 19, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, filename: `${numRNC(a.numero, a.ano).replace("/", "-")}.pdf` };
}
