// POST /api/planejamento/cronogramas/[id]/reordenar
// Reordena tarefas: recebe a lista de IDs na ordem desejada e REATRIBUI os
// uidMpp DAQUELE conjunto (permuta os valores que eles já têm) — assim a ordem
// muda em todas as visões (tela, Gantt, PDF, MS Project, que ordenam por uidMpp)
// SEM tocar em datas/antecessoras (reordenar não recalcula nada). Ideal p/ inserir
// uma tarefa esquecida na posição certa em vez de ela ficar no fim.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  ordem: z.array(z.string()).min(2, "Informe ao menos 2 tarefas na nova ordem."),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Só as tarefas que existem NESTE cronograma (segurança + validação).
  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { cronogramaId: id, id: { in: body.ordem } },
    select: { id: true, uidMpp: true },
  });
  if (tarefas.length < 2) return NextResponse.json({ success: false, error: "Tarefas não encontradas neste cronograma." }, { status: 404 });

  // Ordem final = só os IDs válidos, na sequência pedida.
  const validos = new Set(tarefas.map((t) => t.id));
  const ordemFinal = body.ordem.filter((tid) => validos.has(tid));

  // Reusa os PRÓPRIOS uidMpp do conjunto, do menor pro maior, na nova ordem —
  // não cria valor novo (zero risco de colidir com tarefas de fora do grupo).
  const uidsCrescente = tarefas.map((t) => t.uidMpp).sort((a, b) => a - b);

  const updates = ordemFinal.map((tid, i) =>
    prisma.cronogramaTarefa.update({ where: { id: tid }, data: { uidMpp: uidsCrescente[i] } })
  );

  await prisma.$transaction([
    ...updates,
    prisma.auditLog.create({
      data: { userId: user.id, action: "REORDENAR_CRONOGRAMA_TAREFAS", entity: "Cronograma", entityId: id, diff: { tarefas: ordemFinal.length } },
    }),
  ]);

  return NextResponse.json({ success: true, reordenadas: ordemFinal.length });
}
