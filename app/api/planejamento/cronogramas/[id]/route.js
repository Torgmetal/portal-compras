import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true, status: true } },
      tarefas: {
        orderBy: { uidMpp: "asc" },
        include: {
          registros: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { createdBy: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(cronograma);
}
