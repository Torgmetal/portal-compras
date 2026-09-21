import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fmtOP } from "@/lib/utils";
import { dataHoraBR } from "./data-br";
import { rotuloSituacao, SITUACAO } from "./conferencia-relatorio";

// RELATÓRIO DA CONFERÊNCIA DE PEÇA — o papel que sai de uma conferência finalizada.
//
// Matheus (16/09/2026): "ajuste as conferências que ele finalizar para ser possível gerar um PDF ou
// Excel dessa listagem de peças conferidas".
//
// ⚠⚠ O QUE FALTOU VEM ANTES DO QUE PASSOU. A conferência pode ser finalizada com saldo em aberto, e
// quem abre este papel no pátio está procurando pendência. Por isso a tarja de pendência fica no
// topo, logo abaixo do resumo, e as marcas não conferidas encabeçam a tabela (a ordem vem de
// `montarRelatorio`). Um relatório que só celebra o conferido certifica um carregamento que não
// aconteceu.
//
// ⚠ O desenho é o mesmo dos outros documentos do portal (faixa azul, tarja laranja, rodapé) porque
// ele circula junto com romaneio e guia — documento da Torg com outra cara parece rascunho.

const A4 = [595.28, 841.89];
const M = 40;
const W = A4[0] - M * 2;
const NAVY = rgb(0.051, 0.122, 0.235);
const ORANGE = rgb(0.957, 0.502, 0.122);
const DARK = rgb(0.1, 0.13, 0.18);
const GRAY = rgb(0.45, 0.5, 0.56);
const LIGHT = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const VERMELHO = rgb(0.72, 0.11, 0.11);
const AMBAR = rgb(0.72, 0.45, 0.05);

const CORES_SITUACAO = {
  [SITUACAO.NAO_CONFERIDA]: VERMELHO,
  [SITUACAO.PARCIAL]: AMBAR,
  [SITUACAO.COMPLETA]: rgb(0.02, 0.45, 0.28),
};

// ⚠ AS LARGURAS SOMAM A FOLHA ÚTIL (515,28 pt), e a coluna de situação cabe o rótulo INTEIRO.
// Com 50 pt, "Não conferida" — que é justamente o que o documento existe para destacar — saía
// como "Não conf..." (visto no primeiro PDF gerado). Um teste refaz esta conta.
export const COLS = [
  { t: "Marca", w: 104, a: "l" },
  { t: "Descricao", w: 183, a: "l" },
  { t: "Previsto", w: 50, a: "r" },
  { t: "Conferido", w: 56, a: "r" },
  { t: "Saldo", w: 40, a: "r" },
  { t: "Situacao", w: 82, a: "c" },
];

/** ⚠ Também soma 515,28 — ver a nota em `COLS`. */
export const COLS_HISTORICO = [
  { t: "Data / hora", w: 104, a: "l" },
  { t: "Marca", w: 104, a: "l" },
  { t: "Qtd", w: 38, a: "r" },
  { t: "Conferente", w: 128, a: "l" },
  { t: "Observacao", w: 141, a: "l" },
];

/** A largura útil da folha A4 com as margens do documento. */
export const LARGURA_UTIL = W;

