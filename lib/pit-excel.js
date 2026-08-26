import "server-only";
import { LOGO_EXCEL_B64 } from "./torg-logo-excel";
import { PIT_PADRAO, PIT_COLUNAS, PIT_LEGENDA, PIT_LEGENDA_SNQC } from "./pit-padroes";

// ─── O PIT NA CARA DA TORG ────────────────────────────────────────────────────
// Vitor (26/08/2026): "o PIT é aquele documento que nasce com a proposta (…) tanto o PIT quanto o
// PLP precisam ser assinados pelo inspetor do cliente ou algum responsável da qualidade".
//
// ⚠ UMA FOLHA POR OBRA, não as cinco. O arquivo modelo tem cinco abas porque é um CATÁLOGO de
// padrões; a obra usa UM. Emitir as cinco deixaria o cliente escolhendo qual vale — que é
// exatamente a dúvida que um plano de inspeção existe para não ter.
//
// ⚠ AS LINHAS SÃO NORMATIVAS e vêm de lib/pit-padroes.js, extraídas do arquivo do Vitor. Nada aqui
// reescreve critério de aceitação.

const NAVY = "FF002945";
const AZUL = "FF00406B";
const LARANJA = "FFF4801F";
const CINZA = "FF576D7E";
const BORDA = "FFB0BEC5";
const FUNDO_CAB = "FFEBF5FB";

const so = (v) => (v === null || v === undefined ? "" : String(v).trim());
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

function borda(cell, cor = BORDA) {
  cell.border = {
    top: { style: "thin", color: { argb: cor } }, bottom: { style: "thin", color: { argb: cor } },
    left: { style: "thin", color: { argb: cor } }, right: { style: "thin", color: { argb: cor } },
  };
}
const preencher = (cell, argb) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };

/**
 * @param {object} p
 *   op      — { numero, cliente, obra, refCliente }
 *   padrao  — PINTURA | GALVANIZACAO | GALV_PINTURA | SNQC | BASICO
 *   revisao — a revisão do PIT (padrão "0")
 *   usuario — quem emite
 */
