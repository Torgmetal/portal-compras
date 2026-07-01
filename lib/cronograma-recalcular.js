import { prisma } from "@/lib/prisma";

/**
 * Recalcula datas de tarefas de um cronograma com base nas dependencias (antecessoras).
 * Logica finish-to-start: a tarefa sucessora so comeca quando TODAS as antecessoras terminam.
 * Se uma antecessora nao concluiu e esta atrasada, empurra as sucessoras.
 * Suporta modo DU (dias uteis — pula sab/dom) e DC (dias corridos).
 * Usa `duracaoDias` de cada tarefa para calcular dataFimPrevista a partir do inicio.
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
          dataLiberacao: true, motivoBloqueio: true, duracaoDias: true,
        },
      },
    },
  });

  if (!cronograma) return { updates: [], alteracoes: [], error: "Cronograma nao encontrado" };

  const tipoDias = cronograma.tipoDias || "DU";
  const isDU = tipoDias === "DU";
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

    const temAntecessoras = t.antecessoraIds && t.antecessoraIds.length > 0;
    const temLiberacao = !!t.dataLiberacao;
    const bloqueadaSemData = !!t.motivoBloqueio && !t.dataLiberacao;

    // Se nao tem antecessoras NEM liberacao NEM bloqueio, nada a recalcular
    if (!temAntecessoras && !temLiberacao && !bloqueadaSemData) continue;

    // 1) Calcula a data mais tardia de fim entre todas as antecessoras
    let maxFimAntecessora = null;
    if (temAntecessoras) {
      for (const antId of t.antecessoraIds) {
        const ant = byId.get(antId);
        if (!ant) continue;

        let fimEfetivo;
        // Antecessora bloqueada sem data de liberacao: trata como "nao pode terminar ainda"
        const antBloqueada = !!ant.motivoBloqueio && !ant.dataLiberacao && ant.percentualRealizado < 100;
        if (antBloqueada) {
          // Empurra para hoje — enquanto estiver bloqueada, toda recalculacao vai empurrar
          fimEfetivo = new Date(now);
        } else if (ant.percentualRealizado >= 100 && ant.dataRealizacao) {
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
    }

    // 2) Data de liberacao como piso minimo de inicio
    let dataMinInicio = null;
    if (maxFimAntecessora) {
      dataMinInicio = isDU ? nextWorkday(maxFimAntecessora) : nextCalendarDay(maxFimAntecessora);
    }
    if (temLiberacao) {
      const lib = new Date(t.dataLiberacao);
      lib.setHours(12, 0, 0, 0);
      if (!dataMinInicio || lib > dataMinInicio) {
        dataMinInicio = lib;
      }
    }
    // 2b) Tarefa bloqueada sem data de liberacao: empurra inicio para pelo menos hoje
    if (bloqueadaSemData) {
      const hoje = new Date(now);
      if (!dataMinInicio || hoje > dataMinInicio) {
        dataMinInicio = hoje;
      }
    }

    if (!dataMinInicio) continue;

    // Garante que cai num dia util (apenas em modo DU)
    if (isDU) {
      while (dataMinInicio.getDay() === 0 || dataMinInicio.getDay() === 6) {
        dataMinInicio.setDate(dataMinInicio.getDate() + 1);
      }
    }

    const novoInicio = dataMinInicio;
    const oldInicio = t.dataInicioPrevista ? new Date(t.dataInicioPrevista) : null;
    const oldFim = t.dataFimPrevista ? new Date(t.dataFimPrevista) : null;

    // Calcula duracao: usa duracaoDias se definido, senao deriva das datas existentes
    let duracao = t.duracaoDias || 0;
    if (duracao === 0 && oldInicio && oldFim) {
      duracao = isDU ? workdaysBetween(oldInicio, oldFim) : calendarDaysBetween(oldInicio, oldFim);
    }

    if (oldInicio && novoInicio.getTime() !== oldInicio.getTime()) {
      const novoFim = duracao > 0
        ? (isDU ? addWorkdays(novoInicio, duracao) : addCalendarDays(novoInicio, duracao))
        : novoInicio;

      updates.push({
        id: t.id,
        dataInicioPrevista: novoInicio,
        dataFimPrevista: novoFim,
      });

      const motivo = temLiberacao ? " (liberação)" : "";
      alteracoes.push(
        `${t.nome}${motivo}: início ${fmtBR(oldInicio)} → ${fmtBR(novoInicio)}, ` +
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

  // Atualiza dataFim do cronograma se alguma tarefa ultrapassou
  let maxFimGlobal = cronograma.dataFim ? new Date(cronograma.dataFim) : null;
  for (const t of tarefas) {
    const curr = byId.get(t.id);
    if (!curr || curr.isSummary) continue;
    const fim = curr.dataFimPrevista ? new Date(curr.dataFimPrevista) : null;
    if (fim && (!maxFimGlobal || fim > maxFimGlobal)) maxFimGlobal = fim;
  }
  if (maxFimGlobal && (!cronograma.dataFim || maxFimGlobal > new Date(cronograma.dataFim))) {
    ops.push(
      prisma.cronograma.update({
        where: { id: cronogramaId },
        data: { dataFim: maxFimGlobal },
      })
    );
    alteracoes.push(`Data fim do cronograma ajustada para ${fmtBR(maxFimGlobal)}`);
  }

  // Revisao
  ops.push(
    prisma.cronogramaRevisao.create({
      data: {
        cronogramaId,
        tipo: "TAREFA_ALTERADA",
        descricao: `Recálculo automático (${tipoDias}): ${updates.length} tarefa${updates.length > 1 ? "s" : ""} ajustada${updates.length > 1 ? "s" : ""}`,
        diff: { alteracoes, tipoDias },
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
        diff: { tarefasAlteradas: updates.length, auto: true, tipoDias },
      },
    })
  );

  await prisma.$transaction(ops);

  return { updates, alteracoes };
}

/**
 * GERA as datas do zero a partir de uma data de início do projeto + a duração de
 * cada tarefa + as antecessoras (finish-to-start). Diferente de recalcularCronograma
 * (que só DESLOCA datas já existentes e ignora tarefas sem data), aqui TODA tarefa
 * não-resumo recebe início/fim calculados:
 *   - sem antecessora  → começa na data de início do projeto;
 *   - com antecessora  → começa no dia seguinte ao maior fim das antecessoras (cross-setor);
 *   - fim = início + duracaoDias (DU pula sáb/dom; DC corridos). Duração 0 → fim = início.
 * Função PURA — não toca no banco. Retorna a prévia pra revisar antes de aplicar.
 *
 * @param {Array} tarefas - tarefas do cronograma (com id, isSummary, antecessoraIds, duracaoDias)
 * @param {{dataInicioProjeto: Date|string, tipoDias: string}} opts
 * @returns {{ preview: Array<{id,nome,departamento,inicio,fim,duracaoDias,semDuracao}>, error?: string }}
 */
