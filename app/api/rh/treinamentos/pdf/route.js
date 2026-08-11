// GET /api/rh/treinamentos/pdf — Plano Anual de Treinamentos em PDF (padrão Torg). ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getRevisao, fmtRev } from "@/lib/assinatura-doc";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const treinamentos = await prisma.treinamento.findMany({
    orderBy: { dataInicio: "asc" },
    select: { titulo: true, nrRelacionada: true, dataInicio: true, cargaHoraria: true, tipo: true },
  });
  const revisao = await getRevisao("PLANO_TREINAMENTO");
  const ano = treinamentos[0]?.dataInicio ? new Date(treinamentos[0].dataInicio).getUTCFullYear() : new Date().getUTCFullYear();

  const bytes = await gerarPlanoTreinamentoPDF({ ano, revisao, treinamentos });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Plano de Treinamentos ${ano} ${fmtRev(revisao)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
