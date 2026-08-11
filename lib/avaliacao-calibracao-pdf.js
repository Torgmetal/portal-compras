import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numRAC, conclusaoLabel } from "@/lib/calibracao";

// RELATÓRIO DE AVALIAÇÃO DE CERTIFICADO DE CALIBRAÇÃO (PO-20), padrão Torg.
// Recebe a avaliação + o documento (certificado) e embute a foto do equipamento.

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
const RED = rgb(0.72, 0.11, 0.11);
const GREEN_BG = rgb(0.9, 0.97, 0.93);
const RED_BG = rgb(0.99, 0.92, 0.92);

const SIT = { CONFORME: { t: "Conforme", c: GREEN }, NAO_CONFORME: { t: "Não conforme", c: RED }, NA: { t: "N/A", c: GRAY } };
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const fmtData = (d) => { if (!d) return "—"; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`; const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };
const fmtDT = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : `${x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${x.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`; };

async function embutirFoto(pdf, url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] === 0xff && buf[1] === 0xd8) return await pdf.embedJpg(buf); // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50) return await pdf.embedPng(buf); // PNG
    return null; // formato não suportado (webp etc.) — ignora
  } catch { return null; }
}

export async function gerarAvaliacaoCalibracaoPDF({ avaliacao, documento }) {
  const av = avaliacao || {};
  const doc = documento || {};
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }
  const foto = await embutirFoto(pdf, av.fotoEquipamentoUrl);
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
    page.drawText(san("RELATÓRIO DE AVALIAÇÃO DE CALIBRAÇÃO"), { x: x0, y: A4[1] - 38, size: 13, font: bold, color: WHITE });
    page.drawText(san(`${numRAC(av.numero)} · PO-20 · emitido em ${new Date().toLocaleDateString("pt-BR")}`), { x: x0, y: A4[1] - 58, size: 9.5, font, color: rgb(0.8, 0.86, 0.94) });
    page.drawText("Torg Metal · Qualidade · Controle de equipamentos de medição", { x: x0, y: A4[1] - 74, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
    y = A4[1] - h - 22;
  };
  const espaco = (n) => { if (y - n < 60) banda(); };
  const secao = (t) => { y -= 6; espaco(30); page.drawText(san(t), { x: M, y, size: 9, font: bold, color: GRAY }); y -= 5; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 15; };
  const campo = (x, larg, label, valor) => {
    page.drawText(san(label), { x, y, size: 7.5, font, color: GRAY });
    const linhas = quebrar(valor || "—", bold, 9.5, larg);
    linhas.forEach((ln, i) => page.drawText(ln, { x, y: y - 12 - i * 11, size: 9.5, font: bold, color: DARK }));
    return 12 + linhas.length * 11;
  };
  banda();

  // ── Identificação do equipamento + foto ──
  secao("IDENTIFICAÇÃO DO EQUIPAMENTO");
  const fotoBoxW = foto ? 150 : 0;
  const colW = (W - fotoBoxW - (foto ? 18 : 0)) / 2 - 8;
  const topY = y;
  let hL = campo(M, colW, "Equipamento", doc.nome);
  let hR = campo(M + colW + 16, colW, "Identificação (tag / nº série)", av.identificacao);
  y = topY - Math.max(hL, hR) - 8;
  const midY = y;
  hL = campo(M, colW, "Faixa de uso", av.faixaUso);
  hR = campo(M + colW + 16, colW, "Norma / referência", doc.norma);
  y = midY - Math.max(hL, hR) - 6;
  // Foto do equipamento (coluna direita, alinhada ao topo da seção)
  if (foto) {
    const bx = M + W - fotoBoxW, by0 = topY + 2;
    const maxH = topY - y + 6;
    const scale = Math.min(fotoBoxW / foto.width, maxH / foto.height);
    const iw = foto.width * scale, ih = foto.height * scale;
    page.drawRectangle({ x: bx - 4, y: by0 - maxH - 2, width: fotoBoxW + 8, height: maxH + 6, color: SOFT, borderColor: LINE, borderWidth: 0.5 });
    page.drawImage(foto, { x: bx + (fotoBoxW - iw) / 2, y: by0 - (maxH + ih) / 2, width: iw, height: ih });
    page.drawText("Foto do equipamento", { x: bx - 4, y: by0 - maxH - 12, size: 7, font, color: GRAY });
    y = Math.min(y, by0 - maxH - 16);
  }

  // ── Dados do certificado ──
  secao("DADOS DO CERTIFICADO DE CALIBRAÇÃO");
  const cW = W / 4 - 8;
  const cy = y;
  const hcert = Math.max(
    campo(M, cW, "Laboratório", av.laboratorio),
    campo(M + (W / 4), cW, "Nº do certificado", doc.numeroDocumento),
    campo(M + (W / 4) * 2, cW, "Data de calibração", fmtData(doc.dataEmissao)),
    campo(M + (W / 4) * 3, cW, "Validade", doc.dataValidade ? fmtData(doc.dataValidade) : "sem validade"),
  );
  y = cy - hcert - 10;

  // ── Critérios (PO-20) ──
  secao("CRITÉRIOS DE AVALIAÇÃO (PO-20)");
  const criterios = Array.isArray(av.criterios) ? av.criterios : [];
  const cc = [{ t: "Critério", w: W - 96 - 150 }, { t: "Situação", w: 96 }, { t: "Observação", w: 150 }];
  espaco(18);
  page.drawRectangle({ x: M, y: y - 16, width: W, height: 16, color: NAVY });
  let cx = M + 6; for (const c of cc) { page.drawText(c.t, { x: cx, y: y - 11, size: 7.5, font: bold, color: WHITE }); cx += c.w; } y -= 16;
  if (!criterios.length) { page.drawText("Nenhum critério avaliado.", { x: M + 6, y: y - 12, size: 8.5, font, color: GRAY }); y -= 18; }
  criterios.forEach((c, i) => {
    const critL = quebrar(c.criterio || "—", font, 8, cc[0].w - 8);
    const obsL = quebrar(c.observacao || "", font, 7.5, cc[2].w - 8);
    const rh = Math.max(15, Math.max(critL.length, obsL.length || 1) * 9.5 + 5);
    espaco(rh + 2);
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rh, width: W, height: rh, color: SOFT });
    cx = M + 6;
    critL.forEach((ln, k) => page.drawText(ln, { x: cx, y: y - 11 - k * 9.5, size: 8, font, color: DARK })); cx += cc[0].w;
    const s = SIT[c.situacao] || SIT.NA;
    page.drawText(s.t, { x: cx, y: y - 11, size: 8, font: bold, color: s.c }); cx += cc[1].w;
    obsL.forEach((ln, k) => page.drawText(ln, { x: cx, y: y - 11 - k * 9.5, size: 7.5, font, color: GRAY }));
    y -= rh;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
  });

  // Critério de aceitação + parecer
  const bloco = (titulo, texto) => {
    if (!texto) return;
    secao(titulo);
    quebrar(texto, font, 9, W).forEach((ln) => { espaco(12); page.drawText(ln, { x: M, y, size: 9, font, color: DARK }); y -= 12; });
    y -= 4;
  };
  bloco("CRITÉRIO DE ACEITAÇÃO", av.criterioAceitacao);
  bloco("PARECER DA AVALIAÇÃO", av.parecer);

  // ── Conclusão (carimbo) ──
  y -= 6; espaco(60);
  const aprovado = av.conclusao === "APROVADO";
  const reprovado = av.conclusao === "REPROVADO";
  const cor = aprovado ? GREEN : reprovado ? RED : GRAY;
  const bgc = aprovado ? GREEN_BG : reprovado ? RED_BG : SOFT;
  page.drawRectangle({ x: M, y: y - 46, width: W, height: 46, color: bgc, borderColor: cor, borderWidth: 1.2 });
  page.drawText("CONCLUSÃO", { x: M + 16, y: y - 20, size: 9, font: bold, color: GRAY });
  page.drawText(san(conclusaoLabel(av.conclusao).toUpperCase()), { x: M + 16, y: y - 38, size: 20, font: bold, color: cor });
  const info = `${av.avaliadorNome ? "Avaliado por " + san(av.avaliadorNome) : ""}${av.avaliadoEm ? " · " + fmtDT(av.avaliadoEm) : ""}`;
  if (info.trim()) page.drawText(info.trim(), { x: M + W - 16 - font.widthOfTextAtSize(info.trim(), 8.5), y: y - 38, size: 8.5, font, color: GRAY });
  y -= 60;

  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`Torg Metal · Avaliação de Calibração · ${numRAC(av.numero)} · PO-20`), { x: M, y: 28, size: 7.5, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: GRAY });
  });

  return pdf.save();
}
