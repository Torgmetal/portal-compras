import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req) {
  let user;
  try {
    user = await requireRole([
      "ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL",
      "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "EXPEDICAO", "RH",
    ]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url, "http://n");
  const filtro = searchParams.get("filtro") || "pendentes"; // pendentes | todos | concluidos
  const limite = Math.min(parseInt(searchParams.get("limite")) || 50, 200);

  const where = { userId: user.id };
  if (filtro === "pendentes") where.concluido = false;
  if (filtro === "concluidos") where.concluido = true;

  const compromissos = await prisma.compromisso.findMany({
    where,
    include: {
      tarefa: {
        select: { id: true, titulo: true, status: true, setor: true, semanaIso: true, ano: true },
      },
      criadoPor: { select: { name: true } },
    },
    orderBy: [{ concluido: "asc" }, { data: "asc" }, { prioridade: "asc" }],
    take: limite,
  });

  return NextResponse.json({ compromissos });
}
