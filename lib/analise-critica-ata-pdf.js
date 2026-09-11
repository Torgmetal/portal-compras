// FORM 10 — Ata de Reunião da Análise Crítica do Projeto e Desenvolvimento (PO-13 §5.3), em PDF,
// a partir de UMA reunião do bloco 7 do registro da OP. Mesmo padrão Torg do FORM 08.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { refFORM } from "@/lib/sgq-forms";
import { SITUACAO_ACAO } from "@/lib/analise-critica";
import { fmtOP } from "@/lib/utils";

const A4 = [595.28, 841.89], M = 40, W = A4[0] - M * 2;
const NAVY = rgb(0.051, 0.122, 0.235), ORANGE = rgb(0.957, 0.502, 0.122), DARK = rgb(0.1, 0.13, 0.18), GRAY = rgb(0.45, 0.5, 0.56), LINE = rgb(0.85, 0.88, 0.91), LIGHT = rgb(0.96, 0.97, 0.98), WHITE = rgb(1, 1, 1);
const dataCurta = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || "—");
const hojeBR = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** @param {{ op, registro, reuniao }} p — `reuniao` é uma linha de `registro.reunioes` */
export async function gerarAtaAnaliseCriticaPDF({ op, registro, reuniao }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }
  const acp = `ACP-${String(op.numero).replace(/^0+/, "").padStart(3, "0")}`;
  const codigo = `${acp} · ${reuniao.codigo || "Reunião"} · R${registro.revisao || 0}`;
  const san = (s) => String(s ?? "").replace(/×/g, "x").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[–—]/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  const wid = (s, f, size) => f.widthOfTextAtSize(san(s), size);
  const quebra = (s, f, size, max) => { const out = []; for (const par of san(s).split(/\n/)) { let linha = ""; for (const pal of par.split(/\s+/)) { const t = linha ? `${linha} ${pal}` : pal; if (f.widthOfTextAtSize(t, size) <= max || !linha) linha = t; else { out.push(linha); linha = pal; } } out.push(linha); } return out.length ? out : [""]; };
  let page, y, nPag = 0;
  const txt = (s, x, yy, { f = font, size = 9, color = DARK } = {}) => page.drawText(san(s), { x, y: yy, size, font: f, color });
  const rodape = () => { txt(refFORM(10), M, 26, { size: 7.5, color: GRAY }); const nota = "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTAO DA QUALIDADE"; txt(nota, A4[0] / 2 - wid(nota, font, 6.5) / 2, 26, { size: 6.5, color: GRAY }); const pg = `pag. ${nPag}`; txt(pg, A4[0] - M - wid(pg, font, 7.5), 26, { size: 7.5, color: GRAY }); };
  const cabecalho = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 84, width: A4[0], height: 84, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 90, width: A4[0], height: 6, color: ORANGE });
    if (logo) { const lw = 104, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 26 - lh, width: lw, height: lh }); } else txt("TORG METAL", M, A4[1] - 48, { f: bold, size: 16, color: WHITE });
    const t1 = "ATA DE REUNIAO DA ANALISE CRITICA", t2 = "do Projeto e Desenvolvimento - PO-13 §5.3";
    txt(t1, A4[0] - M - wid(t1, bold, 12.5), A4[1] - 38, { f: bold, size: 12.5, color: WHITE });
    txt(t2, A4[0] - M - wid(t2, font, 8.5), A4[1] - 52, { size: 8.5, color: WHITE });
    txt(codigo, A4[0] - M - wid(codigo, bold, 10.5), A4[1] - 70, { f: bold, size: 10.5, color: ORANGE });
  };
  const novaPagina = () => { page = pdf.addPage(A4); nPag++; cabecalho(); rodape(); y = A4[1] - 110; };
  const espaco = (h) => { if (y - h < 60) novaPagina(); };
  const secao = (t) => { espaco(28); txt(t.toUpperCase(), M, y, { f: bold, size: 8.5, color: GRAY }); y -= 5; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINE }); y -= 14; };
  const paragrafo = (s, { size = 9.5, f = font } = {}) => { for (const l of quebra(s || "—", f, size, W)) { espaco(size + 5); txt(l, M, y, { f, size }); y -= size + 4; } y -= 4; };

  novaPagina();
  page.drawRectangle({ x: M, y: y - 62, width: W, height: 66, color: LIGHT, borderColor: LINE, borderWidth: 0.5 });
  const campo = (rot, val, x, yy, w) => { txt(rot.toUpperCase(), x, yy, { f: bold, size: 6.3, color: GRAY }); txt(quebra(val, bold, 8.5, w)[0], x, yy - 10, { f: bold, size: 8.5 }); };
  campo("OP", fmtOP(op.numero), M + 8, y - 8, 70); campo("Cliente", op.cliente || "—", M + 80, y - 8, 190); campo("Obra", op.obra || "—", M + 280, y - 8, 230);
  campo("Reunião", reuniao.codigo || "—", M + 8, y - 34, 70); campo("Data", dataCurta(reuniao.data), M + 80, y - 34, 80); campo("Análise crítica", `${acp} · revisão R${String(registro.revisao || 0).padStart(2, "0")}`, M + 170, y - 34, 170); campo("Eng.º de Projeto", registro.responsavelNome || "—", M + 350, y - 34, 160);
  y -= 78;

  secao("Participantes (PO-13 §5.3: Engenharia, Comercial, Compras, PCP, Produção e Qualidade)");
  paragrafo(reuniao.participantes);
  secao("Pauta");
  paragrafo(reuniao.pauta);
  secao("Decisões");
  paragrafo(reuniao.decisoes);

  // ações do registro — a ata leva todas as abertas e as concluídas desde a reunião anterior
  secao("Ações (plano 5W2H)");
  const acoes = Array.isArray(registro.acoes) ? registro.acoes : [];
  if (!acoes.length) paragrafo("Nenhuma ação registrada.");
  else {
    const cols = [["Ação", 0.1], ["O que", 0.46], ["Quem", 0.16], ["Quando", 0.12], ["Situação", 0.16]], larg = cols.map((c) => c[1] * W), size = 8, lh = 10, pad = 3;
    const cab = () => { page.drawRectangle({ x: M, y: y - 11, width: W, height: 13, color: LIGHT }); let x = M; cols.forEach((c, i) => { txt(c[0].toUpperCase(), x + pad, y - 8, { f: bold, size: 6.5, color: GRAY }); x += larg[i]; }); y -= 15; };
    espaco(40); cab();
    const hoje = new Date().toISOString().slice(0, 10);
    for (const a of acoes) {
      const atras = a.situacao !== "CONCLUIDA" && a.quando && a.quando < hoje;
      const cel = [a.codigo || "—", a.acao || "—", a.quem || "—", dataCurta(a.quando), atras ? "ATRASADA" : (SITUACAO_ACAO[a.situacao]?.label || a.situacao || "—")].map((v, i) => quebra(v, font, size, larg[i] - pad * 2));
      const h = Math.max(...cel.map((c) => c.length)) * lh + pad * 2;
      if (y - h < 60) { novaPagina(); cab(); }
      let x = M; cel.forEach((linhas, i) => { linhas.forEach((l, j) => txt(l, x + pad, y - pad - 7 - j * lh, { size, color: i === 4 && atras ? rgb(0.75, 0.22, 0.17) : DARK, f: i === 4 ? bold : font })); x += larg[i]; });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + W, y: y - h }, thickness: 0.4, color: LINE }); y -= h;
    }
    y -= 8;
  }

  // assinaturas: uma linha por participante (nomes separados por vírgula ou ponto e vírgula)
  secao("Assinaturas");
  const nomes = String(reuniao.participantes || "").split(/[;,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (!nomes.length) paragrafo("—");
  for (let i = 0; i < nomes.length; i += 2) {
    espaco(40); y -= 22;
    for (const [k, nome] of [[0, nomes[i]], [1, nomes[i + 1]]]) { if (!nome) continue; const x = M + k * (W / 2 + 10); page.drawLine({ start: { x, y }, end: { x: x + W / 2 - 20, y }, thickness: 0.6, color: DARK }); txt(nome, x, y - 10, { size: 8 }); }
    y -= 14;
  }
  y -= 10; espaco(14);
  txt(`Ata ${reuniao.ataAceita ? "aceita por todos os participantes" : "aguardando aceite"} · emitida pelo portal em ${hojeBR()} a partir do registro ${acp}.`, M, y, { size: 7, color: GRAY });

  const bytes = await pdf.save();
  return { bytes, filename: `FORM 10 - Ata ${reuniao.codigo || "reuniao"} Analise Critica ${fmtOP(op.numero)}.pdf` };
}
