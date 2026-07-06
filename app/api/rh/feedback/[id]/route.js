// PATCH /api/rh/feedback/[id]  { status } — marca NOVO/LIDO/RESOLVIDO. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["NOVO", "LIDO", "RESOLVIDO"]) });

export async function PATCH(req, { params }) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const existe = await prisma.feedbackRH.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ success: false, error: "Feedback não encontrado" }, { status: 404 });

  const fb = await prisma.feedbackRH.update({
    where: { id: params.id },
    data: { status: parsed.data.status, lidoEm: parsed.data.status === "NOVO" ? null : new Date() },
  });
  return NextResponse.json({ success: true, feedback: fb });
}
