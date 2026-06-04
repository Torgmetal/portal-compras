import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

// POST /api/planejamento/cronogramas/[id]/recalcular
// Recalcula datas do cronograma baseado nas dependencias (antecessoras).
// Logica: finish-to-start — a tarefa sucessora so comeca quando todas as
// antecessoras terminam. Se uma antecessora atrasou (dataFimPrevista < hoje
// e percentualRealizado < 100), empurra as sucessoras proporcionalmente.
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: {
      tarefas: {
        orderBy: { uidMpp: "asc" },
        select: {
          id: true, nome: true, uidMpp: true, departamento: true,
          dataInicioPrevista: true, dataFimPrevista: true,
          dataInicioBase: true, dataFimBase: true,
          percentualRealizado: true, isSummary: true,
          outlineLevel: true, antecessoraIds: true,
        },
      },
    },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  const tarefas = cronograma.tarefas;
  const byId = new Map(tarefas.map((t) => [t.id, { ...t }]));

  // Ordena por dependencias (topological sort)
  const sorted = topoSort(tarefas, byId);
  if (!sorted) {
    return NextResponse.json({ success: false, error: "Ciclo de dependencias detectado. Verifique as antecessoras." }, { status: 400 });
  }

  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const updates = [];
  const alteracoes = [];

  for (const tarefa of sorted) {
    const t = byId.get(tarefa.id);
    if (!t || t.isSummary) continue;
    if (!t.antecessoraIds || t.antecessoraIds.length === 0) continue;

    // Calcula a data mais tardia de fim entre todas as antecessoras
    let maxFimAntecessora = null;
    for (const antId of t.antecessoraIds) {
      const ant = byId.get(antId);
      if (!ant) continue;

      // Se antecessora nao concluiu (< 100%), usa a data de hoje como referencia
      // de "quando vai terminar" — empurra pra frente.
      let fimEfetivo;
      if (ant.percentualRealizado >= 100 && ant.dataRealizacao) {
        fimEfetivo = new Date(ant.dataRealizacao);
      } else if (ant.percentualRealizado >= 100) {
        fimEfetivo = ant.dataFimPrevista ? new Date(ant.dataFimPrevista) : null;
      } else {
        // Antecessora nao concluida: a data efetiva e o MAX entre
        // dataFimPrevista e hoje (se ja passou, empurra pra hoje)
        const fimPrev = ant.dataFimPrevista ? new Date(ant.dataFimPrevista) : null;
        if (fimPrev && fimPrev < now) {
          fimEfetivo = new Date(now);
        } else {
          fimEfetivo = fimPrev;
        }
      }

      if (fimEfetivo && (!maxFimAntecessora || fimEfetivo > maxFimAntecessora)) {
        maxFimAntecessora = fimEfetivo;
      }
    }

    if (!maxFimAntecessora) continue;

    // A tarefa sucessora comeca no dia util seguinte apos a antecessora terminar
    const novoInicio = nextWorkday(maxFimAntecessora);

    // Se a tarefa ja tem datas, calcula a duracao original e mantem
    const oldInicio = t.dataInicioPrevista ? new Date(t.dataInicioPrevista) : null;
    const oldFim = t.dataFimPrevista ? new Date(t.dataFimPrevista) : null;

    if (oldInicio && novoInicio.getTime() !== oldInicio.getTime()) {
      const duracao = oldFim ? workdaysBetween(oldInicio, oldFim) : 0;
      const novoFim = duracao > 0 ? addWorkdays(novoInicio, duracao) : novoInicio;

      updates.push({
        id: t.id,
        dataInicioPrevista: novoInicio,
        dataFimPrevista: novoFim,
      });

      alteracoes.push(
        `${t.nome}: início ${fmtBR(oldInicio)} → ${fmtBR(novoInicio)}, ` +
        `fim ${fmtBR(oldFim)} → ${fmtBR(novoFim)}`
      );

      // Atualiza o mapa pra cascatear corretamente pros proximos
      t.dataInicioPrevista = novoInicio;
      t.dataFimPrevista = novoFim;
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Nenhuma data precisou ser ajustada.",
      alteracoes: 0,
    });
  }

  // Aplica updates em transacao
  const ops = updates.map((u) =>
    prisma.cronogramaTarefa.update({
      where: { id: u.id },
      data: {
        dataInicioPrevista: u.dataInicioPrevista,
        dataFimPrevista: u.dataFimPrevista,
      },
    })
  );

  // Revisao
  ops.push(
    prisma.cronogramaRevisao.create({
      data: {
        cronogramaId: id,
        tipo: "TAREFA_ALTERADA",
        descricao: `Recalculo de datas: ${updates.length} tarefa${updates.length > 1 ? "s" : ""} ajustada${updates.length > 1 ? "s" : ""}`,
        diff: { alteracoes },
        createdById: user.id,
      },
    })
  );

  ops.push(
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "RECALCULAR_CRONOGRAMA",
        entity: "Cronograma",
        entityId: id,
        diff: { tarefasAlteradas: updates.length },
      },
    })
  );

  await prisma.$transaction(ops);

  return NextResponse.json({
    success: true,
    message: `${updates.length} tarefa${updates.length > 1 ? "s" : ""} ajustada${updates.length > 1 ? "s" : ""}.`,
    alteracoes: updates.length,
    detalhes: alteracoes,
  });
}

// ---- helpers ----

function topoSort(tarefas, byId) {
  const inDegree = new Map();
  const adjList = new Map();

  for (const t of tarefas) {
    inDegree.set(t.id, 0);
    adjList.set(t.id, []);
  }

  for (const t of tarefas) {
    if (!t.antecessoraIds) continue;
    for (const antId of t.antecessoraIds) {
      if (!byId.has(antId)) continue;
      adjList.get(antId).push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    sorted.push(byId.get(curr));
    for (const next of adjList.get(curr) || []) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  // Se nao processou tudo, tem ciclo
  if (sorted.length !== tarefas.length) return null;
  return sorted;
}

function nextWorkday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  // Pula fim de semana
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function workdaysBetween(start, end) {
  let count = 0;
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  const e = new Date(end);
  e.setHours(12, 0, 0, 0);
  while (d < e) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return count;
}

function addWorkdays(start, days) {
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function fmtBR(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}
