import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dadosProposta } from "@/lib/proposta-servico-docx";

// Geração da PROPOSTA (PTC) em PDF (pdf-lib) com formatação padrão ABNT
// (NBR 14724): margens 3 cm (esq/sup) × 2 cm (dir/inf), corpo justificado com
// recuo de 1ª linha, entrelinha 1,5, seções numeradas em negrito e paginação.

const PW = 595.28, PH = 841.89;           // A4
const CM = 28.35;                          // 1 cm em pt
const ML = Math.round(3 * CM);             // margem esquerda 3 cm
const MR = Math.round(2 * CM);             // margem direita 2 cm
const MT = Math.round(3 * CM);             // margem superior 3 cm
const MB = Math.round(2 * CM);             // margem inferior 2 cm
const W = PW - ML - MR;
const SIZE = 11;                            // corpo
const LH = Math.round(SIZE * 1.6);         // entrelinha ~1,6 (um pouco mais aberta que ABNT p/ respirar)
const INDENT = Math.round(1.25 * CM);      // recuo de 1ª linha ~1,25 cm

const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.12, 0.15, 0.2);
const GRAY = rgb(0.36, 0.44, 0.5);
const LINE = rgb(0.8, 0.83, 0.88);
const LIGHT = rgb(0.95, 0.96, 0.98);
const WHITE = rgb(1, 1, 1);

const WINANSI_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);
const san = (s) => String(s ?? "").replace(/μ/g, "µ").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");

const FIXO = {
  intro1: "É com satisfação que nos valemos desta oportunidade para apresentar nossa proposta técnica comercial para execução do serviço em epígrafe.",
  intro2: "Para quaisquer dúvidas referentes às informações contidas neste documento, os departamentos técnico e comercial estarão sempre à disposição com o intuito de prestar esclarecimentos ou receber solicitações adicionais para revisões, complementos ou correções que venham a se fazer necessárias.",
  corte: "Serviço de corte a laser de chapas e peças metálicas, incluindo furação e recortes, executado conforme desenhos e arquivos eletrônicos fornecidos pela contratante, com programação de aproveitamento de chapas (nesting) e conferência dimensional das peças.",
  solda: "Serviço de solda de componentes e conjuntos metálicos pelo processo GMAW (MIG/MAG), conforme projetos e especificações fornecidos pela contratante.",
  jato: "Serviço de jateamento abrasivo de peças metálicas ao metal quase branco, padrão Sa 2½, conforme especificação da contratante.",
  pintura: "Serviço de pintura industrial de peças metálicas, conforme sistema de pintura especificado pela contratante.",
  elab: [
    "Ficará por conta da contratante o fornecimento dos projetos detalhados (detalhamento para fabricação), sendo a sua entrega condição para o início dos trabalhos e para a programação da produção;",
    "Os arquivos deverão ser fornecidos nas extensões .IGS ou .NC1, compatíveis com nossos equipamentos e softwares de programação;",
    "Não nos responsabilizamos por erros de projeto — a conferência e a validação das informações contidas nos projetos e arquivos enviados são de responsabilidade exclusiva da contratante, e eventuais retrabalhos, correções ou acréscimos decorrentes de tais erros terão seus custos repassados à contratante.",
  ],
  prazo: "Conforme cronograma a ser desenvolvido após aprovação do contrato.",
  resp: [
    "Fornecer e enviar os materiais a serem beneficiados, com frete por sua conta e risco, posto nossa fábrica, nas quantidades, dimensões e especificações previstas nos projetos, considerando as margens necessárias ao aproveitamento de chapas (nesting);",
    "Entregar os materiais identificados e isentos de empenamentos, oxidação excessiva ou danos que comprometam o beneficiamento;",
    "Fornecer os projetos detalhados e os arquivos nas extensões .IGS ou .NC1, respondendo pela exatidão das informações neles contidas;",
    "Conferir as quantidades e as condições das peças no ato da retirada — eventuais divergências deverão ser apontadas por escrito em até 05 (cinco) dias úteis do recebimento;",
    "Eventuais atrasos no envio de materiais, projetos ou informações necessárias à execução serão refletidos no cronograma e não caracterizarão descumprimento de prazo de nossa parte.",
  ],
  impostos: "Todos os impostos inclusos — empresa optante pelo regime de lucro real.",
  validade: "Esta proposta tem validade de 05 (cinco) dias.",
  modalidade: "Preço variável conforme a modalidade de medição contratada para cada serviço — por peça ou por quilograma (kg) —, mediante valor unitário fixo.",
  fecho: "Sendo o que se apresenta para o momento, agradecemos a atenção dispensada e nos colocamos ao seu inteiro dispor para esclarecimentos ou outros contatos que se façam necessários.",
};
const DESC_SERV = { CORTE_FURACAO: FIXO.corte, SOLDA: FIXO.solda, JATEAMENTO: FIXO.jato, PINTURA: FIXO.pintura };
const LABEL = { CORTE_FURACAO: "Corte a laser", SOLDA: "Solda", JATEAMENTO: "Jateamento", PINTURA: "Pintura" };

