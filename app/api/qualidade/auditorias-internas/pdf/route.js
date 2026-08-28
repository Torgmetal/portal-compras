// GET /api/qualidade/auditorias-internas/pdf — Cronograma de Auditoria Interna em PDF (padrão Torg). ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getRevisao, fmtRev } from "@/lib/assinatura-doc";
import { gerarCronogramaAuditoriaPDF } from "@/lib/cronograma-auditoria-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const auditorias = await prisma.auditoriaInterna.findMany({
    orderBy: { dataAuditoria: "asc" },
    select: { numero: true, setor: true, dataAuditoria: true, responsavelAcompanhamento: true, status: true, escopo: true },
    take: 500,
  });
  const revisao = await getRevisao("CRONOGRAMA_AUDITORIA");
  const ano = auditorias[0]?.dataAuditoria ? new Date(auditorias[0].dataAuditoria).getUTCFullYear() : new Date().getUTCFullYear();

  const bytes = await gerarCronogramaAuditoriaPDF({ ano, revisao, auditorias });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(`Cronograma de Auditoria Interna ${ano} ${fmtRev(revisao)}.pdf`, "inline"),
      "Cache-Control": "no-store",
    },
  });
}
