import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// PDF da ATA DE REUNIÃO DA OP (AtaOP, aba Planejamento) — mesma linguagem dos
// outros PDFs Torg: faixa navy + filete laranja + logo, blocos de identificação,
// seções com título e rodapé paginado. Espelha o que o cliente vê em /ata-op/[token].

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const SOFT = rgb(0.961, 0.973, 0.984);
const WHITE = rgb(1, 1, 1);

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const nn = (n) => String(n ?? 0).padStart(2, "0");
// pdf-lib (WinAnsi) quebra com caracteres fora da tabela — troca os mais comuns
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");

/** quebra o texto em linhas que cabem em `larg` */
function quebrar(texto, fonte, tam, larg) {
  const out = [];
  for (const paragrafo of san(texto).split(/\n+/)) {
    let linha = "";
    for (const p of paragrafo.split(/\s+/)) {
      const t = linha ? `${linha} ${p}` : p;
      if (fonte.widthOfTextAtSize(t, tam) <= larg) linha = t;
      else { if (linha) out.push(linha); linha = p; }
    }
    if (linha) out.push(linha);
  }
  return out;
}

/**
 * @param {object} ata AtaOP (+ op: {numero, obra, cliente, refCliente})
 * @returns {Promise<{bytes: Uint8Array, filename: string}>}
 */
