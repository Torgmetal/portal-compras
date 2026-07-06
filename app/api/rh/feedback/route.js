// GET /api/rh/feedback?status= — lista os feedbacks enviados pelos funcionários. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const status = new URL(req.url).searchParams.get("status");
  const where = status && ["NOVO", "LIDO", "RESOLVIDO"].includes(status) ? { status } : {};
  const [feedbacks, novos] = await Promise.all([
    prisma.feedbackRH.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.feedbackRH.count({ where: { status: "NOVO" } }),
  ]);
  return NextResponse.json({ success: true, feedbacks, novos });
}
