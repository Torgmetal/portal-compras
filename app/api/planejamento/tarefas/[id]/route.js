import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { z } from "zod";

const schemaUpdate = z.object({
  titulo: z.string().min(1).optional(),
  descricao: z.string().nullable().optional(),
  status: z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]).optional(),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).optional(),
  responsavel: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  subtarefas: z.array(z.object({
    id: z.string(),
    titulo: z.string().min(1).max(200),
    feita: z.boolean(),
  })).max(50).optional(),
});

export async function PATCH(req, { params }) {
  try {
    // Qualquer setor logado responde/atualiza a sua tarefa (status, observação…).
    // Excluir (DELETE) segue só Planejamento/ADMIN.
    await requireUser();
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try {
    body = schemaUpdate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const data = { ...body };
  if (body.status === "CONCLUIDA") data.dataConcluida = new Date();
  if (body.status && body.status !== "CONCLUIDA") data.dataConcluida = null;

  const tarefa = await prisma.tarefaPlanejamento.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ tarefa });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  await prisma.tarefaPlanejamento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
