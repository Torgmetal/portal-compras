// GET /api/relatorios/[id]/pdf — gera o PDF do relatório (layout Torg) e devolve inline.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import { gerarRelatorioStatusPDF } from "@/lib/relatorio-status-pdf";

export const runtime = "nodejs";
export const maxDuration = 120; // embutir várias fotos pode levar tempo

export async function GET(_req, { params }) {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rel = await prisma.relatorioStatus.findUnique({ where: { id: params.id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  let out;
  try { out = await gerarRelatorioStatusPDF(rel); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  const nome = out.filename.replace(/["\r\n]/g, "");
  return new Response(out.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
