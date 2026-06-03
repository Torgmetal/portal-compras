import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: {
      op: { select: {
        id: true, numero: true, cliente: true, obra: true, status: true,
        descricao: true, clienteRazaoSocial: true, clienteCnpj: true,
        clienteCidade: true, clienteUF: true, clienteContato: true,
        clienteEmail: true, clienteTelefone: true, clienteEndereco: true,
        clienteCep: true, dataInicio: true, dataFimPrevista: true,
        valorTotalContrato: true,
      } },
      tarefas: {
        orderBy: { uidMpp: "asc" },
        include: {
          registros: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { createdBy: { select: { name: true } } },
          },
        },
      },
      revisoes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { createdBy: { select: { name: true } } },
      },
    },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(cronograma);
}

// PATCH /api/planejamento/cronogramas/[id]
// Atualiza data base (baseline) do cronograma e/ou datas.
// Quando dataBase e definida, faz snapshot das datas atuais das tarefas.
const patchSchema = z.object({
  dataBase: z.string().datetime().optional(),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
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

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: { tarefas: { select: { id: true, dataInicioPrevista: true, dataFimPrevista: true } } },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  const ops = [];
  const revisoes = [];

  // Definir/alterar data base → snapshot baseline
  if (parsed.data.dataBase) {
    const novaDataBase = new Date(parsed.data.dataBase);
    const jaTemBaseline = !!cronograma.dataBase;

    ops.push(
      prisma.cronograma.update({
        where: { id },
        data: { dataBase: novaDataBase },
      })
    );

    // Snapshot: grava datas atuais como baseline em cada tarefa
    for (const t of cronograma.tarefas) {
      ops.push(
        prisma.cronogramaTarefa.update({
          where: { id: t.id },
          data: {
            dataInicioBase: t.dataInicioPrevista,
            dataFimBase: t.dataFimPrevista,
          },
        })
      );
    }

    revisoes.push({
      cronogramaId: id,
      tipo: "BASELINE_DEFINIDA",
      descricao: jaTemBaseline
        ? `Baseline redefinida para ${novaDataBase.toLocaleDateString("pt-BR")} (${cronograma.tarefas.length} tarefas)`
        : `Baseline definida em ${novaDataBase.toLocaleDateString("pt-BR")} (${cronograma.tarefas.length} tarefas)`,
      diff: {
        antes: cronograma.dataBase ? cronograma.dataBase.toISOString() : null,
        depois: novaDataBase.toISOString(),
      },
      createdById: user.id,
    });
  }

  // Alterar datas do cronograma
  const cronData = {};
  if (parsed.data.dataInicio) {
    const d = new Date(parsed.data.dataInicio);
    revisoes.push({
      cronogramaId: id,
      tipo: "DATA_ALTERADA",
      descricao: `Data início alterada para ${d.toLocaleDateString("pt-BR")}`,
      diff: { campo: "dataInicio", antes: cronograma.dataInicio?.toISOString(), depois: d.toISOString() },
      createdById: user.id,
    });
    cronData.dataInicio = d;
  }
  if (parsed.data.dataFim) {
    const d = new Date(parsed.data.dataFim);
    revisoes.push({
      cronogramaId: id,
      tipo: "DATA_ALTERADA",
      descricao: `Data fim alterada para ${d.toLocaleDateString("pt-BR")}`,
      diff: { campo: "dataFim", antes: cronograma.dataFim?.toISOString(), depois: d.toISOString() },
      createdById: user.id,
    });
    cronData.dataFim = d;
  }
  if (Object.keys(cronData).length > 0) {
    ops.push(prisma.cronograma.update({ where: { id }, data: cronData }));
  }

  if (revisoes.length > 0) {
    ops.push(prisma.cronogramaRevisao.createMany({ data: revisoes }));
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  return NextResponse.json({ success: true });
}
