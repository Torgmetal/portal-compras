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
  // ⚠ segunda confirmação, só quando há baseline — ver o guard mais abaixo
  confirmarSobreBaseline: z.boolean().default(false),
  encadearSetor: z.boolean().default(false), // encadeia tarefas do mesmo setor em sequência (quando sem antecessora)
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
      // ⚠ `dataBase` decide se há baseline a proteger; as datas ATUAIS de cada tarefa são o que a
      // revisão precisa guardar para que dê para desfazer.
      id: true, dataInicio: true, tipoDias: true, dataBase: true,
      tarefas: {
        orderBy: { uidMpp: "asc" },
        select: {
          id: true, nome: true, uidMpp: true, departamento: true, isSummary: true,
          antecessoraIds: true, duracaoDias: true, defasagemDias: true,
          dataInicioPrevista: true, dataFimPrevista: true,
        },
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
    encadearSetor: parsed.data.encadearSetor,
  });
  if (error) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  const semDuracao = preview.filter((p) => p.semDuracao).length;

  // Prévia — não grava nada
  if (!parsed.data.aplicar) {
    return NextResponse.json({ success: true, preview, semDuracao });
  }

  // ⚠⚠ CRONOGRAMA COM BASELINE NÃO SE REGERA POR ACIDENTE. O "Gerar Datas" ignora `dataLiberacao`,
  // ignora bloqueio e não pede justificativa — e para tarefa com `duracaoDias = 0` ele põe início
  // igual ao fim. Rodado hoje na OP-083, transformaria 14/04→12/10 em **14/04→23/04**: as 46 de 46
  // tarefas estão com duração zero. A OP-085 iria de 06/04→04/08 para 06/04→10/04.
  //
  // A tela já avisa em âmbar e obriga calcular a prévia antes — o risco é clicar através do aviso.
  // E em OP-083, OP-067 e OP-071 **não há baseline nem snapshot**: ali a perda é definitiva.
  //
  // Com baseline definido, exige confirmação explícita. Sem baseline, segue como era.
  if (cronograma.dataBase && !parsed.data.confirmarSobreBaseline) {
    return NextResponse.json({
      success: false,
      precisaConfirmar: true,
      semDuracao,
      error: `Este cronograma tem baseline definido${semDuracao ? ` e ${semDuracao} tarefa${semDuracao > 1 ? "s" : ""} sem duração — elas ficariam com início igual ao fim` : ""}. Gerar datas reescreve tudo por cima da baseline. Confirme para prosseguir.`,
    }, { status: 409 });
  }

  // Aplicar — grava as datas de cada tarefa + data início/fim do cronograma
  const fimProjeto = preview.reduce((max, p) => (!max || p.fim > max ? p.fim : max), null);

  // ⚠ GUARDA O ANTES. O recálculo grava `CronogramaRevisao` com data velha e nova de cada tarefa;
  // o Gerar Datas gravava só uma contagem no AuditLog — sem as datas antigas não há como desfazer.
  const porId = new Map(cronograma.tarefas.map((t) => [t.id, t]));
  const alteracoes = preview.map((p) => {
    const antes = porId.get(p.id);
    return {
      id: p.id, nome: antes?.nome || null,
      inicioAntes: antes?.dataInicioPrevista || null, inicioDepois: p.inicio,
      fimAntes: antes?.dataFimPrevista || null, fimDepois: p.fim,
      semDuracao: !!p.semDuracao,
    };
  });
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
    prisma.cronogramaRevisao.create({
      data: {
        cronogramaId: id,
        tipo: "TAREFA_ALTERADA",
        descricao: `Gerar Datas (${cronograma.tipoDias || "DU"}): ${preview.length} tarefa${preview.length > 1 ? "s" : ""} reescrita${preview.length > 1 ? "s" : ""}${semDuracao ? `, ${semDuracao} sem duração` : ""}`,
        diff: { alteracoes, semDuracao, tipoDias: cronograma.tipoDias || "DU", sobreBaseline: !!cronograma.dataBase },
        createdById: user.id,
      },
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
