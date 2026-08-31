import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { refFORM } from "@/lib/sgq-forms";
import { fmtOP } from "@/lib/utils";
import { dataHoraBR } from "./data-br";

// GUIA DE REMESSA DE DOCUMENTOS (FORM 09) — a que o PCP emite ao entregar desenho ao setor.
//
// Vitor (31/08/2026): "precisamos que gere essa mesma estrutura para o PCP, onde criamos a aba de
// GRD". A aba já tinha o CONTROLE das liberações; faltava a GUIA — o documento numerado que prova,
// numa auditoria, o que o PCP entregou, a quem e quando.
//
// ⚠ NÃO É A GUIA DA ENGENHARIA. Aquela sai do Tekla e mora na pasta 13. GRD, com série própria de
// 1 a 481. Esta é do PCP, com série própria — dois setores disputando a mesma numeração seria
// exatamente o que um controle de documentos não pode ter.
//
// ⚠⚠ O QUE VAI IMPRESSO É O SNAPSHOT DA EMISSÃO. O R de cada marca é o que estava carimbado no
// papel que desceu para a fábrica; se o CMR mudar depois, a guia continua provando o que foi
// entregue naquele dia — que é a única coisa que uma guia precisa provar.

const A4 = [595.28, 841.89];
const M = 40;
const W = A4[0] - M * 2;
const NAVY = rgb(0.051, 0.122, 0.235);
const ORANGE = rgb(0.957, 0.502, 0.122);
const DARK = rgb(0.1, 0.13, 0.18);
const GRAY = rgb(0.45, 0.5, 0.56);
const LINE = rgb(0.85, 0.88, 0.91);
const LIGHT = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

/** GRD-PCP-014/2026 — a série do PCP, legível e impossível de confundir com a da Engenharia. */
export const numGrdPcp = (numero, ano) => `GRD-PCP-${String(numero).padStart(3, "0")}/${ano}`;

