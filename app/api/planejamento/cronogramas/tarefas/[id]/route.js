import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const patchSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  percentualRealizado: z.number().min(0).max(100).optional(),
  observacao: z.string().max(500).optional(),
  dataRealizacao: z.string().datetime().nullable().optional(),
  dataInicioPrevista: z.string().datetime().nullable().optional(),
  dataFimPrevista: z.string().datetime().nullable().optional(),
  justificativa: z.string().max(500).optional(),
  qtdePlanejada: z.number().min(0).optional(),
  qtdeRealizada: z.number().min(0).optional(),
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

  const tarefa = await prisma.cronogramaTarefa.findUnique({
    where: { id },
    include: { cronograma: { select: { id: true, dataBase: true } } },
  });
  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa nao encontrada" }, { status: 404 });
  }

  const data = {};
  const diffAntes = {};
  const diffDepois = {};

  if (parsed.data.nome !== undefined && parsed.data.nome !== tarefa.nome) {
    diffAntes.nome = tarefa.nome;
    diffDepois.nome = parsed.data.nome;
    data.nome = parsed.data.nome;
  }
  if (parsed.data.percentualRealizado !== undefined && parsed.data.percentualRealizado !== tarefa.percentualRealizado) {
    diffAntes.percentualRealizado = tarefa.percentualRealizado;
    diffDepois.percentualRealizado = parsed.data.percentualRealizado;
    data.percentualRealizado = parsed.data.percentualRealizado;
  }
  if (parsed.data.qtdePlanejada !== undefined && parsed.data.qtdePlanejada !== tarefa.qtdePlanejada) {
    diffAntes.qtdePlanejada = tarefa.qtdePlanejada;
    diffDepois.qtdePlanejada = parsed.data.qtdePlanejada;
    data.qtdePlanejada = parsed.data.qtdePlanejada;
  }
  if (parsed.data.qtdeRealizada !== undefined && parsed.data.qtdeRealizada !== tarefa.qtdeRealizada) {
    diffAntes.qtdeRealizada = tarefa.qtdeRealizada;
    diffDepois.qtdeRealizada = parsed.data.qtdeRealizada;
    data.qtdeRealizada = parsed.data.qtdeRealizada;
  }
  if (parsed.data.observacao !== undefined) data.observacao = parsed.data.observacao;
  if (parsed.data.dataRealizacao !== undefined) {
    data.dataRealizacao = parsed.data.dataRealizacao ? new Date(parsed.data.dataRealizacao) : null;
  }
  if (parsed.data.dataInicioPrevista !== undefined) {
    const novo = parsed.data.dataInicioPrevista ? new Date(parsed.data.dataInicioPrevista) : null;
    if (tarefa.dataInicioPrevista?.toISOString() !== novo?.toISOString()) {
      diffAntes.dataInicioPrevista = tarefa.dataInicioPrevista?.toISOString() || null;
      diffDepois.dataInicioPrevista = novo?.toISOString() || null;
      data.dataInicioPrevista = novo;
    }
  }
  if (parsed.data.dataFimPrevista !== undefined) {
    const novo = parsed.data.dataFimPrevista ? new Date(parsed.data.dataFimPrevista) : null;
    if (tarefa.dataFimPrevista?.toISOString() !== novo?.toISOString()) {
      diffAntes.dataFimPrevista = tarefa.dataFimPrevista?.toISOString() || null;
      diffDepois.dataFimPrevista = novo?.toISOString() || null;
      data.dataFimPrevista = novo;
    }
  }

  const ops = [
    prisma.cronogramaTarefa.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_CRONOGRAMA_TAREFA",
        entity: "CronogramaTarefa",
        entityId: id,
        diff: { antes: { percentualRealizado: tarefa.percentualRealizado, observacao: tarefa.observacao }, depois: data },
      },
    }),
  ];

  // Se tem justificativa, cria registro permanente
  if (parsed.data.justificativa) {
    ops.push(
      prisma.cronogramaRegistro.create({
        data: {
          tarefaId: id,
          descricao: parsed.data.justificativa,
          createdById: user.id,
        },
      })
    );
  }

  // Se cronograma tem baseline e houve alteracao de datas/progresso, gera revisao
  if (tarefa.cronograma.dataBase && Object.keys(diffDepois).length > 0) {
    const partes = [];
    if (diffDepois.percentualRealizado !== undefined) {
      partes.push(`progresso ${diffAntes.percentualRealizado}% → ${diffDepois.percentualRealizado}%`);
    }
    if (diffDepois.dataInicioPrevista !== undefined) {
      partes.push(`início alterado`);
    }
    if (diffDepois.dataFimPrevista !== undefined) {
      partes.push(`fim alterado`);
    }

    ops.push(
      prisma.cronogramaRevisao.create({
        data: {
          cronogramaId: tarefa.cronograma.id,
          tipo: "TAREFA_ALTERADA",
          descricao: `${tarefa.nome}: ${partes.join(", ")}`,
          diff: { tarefa: tarefa.nome, antes: diffAntes, depois: diffDepois },
          createdById: user.id,
        },
      })
    );
  }

  await prisma.$transaction(ops);

  const updated = await prisma.cronogramaTarefa.findUnique({ where: { id } });
  return NextResponse.json({ success: true, tarefa: updated });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const tarefa = await prisma.cronogramaTarefa.findUnique({
    where: { id },
    select: { id: true, nome: true, cronogramaId: true },
  });
  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa não encontrada" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.cronogramaTarefa.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE_CRONOGRAMA_TAREFA",
        entity: "CronogramaTarefa",
        entityId: id,
        diff: { nome: tarefa.nome, cronogramaId: tarefa.cronogramaId },
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
