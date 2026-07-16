import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { gerarDatasCronograma, rollupPercentualDepartamentos } from "@/lib/cronograma-recalcular";

export const runtime = "nodejs";
export const maxDuration = 20;

// POST /api/planejamento/cronogramas/[id]/gerar-datas
// Gera as datas de todas as tarefas a partir de uma data de início do projeto +
// a duração de cada tarefa + as antecessoras. aplicar=false → só devolve a prévia
// (não grava); aplicar=true → grava as datas.
const schema = z.object({
  dataInicioProjeto: z.string().datetime().optional(),
  aplicar: z.boolean().default(false),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: {
      id: true, dataInicio: true, tipoDias: true,
      tarefas: {
        orderBy: { uidMpp: "asc" },
        select: { id: true, nome: true, uidMpp: true, departamento: true, isSummary: true, antecessoraIds: true, duracaoDias: true, defasagemDias: true },
      },
    },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });
  }

  const inicioProjeto = parsed.data.dataInicioProjeto
    ? new Date(parsed.data.dataInicioProjeto)
    : (cronograma.dataInicio ? new Date(cronograma.dataInicio) : new Date());

  const { preview, error } = gerarDatasCronograma(cronograma.tarefas, {
    dataInicioProjeto: inicioProjeto,
    tipoDias: cronograma.tipoDias,
  });
  if (error) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  const semDuracao = preview.filter((p) => p.semDuracao).length;

  // Prévia — não grava nada
  if (!parsed.data.aplicar) {
    return NextResponse.json({ success: true, preview, semDuracao });
  }

  // Aplicar — grava as datas de cada tarefa + data início/fim do cronograma
  const fimProjeto = preview.reduce((max, p) => (!max || p.fim > max ? p.fim : max), null);
  const ops = preview.map((p) =>
    prisma.cronogramaTarefa.update({
      where: { id: p.id },
      data: { dataInicioPrevista: p.inicio, dataFimPrevista: p.fim },
    })
  );
  ops.push(
    prisma.cronograma.update({
      where: { id },
      data: { dataInicio: inicioProjeto, ...(fimProjeto ? { dataFim: fimProjeto } : {}) },
    })
  );
  ops.push(
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "GERAR_DATAS_CRONOGRAMA",
        entity: "Cronograma",
        entityId: id,
        diff: { tarefas: preview.length, inicioProjeto: inicioProjeto.toISOString(), tipoDias: cronograma.tipoDias || "DU" },
      },
    })
  );

  await prisma.$transaction(ops);

  // Rollup dos resumos de departamento (mín. início / máx. fim / % médio)
  await rollupPercentualDepartamentos(id, null);

  return NextResponse.json({ success: true, aplicadas: preview.length, semDuracao, preview });
}
