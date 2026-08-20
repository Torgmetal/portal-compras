// POST /api/planejamento/cronogramas/[id]/enviar-tarefas — libera as tarefas do cronograma pros
// setores. DELETE recolhe.
//
// Vitor (19/08/2026): "precisamos ajustar uma questão nos cronogramas. Em vez de deixarmos gerar
// automático, minha sugestão seria colocarmos um botão para enviar tarefas em cada cronograma;
// isso será enviado após a liberação do cronograma, não deve ser preenchido automático, pois
// algumas estruturas mudam de obra para obra".
//
// A razão é boa e vale registrar: o cronograma nasce de um MODELO, e o modelo não serve pra toda
// obra igual — tem obra sem cobertura, sem galvanização, com duas frentes, com montagem em campo.
// Enquanto o Planejamento está mexendo, aquelas linhas são rascunho. Publicar rascunho pros
// setores é pior que não publicar nada: cada um começa a se organizar por uma tarefa que vai
// mudar, e quando muda ninguém confia mais na tela.
//
// Então o envio é um ATO: alguém olha o cronograma, decide que está fechado, e clica. Daí as
// tarefas aparecem na Sequência de cada setor.
//
// 🚫 Não copia nada. As tarefas continuam sendo as `CronogramaTarefa` do próprio cronograma — o
// envio só destrava a leitura. Duplicar criaria duas verdades: a data mudaria no cronograma e a
// cópia do setor continuaria mostrando a antiga.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const PERFIS = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO"];

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const crono = await prisma.cronograma.findUnique({
    where: { id },
    select: {
      id: true, titulo: true, opNumero: true, tarefasEnviadasEm: true,
      tarefas: { where: { isSummary: false }, select: { id: true, departamento: true, dataFimPrevista: true } },
    },
  });
  if (!crono) return NextResponse.json({ error: "Cronograma não encontrado" }, { status: 404 });

  const comData = crono.tarefas.filter((t) => t.dataFimPrevista);
  // ⚠ Tarefa sem data não vira sequência: o setor não tem o que sequenciar. Barra aqui em vez de
  // publicar uma lista onde metade das linhas não tem prazo.
  if (!comData.length) {
    return NextResponse.json(
      { error: "As tarefas ainda não têm data. Gere as datas do cronograma antes de enviar aos setores." },
      { status: 400 }
    );
  }

  const atualizado = await prisma.cronograma.update({
    where: { id },
    data: { tarefasEnviadasEm: new Date(), tarefasEnviadasPorId: user.id },
    select: { tarefasEnviadasEm: true },
  });

  const porSetor = {};
  for (const t of comData) porSetor[t.departamento || "—"] = (porSetor[t.departamento || "—"] || 0) + 1;

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "enviar_tarefas_cronograma", entity: "Cronograma", entityId: id,
      diff: { titulo: crono.titulo, opNumero: crono.opNumero, tarefas: comData.length, porSetor },
    },
  });

  revalidatePath("/engenharia/sequencia");
  revalidatePath("/planejamento/tarefas");

  return NextResponse.json({
    ok: true,
    enviadasEm: atualizado.tarefasEnviadasEm,
    tarefas: comData.length,
    semData: crono.tarefas.length - comData.length,
    porSetor,
  });
}

// Recolher: volta a ser rascunho. Útil quando o cronograma foi enviado e precisou ser refeito —
// melhor sumir da Sequência do que deixar o setor seguindo data que já não vale.
export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  await prisma.cronograma.update({ where: { id }, data: { tarefasEnviadasEm: null, tarefasEnviadasPorId: null } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "recolher_tarefas_cronograma", entity: "Cronograma", entityId: id, diff: {} },
  });
  revalidatePath("/engenharia/sequencia");
  revalidatePath("/planejamento/tarefas");
  return NextResponse.json({ ok: true });
}