export function gerarDatasCronograma(tarefas, { dataInicioProjeto, tipoDias }) {
  const isDU = (tipoDias || "DU") === "DU";
  const lista = tarefas || [];
  const byId = new Map(lista.map((t) => [t.id, { ...t }]));

  const sorted = topoSort(lista, byId);
  if (!sorted) {
    return { preview: [], error: "Ciclo de dependências: uma tarefa depende (direta ou indiretamente) de si mesma. Revise as antecessoras." };
  }

  const inicioProjeto = new Date(dataInicioProjeto);
  inicioProjeto.setHours(12, 0, 0, 0);
  if (isDU) {
    while (inicioProjeto.getDay() === 0 || inicioProjeto.getDay() === 6) {
      inicioProjeto.setDate(inicioProjeto.getDate() + 1);
    }
  }

  const preview = [];
  for (const tarefa of sorted) {
    const t = byId.get(tarefa.id);
    if (!t || t.isSummary) continue;

    // Início = dia seguinte ao maior fim das antecessoras; senão, início do projeto
    let maxFimAnt = null;
    for (const antId of t.antecessoraIds || []) {
      const ant = byId.get(antId);
      if (ant && ant._fim && (!maxFimAnt || ant._fim > maxFimAnt)) maxFimAnt = ant._fim;
    }
    let inicio = maxFimAnt
      ? (isDU ? nextWorkday(maxFimAnt) : nextCalendarDay(maxFimAnt))
      : new Date(inicioProjeto);
    if (isDU) {
      while (inicio.getDay() === 0 || inicio.getDay() === 6) inicio.setDate(inicio.getDate() + 1);
    }

    const dur = Number(t.duracaoDias) || 0;
    const fim = dur > 0
      ? (isDU ? addWorkdays(inicio, dur) : addCalendarDays(inicio, dur))
      : new Date(inicio);

    t._inicio = inicio;
    t._fim = fim;
    preview.push({
      id: t.id,
      nome: t.nome,
      departamento: t.departamento || null,
      inicio,
      fim,
      duracaoDias: dur,
      semDuracao: dur === 0,
    });
  }

  return { preview };
}

