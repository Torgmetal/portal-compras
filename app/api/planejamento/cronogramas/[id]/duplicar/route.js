// POST /api/planejamento/cronogramas/[id]/duplicar — copia o cronograma pra outra OP.
// Mesma estrutura (tarefas, durações, áreas, antecessoras remapeadas); zera progresso/
// baseline (é uma OP nova). Muda opNumero/opId/título. sharepointPath único via UUID.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  opNumero: z.string().min(1).max(40).transform((s) => s.trim().toUpperCase()),
  titulo: z.string().min(1).max(200),
  manterProgresso: z.boolean().optional().default(false), // copia %/execução/baseline da origem
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const { opNumero, titulo } = body;
  const manter = body.manterProgresso === true; // copia progresso/execução/baseline

  const origem = await prisma.cronograma.findUnique({
    where: { id },
    include: { tarefas: { orderBy: { uidMpp: "asc" } } },
  });
  if (!origem) return NextResponse.json({ success: false, error: "Cronograma de origem não encontrado" }, { status: 404 });

  // Resolve a OP destino (mesma lógica da criação manual: normaliza T113 → 113).
  const opNum = opNumero.replace(/^T0*/i, "").padStart(3, "0");
  const op = await prisma.oP.findUnique({ where: { numero: opNum } })
    || await prisma.oP.findFirst({ where: { numero: { endsWith: opNum } } });

  const novo = await prisma.$transaction(async (tx) => {
    const cron = await tx.cronograma.create({
      data: {
        opNumero,
        opId: op?.id || null,
        nomeArquivo: titulo,
        titulo,
        sharepointPath: `manual://${opNumero}/${randomUUID()}`,
        dataInicio: origem.dataInicio,
        dataFim: origem.dataFim,
        dataBase: manter ? origem.dataBase : null, // baseline: copia se manterProgresso, senão zera
        tipoDias: origem.tipoDias,
        areas: origem.areas ?? [],
        ativo: true,
      },
    });

    // ids novos pré-gerados → remapeia antecessoraIds num único createMany.
    const idMap = new Map(origem.tarefas.map((t) => [t.id, randomUUID()]));
    if (origem.tarefas.length > 0) {
      await tx.cronogramaTarefa.createMany({
        data: origem.tarefas.map((t) => ({
          id: idMap.get(t.id),
          cronogramaId: cron.id,
          uidMpp: t.uidMpp,
          nome: t.nome,
          departamento: t.departamento,
          area: t.area,
          dataInicioPrevista: t.dataInicioPrevista,
          dataFimPrevista: t.dataFimPrevista,
          percentualPrevisto: t.percentualPrevisto,
          qtdePlanejada: t.qtdePlanejada,
          isSummary: t.isSummary,
          outlineLevel: t.outlineLevel,
          parentUid: t.parentUid,
          antecessoraIds: (t.antecessoraIds || []).map((a) => idMap.get(a)).filter(Boolean),
          defasagemDias: t.defasagemDias,
          duracaoDias: t.duracaoDias,
          observacao: t.observacao,
          // Progresso/execução/baseline: copia da origem se manterProgresso, senão zera:
          percentualRealizado: manter ? t.percentualRealizado : 0,
          qtdeRealizada: manter ? t.qtdeRealizada : 0,
          dataRealizacao: manter ? t.dataRealizacao : null,
          dataInicioReal: manter ? t.dataInicioReal : null,
          dataFimReal: manter ? t.dataFimReal : null,
          dataInicioBase: manter ? t.dataInicioBase : null,
          dataFimBase: manter ? t.dataFimBase : null,
          dataLiberacao: manter ? t.dataLiberacao : null,
          motivoBloqueio: manter ? t.motivoBloqueio : null,
        })),
      });
    }
    return cron;
  }, { timeout: 30000 });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "DUPLICAR_CRONOGRAMA",
      entity: "Cronograma",
      entityId: novo.id,
      diff: { origemId: id, origemOp: origem.opNumero, novaOp: opNumero, titulo, tarefas: origem.tarefas.length, opVinculada: op?.numero || null, manterProgresso: manter },
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    id: novo.id,
    opVinculada: op ? { numero: op.numero, cliente: op.cliente } : null,
  });
}
