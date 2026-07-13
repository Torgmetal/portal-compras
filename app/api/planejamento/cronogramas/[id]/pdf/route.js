// GET /api/planejamento/cronogramas/[id]/pdf — cronograma em PDF (visão de Gantt)
// para apresentar/enviar ao cliente. Abre inline no navegador (prévia).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarCronogramaPDF } from "@/lib/cronograma-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id: params.id },
    include: { tarefas: true, op: { select: { cliente: true } } },
  });
  if (!cronograma) return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });

  let out;
  try { out = await gerarCronogramaPDF(cronograma, cronograma.tarefas); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "EXPORTAR_CRONOGRAMA_PDF", entity: "Cronograma", entityId: cronograma.id, diff: { tarefas: cronograma.tarefas.length } } }).catch(() => {});

  return new Response(Buffer.from(out.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` },
  });
}
