import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { recalcularCronograma, rollupPercentualDepartamentos } from "@/lib/cronograma-recalcular";
import { registrarArea } from "@/lib/cronograma-areas";
import { montarAtualizacaoDaTarefa } from "@/lib/cronograma-tarefa-patch";
import { montarOperacoesDoPatch } from "@/lib/cronograma-tarefa-ops";
import { log } from "@/lib/log";

const registro = log("api/planejamento/cronogramas/tarefas/[id]");

const patchSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  area: z.string().max(120).nullable().optional(),
  percentualRealizado: z.number().min(0).max(100).optional(),
  observacao: z.string().max(500).nullable().optional(),
  dataRealizacao: z.string().datetime().nullable().optional(),
  // Execução REAL — não altera previsto/base (o atraso é derivado na tela)
  dataInicioReal: z.string().datetime().nullable().optional(),
  dataFimReal: z.string().datetime().nullable().optional(),
  dataInicioPrevista: z.string().datetime().nullable().optional(),
  dataFimPrevista: z.string().datetime().nullable().optional(),
  dataLiberacao: z.string().datetime().nullable().optional(),
  motivoBloqueio: z.string().max(300).nullable().optional(),
  justificativa: z.string().max(500).optional(),
  qtdePlanejada: z.number().min(0).optional(),
  qtdeRealizada: z.number().min(0).optional(),
  antecessoraIds: z.array(z.string()).optional(),
  // ⚠ null limpa o dono (a pessoa saiu do setor, a tarefa volta para a fila sem dono)
  responsavelId: z.string().nullable().optional(),
  // estimativa de dias ÚTEIS que ainda faltam, dada por quem executa
  diasParaConcluir: z.number().int().min(0).max(999).nullable().optional(),
  // de quem se espera enquanto a tarefa está em hold
  esperaDe: z.enum(["CLIENTE", "FORNECEDOR", "SETOR_INTERNO"]).nullable().optional(),
  duracaoDias: z.number().int().min(0).max(9999).optional(),
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
    include: { cronograma: { select: { id: true, dataBase: true, tipoDias: true } } },
  });
  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa nao encontrada" }, { status: 404 });
  }

  // Se cronograma esta validado (dataBase existe) e datas estao mudando, exige justificativa
  const inicioMudou =
    parsed.data.dataInicioPrevista !== undefined &&
    tarefa.dataInicioPrevista?.toISOString() !== (parsed.data.dataInicioPrevista ? new Date(parsed.data.dataInicioPrevista).toISOString() : null);
  const fimMudou =
    parsed.data.dataFimPrevista !== undefined &&
    tarefa.dataFimPrevista?.toISOString() !== (parsed.data.dataFimPrevista ? new Date(parsed.data.dataFimPrevista).toISOString() : null);

  if (tarefa.cronograma.dataBase && (inicioMudou || fimMudou) && !parsed.data.justificativa?.trim()) {
    return NextResponse.json(
      { success: false, error: "Justificativa obrigatória para alterar datas após validação do cronograma." },
      { status: 400 }
    );
  }

  const { data, diffAntes, diffDepois, antecessorasChanged } =
    await montarAtualizacaoDaTarefa(parsed.data, tarefa, id);
  const ops = montarOperacoesDoPatch(prisma, {
    id, data, diffAntes, diffDepois, tarefa,
    userId: user.id,
    justificativa: parsed.data.justificativa,
  });

  await prisma.$transaction(ops);

  // Cadastra a área (cor fixa) se veio uma nova ainda não listada no cronograma.
  if (data.area) await registrarArea(prisma, tarefa.cronograma.id, data.area).catch(() => {});

  // Recalcula datas automaticamente quando: antecessoras mudaram, progresso mudou
  // (pode destravar sucessoras) OU a DATA PREVISTA desta tarefa mudou — assim, ao
  // mexer na data de uma antecessora, as sucessoras deslocam sozinhas (finish-to-start).
  // A própria tarefa editada é preservada: raiz (sem antecessora) o recalc pula, e
  // com antecessora a `defasagemDias` gravada segura a data que o usuário digitou.
  const progressoMudou = diffDepois.percentualRealizado !== undefined;
  const datasPrevistasMudaram = diffDepois.dataInicioPrevista !== undefined || diffDepois.dataFimPrevista !== undefined;
  if (antecessorasChanged || progressoMudou || datasPrevistasMudaram) {
    try {
      await recalcularCronograma(tarefa.cronograma.id, user.id);
    } catch (e) {
      // Recalculo nao-fatal: a tarefa ja foi salva
      registro.erro("Erro no recalculo automatico:", e.message);
    }
  }

  // Rollup: recalcular percentual + datas das tarefas-resumo (setores). O recálculo
  // acima cascateia cross-setor (finish-to-start): uma edição em Engenharia pode mover
  // tarefas de Fabricação/Expedição, então rola TODOS os setores — não só o da tarefa
  // editada. Antes só o do editado era rolado e os resumos a jusante ficavam com as
  // datas velhas (o cabeçalho do setor lê summary.dataInicio/FimPrevista).
  // ⚠ o TÉRMINO REAL entra aqui: é ele que conclui a tarefa, e sem ele na lista o resumo do setor
  // (e o % do cronograma) ficava com o número velho até alguém mexer em outra coisa.
  const datasMudaram = diffDepois.dataInicioPrevista !== undefined || diffDepois.dataFimPrevista !== undefined || diffDepois.dataLiberacao !== undefined || diffDepois.motivoBloqueio !== undefined || data.dataFimReal !== undefined;
  if (progressoMudou || antecessorasChanged || datasMudaram) {
    try {
      await rollupPercentualDepartamentos(tarefa.cronograma.id, null);
    } catch (e) {
      registro.erro("Erro no rollup de departamentos:", e.message);
    }
  }

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
