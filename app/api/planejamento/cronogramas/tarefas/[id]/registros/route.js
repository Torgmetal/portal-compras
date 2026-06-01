import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  descricao: z.string().min(1).max(1000),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json();

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const tarefa = await prisma.cronogramaTarefa.findUnique({ where: { id } });
  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa nao encontrada" }, { status: 404 });
  }

  const registro = await prisma.cronogramaRegistro.create({
    data: {
      tarefaId: id,
      descricao: parsed.data.descricao,
      createdById: user.id,
    },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ success: true, registro });
}
