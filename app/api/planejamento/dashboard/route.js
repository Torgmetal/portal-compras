import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  const opsAtivas = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: {
      id: true, numero: true, cliente: true, obra: true, status: true,
      dataInicio: true, dataFimPrevista: true,
      pecasConjunto: {
        select: { status: true, pesoTotalKg: true, qte: true },
      },
    },
    orderBy: { dataFimPrevista: "asc" },
  });

  const ops = opsAtivas.map((op) => {
    const totalPecas = op.pecasConjunto.length;
    const totalQte = op.pecasConjunto.reduce((s, p) => s + p.qte, 0);
    const pesoTotal = op.pecasConjunto.reduce((s, p) => s + p.pesoTotalKg, 0);
    const expedidas = op.pecasConjunto.filter((p) => p.status === "EXPEDIDO");
    const pesoExpedido = expedidas.reduce((s, p) => s + p.pesoTotalKg, 0);
    const qteExpedida = expedidas.reduce((s, p) => s + p.qte, 0);

    const porSetor = {};
    for (const p of op.pecasConjunto) {
      if (!porSetor[p.status]) porSetor[p.status] = { count: 0, peso: 0, qte: 0 };
      porSetor[p.status].count++;
      porSetor[p.status].peso += p.pesoTotalKg;
      porSetor[p.status].qte += p.qte;
    }

    const progresso = pesoTotal > 0 ? (pesoExpedido / pesoTotal) * 100 : 0;
    const atrasada = op.dataFimPrevista && new Date(op.dataFimPrevista) < new Date() && progresso < 100;

    return {
      id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra,
      status: op.status, dataInicio: op.dataInicio, dataFimPrevista: op.dataFimPrevista,
      totalPecas, totalQte, pesoTotal, pesoExpedido, qteExpedida,
      progresso: Math.round(progresso * 10) / 10,
      atrasada, porSetor,
    };
  });

  const now = new Date();
  const semanaAtual = getISOWeek(now);
  const anoAtual = getISOYear(now);

  const tarefasSemana = await prisma.tarefaPlanejamento.groupBy({
    by: ["status"],
    where: { semanaIso: semanaAtual, ano: anoAtual },
    _count: true,
  });

  const necessidadesSemana = await prisma.necessidadeSemanal.findMany({
    where: { semanaIso: semanaAtual, ano: anoAtual },
    orderBy: [{ prioridade: "asc" }, { opNumero: "asc" }],
  });

  return NextResponse.json({
    ops,
    semanaAtual, anoAtual,
    tarefasSemana: tarefasSemana.map((t) => ({ status: t.status, count: t._count })),
    necessidadesSemana,
  });
}

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getISOYear(d) {
  const date = new Date(d.getTime());
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  return date.getFullYear();
}
