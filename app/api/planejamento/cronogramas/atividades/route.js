import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/planejamento/cronogramas/atividades
// Lista todas as tarefas de cronogramas ativos (não-summary, outlineLevel > 1)
// para exibição na tela de Tarefas do planejamento.
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const filtroDepto = searchParams.get("departamento") || null;
  const filtroStatus = searchParams.get("status") || null; // "atrasada" | "no_prazo" | "concluida"
  const filtroOp = searchParams.get("op") || null;

  const where = {
    isSummary: false,
    outlineLevel: { gt: 1 },
    cronograma: { ativo: true },
  };

  if (filtroDepto) {
    where.departamento = filtroDepto;
  }

  if (filtroStatus === "concluida") {
    where.percentualRealizado = { gte: 100 };
  } else if (filtroStatus === "atrasada") {
    where.percentualRealizado = { lt: 100 };
    where.dataFimPrevista = { lt: new Date() };
  } else if (filtroStatus === "no_prazo") {
    where.percentualRealizado = { lt: 100 };
    where.OR = [
      { dataFimPrevista: null },
      { dataFimPrevista: { gte: new Date() } },
    ];
  }

  if (filtroOp) {
    where.cronograma = { ...where.cronograma, opNumero: { contains: filtroOp, mode: "insensitive" } };
  }

  const tarefas = await prisma.cronogramaTarefa.findMany({
    where,
    include: {
      cronograma: {
        select: {
          id: true,
          opNumero: true,
          titulo: true,
          op: {
            select: {
              id: true,
              numero: true,
              cliente: true,
              clienteEmail: true,
              clienteContato: true,
            },
          },
        },
      },
    },
    orderBy: [
      { dataFimPrevista: "asc" },
      { cronograma: { opNumero: "desc" } },
    ],
    take: 500,
  });

  const now = new Date();
  const result = tarefas.map((t) => ({
    id: t.id,
    nome: t.nome,
    departamento: t.departamento,
    dataInicioPrevista: t.dataInicioPrevista,
    dataFimPrevista: t.dataFimPrevista,
    percentualRealizado: t.percentualRealizado,
    observacao: t.observacao,
    opNumero: t.cronograma.opNumero,
    opCliente: t.cronograma.op?.cliente || null,
    opClienteEmail: t.cronograma.op?.clienteEmail || null,
    opClienteContato: t.cronograma.op?.clienteContato || null,
    cronogramaId: t.cronograma.id,
    cronogramaTitulo: t.cronograma.titulo,
    atrasada: !!(t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100),
    concluida: t.percentualRealizado >= 100,
    diasAtraso: t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100
      ? Math.ceil((now - new Date(t.dataFimPrevista)) / 86400000)
      : 0,
  }));

  return NextResponse.json({ success: true, atividades: result });
}
