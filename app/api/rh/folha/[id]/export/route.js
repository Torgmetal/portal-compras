// GET /api/rh/folha/[id]/export → .xlsx (aba Folha completa + aba Resumo agrupado
// por empresa/centro de custo, com salário e horas extras separados). Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcDerivados, resumo } from "@/lib/folha-calc";
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

  const folha = await prisma.folhaCompetencia.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: [{ empresa: "asc" }, { tipoContrato: "asc" }, { nome: "asc" }] } },
  });
  if (!folha) return NextResponse.json({ error: "Competência não encontrada" }, { status: 404 });

  const wb = XLSX.utils.book_new();

  // Aba Folha — todas as colunas (digitadas + calculadas)
  const head = ["Empresa", "Tipo", "Centro de Custo", "Nome", "CPF", "Salário Base", "Horas Extras", "Adicionais",
    "Base INSS", "INSS", "INSS Patronal", "Base IRRF", "IRRF", "FGTS", "Descontos", "Líquido", "VR", "iFOOD", "KR", "Rescisão"];
  const linhas = folha.itens.map((it) => {
    const d = calcDerivados(it);
    return [it.empresa || "", it.tipoContrato, it.centroCusto || "", it.nome, it.cpf || "",
      r2(it.salarioBase), r2(it.horasExtras), r2(it.adicionais), r2(d.baseInss), r2(it.inss), r2(d.inssPatronal),
      r2(d.baseIrrf), r2(it.irrf), r2(d.fgts), r2(it.descontos), r2(it.liquido), r2(it.vr), r2(it.ifood), r2(it.kr), r2(it.rescisao)];
  });
  const wsFolha = XLSX.utils.aoa_to_sheet([[`FOLHA ${folha.competencia}`], head, ...linhas]);
  XLSX.utils.book_append_sheet(wb, wsFolha, "Folha");

  // Aba Resumo — agrupado por empresa/centro de custo/tipo
  const { total, grupos } = resumo(folha.itens);
  const hr = ["Empresa", "Centro de Custo", "Tipo", "Qtd", "Salário", "Horas Extras", "Adicionais", "Descontos", "Líquido (a pagar)", "FGTS", "INSS Patronal"];
  const rLinhas = grupos.map((g) => [g.empresa, g.centroCusto, g.tipoContrato, g.qtd,
    r2(g.salarioBase), r2(g.horasExtras), r2(g.adicionais), r2(g.descontos), r2(g.liquido), r2(g.fgts), r2(g.inssPatronal)]);
  const totalLinha = ["TOTAL", "", "", "", r2(total.salarioBase), r2(total.horasExtras), r2(total.adicionais),
    r2(total.descontos), r2(total.liquido), r2(total.fgts), r2(total.inssPatronal)];
  const wsResumo = XLSX.utils.aoa_to_sheet([[`RESUMO ${folha.competencia}`], hr, ...rLinhas, [], totalLinha]);
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  const buf = Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="folha-${folha.competencia}.xlsx"`,
    },
  });
}