export async function gerarPitExcel({ op = {}, padrao = "PINTURA", revisao = "0", usuario = null }) {
  const def = PIT_PADRAO[padrao] || PIT_PADRAO.PINTURA;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workspace Torg — Torg Metal";
  wb.created = new Date();

  const num = so(op.numero).replace(/\D/g, "").padStart(3, "0");
  const pitNumero = `T${num}`;
  const hoje = fmtD(new Date());
  const rev = so(revisao) || "0";
  const cols = def.snqc ? PIT_COLUNAS.snqc : PIT_COLUNAS.comum;

  const ws = wb.addWorksheet("PIT", { views: [{ showGridLines: false }] });
  [7, 30, 40, 14, 14, 26, 26, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const logoId = wb.addImage({ base64: LOGO_EXCEL_B64, extension: "png" });

  // ── cabeçalho ──
  ws.mergeCells("A1:B4");
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.25 }, ext: { width: 132, height: 44 } });
  ws.mergeCells("C1:F2");
  const t = ws.getCell("C1");
  t.value = "PLANO DE INSPEÇÃO E TESTES";
  t.font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  preencher(t, NAVY);
  ws.mergeCells("C3:F3");
  const sub = ws.getCell("C3");
  sub.value = `Sistema de Gestão da Qualidade · ${def.nome}`;
  sub.font = { name: "Arial", size: 8, color: { argb: "FFFFFFFF" } };
  sub.alignment = { horizontal: "center", vertical: "middle" };
  preencher(sub, AZUL);
  ws.mergeCells("C4:F4");
  preencher(ws.getCell("C4"), LARANJA);
  ws.getRow(4).height = 3;

  for (const [cr, rot, cv, val] of [
    ["G1", "PIT Nº", "H1", pitNumero], ["G2", "Revisão", "H2", rev],
    ["G3", "Emissão", "H3", hoje], ["G4", "Folha", "H4", "1 / 1"],
  ]) {
    const r = ws.getCell(cr); r.value = rot;
    r.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } };
    r.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    preencher(r, FUNDO_CAB); borda(r);
    const v = ws.getCell(cv); v.value = val;
    v.font = { name: "Arial", size: 9, color: { argb: NAVY } };
    v.alignment = { horizontal: "center", vertical: "middle" };
    borda(v);
  }
  ws.getRow(1).height = 20; ws.getRow(2).height = 20; ws.getRow(3).height = 14;

  // ── cliente e obra ──
  ws.mergeCells("A6:H6");
  const c = ws.getCell("A6");
  c.value = `CLIENTE: ${so(op.cliente) || "—"}     ·     OBRA: ${so(op.obra) || "—"}${so(op.refCliente) ? `     ·     REF. CLIENTE: ${so(op.refCliente)}` : ""}`;
  c.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY } };
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  preencher(c, FUNDO_CAB); borda(c);
  ws.getRow(6).height = 20;

  // ── a tabela ──
  let l = 8;
  cols.forEach((h, i) => {
    const cel = ws.getCell(l, i + 1);
    cel.value = h;
    cel.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    preencher(cel, NAVY); borda(cel, NAVY);
  });
  ws.getRow(l).height = 26;
  l++;
  for (const linha of def.linhas) {
    linha.forEach((v, i) => {
      const cel = ws.getCell(l, i + 1);
      cel.value = v;
      cel.font = { name: "Arial", size: 8.5, color: { argb: NAVY } };
      cel.alignment = { horizontal: i === 0 ? "center" : "left", vertical: "middle", wrapText: true, indent: i === 0 ? 0 : 1 };
      borda(cel);
    });
    ws.getRow(l).height = 30;
    l++;
  }
  l += 1;

  // ── legenda ──
  ws.mergeCells(`A${l}:H${l}`);
  const lg = ws.getCell(`A${l}`);
  lg.value = "LEGENDA";
  lg.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  lg.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  preencher(lg, AZUL);
  ws.getRow(l).height = 16;
  l++;
  const itens = [...PIT_LEGENDA, ...(def.snqc ? PIT_LEGENDA_SNQC : [])];
  for (let i = 0; i < itens.length; i += 2) {
    for (const [k, off] of [[i, 0], [i + 1, 4]]) {
      if (!itens[k]) continue;
      const [sigla, txt] = itens[k];
      const a = ws.getCell(l, off + 1); a.value = sigla;
      a.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } };
      a.alignment = { horizontal: "center", vertical: "middle" };
      borda(a);
      ws.mergeCells(l, off + 2, l, off + 4);
      const b = ws.getCell(l, off + 2); b.value = txt;
      b.font = { name: "Arial", size: 8, color: { argb: CINZA } };
      b.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      borda(b);
    }
    ws.getRow(l).height = 14;
    l++;
  }
  l += 1;

  // ── APROVAÇÕES ──
  // ⚠ TRÊS BLOCOS, e o terceiro é o motivo do pedido. Vitor (26/08/2026): "tanto o PIT quanto o PLP
  // precisam ser assinados pelo inspetor do cliente ou algum responsável da qualidade". Sem o campo
  // do CLIENTE no papel, o plano é uma declaração nossa; com ele, é um acordo.
  ws.mergeCells(`A${l}:H${l}`);
  const ap = ws.getCell(`A${l}`);
  ap.value = "APROVAÇÕES";
  ap.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  ap.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  preencher(ap, AZUL);
  ws.getRow(l).height = 16;
  l++;
  const blocos = [
    { papel: "ELABORADO POR", nome: so(usuario) || "", ci: 1, cf: 3 },
    { papel: "VERIFICADO POR", nome: "", ci: 4, cf: 5 },
    { papel: "INSPETOR DO CLIENTE / QUALIDADE", nome: "", ci: 6, cf: 8 },
  ];
  for (const b of blocos) {
    ws.mergeCells(l, b.ci, l, b.cf);
    const p1 = ws.getCell(l, b.ci); p1.value = b.papel;
    p1.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    p1.alignment = { horizontal: "center", vertical: "middle" };
    preencher(p1, CINZA); borda(p1);

    ws.mergeCells(l + 1, b.ci, l + 1, b.cf);
    const p2 = ws.getCell(l + 1, b.ci); p2.value = b.nome;
    p2.font = { name: "Arial", size: 9, color: { argb: NAVY } };
    p2.alignment = { horizontal: "center", vertical: "middle" };
    borda(p2);

    // ⚠ a linha de assinatura é célula alta com borda inferior, não "_____" digitado: sublinhado
    // desalinha na impressão e some quando a coluna estica.
    ws.mergeCells(l + 2, b.ci, l + 2, b.cf);
    ws.getCell(l + 2, b.ci).border = { bottom: { style: "medium", color: { argb: NAVY } } };

    ws.mergeCells(l + 3, b.ci, l + 3, b.cf);
    const p4 = ws.getCell(l + 3, b.ci);
    p4.value = "Data: ____ / ____ / ________";
    p4.font = { name: "Arial", size: 8, color: { argb: CINZA } };
    p4.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(l).height = 16; ws.getRow(l + 1).height = 18;
  ws.getRow(l + 2).height = 34; ws.getRow(l + 3).height = 14;
  l += 5;

  ws.mergeCells(`A${l}:H${l}`);
  const rd = ws.getCell(`A${l}`);
  rd.value = `PIT ${pitNumero} · ${def.nome} · Revisão ${rev} · Torg Metal — Estruturas Metálicas · documento controlado, proibida a reprodução sem autorização (ISO 9001)`;
  rd.font = { name: "Arial", size: 7, italic: true, color: { argb: CINZA } };
  rd.alignment = { horizontal: "center", vertical: "middle" };

  ws.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter = { oddFooter: `&L&8&"Arial"PIT ${pitNumero}&C&8&"Arial"Documento controlado&R&8&"Arial"Página &P de &N` };

  return wb.xlsx.writeBuffer();
}
