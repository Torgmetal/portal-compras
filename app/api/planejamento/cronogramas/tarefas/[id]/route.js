import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const patchSchema = z.object({
  percentualRealizado: z.number().min(0).max(100).optional(),
  observacao: z.string().max(500).optional(),
  dataRealizacao: z.string().datetime().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json();

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const tarefa = await prisma.cronogramaTarefa.findUnique({ where: { id } });
  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa nao encontrada" }, { status: 404 });
  }

  const data = {};
  if (parsed.data.percentualRealizado !== undefined) data.percentualRealizado = parsed.data.percentualRealizado;
  if (parsed.data.observacao !== undefined) data.observacao = parsed.data.observacao;
  if (parsed.data.dataRealizacao !== undefined) {
    data.dataRealizacao = parsed.data.dataRealizacao ? new Date(parsed.data.dataRealizacao) : null;
  }

  const updated = await prisma.cronogramaTarefa.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE_CRONOGRAMA_TAREFA",
      entity: "CronogramaTarefa",
      entityId: id,
      diff: { antes: { percentualRealizado: tarefa.percentualRealizado, observacao: tarefa.observacao }, depois: data },
    },
  });

  return NextResponse.json({ success: true, tarefa: updated });
}
