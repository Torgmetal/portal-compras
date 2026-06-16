import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "./prisma";
import { downloadRhItem } from "./sharepoint";
import { calcStatusValidade, diasAlertaCategoria } from "./qualidade-status";
import { ESTADO_DATABOOK } from "./databook-secoes";
import { TIPO_DATABOOK_LABEL } from "./op-opcoes";

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

  // Tabela: cabeçalho (faixa navy) + linhas zebra + borda inferior. Quebra de
  // página repete o cabeçalho. Cada célula = string ou { text, color, bold }.
  // colunas = [{ t, w, align?, bold?, color? }] — w somando a W (largura útil).
  const drawTabela = (colunas, linhas, opts = {}) => {
    const fs = opts.fontSize || 8.5;
    const rowH = opts.rowH || 16;
    const cab = () => {
      espaco(rowH + 6);
      page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: NAVY2 });
      let x = M + 5;
      for (const c of colunas) {
        const txt = fit(c.t, bold, fs, c.w - 8);
        const tx = c.align === "right" ? x + c.w - 8 - bold.widthOfTextAtSize(txt, fs) : x;
        page.drawText(txt, { x: tx, y: y - rowH + 8, size: fs, font: bold, color: WHITE });
        x += c.w;
      }
      y -= rowH;
    };
    cab();
    linhas.forEach((row, ri) => {
      if (y - rowH < M + 44) { novaPagina(); cab(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: LIGHT });
      let x = M + 5;
      colunas.forEach((c, ci) => {
        const cell = row[ci];
        const obj = cell && typeof cell === "object";
        const val = obj ? (cell.text ?? "—") : (cell ?? "—");
        const cor = (obj && cell.color) || c.color || DARK;
        const f = ((obj && cell.bold) || c.bold) ? bold : font;
        const txt = fit(String(val), f, fs, c.w - 8);
        const tx = c.align === "right" ? x + c.w - 8 - f.widthOfTextAtSize(txt, fs) : x;
        page.drawText(txt, { x: tx, y: y - rowH + 8, size: fs, font: f, color: cor });
        x += c.w;
      });
      y -= rowH;
    });
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };

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
  if (book.tipo) linhaCapa("DATA BOOK", TIPO_DATABOOK_LABEL[book.tipo] || book.tipo);

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
  y -= 80;
  // Só as seções que COMPÕEM o data book (não-N/A). A composição é selecionada
  // por data book (varia por cliente) — seções N/A não entram.
  const incluidas = book.secoes.filter((s) => s.estado !== "NA");
  const naSecoes = book.secoes.filter((s) => s.estado === "NA");
  page.drawText(`Este data book é composto por ${incluidas.length} seções.`, { x: M, y, size: 9.5, font, color: GRAY }); y -= 20;
  drawTabela(
    [
      { t: "Nº", w: 34, bold: true },
      { t: "Seção", w: 252 },
      { t: "Norma", w: 108 },
      { t: "Estado", w: 67 },
      { t: "Docs", w: 50, align: "right" },
    ],
    incluidas.map((s) => {
      const nDocs = s.documentos.length;
      const cor = s.estado === "ANEXADO" ? rgb(0.06, 0.5, 0.3) : GRAY;
      return [s.numero, s.titulo, s.norma || "—", { text: ESTADO_DATABOOK[s.estado]?.label || s.estado, color: cor }, nDocs ? String(nDocs) : "—"];
    }),
  );
  if (naSecoes.length) {
    y -= 10; espaco(14);
    page.drawText(`Seções não aplicáveis a esta obra: ${naSecoes.map((s) => s.numero).join(", ")}`, { x: M, y, size: 8.5, font, color: GRAY });
    y -= 12;
  }

  // ─── SEÇÕES 02..20 ──────────────────────────────────────
  let mergedPages = 0;
  for (const s of book.secoes) {
    if (s.numero === "01") continue;
    if (s.estado === "NA") continue; // seção não compõe este data book
    novaPagina();
    tituloSecao(page, bold, font, s.numero, s.titulo, s.norma, s);
    y -= 92;

    const docsSecao = s.documentos.map((ld) => docById.get(ld.documentoId)).filter(Boolean);
    if (docsSecao.length) {
      const isMaterial = docsSecao.some((d) => d.categoria === "MATERIAL" || d.importRef);
      if (isMaterial) {
        // Rastreabilidade de material: o código (Índice R) é a chave do dossiê.
        page.drawText(`Rastreabilidade — ${docsSecao.length} ${docsSecao.length === 1 ? "item" : "itens"}`, { x: M, y, size: 10, font: bold, color: NAVY2 }); y -= 18;
        drawTabela(
          [
            { t: "Índice R", w: 56, bold: true, color: BLUE },
            { t: "Material", w: 168 },
            { t: "Corrida", w: 60, color: NAVY2 },
            { t: "Nº Certificado", w: 88 },
            { t: "Norma", w: 64 },
            { t: "Fornecedor", w: 75 },
          ],
          docsSecao.map((d) => [
            d.importRef || "—", d.nome, d.numeroCorrida || "—",
            d.numeroDocumento || "—", d.norma || "—", d.fornecedor || "—",
          ]),
        );
      } else {
        page.drawText(`Documentos — ${docsSecao.length}`, { x: M, y, size: 10, font: bold, color: NAVY2 }); y -= 18;
        drawTabela(
          [
            { t: "Documento", w: 240 },
            { t: "Nº / Certificado", w: 95 },
            { t: "Emissão", w: 76 },
            { t: "Validade", w: 100 },
          ],
          docsSecao.map((d) => {
            const st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
            let validade;
            if (st.key === "VENCIDO") validade = { text: st.label, color: rgb(0.78, 0.12, 0.12), bold: true };
            else if (st.key === "VENCENDO") validade = { text: st.label, color: rgb(0.7, 0.45, 0) };
            else if (st.key === "SEM_VALIDADE") validade = { text: "Sem validade", color: GRAY };
            else validade = fmtData(d.dataValidade);
            return [d.nome, d.numeroDocumento || "—", fmtData(d.dataEmissao), validade];
          }),
        );
      }
      y -= 10;
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

  // ─── RESPONSABILIDADE TÉCNICA E ASSINATURAS ─────────────
  // A linha do inspetor varia pelo tipo do data book (importa só p/ a assinatura):
  // SNQC exige inspetor qualificado SNQC/ABENDI; Padrão Torg / Relatório usam o
  // responsável de qualidade da Torg.
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
  page.drawText("RESPONSABILIDADE TÉCNICA E ASSINATURAS", { x: M, y: A4[1] - 40, size: 15, font: bold, color: WHITE });
  y = A4[1] - 110;

  const inspetor = {
    SNQC: { titulo: "Inspetor de Ensaios (Soldagem / END)", sub: "Qualificação SNQC / ABENDI nº __________________________" },
    PADRAO_TORG: { titulo: "Inspetor / Responsável de Qualidade", sub: "Torg Metal" },
    RELATORIO_ACOMPANHAMENTO: { titulo: "Responsável pelo Acompanhamento", sub: "Torg Metal" },
  }[book.tipo] || { titulo: "Inspetor / Responsável de Qualidade", sub: "Torg Metal" };

  const assinaturas = [
    { titulo: "Elaborado por", sub: "Qualidade — Torg Metal" },
    inspetor,
    { titulo: "Aprovado por (Responsável Técnico)", sub: "Torg Metal" },
    { titulo: "Recebido / Aceite — Cliente", sub: book.cliente || "" },
  ];
  for (const a of assinaturas) {
    espaco(80);
    y -= 34; // espaço para a assinatura acima da linha
    page.drawLine({ start: { x: M, y }, end: { x: M + 300, y }, thickness: 0.8, color: DARK });
    page.drawText(a.titulo, { x: M, y: y - 14, size: 10, font: bold, color: DARK });
    if (a.sub) page.drawText(a.sub, { x: M, y: y - 26, size: 8.5, font, color: GRAY });
    y -= 46;
  }
  if (book.tipo) {
    espaco(20);
    page.drawText(`Data book no padrão: ${TIPO_DATABOOK_LABEL[book.tipo] || book.tipo}.`, { x: M, y, size: 8.5, font, color: GRAY });
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
  function tituloSecao(pg, fb, fr, numero, titulo, norma) {
    pg.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
    pg.drawText(`SEÇÃO ${numero}`, { x: M, y: A4[1] - 27, size: 10, font: fb, color: rgb(0.62, 0.74, 0.9) });
    if (norma) {
      const nt = fit(norma, fr, 9, 250);
      pg.drawText(nt, { x: A4[0] - M - fr.widthOfTextAtSize(nt, 9), y: A4[1] - 27, size: 9, font: fr, color: rgb(0.8, 0.86, 0.95) });
    }
    pg.drawText(fit(titulo, fb, 16, W - 12), { x: M, y: A4[1] - 50, size: 16, font: fb, color: WHITE });
  }
}