// ---- helpers DU (dias uteis) ----

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

// ---- helpers DC (dias corridos) ----

export function nextCalendarDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function calendarDaysBetween(start, end) {
  const s = new Date(start);
  s.setHours(12, 0, 0, 0);
  const e = new Date(end);
  e.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((e - s) / 86400000));
}

export function addCalendarDays(start, days) {
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtBR(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

/**
 * Recalcula o percentualRealizado E as datas (inicio/fim) da tarefa-resumo
 * (isSummary=true, outlineLevel=1) de um ou mais departamentos.
 * - Percentual = média simples das tarefas-filha
 * - dataInicioPrevista = menor dataInicioPrevista das filhas
 * - dataFimPrevista = maior dataFimPrevista das filhas
 *
 * @param {string} cronogramaId
 * @param {string|string[]|null} departamentos — um, vários ou null para todos
 */
export async function rollupPercentualDepartamentos(cronogramaId, departamentos) {
  const deptList = departamentos
    ? (Array.isArray(departamentos) ? departamentos : [departamentos])
    : null;

  // Buscar sumários do cronograma
  const summaryWhere = {
    cronogramaId,
    isSummary: true,
    outlineLevel: 1,
  };
  if (deptList) summaryWhere.departamento = { in: deptList };

  const summaries = await prisma.cronogramaTarefa.findMany({
    where: summaryWhere,
    select: { id: true, departamento: true },
  });

  if (summaries.length === 0) return;

  const deptIds = [...new Set(summaries.map((s) => s.departamento).filter(Boolean))];

  // Buscar todas as filhas dos departamentos de uma vez
  const filhas = await prisma.cronogramaTarefa.findMany({
    where: {
      cronogramaId,
      departamento: { in: deptIds },
      isSummary: false,
      outlineLevel: { gt: 1 },
    },
    select: {
      departamento: true,
      percentualRealizado: true,
      dataInicioPrevista: true,
      dataFimPrevista: true,
    },
  });

  // Agrupar por departamento
  const porDepto = {};
  for (const f of filhas) {
    if (!porDepto[f.departamento]) {
      porDepto[f.departamento] = { pcts: [], minInicio: null, maxFim: null };
    }
    const g = porDepto[f.departamento];
    g.pcts.push(f.percentualRealizado || 0);
    if (f.dataInicioPrevista) {
      const d = new Date(f.dataInicioPrevista);
      if (!g.minInicio || d < g.minInicio) g.minInicio = d;
    }
    if (f.dataFimPrevista) {
      const d = new Date(f.dataFimPrevista);
      if (!g.maxFim || d > g.maxFim) g.maxFim = d;
    }
  }

  // Atualizar cada summary
  const ops = [];
  for (const s of summaries) {
    const g = porDepto[s.departamento];
    if (!g || g.pcts.length === 0) continue;
    const media = Math.round(g.pcts.reduce((a, b) => a + b, 0) / g.pcts.length);
    const data = { percentualRealizado: media };
    if (g.minInicio) data.dataInicioPrevista = g.minInicio;
    if (g.maxFim) data.dataFimPrevista = g.maxFim;
    ops.push(
      prisma.cronogramaTarefa.update({
        where: { id: s.id },
        data,
      })
    );
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
}
