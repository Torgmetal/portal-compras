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
  tipoDias: z.enum(["DU", "DC"]).optional(),
  ativo: z.boolean().optional(), // false = encerrar, true = reabrir
  titulo: z.string().min(1).max(300).optional(),
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

  // Encerrar ou reabrir cronograma
  if (parsed.data.ativo !== undefined && parsed.data.ativo !== cronograma.ativo) {
    const encerrar = !parsed.data.ativo;
    ops.push(
      prisma.cronograma.update({
        where: { id },
        data: { ativo: parsed.data.ativo },
      })
    );
    revisoes.push({
      cronogramaId: id,
      tipo: encerrar ? "CRONOGRAMA_ENCERRADO" : "CRONOGRAMA_REABERTO",
      descricao: encerrar
        ? `Cronograma encerrado por ${user.name || "usuário"}`
        : `Cronograma reaberto por ${user.name || "usuário"}`,
      diff: { ativo: { antes: cronograma.ativo, depois: parsed.data.ativo } },
      createdById: user.id,
    });
    ops.push(
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: encerrar ? "ENCERRAR_CRONOGRAMA" : "REABRIR_CRONOGRAMA",
          entity: "Cronograma",
          entityId: id,
          diff: { opNumero: cronograma.opNumero, titulo: cronograma.titulo },
        },
      })
    );
  }

  // Alterar titulo
  if (parsed.data.titulo && parsed.data.titulo !== cronograma.titulo) {
    ops.push(
      prisma.cronograma.update({
        where: { id },
        data: { titulo: parsed.data.titulo },
      })
    );
    ops.push(
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "RENAME_CRONOGRAMA",
          entity: "Cronograma",
          entityId: id,
          diff: { antes: { titulo: cronograma.titulo }, depois: { titulo: parsed.data.titulo } },
        },
      })
    );
  }

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

  // Alterar tipo de dias (DU/DC)
  if (parsed.data.tipoDias && parsed.data.tipoDias !== cronograma.tipoDias) {
    const anterior = cronograma.tipoDias || "DU";
    ops.push(
      prisma.cronograma.update({
        where: { id },
        data: { tipoDias: parsed.data.tipoDias },
      })
    );
    revisoes.push({
      cronogramaId: id,
      tipo: "TAREFA_ALTERADA",
      descricao: `Tipo de dias alterado: ${anterior === "DU" ? "Dias Úteis" : "Dias Corridos"} → ${parsed.data.tipoDias === "DU" ? "Dias Úteis" : "Dias Corridos"}`,
      diff: { campo: "tipoDias", antes: anterior, depois: parsed.data.tipoDias },
      createdById: user.id,
    });
  }

  // Alterar datas do cronograma — bloqueado se baseline já definida
  const cronData = {};
  if (parsed.data.dataInicio || parsed.data.dataFim) {
    if (cronograma.dataBase) {
      return NextResponse.json(
        { success: false, error: "Datas do cronograma não podem ser alteradas após definir a linha de base" },
        { status: 400 }
      );
    }
  }
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

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: { id: true, opNumero: true, titulo: true },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.cronograma.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE_CRONOGRAMA",
        entity: "Cronograma",
        entityId: id,
        diff: { opNumero: cronograma.opNumero, titulo: cronograma.titulo },
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
