// GET /api/engenharia/listas/ops — OPs pra o seletor da importação de listas
// (o responsável escolhe a OP, não digita). numero + cliente/obra pra exibir.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({
    select: { numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });
  return NextResponse.json({
    ops: ops.map((o) => ({ numero: o.numero, cliente: o.cliente || null, obra: o.obra || null })),
  });
}
