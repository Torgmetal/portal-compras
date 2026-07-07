import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Geração do PDF do Relatório de Status (painel Relatórios) no layout padrão
// Torg — mesma linguagem do Data Book (lib/databook-pdf.js): capa institucional
// navy + faixa laranja + logo, blocos de identificação, seções com cabeçalho
// navy e FOTOS em grade com legenda, rodapé paginado + selo ISO.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const NAVY2 = rgb(31 / 255, 56 / 255, 100 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const LIGHTBLUE = rgb(0.62, 0.74, 0.9);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LIGHT = rgb(0.94, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtOP = (n) => {
  if (n == null || n === "") return null;
  const s = String(n).trim();
  return /^\d+$/.test(s) ? `OP-${s.padStart(3, "0")}` : `OP ${s}`;
};

/**
 * @param {object} rel Registro RelatorioStatus (titulo, resumo, cliente, obra,
 *   opNumero, status, criadoPorNome, createdAt, blocos:[{titulo,descricao,fotos:[{url,legenda}]}])
 * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
 */
export async function gerarRelatorioStatusPDF(rel) {
  const blocos = Array.isArray(rel.blocos) ? rel.blocos : [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const embedLogo = async (nome) => {
    try { return await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", nome))); } catch { return null; }
  };
  const logoWhite = await embedLogo("torg-logo-white.png");
  const bvImg = await embedLogo("bureau-veritas.png");

  const W = A4[0] - 2 * M;
  const emitido = rel.status === "EMITIDO";
  const codigo = rel.opNumero ? `REL-${String(rel.opNumero).padStart(3, "0")}` : "REL";

  const fit = (str, f, size, maxW) => {
    let s = String(str ?? "");
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };
  const quebrar = (txt, f, size, maxW) => {
    const out = []; let l = "";
    for (const wd of String(txt ?? "—").split(/\s+/)) {
      const t = l ? l + " " + wd : wd;
      if (f.widthOfTextAtSize(t, size) <= maxW) l = t;
      else { if (l) out.push(l); l = wd; }
    }
    if (l) out.push(l);
    return out.length ? out : ["—"];
  };
  const tracked = (txt, x, ty, size, f, color, track = 1.5) => {
    let cx = x;
    for (const ch of String(txt)) { page.drawText(ch, { x: cx, y: ty, size, font: f, color }); cx += f.widthOfTextAtSize(ch, size) + track; }
  };

  let page, y;
  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; return page; };
  const espaco = (h) => { if (y - h < M + 34) novaPagina(); };

  const paragrafo = (texto, size = 10, cor = DARK, x0 = M, maxW = W) => {
    if (!texto) return;
    for (const par of String(texto).split(/\n/)) {
      if (!par.trim()) { y -= size; continue; }
      for (const ln of quebrar(par, font, size, maxW)) {
        espaco(size + 5);
        page.drawText(ln, { x: x0, y, size, font, color: cor });
        y -= size + 4;
      }
    }
  };

  const secaoHeader = (numero, titulo) => {
    const h = 24;
    espaco(h + 40);
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: NAVY });
    if (numero) page.drawText(numero, { x: M + 9, y: y - h + 7, size: 11, font: bold, color: LIGHTBLUE });
    page.drawText(fit(titulo, bold, 11, W - 60), { x: M + (numero ? 34 : 12), y: y - h + 7, size: 11, font: bold, color: WHITE });
    y -= h + 12;
  };

  // ─── Fotos em grade (2 col; 1 foto = destaque) com legenda + moldura ───
  const embedFoto = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      try { return await pdf.embedJpg(buf); } catch {}
      try { return await pdf.embedPng(buf); } catch {}
      return null;
    } catch { return null; }
  };

  const desenharFotos = async (fotos) => {
    const gap = 14;
    for (let i = 0; i < fotos.length; ) {
      const cols = fotos.length - i === 1 ? 1 : 2;
      const cellW = cols === 1 ? Math.min(W, 400) : (W - gap) / 2;
      const maxH = cols === 1 ? 300 : 200;
      const linha = fotos.slice(i, i + cols);
      const cells = [];
      for (const f of linha) {
        const img = await embedFoto(f.url);
        let dw = cellW, dh = cols === 1 ? 200 : 150;
        if (img) { const sc = Math.min(cellW / img.width, maxH / img.height); dw = img.width * sc; dh = img.height * sc; }
        cells.push({ f, img, dw, dh });
      }
      const boxH = Math.max(...cells.map((c) => c.dh));
      const temLegenda = cells.some((c) => c.f?.legenda);
      const rowH = boxH + (temLegenda ? 16 : 0) + 12;
      espaco(rowH);
      let x = cols === 1 ? M + (W - cellW) / 2 : M;
      for (const c of cells) {
        page.drawRectangle({ x, y: y - boxH, width: cellW, height: boxH, color: LIGHT });
        if (c.img) page.drawImage(c.img, { x: x + (cellW - c.dw) / 2, y: y - boxH + (boxH - c.dh) / 2, width: c.dw, height: c.dh });
        else page.drawText("(imagem indisponível)", { x: x + 10, y: y - boxH / 2, size: 8, font, color: GRAY });
        if (c.f?.legenda) page.drawText(fit(c.f.legenda, font, 8.5, cellW - 4), { x, y: y - boxH - 12, size: 8.5, font, color: GRAY });
        x += cellW + gap;
      }
      y -= rowH;
      i += cols;
    }
  };

  // ─── CAPA ───────────────────────────────────────────────
  novaPagina();
  const bandH = 236;
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: 4, color: ORANGE });
  if (logoWhite) {
    const lw = 150, lh = (logoWhite.height / logoWhite.width) * lw;
    page.drawImage(logoWhite, { x: M, y: A4[1] - 44 - lh, width: lw, height: lh });
  } else {
    page.drawText("TORG METAL", { x: M, y: A4[1] - 70, size: 22, font: bold, color: WHITE });
  }
  tracked("ACOMPANHAMENTO DE FABRICAÇÃO", M, A4[1] - 150, 11, bold, LIGHTBLUE, 3);
  page.drawText("RELATÓRIO DE STATUS", { x: M, y: A4[1] - 196, size: 38, font: bold, color: WHITE });
  page.drawText(fit(rel.titulo || "", font, 12.5, W), { x: M, y: A4[1] - bandH + 26, size: 12.5, font, color: rgb(0.8, 0.86, 0.95) });

  let by = A4[1] - bandH - 60;
  const rowCapa = (label, val) => {
    tracked(label, M, by, 9, bold, GRAY, 2); by -= 19;
    for (const ln of quebrar(val, bold, 16, W)) { page.drawText(ln, { x: M, y: by, size: 16, font: bold, color: NAVY }); by -= 19; }
    by -= 8;
    page.drawLine({ start: { x: M, y: by }, end: { x: A4[0] - M, y: by }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    by -= 24;
  };
  rowCapa("CLIENTE", rel.cliente || "—");
  rowCapa("EMPREENDIMENTO", rel.obra || "—");
  rowCapa("FABRICANTE", "TORG METAL");
  if (rel.opNumero) rowCapa("OBRA", fmtOP(rel.opNumero));

  const fH = 88;
  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: fH, color: LIGHT });
  page.drawRectangle({ x: 0, y: fH, width: A4[0], height: 3, color: NAVY });
  const cw = (A4[0] - 2 * M) / 4;
  const corStatus = emitido ? rgb(0.06, 0.5, 0.3) : rgb(0.7, 0.45, 0);
  [
    ["CÓDIGO", codigo, NAVY],
    ["REVISÃO", "00", NAVY],
    ["EMISSÃO", fmtData(new Date()), NAVY],
    ["STATUS", emitido ? "EMITIDO" : "RASCUNHO", corStatus],
  ].forEach(([l, v, cor], i) => {
    const cx = M + i * cw;
    tracked(l, cx, fH - 34, 8, bold, GRAY, 1.5);
    page.drawText(fit(v, bold, 12.5, cw - 8), { x: cx, y: fH - 56, size: 12.5, font: bold, color: cor });
  });

  // ─── CONTEÚDO ───────────────────────────────────────────
  novaPagina();
  if (rel.resumo && rel.resumo.trim()) {
    secaoHeader(null, "Resumo do status");
    paragrafo(rel.resumo, 10, DARK);
    y -= 10;
  }
  for (let idx = 0; idx < blocos.length; idx++) {
    const b = blocos[idx];
    secaoHeader(`${idx + 1}`, b.titulo || `Bloco ${idx + 1}`);
    if (b.descricao && b.descricao.trim()) { paragrafo(b.descricao, 9.5, DARK); y -= 4; }
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f) => f && f.url) : [];
    if (fotos.length) { await desenharFotos(fotos); }
    y -= 14;
  }

  if (!blocos.length && !(rel.resumo && rel.resumo.trim())) {
    paragrafo("Relatório sem conteúdo — adicione o resumo do status e blocos com fotos.", 10, GRAY);
  }

  // ─── RODAPÉ + PAGINAÇÃO ─────────────────────────────────
  const paginas = pdf.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    p.drawText(`TORG METAL · ${codigo} Rev.00${rel.criadoPorNome ? " · " + rel.criadoPorNome : ""}`, { x: M, y: 20, size: 7, font, color: GRAY });
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
  const nomeArq = `Relatorio de Status ${rel.opNumero ? fmtOP(rel.opNumero) + " " : ""}${emitido ? "" : "(rascunho)"}`.trim();
  return { bytes, filename: `${nomeArq}.pdf` };
}
