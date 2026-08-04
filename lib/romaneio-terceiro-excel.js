// Gera o romaneio de MATERIAL EM TERCEIRO em Excel, no mesmo espírito do FORM 22
// (cabeçalho Torg, tabela de marcas com peso, campos de assinatura). É um documento
// À PARTE do romaneio da obra — serve pra acompanhar o material que sai pra trabalhar
// fora e o seu retorno.
import ExcelJS from "exceljs";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const AZUL = "FF006EAB";
const ESCURO = "FF002945";
const CINZA = "FFF1F5F9";

/**
 * @param {object} rom — registro RomaneioTerceiro
 * @returns {Promise<Buffer>}
 */
export async function gerarRomaneioTerceiroExcel(rom) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torg Metal — Portal";
  const ws = wb.addWorksheet("Romaneio Terceiro", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  ws.columns = [
    { width: 6 },   // A - item
    { width: 18 },  // B - marca
    { width: 40 },  // C - descrição
    { width: 10 },  // D - qtd
    { width: 14 },  // E - peso
  ];

  const box = (cell) => { cell.border = { top: { style: "thin", color: { argb: "FFBBBBBB" } }, left: { style: "thin", color: { argb: "FFBBBBBB" } }, bottom: { style: "thin", color: { argb: "FFBBBBBB" } }, right: { style: "thin", color: { argb: "FFBBBBBB" } } }; };

  // ── Título ──
  ws.mergeCells("A1:E1");
  const t = ws.getCell("A1");
  t.value = "TORG METAL — ROMANEIO DE MATERIAL EM TERCEIRO";
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:E2");
  const sub = ws.getCell("A2");
  sub.value = `Nº RT-${String(rom.numero).padStart(3, "0")}   ·   Material enviado para trabalho em terceiro (controle à parte)`;
  sub.font = { italic: true, size: 9, color: { argb: "FF666666" } };
  sub.alignment = { horizontal: "center" };

  // ── Cabeçalho de dados ──
  const linhaCampo = (r, label1, val1, label2, val2) => {
    ws.getCell(`A${r}`).value = label1; ws.getCell(`A${r}`).font = { bold: true, size: 9, color: { argb: AZUL } };
    ws.mergeCells(`B${r}:C${r}`); ws.getCell(`B${r}`).value = val1 ?? "—"; ws.getCell(`B${r}`).font = { size: 10 };
    ws.getCell(`D${r}`).value = label2; ws.getCell(`D${r}`).font = { bold: true, size: 9, color: { argb: AZUL } };
    ws.getCell(`E${r}`).value = val2 ?? "—"; ws.getCell(`E${r}`).font = { size: 10 };
  };
  linhaCampo(4, "Terceiro", rom.terceiroNome, "Serviço", rom.servico || "—");
  linhaCampo(5, "OP ref.", rom.opRefNumero || "—", "Data envio", fmtD(rom.dataEnvio));
  linhaCampo(6, "Transporte", [rom.transportadora, rom.motorista].filter(Boolean).join(" · ") || "—", "Prev. retorno", fmtD(rom.dataPrevRetorno));
  linhaCampo(7, "Placas", [rom.placaVeiculo, rom.placaCarreta].filter(Boolean).join(" / ") || "—", "Contato", rom.contatoTransporte || "—");

  // ── Cabeçalho da tabela ──
  const hRow = 9;
  const heads = ["Item", "Marca", "Descrição", "Qtd", "Peso (kg)"];
  heads.forEach((h, i) => {
    const c = ws.getCell(hRow, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { horizontal: i >= 3 ? "right" : "left", vertical: "middle" };
    box(c);
  });

  const itens = Array.isArray(rom.itens) ? rom.itens : [];
  let rr = hRow + 1;
  itens.forEach((it, idx) => {
    const row = ws.getRow(rr);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = it.marca || "—";
    row.getCell(3).value = it.descricao || "—";
    row.getCell(4).value = it.qte ?? null;
    row.getCell(5).value = r2(it.pesoTotal);
    row.getCell(4).numFmt = "0";
    row.getCell(5).numFmt = "#,##0.00";
    [1, 2, 3, 4, 5].forEach((ci) => {
      const c = row.getCell(ci);
      box(c);
      c.font = { size: 10 };
      c.alignment = { horizontal: ci >= 4 ? "right" : "left", vertical: "middle" };
      if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
    });
    rr++;
  });

  // ── Total ──
  ws.mergeCells(`A${rr}:D${rr}`);
  const totLbl = ws.getCell(`A${rr}`);
  totLbl.value = "TOTAL ENVIADO";
  totLbl.font = { bold: true, size: 10, color: { argb: ESCURO } };
  totLbl.alignment = { horizontal: "right", vertical: "middle" };
  const totVal = ws.getCell(`E${rr}`);
  totVal.value = r2(rom.pesoEnviadoKg);
  totVal.numFmt = "#,##0.00";
  totVal.font = { bold: true, size: 10, color: { argb: ESCURO } };
  totVal.alignment = { horizontal: "right", vertical: "middle" };
  [1, 2, 3, 4, 5].forEach((ci) => box(ws.getCell(rr, ci)));

  // ── Assinaturas ──
  const aRow = rr + 3;
  ws.mergeCells(`A${aRow}:B${aRow}`); ws.getCell(`A${aRow}`).value = "_____________________________";
  ws.getCell(`A${aRow}`).alignment = { horizontal: "center" };
  ws.mergeCells(`D${aRow}:E${aRow}`); ws.getCell(`D${aRow}`).value = "_____________________________";
  ws.getCell(`D${aRow}`).alignment = { horizontal: "center" };
  ws.mergeCells(`A${aRow + 1}:B${aRow + 1}`); ws.getCell(`A${aRow + 1}`).value = "Expedição (Torg)";
  ws.getCell(`A${aRow + 1}`).alignment = { horizontal: "center" }; ws.getCell(`A${aRow + 1}`).font = { size: 9, color: { argb: "FF666666" } };
  ws.mergeCells(`D${aRow + 1}:E${aRow + 1}`); ws.getCell(`D${aRow + 1}`).value = "Recebido pelo terceiro";
  ws.getCell(`D${aRow + 1}`).alignment = { horizontal: "center" }; ws.getCell(`D${aRow + 1}`).font = { size: 9, color: { argb: "FF666666" } };

  if (rom.observacao) {
    const oRow = aRow + 3;
    ws.mergeCells(`A${oRow}:E${oRow}`);
    ws.getCell(`A${oRow}`).value = `Obs.: ${rom.observacao}`;
    ws.getCell(`A${oRow}`).font = { size: 9, italic: true, color: { argb: "FF666666" } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
