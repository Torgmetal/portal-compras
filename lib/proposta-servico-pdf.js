import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dadosProposta } from "@/lib/proposta-servico-docx";

// Geração da PROPOSTA (PTC) direto em PDF (pdf-lib) — mesma linha visual dos
// outros PDFs do portal (Data Book / Relatórios), sem depender de conversão
// externa. Só entram os serviços selecionados; documentos, perfis, CQ, dias,
// revisões vêm de dadosProposta().

const A4 = [595.28, 841.89];
const M = 48;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.15, 0.19, 0.25);
const GRAY = rgb(0.36, 0.44, 0.5);
const LINE = rgb(0.82, 0.85, 0.89);
const LIGHT = rgb(0.95, 0.96, 0.98);
const WHITE = rgb(1, 1, 1);

// Sanitiza texto pro WinAnsi (Helvetica) — evita "cannot encode" do pdf-lib.
// Mantém Latin-1 (<=0xFF) + extras do WinAnsi; troca mu grego->micro e nbsp; resto vira "?".
const WINANSI_EXTRA = new Set([0x20ac,0x201a,0x0192,0x201e,0x2026,0x2020,0x2021,0x02c6,0x2030,0x0160,0x2039,0x0152,0x017d,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x02dc,0x2122,0x0161,0x203a,0x0153,0x017e,0x0178]);
const san = (s) => String(s ?? "").replace(/\u03bc/g,"\u00b5").replace(/[\u00a0\u2007\u202f]/g," ").split("").map((ch)=>{const c=ch.codePointAt(0);return c<=0xff||WINANSI_EXTRA.has(c)?ch:"?";}).join("");

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
    "Não nos responsabilizamos por erros de projeto – a conferência e a validação das informações contidas nos projetos e arquivos enviados são de responsabilidade exclusiva da contratante, e eventuais retrabalhos, correções ou acréscimos decorrentes de tais erros terão seus custos repassados à contratante.",
  ],
  prazo: "Conforme cronograma a ser desenvolvido após aprovação do contrato.",
  inclusos: ["Descarga dos materiais;", "Consumíveis para execução dos trabalhos;", "Fornecimento de relatório visual dos trabalhos;", "Fornecimento de uma cópia de data book e projetos em arquivo eletrônico."],
  exclusos: ["Montagem das estruturas metálicas;", "Fornecimento de materiais;", "Colocação de componentes em vigas cortadas;", "Serviços de engenharia;", "Aproveitamento de materiais;", "Frete;", "Despesas com ensaios tecnológicos;", "E tudo o mais não expressamente orçado."],
  resp: [
    "Fornecer e enviar os materiais a serem beneficiados, com frete por sua conta e risco, posto nossa fábrica, nas quantidades, dimensões e especificações previstas nos projetos, considerando as margens necessárias ao aproveitamento de chapas (nesting);",
    "Entregar os materiais identificados e isentos de empenamentos, oxidação excessiva ou danos que comprometam o beneficiamento;",
    "Fornecer os projetos detalhados e os arquivos nas extensões .IGS ou .NC1, respondendo pela exatidão das informações neles contidas;",
    "Conferir as quantidades e as condições das peças no ato da retirada – eventuais divergências deverão ser apontadas por escrito em até 05 (cinco) dias úteis do recebimento;",
    "Eventuais atrasos no envio de materiais, projetos ou informações necessárias à execução serão refletidos no cronograma e não caracterizarão descumprimento de prazo de nossa parte.",
  ],
  impostos: "Todos os impostos inclusos — empresa optante pelo regime de lucro real.",
  validade: "Esta proposta tem validade de 05 (cinco) dias.",
  modalidade: "Preço variável conforme a modalidade de medição contratada para cada serviço — por peça ou por quilograma (kg) —, mediante valor unitário fixo.",
  fecho: "Sendo o que se apresenta para o momento, agradecemos a atenção dispensada e nos colocamos ao seu inteiro dispor para esclarecimentos ou outros contatos que se façam necessários.",
};
const DESC_SERV = { CORTE_FURACAO: FIXO.corte, SOLDA: FIXO.solda, JATEAMENTO: FIXO.jato, PINTURA: FIXO.pintura };

