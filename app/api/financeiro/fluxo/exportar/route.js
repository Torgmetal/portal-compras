import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Exporta o Fluxo de Caixa em Excel por período + filtros (banco, categoria,
// fornecedor, tipo, situação). Consulta o banco direto — qualquer período.
export const maxDuration = 60;

const fmtDataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const padrao90 = new Date(hoje.getTime() - 90 * 86400000);
  const de  = searchParams.get("de")  ? new Date(searchParams.get("de") + "T00:00:00.000-03:00") : padrao90;
  const ate = searchParams.get("ate") ? new Date(searchParams.get("ate") + "T23:59:59.999-03:00") : hoje;
  const banco      = searchParams.get("banco")      || null;
  const categoria  = searchParams.get("categoria")  || null;
  const fornecedor = searchParams.get("fornecedor") || null;
  const tipo       = searchParams.get("tipo")       || null;   // ENTRADA | SAIDA
  const situacao   = searchParams.get("situacao")   || null;   // real | prev

  const where = { data: { gte: de, lte: ate } };
  if (banco)      where.contaCorrente = banco;
  if (categoria)  where.categoria = categoria;
  if (fornecedor) where.contraparte = fornecedor;
  if (tipo)       where.tipo = tipo;
  if (situacao === "real") where.realizado = true;
  if (situacao === "prev") where.realizado = false;

  const linhas = await prisma.fluxoCaixa.findMany({
    where,
    orderBy: { data: "asc" },
    include: { op: { select: { numero: true, cliente: true } } },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Fluxo de Caixa");
  ws.columns = [
    { header: "Data",        key: "data",   width: 12 },
    { header: "Tipo",        key: "tipo",   width: 10 },
    { header: "Situação",    key: "sit",    width: 12 },
    { header: "Banco",       key: "banco",  width: 22 },
    { header: "Categoria",   key: "cat",    width: 28 },
    { header: "Fornecedor/Cliente", key: "forn", width: 34 },
    { header: "Descrição",   key: "desc",   width: 44 },
    { header: "OP",          key: "op",     width: 10 },
    { header: "Valor (R$)",  key: "valor",  width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF006EAB" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  let entradas = 0, saidas = 0;
  for (const f of linhas) {
    const sinal = f.tipo === "ENTRADA" ? 1 : -1;
    if (f.tipo === "ENTRADA") entradas += f.valor; else saidas += f.valor;
    const row = ws.addRow({
      data: fmtDataBR(f.data),
      tipo: f.tipo === "ENTRADA" ? "Entrada" : "Saída",
      sit: f.realizado ? "Realizado" : "Previsto",
      banco: f.contaCorrente || "",
      cat: (f.transferencia ? "[Transf.] " : "") + (f.categoria || ""),
      forn: f.contraparte || "",
      desc: f.descricao || "",
      op: f.op?.numero || "",
      valor: sinal * (f.valor || 0),
    });
    row.getCell("valor").numFmt = "#,##0.00";
  }

  // Linha de totais
  ws.addRow({});
  const tot = ws.addRow({ desc: "TOTAIS", op: "", valor: entradas - saidas });
  tot.font = { bold: true };
  tot.getCell("valor").numFmt = "#,##0.00";
  ws.addRow({ desc: "Entradas", valor: entradas }).getCell("valor").numFmt = "#,##0.00";
  ws.addRow({ desc: "Saídas",   valor: -saidas   }).getCell("valor").numFmt = "#,##0.00";

  ws.autoFilter = { from: "A1", to: "I1" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const nome = `fluxo-caixa_${searchParams.get("de") || ""}_${searchParams.get("ate") || ""}.xlsx`.replace(/__+/g, "_");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
