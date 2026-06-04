import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET /api/planejamento/cronogramas/cobranca/[token]
// Publico (sem auth) — retorna dados da cobranca pra tela de resposta
export async function GET(req, { params }) {
  const { token } = await params;

  const cobranca = await prisma.cronogramaCobranca.findUnique({
    where: { token },
    include: {
      cronograma: {
        select: {
          id: true, titulo: true, opNumero: true,
          op: { select: { numero: true, cliente: true, obra: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!cobranca) {
    return NextResponse.json({ success: false, error: "Link invalido ou expirado" }, { status: 404 });
  }

  // Busca as tarefas cobradas
  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { id: { in: cobranca.tarefaIds } },
    select: {
      id: true, nome: true, departamento: true,
      dataInicioPrevista: true, dataFimPrevista: true,
      percentualRealizado: true, observacao: true,
    },
    orderBy: { uidMpp: "asc" },
  });

  return NextResponse.json({
    success: true,
    cobranca: {
      id: cobranca.id,
      departamento: cobranca.departamento,
      respondido: cobranca.respondido,
      respondidoAt: cobranca.respondidoAt,
      respondidoPor: cobranca.respondidoPor,
      respostas: cobranca.respostas,
      createdAt: cobranca.createdAt,
      cobradoPor: cobranca.createdBy?.name || "Planejamento",
    },
    cronograma: {
      titulo: cobranca.cronograma.titulo,
      opNumero: cobranca.cronograma.opNumero,
      op: cobranca.cronograma.op,
    },
    tarefas,
  });
}

// POST /api/planejamento/cronogramas/cobranca/[token]
// Publico (sem auth) — setor responde com novas datas previstas
const respostaSchema = z.object({
  respondidoPor: z.string().min(1).max(100),
  respostas: z.array(z.object({
    tarefaId: z.string(),
    novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    comentario: z.string().max(300).nullable().optional(),
  })),
});

export async function POST(req, { params }) {
  const { token } = await params;

  const cobranca = await prisma.cronogramaCobranca.findUnique({
    where: { token },
    select: { id: true, cronogramaId: true, tarefaIds: true, respondido: true, departamento: true, createdById: true },
  });

  if (!cobranca) {
    return NextResponse.json({ success: false, error: "Link invalido ou expirado" }, { status: 404 });
  }

  if (cobranca.respondido) {
    return NextResponse.json({ success: false, error: "Esta cobranca ja foi respondida" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = respostaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { respondidoPor, respostas } = parsed.data;

  // Filtra apenas respostas de tarefas que foram cobradas
  const respostasValidas = respostas.filter((r) => cobranca.tarefaIds.includes(r.tarefaId));

  const ops = [];

  // Atualiza a cobranca
  ops.push(
    prisma.cronogramaCobranca.update({
      where: { id: cobranca.id },
      data: {
        respondido: true,
        respondidoAt: new Date(),
        respondidoPor,
        respostas: respostasValidas,
      },
    })
  );

  // Atualiza datas das tarefas que receberam nova data
  for (const r of respostasValidas) {
    if (!r.novaData) continue;
    const novaDataFim = new Date(r.novaData + "T12:00:00Z");

    ops.push(
      prisma.cronogramaTarefa.update({
        where: { id: r.tarefaId },
        data: { dataFimPrevista: novaDataFim },
      })
    );
  }

  // Registra revisao
  const respostasComData = respostasValidas.filter((r) => r.novaData);
  if (respostasComData.length > 0) {
    ops.push(
      prisma.cronogramaRevisao.create({
        data: {
          cronogramaId: cobranca.cronogramaId,
          tipo: "TAREFA_ALTERADA",
          descricao: `Resposta de cobranca (${cobranca.departamento}): ${respostasComData.length} tarefa(s) com nova data — por ${respondidoPor}`,
          diff: { respostas: respostasValidas, respondidoPor },
          createdById: cobranca.createdById,
        },
      })
    );
  }

  // Audit
  ops.push(
    prisma.auditLog.create({
      data: {
        userId: cobranca.createdById,
        action: "RESPONDER_COBRANCA_CRONOGRAMA",
        entity: "CronogramaCobranca",
        entityId: cobranca.id,
        diff: { respondidoPor, respostas: respostasValidas },
      },
    })
  );

  await prisma.$transaction(ops);

  return NextResponse.json({ success: true, message: "Resposta registrada com sucesso" });
}