export async function gerarPropostaPDF(o, now = new Date()) {
  const d = dadosProposta(o, now);
  const servs = Array.isArray(o.servicos) ? o.servicos : [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0] - 2 * M;

  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const quebrar = (txt, f, size, maxW) => {
    const out = []; let l = "";
    for (const wd of san(txt).split(/\s+/)) {
      const t = l ? l + " " + wd : wd;
      if (f.widthOfTextAtSize(t, size) <= maxW) l = t;
      else { if (l) out.push(l); l = wd; }
    }
    if (l) out.push(l);
    return out.length ? out : [""];
  };
  const fit = (str, f, size, maxW) => {
    let s = san(str);
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  let page, y;
  const rodape = () => {
    page.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.6, color: LINE });
    page.drawText("TORG METAL", { x: M, y: 30, size: 7.5, font: bold, color: GRAY });
    page.drawText(san(d.numeroPtc), { x: A4[0] - M - font.widthOfTextAtSize(san(d.numeroPtc), 7.5), y: 30, size: 7.5, font, color: GRAY });
  };
  const novaPagina = () => { if (page) rodape(); page = pdf.addPage(A4); y = A4[1] - M; return page; };
  const espaco = (h) => { if (y - h < 52) novaPagina(); };

  const para = (texto, { size = 9.5, cor = DARK, x0 = M, maxW = W, gap = 3.5, lh = 4 } = {}) => {
    for (const bloco of san(texto).split(/\n/)) {
      if (!bloco.trim()) { y -= size; continue; }
      for (const ln of quebrar(bloco, font, size, maxW)) {
        espaco(size + lh);
        page.drawText(ln, { x: x0, y, size, font, color: cor });
        y -= size + lh;
      }
    }
    y -= gap;
  };
  const bullets = (itens, { size = 9.5 } = {}) => {
    for (const it of itens) {
      const linhas = quebrar(it, font, size, W - 14);
      linhas.forEach((ln, i) => {
        espaco(size + 4);
        if (i === 0) page.drawText("•", { x: M + 2, y, size, font: bold, color: ORANGE });
        page.drawText(ln, { x: M + 14, y, size, font, color: DARK });
        y -= size + 4;
      });
    }
    y -= 3;
  };
  const secao = (numero, titulo) => {
    const h = 22; espaco(h + 30);
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: NAVY });
    page.drawRectangle({ x: M, y: y - h, width: 4, height: h, color: ORANGE });
    if (numero) page.drawText(numero, { x: M + 12, y: y - h + 6.5, size: 10, font: bold, color: ORANGE });
    page.drawText(fit(titulo, bold, 10.5, W - 60), { x: M + (numero ? 40 : 12), y: y - h + 6.5, size: 10.5, font: bold, color: WHITE });
    y -= h + 11;
  };
  const sub = (numero, titulo) => {
    espaco(22);
    page.drawText(san((numero ? numero + " " : "") + titulo), { x: M, y, size: 10, font: bold, color: NAVY });
    y -= 15;
  };

  // ─── Cabeçalho ───
  novaPagina();
  const bh = 60;
  page.drawRectangle({ x: 0, y: A4[1] - bh, width: A4[0], height: bh, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - bh, width: A4[0], height: 3, color: ORANGE });
  if (logo) { const lw = 92, lh2 = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - bh / 2 - lh2 / 2, width: lw, height: lh2 }); }
  const tit = "PROPOSTA COMERCIAL";
  page.drawText(tit, { x: A4[0] - M - bold.widthOfTextAtSize(tit, 14), y: A4[1] - 30, size: 14, font: bold, color: WHITE });
  page.drawText(san(d.numeroPtc), { x: A4[0] - M - font.widthOfTextAtSize(san(d.numeroPtc), 10), y: A4[1] - 46, size: 10, font, color: rgb(0.75, 0.82, 0.92) });
  y = A4[1] - bh - 22;
  page.drawText(san(`Conchal, ${d.dataProposta}`), { x: M, y, size: 9.5, font, color: GRAY }); y -= 18;

  // Tarja de proposta consolidada
  if (o.consolidadaEm) {
    const th = 20;
    page.drawRectangle({ x: M, y: y - th, width: W, height: th, color: rgb(0.11, 0.47, 0.29) });
    const t = "PROPOSTA CONSOLIDADA";
    page.drawText(t, { x: M + (W - bold.widthOfTextAtSize(t, 11)) / 2, y: y - th + 6, size: 11, font: bold, color: WHITE });
    y -= th + 14;
  } else { y -= 4; }

  // ─── Destinatário ───
  page.drawText("À", { x: M, y, size: 9.5, font, color: DARK }); y -= 14;
  page.drawText(san(d.cliente || "—"), { x: M, y, size: 11, font: bold, color: NAVY }); y -= 14;
  if (d.endereco) { para(d.endereco, { gap: 0, lh: 3 }); }
  const kv = (k, v) => { if (!v) return; page.drawText(san(k), { x: M, y, size: 9, font: bold, color: GRAY }); page.drawText(san(v), { x: M + 58, y, size: 9, font, color: DARK }); y -= 13; };
  y -= 4;
  kv("A/C:", d.contato); kv("E-mail:", d.email); kv("Fone:", d.telefone); kv("Ref.:", d.obra);
  y -= 6;

  // ─── Tabela de revisões ───
  const revW = [50, 90, W - 140];
  const revH = 16;
  espaco(revH * (d.revisoes.length + 1) + 10);
  const drawRevRow = (cells, isHeader) => {
    page.drawRectangle({ x: M, y: y - revH, width: W, height: revH, color: isHeader ? NAVY : WHITE, borderColor: LINE, borderWidth: 0.5 });
    let cx = M;
    cells.forEach((c, i) => {
      page.drawText(fit(c, isHeader ? bold : font, 8, revW[i] - 8), { x: cx + 5, y: y - revH + 5, size: 8, font: isHeader ? bold : font, color: isHeader ? WHITE : DARK });
      cx += revW[i];
    });
    y -= revH;
  };
  drawRevRow(["Revisão", "Data", "Motivo"], true);
  d.revisoes.forEach((r) => drawRevRow([r.rev_num, r.rev_data, r.rev_motivo], false));
  y -= 14;

  // ─── Intro ───
  para(FIXO.intro1); para(FIXO.intro2);

  // ─── 1. PROPOSTA TÉCNICA ───
  secao("1.", "PROPOSTA TÉCNICA");
  sub("1.1", "Escopo");
  para(`Serviços de ${d.escopo}, conforme projetos, documentos e planilhas fornecidos pela contratante.`);
  sub("1.2", "Documentos referentes");
  bullets(d.docs.length ? d.docs.map((x) => x.doc) : ["A definir."]);
  sub("1.3", "Descrição dos serviços");
  servs.forEach((s) => {
    page.drawText(san(({ CORTE_FURACAO: "Corte a laser", SOLDA: "Solda", JATEAMENTO: "Jateamento", PINTURA: "Pintura" }[s]) || s), { x: M, y, size: 9.5, font: bold, color: DARK }); y -= 14;
    para(DESC_SERV[s] || "—", { x0: M });
    if (s === "CORTE_FURACAO") {
      bullets([`Material: ${d.corte_material};`, `Espessura: ${d.corte_espessura};`, `Quantidade: ${d.corte_qtd};`, `Modalidade de medição: ${d.corte_modalidade}.`]);
    }
  });
  sub("1.4", "Elaborações dos projetos");
  bullets(FIXO.elab);
  sub("1.5", "Controle de qualidade");
  para(d.cq);
  sub("1.6", "Prazo de execução");
  para(FIXO.prazo);
  sub("1.7", "Inclusos");
  bullets(d.inclusos);
  sub("1.8", "Exclusos");
  bullets(d.exclusos);
  sub("1.9", "Responsabilidades da contratante");
  bullets(FIXO.resp);

  // ─── 2. PROPOSTA COMERCIAL ───
  secao("2.", "PROPOSTA COMERCIAL");
  sub("2.1", "Valores dos serviços");
  // tabela de preços
  const cols = [0.07, 0.33, 0.13, 0.14, 0.16, 0.17].map((f) => f * W);
  const th = 18;
  const cellText = (t, cx, cw, ty, f, color, alignRight) => {
    const s = fit(t, f, 8, cw - 8);
    const tx = alignRight ? cx + cw - 5 - f.widthOfTextAtSize(s, 8) : cx + 5;
    page.drawText(s, { x: tx, y: ty, size: 8, font: f, color });
  };
  const drawRow = (cells, { header, total } = {}) => {
    espaco(th + 4);
    page.drawRectangle({ x: M, y: y - th, width: W, height: th, color: header ? NAVY : total ? LIGHT : WHITE, borderColor: LINE, borderWidth: 0.5 });
    let cx = M;
    cells.forEach((c, i) => {
      const f = header || total ? bold : font;
      cellText(c, cx, cols[i], y - th + 5.5, f, header ? WHITE : DARK, i >= 3);
      cx += cols[i];
    });
    y -= th;
  };
  drawRow(["Item", "Serviço", "Unid.", "Qtd.", "Valor unit.", "Valor total"], { header: true });
  d.servicos.forEach((s) => drawRow([s.item, s.nome, s.unid, s.qtd, s.vu, s.vt]));
  drawRow(["", "VALOR TOTAL", "", "", "", d.valorTotal], { total: true });
  y -= 14;
  sub("2.2", "Impostos");
  para(FIXO.impostos);
  sub("2.3", "Pagamentos");
  para(`Material finalizado para embarque, vencíveis em ${d.dias} dias a contar da data de emissão da NF respectiva.`);
  sub("2.4", "Validade da proposta");
  para(FIXO.validade);
  sub("2.5", "Modalidade");
  para(FIXO.modalidade);

  // ─── Fecho + assinaturas ───
  y -= 6; para(FIXO.fecho); y -= 6;
  para("Atenciosamente,", { gap: 2 });
  para("Torg Metal — Comercial", { size: 10 });
  espaco(70); y -= 34;
  const colW = (W - 40) / 2;
  [["Cliente", M], ["Torg Metal", M + colW + 40]].forEach(([lbl, x]) => {
    page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.8, color: DARK });
    page.drawText(san(lbl), { x, y: y - 12, size: 9, font: bold, color: DARK });
    page.drawText("Responsável:", { x, y: y - 26, size: 8.5, font, color: GRAY });
    page.drawText("RG/CPF:", { x, y: y - 40, size: 8.5, font, color: GRAY });
  });
  rodape();

  const bytes = await pdf.save();
  return { bytes, numeroPtc: d.numeroPtc };
}
