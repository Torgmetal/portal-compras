// GET /api/reunioes/[id]/pdf — ata de reunião em PDF (layout Torg, com logo).
// Abre inline no navegador (prévia/impressão).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarAtaPDF } from "@/lib/ata-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataReuniao.findUnique({
    where: { id: params.id },
    include: { atividades: { orderBy: { ordem: "asc" } }, confirmacoes: true },
  });
  if (!ata) return NextResponse.json({ success: false, error: "Ata não encontrada" }, { status: 404 });

  let out;
  try { out = await gerarAtaPDF(ata); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "EXPORTAR_ATA_PDF", entity: "AtaReuniao", entityId: ata.id, diff: { atividades: ata.atividades.length } } }).catch(() => {});

  return new Response(Buffer.from(out.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` },
  });
}
