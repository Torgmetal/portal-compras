// GET /api/engenharia/sequencia/pessoas — quem pode ser dono de uma tarefa do setor.
//
// ⚠ Quem tem o MÓDULO do setor, não quem tem o cargo: é o módulo que diz quem trabalha ali dentro
// do portal, e é o mesmo critério que já decide o que a pessoa enxerga.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const modulo = new URL(req.url).searchParams.get("modulo") || "ENGENHARIA";
  const pessoas = await prisma.user.findMany({
    where: { ativo: true, tipo: { in: ["ADMIN", "USUARIO"] }, modulos: { some: { modulo } } },
    select: { id: true, name: true, setor: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, pessoas });
}
