import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "./prisma";
import { downloadRhItem } from "./sharepoint";
import { calcStatusValidade, diasAlertaCategoria } from "./qualidade-status";
import { FONTE_LABEL, ESTADO_DATABOOK } from "./databook-secoes";

// Geração server-side do PDF do Data Book (PQ-00 §9): capa TORG + lista mestra
// + as 20 seções, com merge dos PDFs dos certificados (M1) anexados.
// pdf-lib (JS puro) — gera páginas e copia páginas de PDFs existentes.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const NAVY2 = rgb(31 / 255, 56 / 255, 100 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const DARK = rgb(0.16, 0.20, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LIGHT = rgb(0.94, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);
const MAX_MERGE_PAGES = 200; // trava de sanidade

const fmtKg = (v) => (v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

function lerLogo() {
  for (const nome of ["torg-logo-white.png", "torg-logo.png"]) {
    try {
      return fs.readFileSync(path.join(process.cwd(), "public", nome));
    } catch {}
  }
  return null;
}

export async function gerarDataBookPDF(dataBookId) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: dataBookId },
    include: { secoes: { orderBy: { ordem: "asc" }, include: { documentos: true } } },
  });
  if (!book) throw new Error("Data book não encontrado");

  // resolve documentos vinculados
  const ids = [...new Set(book.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)))];
  const docs = ids.length ? await prisma.documentoQualidade.findMany({ where: { id: { in: ids } } }) : [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const codigo = `PQ-DB-${String(book.opNumero).padStart(3, "0")}`;
  const emitido = book.status === "EMITIDO";

  // largura útil
  const W = A4[0] - 2 * M;
  const fit = (str, f, size, maxW) => {
    let s = String(str ?? "");
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  let page, y;
  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; return page; };
  const espaco = (h) => { if (y - h < M + 28) novaPagina(); };

  // ─── CAPA ───────────────────────────────────────────────
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 200, width: A4[0], height: 200, color: NAVY });
  const logo = lerLogo();
  if (logo) {
    try {
      const img = await pdf.embedPng(logo);
      const lw = 150, lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: M, y: A4[1] - 70 - lh / 2, width: lw, height: lh });
    } catch { page.drawText("TORG METAL", { x: M, y: A4[1] - 78, size: 22, font: bold, color: WHITE }); }
  } else {
    page.drawText("TORG METAL", { x: M, y: A4[1] - 78, size: 22, font: bold, color: WHITE });
  }
  page.drawText("DATA BOOK DE QUALIDADE", { x: M, y: A4[1] - 150, size: 24, font: bold, color: WHITE });
  page.drawText("Dossiê de Qualidade · ABNT NBR 16775:2020", { x: M, y: A4[1] - 174, size: 11, font, color: rgb(0.8, 0.86, 0.95) });

  // bloco de identificação
  let by = A4[1] - 250;
  const linhaCapa = (rot, val) => {
    page.drawText(rot, { x: M, y: by, size: 10, font: bold, color: GRAY });
    page.drawText(fit(val, font, 13, W - 130), { x: M + 120, y: by, size: 13, font, color: DARK });
    by -= 26;
  };
  linhaCapa("OBRA / OP", `${fmtOP(book.opNumero)}${book.obra ? " · " + book.obra : ""}`);
  linhaCapa("CLIENTE", book.cliente || "—");
  linhaCapa("PESO TOTAL", fmtKg(book.pesoTotalKg));
  linhaCapa("Nº DE PEÇAS", book.pecas != null ? String(book.pecas) : "—");

  // caixa de controle (rodapé da capa)
  const cy = 150;
  page.drawRectangle({ x: M, y: cy, width: W, height: 70, color: LIGHT });
  page.drawText("DOCUMENTO CONTROLADO", { x: M + 14, y: cy + 50, size: 9, font: bold, color: NAVY2 });
  const ctrl = [
    ["Código", codigo], ["Revisão", "00"], ["Data", fmtData(new Date())],
    ["Status", emitido ? "EMITIDO" : "RASCUNHO"],
  ];
  let cx = M + 14;
  for (const [k, v] of ctrl) {
    page.drawText(k, { x: cx, y: cy + 30, size: 8, font, color: GRAY });
    page.drawText(v, { x: cx, y: cy + 16, size: 11, font: bold, color: v === "RASCUNHO" ? rgb(0.7, 0.45, 0) : DARK });
    cx += (W - 28) / 4;
  }
  if (!emitido) {
    page.drawText("RASCUNHO — gerado antes da emissão formal.", { x: M, y: 120, size: 9, font, color: rgb(0.7, 0.45, 0) });
  }

  // ─── SEÇÃO 01: LISTA MESTRA ─────────────────────────────
  novaPagina();
  tituloSecao(page, bold, font, "01", "Identificação e Lista Mestra de Documentos", "NBR 16775", null);
  y -= 86;
  // cabeçalho da tabela
  const cols = [{ t: "Nº", w: 28 }, { t: "Seção", w: 250 }, { t: "Norma", w: 120 }, { t: "Estado", w: 70 }, { t: "Docs", w: 40 }];
  const drawLinhaTab = (cells, f, size, cor, bg) => {
    espaco(18);
    if (bg) page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: bg });
    let x = M + 2;
    cells.forEach((c, i) => { page.drawText(fit(c, f, size, cols[i].w - 4), { x, y, size, font: f, color: cor }); x += cols[i].w; });
    y -= 16;
  };
  drawLinhaTab(cols.map((c) => c.t), bold, 8.5, NAVY2, LIGHT);
  for (const s of book.secoes) {
    const nDocs = s.documentos.length;
    drawLinhaTab([s.numero, s.titulo, s.norma || "—", ESTADO_DATABOOK[s.estado]?.label || s.estado, nDocs ? String(nDocs) : "—"], font, 8.5, DARK);
  }

  // ─── SEÇÕES 02..20 ──────────────────────────────────────
  let mergedPages = 0;
  for (const s of book.secoes) {
    if (s.numero === "01") continue;
    novaPagina();
    tituloSecao(page, bold, font, s.numero, s.titulo, s.norma, s);
    y -= 92;

    const docsSecao = s.documentos.map((ld) => docById.get(ld.documentoId)).filter(Boolean);
    if (docsSecao.length) {
      page.drawText("Documentos", { x: M, y, size: 10, font: bold, color: NAVY2 }); y -= 16;
      for (const d of docsSecao) {
        espaco(14);
        const st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
        const extra = [d.numeroCorrida ? `corrida ${d.numeroCorrida}` : null, d.numeroDocumento ? `cert. ${d.numeroDocumento}` : null, st.key !== "SEM_VALIDADE" ? st.label : null].filter(Boolean).join(" · ");
        page.drawText(fit(`• ${d.nome}`, font, 9.5, W - 4), { x: M + 4, y, size: 9.5, font, color: DARK }); y -= 12;
        if (extra) { page.drawText(fit(extra, font, 8, W - 20), { x: M + 14, y, size: 8, font, color: GRAY }); y -= 12; }
      }
      y -= 6;
    } else {
      page.drawText("Sem documentos vinculados.", { x: M, y, size: 9, font, color: GRAY }); y -= 16;
    }
    if (/entrada_a|misto/.test(s.fonte)) {
      page.drawText("Evidências fotográficas: captura em campo (fase futura).", { x: M, y, size: 8.5, font, color: GRAY }); y -= 14;
    }

    // merge dos PDFs dos certificados (dedup por sharepointItemId/arquivoUrl)
    const vistos = new Set();
    for (const d of docsSecao) {
      const chave = d.sharepointItemId || d.arquivoUrl;
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      if (mergedPages >= MAX_MERGE_PAGES) continue;
      try {
        let buf;
        if (d.arquivoUrl) buf = Buffer.from(await (await fetch(d.arquivoUrl)).arrayBuffer());
        else buf = (await downloadRhItem(d.sharepointItemId)).buffer;
        const ext = await PDFDocument.load(buf, { ignoreEncryption: true });
        const idxs = ext.getPageIndices().slice(0, MAX_MERGE_PAGES - mergedPages);
        const copiadas = await pdf.copyPages(ext, idxs);
        copiadas.forEach((p) => { pdf.addPage(p); mergedPages++; });
      } catch {
        novaPagina();
        page.drawText(`Não foi possível anexar automaticamente o certificado:`, { x: M, y, size: 10, font: bold, color: rgb(0.7, 0.2, 0.2) }); y -= 16;
        page.drawText(fit(d.nome, font, 10, W), { x: M, y, size: 10, font, color: DARK });
      }
    }
  }

  // ─── RODAPÉ + PAGINAÇÃO (todas as páginas) ──────────────
  const paginas = pdf.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    p.drawText(`TORG METAL · Documento controlado · ${codigo} Rev.00`, { x: M, y: 20, size: 7, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 20, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, filename: `Data Book ${fmtOP(book.opNumero)}${emitido ? "" : " (rascunho)"}.pdf` };

  // ── helper de título de seção (cabeçalho navy) ──
  function tituloSecao(pg, fb, fr, numero, titulo, norma, secao) {
    pg.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
    pg.drawText(`SEÇÃO ${numero}`, { x: M, y: A4[1] - 30, size: 11, font: fb, color: rgb(0.7, 0.8, 0.92) });
    pg.drawText(fit(titulo, fb, 16, W - 120), { x: M, y: A4[1] - 50, size: 16, font: fb, color: WHITE });
    if (norma) pg.drawText(fit(norma, fr, 9, 200), { x: A4[0] - M - 200, y: A4[1] - 30, size: 9, font: fr, color: rgb(0.8, 0.86, 0.95) });
    if (secao) {
      const est = ESTADO_DATABOOK[secao.estado]?.label || secao.estado;
      pg.drawText(`${est}${secao.fonte ? " · " + (FONTE_LABEL[secao.fonte] || secao.fonte) : ""}`, { x: A4[0] - M - 200, y: A4[1] - 50, size: 8, font: fr, color: rgb(0.75, 0.82, 0.92) });
    }
  }
}
