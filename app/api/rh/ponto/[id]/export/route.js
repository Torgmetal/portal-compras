// GET /api/rh/ponto/[id]/export → .xlsx com os totais por funcionário (contabilidade).
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const ponto = await prisma.pontoCompetencia.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: [{ nome: "asc" }, { pisArquivo: "asc" }] } },
  });
  if (!ponto) return NextResponse.json({ error: "Competência não encontrada" }, { status: 404 });

  const head = ["PIS", "Funcionário", "Dias", "HE 50%", "HE 100%", "Faltas", "Atrasos", "Adic. Noturno", "DSR", "Ajuda de Custo", "Observação"];
  const linhas = ponto.itens.map((it) => [
    it.pisArquivo, it.nome || "(não vinculado)", Array.isArray(it.marcacoes) ? it.marcacoes.length : "",
    r2(it.horasExtras50), r2(it.horasExtras100), r2(it.faltas), r2(it.atrasos),
    r2(it.adicionalNoturno), r2(it.dsr), r2(it.ajudaCusto), it.observacao || "",
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[`PONTO ${ponto.competencia}${ponto.empresa ? " — " + ponto.empresa : ""}`], head, ...linhas]);
  ws["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, "Ponto");

  const buf = Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ponto-${ponto.competencia}.xlsx"`,
    },
  });
}
