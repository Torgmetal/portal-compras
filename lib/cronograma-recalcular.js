import { prisma } from "@/lib/prisma";

/**
 * Recalcula datas de tarefas de um cronograma com base nas dependencias (antecessoras).
 * Logica finish-to-start: a tarefa sucessora so comeca quando TODAS as antecessoras terminam.
 * Se uma antecessora nao concluiu e esta atrasada, empurra as sucessoras.
 *
 * @param {string} cronogramaId
 * @param {string} userId - pra audit/revisao
 * @returns {{ updates: Array, alteracoes: string[] }}
 */
export async function recalcularCronograma(cronogramaId, userId) {
  const cronograma = await prisma.cronograma.findUnique({
    where: { id: cronogramaId },
    include: {
      tarefas: {
        orderBy: { uidMpp: "asc" },
        select: {
          id: true, nome: true, uidMpp: true, departamento: true,
          dataInicioPrevista: true, dataFimPrevista: true,
          dataInicioBase: true, dataFimBase: true,
          percentualRealizado: true, isSummary: true,
          outlineLevel: true, antecessoraIds: true, dataRealizacao: true,
        },
      },
    },
  });

  if (!cronograma) return { updates: [], alteracoes: [], error: "Cronograma nao encontrado" };

  const tarefas = cronograma.tarefas;
  const byId = new Map(tarefas.map((t) => [t.id, { ...t }]));

  // Topological sort
  const sorted = topoSort(tarefas, byId);
  if (!sorted) return { updates: [], alteracoes: [], error: "Ciclo de dependencias detectado" };

  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const updates = [];
  const alteracoes = [];

  for (const tarefa of sorted) {
    const t = byId.get(tarefa.id);
    if (!t || t.isSummary) continue;
    if (!t.antecessoraIds || t.antecessoraIds.length === 0) continue;

    // Data mais tardia de fim entre todas as antecessoras
    let maxFimAntecessora = null;
    for (const antId of t.antecessoraIds) {
      const ant = byId.get(antId);
      if (!ant) continue;

      let fimEfetivo;
      if (ant.percentualRealizado >= 100 && ant.dataRealizacao) {
        fimEfetivo = new Date(ant.dataRealizacao);
      } else if (ant.percentualRealizado >= 100) {
        fimEfetivo = ant.dataFimPrevista ? new Date(ant.dataFimPrevista) : null;
      } else {
        // Antecessora nao concluida: empurra pra hoje se ja passou da data
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

    const novoInicio = nextWorkday(maxFimAntecessora);
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

  if (updates.length === 0) return { updates: [], alteracoes: [] };

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
        cronogramaId,
        tipo: "TAREFA_ALTERADA",
        descricao: `Recálculo automático: ${updates.length} tarefa${updates.length > 1 ? "s" : ""} ajustada${updates.length > 1 ? "s" : ""}`,
        diff: { alteracoes },
        createdById: userId,
      },
    })
  );

  ops.push(
    prisma.auditLog.create({
      data: {
        userId,
        action: "RECALCULAR_CRONOGRAMA",
        entity: "Cronograma",
        entityId: cronogramaId,
        diff: { tarefasAlteradas: updates.length, auto: true },
      },
    })
  );

  await prisma.$transaction(ops);

  return { updates, alteracoes };
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

  if (sorted.length !== tarefas.length) return null;
  return sorted;
}

export function nextWorkday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function workdaysBetween(start, end) {
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

export function addWorkdays(start, days) {
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