export async function gerarAtaOPPDF(ata) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  const W = A4[0] - 2 * M;
  const cj = ata.conteudoJson || {};
  const anexos = Array.isArray(ata.anexos) ? ata.anexos : [];
  const obraLinha = [ata.op?.obra, ata.op?.cliente].filter(Boolean).join(" - ");
  const codigo = `OP-${nn(ata.opNumero)} - ATA #${nn(ata.numero)}`;

  let page, y;
  const paginas = [];
  const novaPagina = (comBanda) => {
    page = pdf.addPage(A4);
    paginas.push(page);
    if (comBanda) {
      const h = 96;
      page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
      page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
      if (logo) {
        const lw = 92, lh = (logo.height / logo.width) * lw;
        page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh });
      }
      page.drawText("ATA DE REUNIÃO", { x: M + (logo ? 118 : 0), y: A4[1] - 46, size: 19, font: bold, color: WHITE });
      page.drawText(san(`${codigo}${obraLinha ? ` - ${obraLinha}` : ""}`), { x: M + (logo ? 118 : 0), y: A4[1] - 66, size: 10, font, color: rgb(0.8, 0.86, 0.94) });
      y = A4[1] - h - 30;
    } else {
      y = A4[1] - M;
    }
  };
  const espaco = (n) => { if (y - n < 70) novaPagina(false); };

  const secao = (titulo) => {
    espaco(46);
    y -= 10;
    page.drawText(san(titulo.toUpperCase()), { x: M, y, size: 9.5, font: bold, color: GRAY });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });
    y -= 14;
  };
  const paragrafo = (txt, tam = 10.5, fonte = font, cor = DARK, larg = W, x = M) => {
    for (const ln of quebrar(txt, fonte, tam, larg)) {
      espaco(tam + 6);
      page.drawText(ln, { x, y, size: tam, font: fonte, color: cor });
      y -= tam + 4;
    }
  };

  novaPagina(true);

  // título da reunião
  if (ata.titulo) {
    for (const ln of quebrar(ata.titulo, bold, 15, W)) {
      espaco(22);
      page.drawText(ln, { x: M, y, size: 15, font: bold, color: DARK });
      y -= 19;
    }
    y -= 6;
  }

  // bloco de identificação
  const linhas = [
    ["Reunião", ata.dataReuniao ? fmtD(ata.dataReuniao) : "-"],
    ["Participantes", ata.participantes || "-"],
  ];
  if (obraLinha) linhas.push(["Obra / Cliente", obraLinha]);
  if (ata.op?.refCliente) linhas.push(["Ref. do cliente", ata.op.refCliente]);

  const alturaBloco = linhas.reduce((s, [, v]) => s + Math.max(1, quebrar(v, font, 10, W - 130).length) * 14 + 6, 10);
  espaco(alturaBloco + 10);
  const topo = y;
  page.drawRectangle({ x: M, y: y - alturaBloco, width: W, height: alturaBloco, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
  y -= 14;
  for (const [rot, val] of linhas) {
    page.drawText(san(rot), { x: M + 12, y, size: 9, font: bold, color: GRAY });
    const vls = quebrar(val, font, 10, W - 140);
    vls.forEach((ln, i) => page.drawText(ln, { x: M + 128, y: y - i * 13, size: 10, font, color: DARK }));
    y -= Math.max(1, vls.length) * 13 + 7;
  }
  y = topo - alturaBloco - 16;

  // resumo (ou pauta bruta)
  if (cj.resumo) {
    secao("Resumo");
    const ls = quebrar(cj.resumo, font, 10.5, W - 18);
    espaco(ls.length * 15 + 12);
    const alt = ls.length * 14.5 + 14;
    page.drawRectangle({ x: M, y: y - alt + 12, width: W, height: alt, color: SOFT });
    page.drawRectangle({ x: M, y: y - alt + 12, width: 3, height: alt, color: ORANGE });
    ls.forEach((ln) => { page.drawText(ln, { x: M + 14, y, size: 10.5, font, color: DARK }); y -= 14.5; });
    y -= 12;
  } else if (ata.pauta) {
    secao("Pauta");
    paragrafo(ata.pauta);
    y -= 6;
  }

  // tópicos
  if (cj.topicos?.length) {
    secao("Tópicos discutidos");
    cj.topicos.forEach((t, i) => {
      espaco(34);
      page.drawCircle({ x: M + 8, y: y + 3.5, size: 8.5, color: NAVY });
      const nro = String(i + 1);
      page.drawText(nro, { x: M + 8 - bold.widthOfTextAtSize(nro, 8) / 2, y: y + 1, size: 8, font: bold, color: WHITE });
      for (const ln of quebrar(t.titulo || "", bold, 10.5, W - 26)) {
        espaco(16); page.drawText(ln, { x: M + 24, y, size: 10.5, font: bold, color: DARK }); y -= 14;
      }
      if (t.discussao) { paragrafo(t.discussao, 10, font, GRAY, W - 26, M + 24); }
      y -= 8;
    });
  }

  // ações
  if (cj.acoes?.length) {
    secao("Ações e pendências");
    const cw = [W - 190, 110, 80];
    const cabecalhoTabela = () => {
      page.drawRectangle({ x: M, y: y - 5, width: W, height: 20, color: NAVY });
      ["Ação", "Responsável", "Prazo"].forEach((h, i) => {
        const x = M + 8 + cw.slice(0, i).reduce((a, b) => a + b, 0);
        page.drawText(h, { x, y, size: 9, font: bold, color: WHITE });
      });
      y -= 22;
    };
    espaco(46);
    cabecalhoTabela();
    cj.acoes.forEach((a, i) => {
      const ls = quebrar(a.descricao || "", font, 9.5, cw[0] - 16);
      const alt = Math.max(ls.length * 12 + 8, 20);
      // quebrou de página no meio da tabela → repete o cabeçalho
      if (y - (alt + 6) < 70) { novaPagina(false); cabecalhoTabela(); }
      if (i % 2) page.drawRectangle({ x: M, y: y - alt + 12, width: W, height: alt, color: SOFT });
      ls.forEach((ln, k) => page.drawText(ln, { x: M + 8, y: y - k * 12, size: 9.5, font, color: DARK }));
      page.drawText(san(a.responsavel || "-"), { x: M + 8 + cw[0], y, size: 9.5, font, color: GRAY });
      page.drawText(a.prazo ? fmtD(a.prazo) : "-", { x: M + 8 + cw[0] + cw[1], y, size: 9.5, font, color: GRAY });
      y -= alt;
      page.drawLine({ start: { x: M, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.5, color: LINE });
    });
    y -= 10;
  }

  // anexos
  if (anexos.length) {
    secao("Anexos");
    anexos.forEach((a) => {
      espaco(16);
      page.drawText(`#${nn(a.seq)}`, { x: M, y, size: 9, font: bold, color: GRAY });
      for (const ln of quebrar(a.nome || "", font, 10, W - 40)) {
        page.drawText(ln, { x: M + 34, y, size: 10, font, color: DARK }); y -= 13;
      }
      y -= 3;
    });
    y -= 6;
  }

  // aceite
  espaco(60);
  y -= 6;
  if (ata.aceiteEm) {
    const alt = 40;
    page.drawRectangle({ x: M, y: y - alt + 12, width: W, height: alt, color: rgb(0.93, 0.99, 0.96), borderColor: rgb(0.65, 0.95, 0.82), borderWidth: 0.8 });
    page.drawText("ACEITE REGISTRADO", { x: M + 12, y, size: 9, font: bold, color: rgb(0.02, 0.47, 0.34) });
    y -= 14;
    page.drawText(san(`${ata.aceiteNome || "Cliente"} - ${fmtDT(ata.aceiteEm)}`), { x: M + 12, y, size: 10, font, color: DARK });
    y -= 20;
  } else {
    page.drawText("Aguardando aceite do cliente.", { x: M, y, size: 9.5, font: italic, color: GRAY });
    y -= 16;
  }

  // rodapé paginado
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 52 }, end: { x: A4[0] - M, y: 52 }, thickness: 0.6, color: LINE });
    p.drawText("Torg Metal · Estruturas Metálicas", { x: M, y: 40, size: 8, font, color: GRAY });
    const txt = `${san(codigo)}   |   Página ${i + 1} de ${total}`;
    p.drawText(txt, { x: A4[0] - M - font.widthOfTextAtSize(txt, 8), y: 40, size: 8, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, filename: `Ata_OP-${nn(ata.opNumero)}_${nn(ata.numero)}.pdf` };
}