export async function gerarPropostaPDF(o, now = new Date()) {
  const d = dadosProposta(o, now);
  const servs = Array.isArray(o.servicos) ? o.servicos : [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const fit = (str, f, size, maxW) => { let s = san(str); if (f.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1); return s + "…"; };
  // quebra respeitando 1ª linha mais estreita (recuo)
  const wrap = (txt, f, size, firstW, restW) => {
    const lines = []; let cur = [], curW = 0, maxW = firstW;
    for (const w of san(txt).split(/\s+/).filter(Boolean)) {
      const ww = f.widthOfTextAtSize(w, size);
      const add = cur.length ? f.widthOfTextAtSize(" ", size) + ww : ww;
      if (!cur.length || curW + add <= maxW) { cur.push(w); curW += add; }
      else { lines.push({ words: cur, maxW }); cur = [w]; curW = ww; maxW = restW; }
    }
    if (cur.length) lines.push({ words: cur, maxW });
    return lines.length ? lines : [{ words: [""], maxW: firstW }];
  };

  const pages = [];
  let page, y;
  const drawLine = (words, x0, yy, maxW, noJust, size, f, cor) => {
    if (noJust || words.length <= 1) { let cx = x0; for (const w of words) { page.drawText(w, { x: cx, y: yy, size, font: f, color: cor }); cx += f.widthOfTextAtSize(w, size) + f.widthOfTextAtSize(" ", size); } return; }
    const wordsW = words.reduce((a, w) => a + f.widthOfTextAtSize(w, size), 0);
    const gap = (maxW - wordsW) / (words.length - 1);
    let cx = x0; for (const w of words) { page.drawText(w, { x: cx, y: yy, size, font: f, color: cor }); cx += f.widthOfTextAtSize(w, size) + gap; }
  };
  const novaPagina = () => { page = pdf.addPage([PW, PH]); pages.push(page); y = PH - MT; return page; };
  const espaco = (h) => { if (y - h < MB + 22) novaPagina(); };
  const para = (texto, { justify = true, indent = INDENT, size = SIZE, cor = DARK, x0 = ML, gapAfter = 11 } = {}) => {
    for (const bloco of san(texto).split(/\n/)) {
      if (!bloco.trim()) { y -= LH; continue; }
      const lines = wrap(bloco, font, size, W - indent, W);
      lines.forEach((ln, li) => { espaco(LH); drawLine(ln.words, x0 + (li === 0 ? indent : 0), y, ln.maxW, li === lines.length - 1 || !justify, size, font, cor); y -= LH; });
    }
    y -= gapAfter;
  };
  const bullets = (itens) => {
    for (const it of itens) {
      const lines = wrap(it, font, SIZE, W - 18, W - 18);
      lines.forEach((ln, li) => { espaco(LH); if (li === 0) page.drawText("•", { x: ML + 2, y, size: SIZE, font: bold, color: ORANGE }); drawLine(ln.words, ML + 18, y, W - 18, li === lines.length - 1, SIZE, font, DARK); y -= LH; });
      y -= 4;
    }
    y -= 7;
  };
  const secao = (num, titulo) => { espaco(LH + 26); y -= 16; page.drawText(san(`${num}  ${titulo}`).toUpperCase(), { x: ML, y, size: 12, font: bold, color: NAVY }); y -= 6; page.drawLine({ start: { x: ML, y }, end: { x: ML + W, y }, thickness: 1.2, color: ORANGE }); y -= Math.round(LH * 1.1); };
  const sub = (num, titulo) => { espaco(LH + 14); y -= 7; page.drawText(san(`${num}  ${titulo}`), { x: ML, y, size: 11.5, font: bold, color: NAVY }); y -= LH; };

  // ── Timbre (letterhead) ──
  novaPagina();
  const bh = 54;
  page.drawRectangle({ x: 0, y: PH - bh, width: PW, height: bh, color: NAVY });
  page.drawRectangle({ x: 0, y: PH - bh, width: PW, height: 3, color: ORANGE });
  if (logo) { const lw = 88, lh2 = (logo.height / logo.width) * lw; page.drawImage(logo, { x: ML, y: PH - bh / 2 - lh2 / 2, width: lw, height: lh2 }); }
  page.drawText("PROPOSTA COMERCIAL", { x: PW - MR - wid("PROPOSTA COMERCIAL", bold, 13), y: PH - 26, size: 13, font: bold, color: WHITE });
  page.drawText(san(d.numeroPtc), { x: PW - MR - wid(d.numeroPtc, font, 10), y: PH - 42, size: 10, font, color: rgb(0.75, 0.82, 0.92) });
  y = PH - bh - 24;

  para(`Conchal, ${d.dataProposta}.`, { justify: false, indent: 0, size: 10, cor: GRAY, gapAfter: 12 });

  // Destinatário
  para("À", { justify: false, indent: 0, gapAfter: 2 });
  page.drawText(san(d.cliente || "—"), { x: ML, y, size: 12, font: bold, color: NAVY }); y -= LH;
  if (d.endereco) para(d.endereco, { justify: false, indent: 0, gapAfter: 2 });
  const kv = (k, v) => { if (!v) return; espaco(LH); page.drawText(san(k), { x: ML, y, size: 10, font: bold, color: GRAY }); page.drawText(fit(v, font, 10, W - 70), { x: ML + 64, y, size: 10, font, color: DARK }); y -= Math.round(LH * 0.9); };
  y -= 4; kv("A/C:", d.contato); kv("E-mail:", d.email); kv("Fone:", d.telefone); kv("Ref.:", d.obra); y -= 8;

  // Tabela de revisões
  const revW = [60, 95, W - 155], revH = 17;
  const revRow = (cells, hdr) => { espaco(revH); page.drawRectangle({ x: ML, y: y - revH, width: W, height: revH, color: hdr ? NAVY : WHITE, borderColor: LINE, borderWidth: 0.5 }); let cx = ML; cells.forEach((c, i) => { page.drawText(fit(c, hdr ? bold : font, 8.5, revW[i] - 8), { x: cx + 5, y: y - revH + 5.5, size: 8.5, font: hdr ? bold : font, color: hdr ? WHITE : DARK }); cx += revW[i]; }); y -= revH; };
  revRow(["Revisão", "Data", "Motivo"], true);
  d.revisoes.forEach((r) => revRow([r.rev_num, r.rev_data, r.rev_motivo], false));
  y -= 12;

  if (o.consolidadaEm) { espaco(22); page.drawRectangle({ x: ML, y: y - 20, width: W, height: 20, color: rgb(0.11, 0.47, 0.29) }); const t = "PROPOSTA CONSOLIDADA"; page.drawText(t, { x: ML + (W - wid(t, bold, 11)) / 2, y: y - 20 + 6, size: 11, font: bold, color: WHITE }); y -= 34; }

  para(FIXO.intro1); para(FIXO.intro2);

  // 1. PROPOSTA TÉCNICA
  secao("1.", "Proposta Técnica");
  sub("1.1", "Escopo");
  para(`Serviços de ${d.escopo}, conforme projetos, documentos e planilhas fornecidos pela contratante.`);
  sub("1.2", "Documentos referentes");
  bullets(d.docs.length ? d.docs.map((x) => x.doc) : ["A definir."]);
  sub("1.3", "Descrição dos serviços");
  servs.forEach((s) => {
    espaco(LH); page.drawText(san(LABEL[s] || s), { x: ML, y, size: 11, font: bold, color: DARK }); y -= LH;
    para(DESC_SERV[s] || "—");
    if (s === "CORTE_FURACAO") bullets([`Material: ${d.corte_material};`, `Espessura: ${d.corte_espessura};`, `Quantidade: ${d.corte_qtd};`, `Modalidade de medição: ${d.corte_modalidade}.`]);
  });
  sub("1.4", "Elaboração dos projetos"); bullets(FIXO.elab);
  sub("1.5", "Controle de qualidade"); para(d.cq);
  sub("1.6", "Prazo de execução"); para(FIXO.prazo);
  sub("1.7", "Inclusos"); bullets(d.inclusos);
  sub("1.8", "Exclusos"); bullets(d.exclusos);
  sub("1.9", "Responsabilidades da contratante"); bullets(FIXO.resp);

  // 2. PROPOSTA COMERCIAL
  secao("2.", "Proposta Comercial");
  sub("2.1", "Valores dos serviços");
  const cols = [0.07, 0.33, 0.13, 0.14, 0.16, 0.17].map((f) => f * W), th = 19;
  const trow = (cells, o2 = {}) => { espaco(th); page.drawRectangle({ x: ML, y: y - th, width: W, height: th, color: o2.header ? NAVY : o2.total ? LIGHT : WHITE, borderColor: LINE, borderWidth: 0.5 }); let cx = ML; cells.forEach((c, i) => { const f = o2.header || o2.total ? bold : font; const s = fit(c, f, 9, cols[i] - 8); page.drawText(s, { x: i >= 3 ? cx + cols[i] - 5 - f.widthOfTextAtSize(s, 9) : cx + 5, y: y - th + 6, size: 9, font: f, color: o2.header ? WHITE : DARK }); cx += cols[i]; }); y -= th; };
  trow(["Item", "Serviço", "Unid.", "Qtd.", "Valor unit.", "Valor total"], { header: true });
  d.servicos.forEach((s) => trow([s.item, s.nome, s.unid, s.qtd, s.vu, s.vt]));
  trow(["", "VALOR TOTAL", "", "", "", d.valorTotal], { total: true });
  y -= 12;
  sub("2.2", "Impostos"); para(FIXO.impostos);
  sub("2.3", "Condições de pagamento"); para(`Material finalizado para embarque, vencíveis em ${d.dias} dias a contar da data de emissão da nota fiscal respectiva.`);
  sub("2.4", "Validade da proposta"); para(FIXO.validade);
  sub("2.5", "Modalidade"); para(FIXO.modalidade);

  y -= 6; para(FIXO.fecho);
  y -= 10; para("Atenciosamente,", { justify: false, indent: 0, gapAfter: 2 });
  page.drawText("Torg Metal — Departamento Comercial", { x: ML, y, size: 11, font: bold, color: NAVY }); y -= LH;

  espaco(72); y -= 40;
  const colW = (W - 40) / 2;
  [["Cliente", ML], ["Torg Metal", ML + colW + 40]].forEach(([lbl, x]) => {
    page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.8, color: DARK });
    page.drawText(san(lbl), { x, y: y - 13, size: 10, font: bold, color: DARK });
    page.drawText("Responsável:", { x, y: y - 28, size: 9, font, color: GRAY });
    page.drawText("RG/CPF:", { x, y: y - 43, size: 9, font, color: GRAY });
  });

  // Paginação (rodapé) — pág X de N + ref
  const total = pages.length;
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: ML, y: MB - 6 }, end: { x: PW - MR, y: MB - 6 }, thickness: 0.5, color: LINE });
    pg.drawText(san(d.numeroPtc), { x: ML, y: MB - 18, size: 8, font, color: GRAY });
    const pn = `${i + 1} / ${total}`;
    pg.drawText(pn, { x: PW - MR - font.widthOfTextAtSize(pn, 8), y: MB - 18, size: 8, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, numeroPtc: d.numeroPtc };
}
