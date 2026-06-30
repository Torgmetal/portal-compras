// POST /api/rh/folha/[id]/status  { status: "ABERTA" | "FECHADA" }
// Fecha (trava edição) ou reabre uma competência. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["ABERTA", "FECHADA"]) });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const folha = await prisma.folhaCompetencia.findUnique({ where: { id: params.id }, select: { id: true, competencia: true } });
  if (!folha) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });

  await prisma.folhaCompetencia.update({ where: { id: folha.id }, data: { status: parsed.data.status } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "STATUS_FOLHA", entity: "FolhaCompetencia", entityId: folha.id, diff: { competencia: folha.competencia, status: parsed.data.status } },
  }).catch(() => {});

  return NextResponse.json({ success: true, status: parsed.data.status });
}
