import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, PDFName, degrees } from "pdf-lib";
import { prisma } from "./prisma";
import { downloadRhItem } from "./sharepoint";
import { calcStatusValidade, diasAlertaCategoria } from "./qualidade-status";
import { ESTADO_DATABOOK, GRUPOS_DATABOOK, grupoDaSecao } from "./databook-secoes";
import { TIPO_DATABOOK_LABEL } from "./op-opcoes";

// Geração server-side do PDF do Data Book (PQ-00 §9): capa TORG + lista mestra
// + as 20 seções, com merge dos PDFs dos certificados (M1) anexados.
// pdf-lib (JS puro) — gera páginas e copia páginas de PDFs existentes.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const NAVY2 = rgb(31 / 255, 56 / 255, 100 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const LIGHTBLUE = rgb(0.62, 0.74, 0.9);
const DARK = rgb(0.16, 0.20, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LIGHT = rgb(0.94, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);
const MAX_MERGE_PAGES = 200; // trava de sanidade
const CNPJ_TORG = "53.694.442/0001-41";
const RESPONSAVEL_TECNICO = "Guilherme A. Corte Campos";

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

  // Logos: branco (sobre faixa navy, na capa) e escuro (sobre branco, nas divisórias).
  const embedLogo = async (nome) => { try { return await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", nome))); } catch { return null; } };
  const logoWhiteImg = await embedLogo("torg-logo-white.png");
  const logoDarkImg = (await embedLogo("torg-logo.png")) || null;
  // Selo de certificação (Bureau Veritas / ISO 9001) — só se o arquivo existir no repo.
  const bvImg = await embedLogo("bureau-veritas.png");

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

  // Quebra um texto em linhas que cabem em maxW (palavra a palavra; quebra dura
  // palavras muito longas). Usado nas células do PIT (§10), que têm texto longo.
  const wrapCell = (str, f, size, maxW) => {
    const out = [];
    let cur = "";
    for (const w of String(str ?? "—").split(/\s+/)) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
      if (cur) out.push(cur);
      cur = w;
      while (f.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) {
        let k = cur.length;
        while (k > 1 && f.widthOfTextAtSize(cur.slice(0, k), size) > maxW) k--;
        out.push(cur.slice(0, k));
        cur = cur.slice(k);
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : ["—"];
  };

  // Tabela do PIT (§10) — células com QUEBRA de linha (altura variável), sem cortar
  // o texto. Cabeçalho navy repetido a cada página; zebra.
  const drawPitTabela = (itens) => {
    const fs = 7.5, lineH = 9, padV = 5, cabH = 16;
    const cols = [
      { t: "Etapa / Atividade", w: 84, key: "etapa", bold: true },
      { t: "Característica", w: 88, key: "caracteristica" },
      { t: "Método", w: 74, key: "metodo" },
      { t: "Critério de aceitação", w: 92, key: "criterio" },
      { t: "Frequência", w: 46, key: "frequencia" },
      { t: "Registro", w: 70, key: "registro" },
      { t: "Resp.", w: 57, key: "responsavel" },
    ]; // soma = 511 = W
    const cab = () => {
      espaco(cabH + 16);
      page.drawRectangle({ x: M, y: y - cabH + 3, width: W, height: cabH, color: NAVY2 });
      let x = M + 4;
      for (const c of cols) { page.drawText(fit(c.t, bold, fs, c.w - 6), { x, y: y - cabH + 8, size: fs, font: bold, color: WHITE }); x += c.w; }
      y -= cabH;
    };
    cab();
    itens.forEach((it, ri) => {
      const cells = cols.map((c) => wrapCell(it[c.key], font, fs, c.w - 6));
      const nLines = Math.max(...cells.map((l) => l.length));
      const rowH = nLines * lineH + padV;
      if (y - rowH < M + 40) { novaPagina(); cab(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 3, width: W, height: rowH, color: LIGHT });
      let x = M + 4;
      cols.forEach((c, ci) => {
        const f = c.bold ? bold : font;
        cells[ci].forEach((ln, li) => page.drawText(ln, { x, y: y - 8 - li * lineH, size: fs, font: f, color: DARK }));
        x += c.w;
      });
      y -= rowH;
    });
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };

  // Cabeçalho de seção COMPACTO (faixa navy boxed) — as seções fluem na página
  // (várias por folha) em vez de uma por página, eliminando o espaço em branco.
  const secaoHeader = (numero, titulo, norma) => {
    const h = 24;
    espaco(h + 46); // garante header + começo de conteúdo; senão quebra a página
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: NAVY });
    page.drawText(numero, { x: M + 9, y: y - h + 7, size: 11, font: bold, color: rgb(0.62, 0.74, 0.9) });
    page.drawText(fit(titulo, bold, 11, W - 210), { x: M + 36, y: y - h + 7, size: 11, font: bold, color: WHITE });
    if (norma) { const nt = fit(norma, font, 8, 160); page.drawText(nt, { x: M + W - 9 - font.widthOfTextAtSize(nt, 8), y: y - h + 7, size: 8, font, color: rgb(0.8, 0.86, 0.95) }); }
    y -= h + 10;
  };

  // Parágrafo com quebra de linha automática na largura útil.
  const paragrafo = (texto, size = 9.5, cor = DARK) => {
    let linha = "";
    const flush = () => { if (linha) { espaco(size + 5); page.drawText(linha, { x: M, y, size, font, color: cor }); y -= size + 4; linha = ""; } };
    for (const p of String(texto).split(/\s+/)) {
      const t = linha ? linha + " " + p : p;
      if (font.widthOfTextAtSize(t, size) > W) { flush(); linha = p; } else linha = t;
    }
    flush();
  };

  // Texto com tracking (espaçamento entre letras) — para rótulos em caixa-alta.
  const tracked = (txt, x, ty, size, f, color, track = 1.5) => {
    let cx = x;
    for (const ch of String(txt)) { page.drawText(ch, { x: cx, y: ty, size, font: f, color }); cx += f.widthOfTextAtSize(ch, size) + track; }
    return cx - x;
  };
  const trackedWidth = (txt, size, f, track = 1.5) => { let w = 0; for (const ch of String(txt)) w += f.widthOfTextAtSize(ch, size) + track; return w - track; };
  const centerX = (txt, size, f) => (A4[0] - f.widthOfTextAtSize(txt, size)) / 2;
  const quebrar = (txt, f, size, maxW) => {
    const out = []; let l = "";
    for (const wd of String(txt ?? "—").split(/\s+/)) { const t = l ? l + " " + wd : wd; if (f.widthOfTextAtSize(t, size) <= maxW) l = t; else { if (l) out.push(l); l = wd; } }
    if (l) out.push(l); return out.length ? out : ["—"];
  };

  // Página separadora de subseção (estilo dossiê): logo escuro no topo + "I-3) Título"
  // no centro vertical, régua laranja. Cada subseção abre numa página própria.
  const dividerPagina = (id, titulo, norma) => {
    novaPagina();
    if (logoDarkImg) {
      const lw = 150, lh = (logoDarkImg.height / logoDarkImg.width) * lw;
      page.drawImage(logoDarkImg, { x: (A4[0] - lw) / 2, y: A4[1] - 110 - lh, width: lw, height: lh });
    } else {
      const t = "TORG METAL"; page.drawText(t, { x: centerX(t, 20, bold), y: A4[1] - 120, size: 20, font: bold, color: NAVY });
    }
    const linhas = quebrar(`${id})  ${titulo}`, bold, 17, W - 80);
    let ty = A4[1] / 2 + (linhas.length - 1) * 12;
    for (const ln of linhas) { page.drawText(ln, { x: centerX(ln, 17, bold), y: ty, size: 17, font: bold, color: NAVY }); ty -= 24; }
    page.drawRectangle({ x: (A4[0] - 90) / 2, y: ty - 4, width: 90, height: 2.5, color: ORANGE });
    if (norma) page.drawText(norma, { x: centerX(norma, 10, font), y: ty - 22, size: 10, font, color: GRAY });
  };

  // ─── CAPA (Faixa institucional) ─────────────────────────
  novaPagina();
  const bandH = 236;
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: 4, color: ORANGE });
  if (logoWhiteImg) {
    const lw = 150, lh = (logoWhiteImg.height / logoWhiteImg.width) * lw;
    page.drawImage(logoWhiteImg, { x: M, y: A4[1] - 44 - lh, width: lw, height: lh });
  } else {
    page.drawText("TORG METAL", { x: M, y: A4[1] - 70, size: 22, font: bold, color: WHITE });
  }
  tracked("DOSSIÊ DA QUALIDADE", M, A4[1] - 150, 11, bold, LIGHTBLUE, 3);
  page.drawText("DATA BOOK", { x: M, y: A4[1] - 196, size: 42, font: bold, color: WHITE });
  page.drawText("Documentos de Engenharia e Fabricação", { x: M, y: A4[1] - bandH + 26, size: 12.5, font, color: rgb(0.8, 0.86, 0.95) });

  // bloco de identificação
  let by = A4[1] - bandH - 64;
  const rowCapa = (label, val) => {
    tracked(label, M, by, 9, bold, GRAY, 2); by -= 19;
    for (const ln of quebrar(val, bold, 16, W)) { page.drawText(ln, { x: M, y: by, size: 16, font: bold, color: NAVY }); by -= 19; }
    by -= 8;
    page.drawLine({ start: { x: M, y: by }, end: { x: A4[0] - M, y: by }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    by -= 26;
  };
  rowCapa("CLIENTE", book.cliente || "—");
  rowCapa("EMPREENDIMENTO", book.obra || "—");
  rowCapa("FABRICANTE", "TORG METAL");
  rowCapa("RESPONSÁVEL TÉCNICO", RESPONSAVEL_TECNICO);
  rowCapa("OBRA", fmtOP(book.opNumero));

  // rodapé de controle — 4 colunas alinhadas (mesma linha-base p/ rótulo e valor)
  const fH = 88;
  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: fH, color: LIGHT });
  page.drawRectangle({ x: 0, y: fH, width: A4[0], height: 3, color: NAVY });
  const cwCapa = (A4[0] - 2 * M) / 4;
  const corStatus = emitido ? rgb(0.06, 0.5, 0.3) : rgb(0.7, 0.45, 0);
  [
    ["CÓDIGO", codigo, NAVY],
    ["REVISÃO", "00", NAVY],
    ["EMISSÃO", fmtData(new Date()), NAVY],
    ["STATUS", emitido ? "EMITIDO" : "RASCUNHO", corStatus],
  ].forEach(([l, v, cor], i) => {
    const cx = M + i * cwCapa;
    tracked(l, cx, fH - 34, 8, bold, GRAY, 1.5);
    page.drawText(fit(v, bold, 12.5, cwCapa - 8), { x: cx, y: fH - 56, size: 12.5, font: bold, color: cor });
  });

  // ─── SUMÁRIO (índice do dossiê: I / II / III / IV) ──────
  // Agrupa as seções que compõem o data book (não-N/A, exceto a §01 índice) na
  // taxonomia do dossiê e numera as subseções I-1, I-2, … II-1, …
  // Só entram no PDF as seções com conteúdo real: docs anexados, ou o termo (§20),
  // ou o PIT (§10) preenchido — seção sem nada não vira página em branco.
  const temConteudo = (s) =>
    s.documentos.length > 0 ||
    s.numero === "20" ||
    (s.numero === "10" && Array.isArray(s.conteudoJson?.itens) && s.conteudoJson.itens.length > 0);
  const incluidas = book.secoes.filter((s) => s.estado !== "NA" && s.numero !== "01" && temConteudo(s));
  const grupos = GRUPOS_DATABOOK
    .map((g) => ({
      ...g,
      itens: incluidas
        .filter((s) => grupoDaSecao(s.numero) === g.romano)
        .map((s, i) => ({ secao: s, id: `${g.romano}-${i + 1}` })),
    }))
    .filter((g) => g.itens.length);

  // Sumário: reservamos a página agora (fica logo após a capa) e a desenhamos
  // DEPOIS do conteúdo — aí já sabemos a página-destino de cada seção, pra criar
  // os links clicáveis (clicar na linha do índice leva até a seção).
  const sumarioPage = pdf.addPage(A4);
  const destByItemId = {};

  // ─── CONTEÚDO — cada subseção abre em página separadora + conteúdo + merge ───
  let mergedPages = 0;
  for (const g of grupos) {
   for (const it of g.itens) {
    const s = it.secao;
    dividerPagina(it.id, s.titulo, s.norma);
    destByItemId[it.id] = page; // página separadora = destino do link no sumário
    novaPagina();
    const docsSecao = s.documentos.map((ld) => docById.get(ld.documentoId)).filter(Boolean);

    // cabeçalho compacto da subseção no topo da página de conteúdo
    tracked(it.id, M, y - 2, 9, bold, BLUE, 1);
    page.drawText(fit(s.titulo, bold, 10.5, W - 60), { x: M + 40, y: y - 2, size: 10.5, font: bold, color: NAVY });
    y -= 16;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4[0] - M, y: y + 4 }, thickness: 0.5, color: rgb(0.86, 0.88, 0.91) });
    y -= 6;

    if (s.numero === "20") {
      // ── Termo de Encerramento e Declaração de Conformidade ──
      page.drawText("TERMO DE ENCERRAMENTO E DECLARAÇÃO DE CONFORMIDADE", { x: M, y, size: 12, font: bold, color: NAVY }); y -= 9;
      page.drawRectangle({ x: M, y, width: 96, height: 2.5, color: ORANGE }); y -= 18;
      paragrafo(
        `A TORG METAL, inscrita no CNPJ sob o nº ${CNPJ_TORG}, fabricante de estruturas metálicas, ` +
        `DECLARA que o fornecimento referente à ${fmtOP(book.opNumero)}${book.obra ? " — " + book.obra : ""}` +
        `${book.cliente ? ", destinado ao cliente " + book.cliente : ""}, ` +
        `${book.pesoTotalKg ? "com peso total aproximado de " + fmtKg(book.pesoTotalKg) + (book.pecas ? " e " + book.pecas + " peças, " : ", ") : ""}` +
        `foi integralmente fabricado, inspecionado e liberado para embarque em conformidade com os requisitos a seguir:`,
        10,
      );
      y -= 8;
      const itensDecl = [
        "Fabricação executada de acordo com os projetos aprovados e suas revisões vigentes, atendendo à norma ABNT NBR 8800.",
        "Rastreabilidade integral dos materiais, comprovada pelos certificados de usina (MTC) com nº de corrida, conforme ABNT NBR 8800 (Anexo A).",
        "Soldagem realizada com procedimentos (EPS/WPS) qualificados e por soldadores certificados, conforme AWS D1.1.",
        "Ensaios visuais (EVS) e não destrutivos — líquido penetrante (LP) e ultrassom (US) — executados por inspetores qualificados (SNQC/ABENDI), atendendo aos critérios de aceitação da AWS D1.1.",
        "Inspeção dimensional realizada conforme as tolerâncias da ABNT NBR 8800 e dos desenhos de fabricação.",
        "Tratamento de superfície e pintura executados conforme o esquema especificado em projeto (ISO 8501-1, ISO 8503 e ISO 2808), com controle da espessura de película seca (DFT).",
        "Atividades conduzidas sob o Sistema de Gestão da Qualidade da TORG METAL, certificado conforme ABNT NBR ISO 9001.",
      ];
      itensDecl.forEach((txt, i) => {
        const lines = quebrar(txt, font, 9.5, W - 20);
        espaco(lines.length * 13 + 6);
        page.drawText(`${i + 1}.`, { x: M + 1, y, size: 9.5, font: bold, color: ORANGE });
        for (const ln of lines) { page.drawText(ln, { x: M + 18, y, size: 9.5, font, color: DARK }); y -= 13; }
        y -= 4;
      });
      y -= 6;
      paragrafo(
        "Declaramos, para os devidos fins, que foram atendidos os requisitos contratuais e normativos aplicáveis, " +
        "atestando a conformidade do produto entregue. As evidências objetivas — certificados, relatórios de inspeção e " +
        "ensaios, qualificações e demais registros — encontram-se compiladas nas seções deste Data Book, que integra a " +
        "documentação da qualidade do empreendimento e deve acompanhar a entrega da obra.",
        10,
      );
      // Selo de certificação ISO 9001 (Bureau Veritas) — imagem se houver; senão, marca textual.
      y -= 14; espaco(70);
      if (bvImg) {
        const bw = 96, bh = (bvImg.height / bvImg.width) * bw;
        page.drawImage(bvImg, { x: M, y: y - bh, width: bw, height: bh });
        page.drawText("Sistema de Gestão da Qualidade certificado", { x: M + bw + 14, y: y - bh / 2 + 4, size: 9, font: bold, color: NAVY });
        page.drawText("ABNT NBR ISO 9001 — Bureau Veritas Certification", { x: M + bw + 14, y: y - bh / 2 - 9, size: 9, font, color: GRAY });
      } else {
        page.drawRectangle({ x: M, y: y - 34, width: 250, height: 34, color: LIGHT });
        page.drawRectangle({ x: M, y: y - 34, width: 3, height: 34, color: ORANGE });
        page.drawText("ABNT NBR ISO 9001", { x: M + 14, y: y - 15, size: 11, font: bold, color: NAVY });
        page.drawText("Sistema de Gestão da Qualidade certificado por Bureau Veritas", { x: M + 14, y: y - 28, size: 8, font, color: GRAY });
      }
    } else if (s.numero === "10") {
      // Plano de Inspeção e Testes montado no portal (§10) — tabela com quebra de linha
      const itens = Array.isArray(s.conteudoJson?.itens) ? s.conteudoJson.itens : [];
      if (itens.length) {
        page.drawText(`Plano de Inspeção e Testes — ${itens.length} ${itens.length === 1 ? "etapa" : "etapas"}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
        drawPitTabela(itens);
        y -= 8;
      } else {
        page.drawText("PIT não preenchido — monte a tabela na seção 10 do portal.", { x: M, y, size: 8.5, font, color: GRAY }); y -= 12;
      }
    } else if (docsSecao.length) {
      const isMaterial = docsSecao.some((d) => d.categoria === "MATERIAL" || d.importRef);
      if (isMaterial) {
        page.drawText(`Rastreabilidade — ${docsSecao.length} ${docsSecao.length === 1 ? "item" : "itens"}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
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
        page.drawText(`Documentos — ${docsSecao.length}`, { x: M, y, size: 9.5, font: bold, color: NAVY2 }); y -= 15;
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
      y -= 8;
    } else {
      page.drawText("Sem documentos vinculados.", { x: M, y, size: 8.5, font, color: GRAY }); y -= 12;
    }
    if (/entrada_a|misto/.test(s.fonte)) {
      page.drawText("Evidências fotográficas: captura em campo (fase futura).", { x: M, y, size: 8, font, color: GRAY }); y -= 11;
    }

    // merge dos PDFs dos certificados (dedup). Se anexar páginas, a próxima seção
    // recomeça em página nova (pra não ficar fora de ordem com os certificados).
    const antesPag = pdf.getPages().length;
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
        copiadas.forEach((p) => {
          // Padroniza tudo em RETRATO: certificado efetivamente em paisagem gira 90°
          // (o conteúdo fica em pé na página vertical, como em data book impresso).
          const { width, height } = p.getSize();
          const rot = p.getRotation().angle || 0;
          const ehPaisagem = rot % 180 === 0 ? width > height : height > width;
          if (ehPaisagem) p.setRotation(degrees((rot + 90) % 360));
          pdf.addPage(p);
          mergedPages++;
        });
      } catch {
        novaPagina();
        page.drawText(`Não foi possível anexar automaticamente o certificado:`, { x: M, y, size: 10, font: bold, color: rgb(0.7, 0.2, 0.2) }); y -= 16;
        page.drawText(fit(d.nome, font, 10, W), { x: M, y, size: 10, font, color: DARK });
      }
    }
    void antesPag; // cada subseção já abre na própria página separadora
   }
  }

  // ─── SUMÁRIO (desenhado agora, com links clicáveis: clicar na linha leva à seção) ───
  page = sumarioPage;
  page.drawRectangle({ x: 0, y: A4[1] - 64, width: A4[0], height: 64, color: NAVY });
  page.drawText("SUMÁRIO", { x: M, y: A4[1] - 42, size: 18, font: bold, color: WHITE });
  const subCap = `${book.cliente || ""}${book.obra ? "  ·  " + book.obra : ""}  ·  ${fmtOP(book.opNumero)}`;
  page.drawText(fit(subCap, font, 9, W), { x: M, y: A4[1] - 56, size: 9, font, color: LIGHTBLUE });
  y = A4[1] - 98;
  const sumarioLinks = [];
  for (const g of grupos) {
    tracked(`${g.romano}.`, M, y, 12, bold, ORANGE, 1);
    page.drawText(g.titulo, { x: M + 28, y, size: 12, font: bold, color: NAVY });
    y -= 7;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: NAVY2 });
    y -= 18;
    for (const it of g.itens) {
      const nDocs = it.secao.documentos.length;
      page.drawText(it.id, { x: M + 12, y, size: 9.5, font: bold, color: BLUE });
      // título em azul = pista visual de que a linha é clicável
      page.drawText(fit(it.secao.titulo, font, 9.5, W - 170), { x: M + 58, y, size: 9.5, font, color: BLUE });
      const meta = it.secao.numero === "10" ? "PIT" : (nDocs ? `${nDocs} doc${nDocs > 1 ? "s" : ""}` : "—");
      page.drawText(meta, { x: A4[0] - M - font.widthOfTextAtSize(meta, 8.5), y, size: 8.5, font, color: GRAY });
      const dest = destByItemId[it.id];
      if (dest) {
        const annot = pdf.context.obj({
          Type: "Annot", Subtype: "Link",
          Rect: [M, y - 4, A4[0] - M, y + 12],
          Border: [0, 0, 0],
          Dest: [dest.ref, PDFName.of("Fit")],
        });
        sumarioLinks.push(pdf.context.register(annot));
      }
      y -= 16;
    }
    y -= 14;
  }
  if (sumarioLinks.length) sumarioPage.node.set(PDFName.of("Annots"), pdf.context.obj(sumarioLinks));

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
  // Selo Bureau Veritas (ISO 9001) centralizado no rodapé se houver o arquivo;
  // senão, marca textual da certificação (sem reproduzir o logo de terceiros).
  const paginas = pdf.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    // Certificado girado p/ retrato: o rodapé sairia de lado — pula nessas páginas.
    if ((p.getRotation().angle || 0) % 360 !== 0) return;
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    p.drawText(`TORG METAL · Documento controlado · ${codigo} Rev.00`, { x: M, y: 20, size: 7, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 20, size: 7, font, color: GRAY });
    if (bvImg) {
      const bw = 24, bh = (bvImg.height / bvImg.width) * bw;
      p.drawImage(bvImg, { x: A4[0] / 2 - bw / 2, y: 4, width: bw, height: bh });
    } else {
      const cert = "ISO 9001 · Bureau Veritas Certification";
      p.drawText(cert, { x: A4[0] / 2 - font.widthOfTextAtSize(cert, 7) / 2, y: 20, size: 7, font, color: GRAY });
    }
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