/** @returns {Promise<Buffer>} */
export async function gerarConferenciaPDF(rel) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  let page, y;
  // ⚠ O PDF padrão só desenha WinAnsi: um "ç" ou um "ã" fora dessa tabela derruba o documento
  // inteiro no `drawText`. Sanear é o que faz o relatório sair mesmo com marca esquisita no nome.
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
    txt("CONFERENCIA DE PECA — EXPEDICAO", M, 26, { size: 7.5, color: GRAY });
    const nota = "Documento gerado pelo Portal Torg";
    txt(nota, A4[0] - M - wid(nota, font, 6.5), 26, { size: 6.5, color: GRAY });
  };

  const cabecalho = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 98, width: A4[0], height: 6, color: ORANGE });
    if (logo) { const lw = 110, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 30 - lh, width: lw, height: lh }); }
    else txt("TORG METAL", M, A4[1] - 50, { f: bold, size: 17, color: WHITE });
    const t1 = "CONFERENCIA DE PECA";
    txt(t1, A4[0] - M - wid(t1, bold, 14), A4[1] - 44, { f: bold, size: 14, color: WHITE });
    const t2 = `OP-${String(rel.op.numero ?? "").padStart(3, "0")}`;
    txt(t2, A4[0] - M - wid(t2, bold, 11), A4[1] - 62, { f: bold, size: 11, color: ORANGE });
  };

  const novaPagina = () => { page = pdf.addPage(A4); cabecalho(); rodape(); y = A4[1] - 118; };
  const espaco = (h) => { if (y - h < 48) novaPagina(); };
  novaPagina();

  /* Identificação */
  const s = rel.sessao;
  const pares = [
    ["OP", fmtOP(rel.op.numero)],
    ["Obra / cliente", [rel.op.obra, rel.op.cliente].filter(Boolean).join(" · ") || "—"],
    ["Iniciada em", dataHoraBR(s.iniciadaEm)],
    ["Iniciada por", s.iniciadaPorNome || "—"],
    ["Finalizada em", s.finalizadaEm ? dataHoraBR(s.finalizadaEm) : "—"],
    ["Finalizada por", s.finalizadaPorNome || "—"],
  ];
  const colW = W / 2;
  for (let i = 0; i < pares.length; i += 2) {
    espaco(26);
    for (let j = 0; j < 2; j++) {
      const p = pares[i + j]; if (!p) continue;
      const x = M + j * colW;
      txt(p[0], x, y - 8, { size: 7.5, color: GRAY });
      txt(corta(p[1] || "—", bold, 9, colW - 14), x, y - 19, { f: bold, size: 9 });
    }
    y -= 28;
  }
  if (s.observacao) {
    espaco(24);
    txt("Observacao", M, y - 8, { size: 7.5, color: GRAY });
    txt(corta(s.observacao, font, 9, W - 8), M, y - 19, { size: 9 });
    y -= 26;
  }

  /* Resumo */
  const r = rel.resumo;
  y -= 4;
  espaco(40);
  page.drawRectangle({ x: M, y: y - 34, width: W, height: 34, color: LIGHT });
  const blocos = [
    ["Marcas", String(r.marcas)],
    ["Previsto", String(r.previsto)],
    ["Conferido", String(r.conferido)],
    ["Saldo", String(r.saldo)],
    ["Conferido", r.percentual === null ? "—" : `${r.percentual}%`],
  ];
  const bw = W / blocos.length;
  blocos.forEach((b, i) => {
    const x = M + i * bw + 10;
    txt(b[0], x, y - 12, { size: 7, color: GRAY });
    txt(b[1], x, y - 26, { f: bold, size: 12, color: i === 3 && r.saldo > 0 ? VERMELHO : DARK });
  });
  y -= 42;

  // ⚠⚠ A TARJA É O PONTO DO DOCUMENTO. Sem ela, um relatório de conferência com saldo em aberto é
  // indistinguível de um completo para quem bate o olho — e é assim que peça que ficou no pátio
  // some do carregamento sem ninguém notar.
  if (r.pendente) {
    espaco(30);
    page.drawRectangle({ x: M, y: y - 24, width: W, height: 24, color: rgb(0.99, 0.93, 0.93) });
    page.drawRectangle({ x: M, y: y - 24, width: 4, height: 24, color: VERMELHO });
    const aviso = `ATENCAO: ${r.saldo} peca(s) NAO conferida(s) — ${r.naoConferidas} marca(s) sem nenhum lancamento e ${r.parciais} parcial(is).`;
    txt(corta(aviso, bold, 9, W - 24), M + 12, y - 16, { f: bold, size: 9, color: VERMELHO });
    y -= 32;
  }

  /* Tabela das marcas */
  const cabTabela = () => {
    espaco(22);
    page.drawRectangle({ x: M, y: y - 16, width: W, height: 16, color: NAVY });
    let x = M + 4;
    for (const c of COLS) {
      const t = corta(c.t, bold, 7.5, c.w - 6);
      const tx = c.a === "r" ? x + c.w - 8 - wid(t, bold, 7.5) : c.a === "c" ? x + (c.w - wid(t, bold, 7.5)) / 2 : x;
      txt(t, tx, y - 11, { f: bold, size: 7.5, color: WHITE });
      x += c.w;
    }
    y -= 18;
  };
  cabTabela();

  rel.linhas.forEach((l, i) => {
    if (y - 16 < 48) { novaPagina(); cabTabela(); }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 14, width: W, height: 14, color: LIGHT });
    const vals = [l.marca, l.descricao || "—", String(l.previsto), String(l.conferido), String(l.saldo), rotuloSituacao(l.situacao)];
    let x = M + 4;
    COLS.forEach((c, k) => {
      const cor = k === 5 ? CORES_SITUACAO[l.situacao] : k === 4 && l.saldo > 0 ? VERMELHO : DARK;
      const f = k === 5 || (k === 4 && l.saldo > 0) ? bold : font;
      const t = corta(vals[k], f, 7.5, c.w - 8);
      const tx = c.a === "r" ? x + c.w - 8 - wid(t, f, 7.5) : c.a === "c" ? x + (c.w - wid(t, f, 7.5)) / 2 : x;
      txt(t, tx, y - 10, { f, size: 7.5, color: cor });
      x += c.w;
    });
    page.drawLine({ start: { x: M, y: y - 14 }, end: { x: M + W, y: y - 14 }, thickness: 0.3, color: rgb(0.88, 0.9, 0.92) });
    y -= 14;
  });

  /* Histórico dos lançamentos */
  if (rel.lancamentos.length) {
    y -= 14;
    espaco(30);
    txt("HISTORICO DOS LANCAMENTOS", M, y - 10, { f: bold, size: 9, color: NAVY });
    y -= 20;
    const hc = COLS_HISTORICO;
    const cabHist = () => {
      espaco(20);
      page.drawRectangle({ x: M, y: y - 15, width: W, height: 15, color: rgb(0.34, 0.42, 0.49) });
      let x = M + 4;
      for (const c of hc) {
        txt(corta(c.t, bold, 7, c.w - 6), x, y - 10.5, { f: bold, size: 7, color: WHITE });
        x += c.w;
      }
      y -= 17;
    };
    cabHist();
    rel.lancamentos.forEach((l, i) => {
      if (y - 14 < 48) { novaPagina(); cabHist(); }
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 13, width: W, height: 13, color: LIGHT });
      const vals = [dataHoraBR(l.criadoEm), l.marca, String(l.qte), l.criadoPorNome || "—", l.observacao || "—"];
      let x = M + 4;
      hc.forEach((c, k) => {
        const t = corta(vals[k], font, 7, c.w - 8);
        const tx = c.a === "r" ? x + c.w - 8 - wid(t, font, 7) : x;
        txt(t, tx, y - 9.5, { size: 7 });
        x += c.w;
      });
      y -= 13;
    });
  }

  return Buffer.from(await pdf.save());
}
