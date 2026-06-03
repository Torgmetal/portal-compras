import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const createSchema = z.object({
  nome: z.string().min(1).max(200),
  departamento: z.enum(["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"]),
  dataInicioPrevista: z.string().datetime().nullable().optional(),
  dataFimPrevista: z.string().datetime().nullable().optional(),
  isSummary: z.boolean().default(false),
  outlineLevel: z.number().int().min(0).max(5).default(2),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: { id: true, tarefas: { select: { uidMpp: true }, orderBy: { uidMpp: "desc" }, take: 1 } },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });
  }

  const nextUid = (cronograma.tarefas[0]?.uidMpp || 0) + 1;

  const tarefa = await prisma.cronogramaTarefa.create({
    data: {
      cronogramaId: id,
      uidMpp: nextUid,
      nome: parsed.data.nome,
      departamento: parsed.data.departamento,
      dataInicioPrevista: parsed.data.dataInicioPrevista ? new Date(parsed.data.dataInicioPrevista) : null,
      dataFimPrevista: parsed.data.dataFimPrevista ? new Date(parsed.data.dataFimPrevista) : null,
      isSummary: parsed.data.isSummary,
      outlineLevel: parsed.data.outlineLevel,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE_CRONOGRAMA_TAREFA",
      entity: "CronogramaTarefa",
      entityId: tarefa.id,
      diff: { cronogramaId: id, nome: parsed.data.nome, departamento: parsed.data.departamento },
    },
  });

  return NextResponse.json({ success: true, tarefa });
}
