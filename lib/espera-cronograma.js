import "server-only";
import { prisma } from "./prisma";

// ─── O QUE A ESPERA DO CLIENTE EMPURRARIA ─────────────────────────────────────
// Vitor (29/08/2026): "alguns eventos são de responsabilidade do cliente e não medimos isso, e
// vários atrasos podem ser causados por isso" — e, depois de ver a simulação: "vamos no ponto 2; se
// caso avaliarmos ser necessário passarmos para o cronograma, aí atualizamos depois".
//
// ⚠⚠ ESTE MÓDULO NÃO ESCREVE DATA NENHUMA. Ele calcula e devolve o que ACONTECERIA. Mover o
// cronograma sozinho atravessa três setores — na TMSA, uma revisão parada na Engenharia desloca
// Preparação, Montagem, Solda, Pintura e Expedição — e o Planejamento tem de decidir isso, não
// descobrir na segunda-feira. Quando a decisão for aplicar, o motor já existe
// (recalcularCronograma); o que falta é o clique.
//
// ⚠ A DURAÇÃO DA ESPERA vem de `esperaInicio` quando existe. Sem ele (o passivo anterior à coluna),
// cai para o PRAZO VENCIDO da tarefa travada — aproximação conservadora, porque a espera pode ter
// começado antes do prazo. O retorno marca `estimado: true` nesse caso: número aproximado
// apresentado como exato é pior que número ausente.

const DIA = 86400000;
const meiaNoite = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };

/** Dias que esta tarefa está parada esperando alguém. */
export function diasDeEspera(t, hoje = new Date()) {
  const ref = t.esperaInicio || t.dataFimPrevista;
  if (!ref) return { dias: 0, estimado: false };
  const dias = Math.max(0, Math.round((meiaNoite(hoje) - meiaNoite(ref)) / DIA));
  return { dias, estimado: !t.esperaInicio };
}

/**
 * O impacto das esperas de um setor: quais tarefas se moveriam e o que acontece com a entrega.
 *
 * @param {string} setor  departamento das tarefas travadas (ex.: "ENGENHARIA")
 * @returns {Promise<Array>} um item por cronograma afetado
 */
export async function impactoDasEsperas(setor = "ENGENHARIA", hoje = new Date()) {
  const travadas = await prisma.cronogramaTarefa.findMany({
    where: {
      isSummary: false, departamento: setor, dataFimReal: null,
      motivoBloqueio: { not: null }, dataLiberacao: null, dataFimPrevista: { not: null },
      cronograma: { ativo: true },
    },
    select: {
      id: true, nome: true, motivoBloqueio: true, esperaInicio: true, dataFimPrevista: true, cronogramaId: true,
      cronograma: { select: { id: true, opNumero: true, op: { select: { id: true, numero: true, cliente: true, obra: true } } } },
    },
  });
  if (!travadas.length) return [];

  const cronoIds = [...new Set(travadas.map((t) => t.cronogramaId))];
  const todas = await prisma.cronogramaTarefa.findMany({
    where: { cronogramaId: { in: cronoIds }, isSummary: false },
    select: { id: true, nome: true, departamento: true, antecessoraIds: true, dataFimPrevista: true, dataFimReal: true, cronogramaId: true },
  });
  const porId = new Map(todas.map((t) => [t.id, t]));
  const sucessoras = new Map();
  for (const t of todas) {
    for (const a of t.antecessoraIds || []) {
      if (!sucessoras.has(a)) sucessoras.set(a, []);
      sucessoras.get(a).push(t);
    }
  }

  // ⚠ o maior deslocamento ganha: uma tarefa que depende de dois caminhos espera o mais lento.
  // A profundidade é limitada porque cronograma com ciclo (antecessora circular) existe e travaria.
  const desloca = new Map();
  const empurrar = (id, dias, prof = 0) => {
    if (prof > 40) return;
    for (const s of sucessoras.get(id) || []) {
      if (s.dataFimReal) continue; // entregue: não se mexe no passado
      if ((desloca.get(s.id) || 0) >= dias) continue;
      desloca.set(s.id, dias);
      empurrar(s.id, dias, prof + 1);
    }
  };

  let algumEstimado = false;
  const origens = [];
  for (const t of travadas) {
    const { dias, estimado } = diasDeEspera(t, hoje);
    if (estimado) algumEstimado = true;
    origens.push({ id: t.id, nome: t.nome, motivo: t.motivoBloqueio, dias, estimado, cronogramaId: t.cronogramaId });
    if (dias > 0) empurrar(t.id, dias);
  }

  const saida = [];
  for (const cid of cronoIds) {
    const doCrono = todas.filter((x) => x.cronogramaId === cid && x.dataFimPrevista);
    const movidas = [...desloca.entries()]
      .map(([id, dias]) => ({ t: porId.get(id), dias }))
      .filter((x) => x.t && x.t.cronogramaId === cid);
    if (!movidas.length) continue;
    const fimAtual = new Date(Math.max(...doCrono.map((x) => +x.dataFimPrevista)));
    const fimNovo = new Date(Math.max(...doCrono.map((x) => +x.dataFimPrevista + (desloca.get(x.id) || 0) * DIA)));
    const orig = origens.filter((o) => o.cronogramaId === cid && o.dias > 0);
    const t0 = travadas.find((x) => x.cronogramaId === cid);
    saida.push({
      cronogramaId: cid,
      opNumero: t0?.cronograma?.op?.numero || t0?.cronograma?.opNumero || null,
      opId: t0?.cronograma?.op?.id || null,
      cliente: t0?.cronograma?.op?.cliente || null,
      obra: t0?.cronograma?.op?.obra || null,
      esperas: orig.map(({ nome, motivo, dias, estimado }) => ({ nome, motivo, dias, estimado })),
      tarefasMovidas: movidas.length,
      porSetor: Object.entries(movidas.reduce((a, m) => {
        const s = m.t.departamento || "—";
        a[s] = Math.max(a[s] || 0, m.dias);
        return a;
      }, {})).map(([setor, dias]) => ({ setor, dias })).sort((a, b) => b.dias - a.dias),
      detalhe: movidas
        .sort((a, b) => +a.t.dataFimPrevista - +b.t.dataFimPrevista)
        .map((m) => ({
          // ⚠ o `id` vai junto porque nome NÃO identifica tarefa: a TMSA tem quatro "Diagrama de
          // Montagem" no mesmo cronograma. Casar por nome deslocaria 18 tarefas onde são 7 — e é
          // por id que o botão de aplicar vai atualizar, quando ele existir.
          id: m.t.id, nome: m.t.nome, setor: m.t.departamento, dias: m.dias,
          de: m.t.dataFimPrevista, para: new Date(+m.t.dataFimPrevista + m.dias * DIA),
        })),
      fimAtual, fimNovo,
      diasNaEntrega: Math.round((fimNovo - fimAtual) / DIA),
      estimado: algumEstimado,
    });
  }
  return saida.sort((a, b) => b.diasNaEntrega - a.diasNaEntrega);
}
