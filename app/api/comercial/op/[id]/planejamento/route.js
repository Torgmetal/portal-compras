// GET /api/comercial/op/[id]/planejamento
// Dados da aba Planejamento da OP (comercial): o(s) cronograma(s) da OP (com as
// tarefas pro Gantt) + o histórico de tarefas de planejamento (em andamento +
// concluídas). Ata por OP entra em endpoint próprio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

// campos que o GanttInline (components/planejamento/GanttInline.jsx) consome
const TAREFA_GANTT = {
  id: true, uidMpp: true, nome: true, departamento: true,
  dataInicioPrevista: true, dataFimPrevista: true, dataInicioBase: true, dataFimBase: true,
  percentualRealizado: true, isSummary: true, outlineLevel: true,
  antecessoraIds: true, motivoBloqueio: true, dataLiberacao: true,
};

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const where = { OR: [{ opId: op.id }, { opNumero: op.numero }] };

  const [cronogramas, tarefas, lotes] = await Promise.all([
    prisma.cronograma.findMany({
      where, orderBy: { createdAt: "desc" },
      select: { id: true, titulo: true, dataInicio: true, dataFim: true, tarefas: { select: TAREFA_GANTT, orderBy: { uidMpp: "asc" } } },
    }),
    // Histórico: tarefas de planejamento em andamento + concluídas (as pendentes ficam de fora)
    prisma.tarefaPlanejamento.findMany({
      where: { AND: [where, { status: { in: ["EM_ANDAMENTO", "CONCLUIDA"] } }] },
      select: { id: true, titulo: true, descricao: true, setor: true, status: true, responsavel: true, dataPrevista: true, dataConcluida: true, prioridade: true, semanaIso: true, ano: true, updatedAt: true },
      orderBy: [{ dataConcluida: "desc" }, { updatedAt: "desc" }],
    }),
    // Lotes de entrega da OP (criados na Engenharia) — resumo pro Planejamento
    prisma.loteExpedicao.findMany({
      where: { opId: op.id },
      orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, ordem: true, nome: true, local: true, dataPrevista: true, pesoKg: true, status: true,
        _count: { select: { desenhos: true } },
      },
    }),
  ]);

  return NextResponse.json({ success: true, cronogramas, tarefas, lotes });
}