export async function gerarGuiaPcpPDF(g) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  let page, y;
  const san = (s) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  const wid = (s, f, size) => f.widthOfTextAtSize(san(s), size);
  const txt = (s, x, yy, { f = font, size = 9, color = DARK } = {}) =>
    page.drawText(san(s), { x, y: yy, size, font: f, color });
  const corta = (s, f, size, max) => {
    let t = san(s);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", size) > max) t = t.slice(0, -1);
    return t + "...";
  };

  const rodape = () => {
    const ref = refFORM(9);
    txt(ref, M, 26, { size: 7.5, color: GRAY });
    const nota = "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTAO DA QUALIDADE";
    txt(nota, A4[0] - M - wid(nota, font, 6.5), 26, { size: 6.5, color: GRAY });
  };

  const cabecalho = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 98, width: A4[0], height: 6, color: ORANGE });
    if (logo) { const lw = 110, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 30 - lh, width: lw, height: lh }); }
    else txt("TORG METAL", M, A4[1] - 50, { f: bold, size: 17, color: WHITE });
    const t1 = "GUIA DE REMESSA", t2 = "DE DOCUMENTOS";
    txt(t1, A4[0] - M - wid(t1, bold, 14), A4[1] - 40, { f: bold, size: 14, color: WHITE });
    txt(t2, A4[0] - M - wid(t2, bold, 14), A4[1] - 56, { f: bold, size: 14, color: WHITE });
    const cod = numGrdPcp(g.numero, g.ano);
    txt(cod, A4[0] - M - wid(cod, bold, 10.5), A4[1] - 74, { f: bold, size: 10.5, color: ORANGE });
  };

  const novaPagina = () => { page = pdf.addPage(A4); cabecalho(); rodape(); y = A4[1] - 118; };
  const espaco = (h) => { if (y - h < 48) novaPagina(); };

  novaPagina();

  /* Identificação — os campos que a guia precisa responder sozinha */
  const pares = [
    ["OP", fmtOP(g.opNumero)],
    ["Obra / cliente", [g.obra, g.cliente].filter(Boolean).join(" · ") || "—"],
    ["De", "PCP"],
    ["Para", g.setor || "Producao"],
    ["Emitida em", dataHoraBR(g.emitidoEm)],
    ["Emitida por", g.emitidoPorNome || "—"],
  ];
  const colW = W / 2;
  for (let i = 0; i < pares.length; i += 2) {
    espaco(26);
    for (let j = 0; j < 2; j++) {
      const p2 = pares[i + j]; if (!p2) continue;
      const x = M + j * colW;
      txt(p2[0], x, y - 8, { size: 7.5, color: GRAY });
      txt(corta(p2[1] || "—", bold, 9, colW - 14), x, y - 19, { f: bold, size: 9 });
    }
    y -= 28;
  }

  /* Tabela dos documentos entregues */
  y -= 6;
  const cols = [
    { t: "Item", w: 32, a: "l" },
    { t: "Marca", w: 96, a: "l" },
    { t: "Documento", w: 176, a: "l" },
    { t: "Form.", w: 44, a: "c" },
    { t: "Rastreabilidade (R)", w: 132, a: "l" },
    { t: "Copias", w: 35, a: "r" },
  ];
  const cabTabela = () => {
    espaco(22);
    page.drawRectangle({ x: M, y: y - 16, width: W, height: 16, color: NAVY });
    let x = M + 4;
    for (const c of cols) {
      const t = corta(c.t, bold, 7.5, c.w - 6);
      const tx = c.a === "r" ? x + c.w - 8 - wid(t, bold, 7.5) : c.a === "c" ? x + (c.w - wid(t, bold, 7.5)) / 2 : x;
      txt(t, tx, y - 11, { f: bold, size: 7.5, color: WHITE });
      x += c.w;
    }
    y -= 18;
  };
  cabTabela();

  const itens = Array.isArray(g.itens) ? g.itens : [];
  itens.forEach((it, i) => {
    if (y - 16 < 48) { novaPagina(); cabTabela(); }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 14, width: W, height: 14, color: LIGHT });
    const vals = [
      String(i + 1),
      it.marca || "—",
      it.arquivo || "—",
      it.formato || "—",
      it.r || "—",
      String(it.impressoes ?? 1),
    ];
    let x = M + 4;
    cols.forEach((c, k) => {
      const t = corta(vals[k], font, 7.5, c.w - 8);
      const tx = c.a === "r" ? x + c.w - 8 - wid(t, font, 7.5) : c.a === "c" ? x + (c.w - wid(t, font, 7.5)) / 2 : x;
      txt(t, tx, y - 10, { size: 7.5 });
      x += c.w;
    });
    y -= 14;
  });

  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINE });
  y -= 14;
  txt(`${itens.length} documento(s) nesta remessa.`, M, y, { f: bold, size: 8.5 });

  /* Recebimento — a guia só fecha quando alguém assina do outro lado */
  //
  // ⚠⚠ DOIS CAMINHOS, E A GUIA SERVE AOS DOIS. Vitor (31/08/2026): "preciso de uma forma de
  // registrar a assinatura de quem deve receber". Quem tem e-mail assina pelo link e a confirmação
  // (nome, data e IP) vem impressa aqui; quem não tem — e são 58 dos 70 da fábrica — assina na
  // linha, no papel. Imprimir só a linha ignoraria o encarregado que já assina eletronicamente no
  // resto do portal; imprimir só a assinatura eletrônica deixaria a fábrica sem como receber.
  y -= 44;
  espaco(70);
  txt("RECEBIMENTO", M, y, { f: bold, size: 8.5, color: NAVY });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: LINE });
  y -= 16;

  // ⚠⚠ O QUE VAI IMPRESSO É A REMESSA, NÃO UMA CONFIRMAÇÃO. Vitor (31/08/2026): "preenche o
  // recebimento da GRD só pelo fato de enviar o e-mail (…) só preciso deixar isso como se alguém
  // tivesse recebido por conta da ISO". Escrever "confirmado por Fulano" sem que ninguém tenha
  // clicado seria inventar um ato dentro de um documento auditado — o mesmo erro que a gente evita
  // no data book, só que na direção contrária. "Recebimento por meio eletrônico", com destinatário
  // e data do envio, é fato: preenche o campo, cumpre o que a guia precisa provar, e não afirma
  // nada que não aconteceu.
  if (g.recebidoPorNome && g.enviadoEm) {
    espaco(52);
    txt(g.recebidoPorNome, M, y - 10, { f: bold, size: 9.5 });
    if (g.recebidoPorEmail) {
      txt(g.recebidoPorEmail, A4[0] - M - wid(g.recebidoPorEmail, font, 8), y - 10, { size: 8, color: GRAY });
    }
    y -= 24;
    txt(`Remetida por e-mail em ${dataHoraBR(g.enviadoEm)} — recebimento por meio eletronico.`,
      M, y, { size: 8, color: GRAY });
    y -= 12;
    txt(`${g.setor ? `Setor ${g.setor}. ` : ""}Registro desta remessa no portal, sob ${numGrdPcp(g.numero, g.ano)}.`,
      M, y, { size: 7.5, color: GRAY });
  } else {
    // sem destinatário por e-mail, a guia sai para assinar no papel — o caminho da fábrica, onde
    // 58 dos 70 não têm conta.
    y -= 30;
    const meia = (W - 20) / 2;
    page.drawLine({ start: { x: M, y }, end: { x: M + meia, y }, thickness: 0.6, color: GRAY });
    page.drawLine({ start: { x: M + meia + 20, y }, end: { x: M + W, y }, thickness: 0.6, color: GRAY });
    txt("Nome / assinatura de quem recebeu", M, y - 11, { size: 7.5, color: GRAY });
    txt("Data", M + meia + 20, y - 11, { size: 7.5, color: GRAY });
  }

  return {
    bytes: await pdf.save(),
    filename: `${numGrdPcp(g.numero, g.ano).replace(/\//g, "-")} ${fmtOP(g.opNumero)}.pdf`,
  };
}
