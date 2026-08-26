import "server-only";
import { prisma } from "@/lib/prisma";
import { FLUXO_SETORES } from "@/lib/prioridades-setor";

// A FRENTE É A FASE DA OBRA, e ela vive no `opNumero` da PEÇA — não num campo próprio.
//
// Vitor (25/08/2026): "o planejamento cria a demanda para o pcp indicando as prioridades e fases
// das obras". A LPC do Tekla grava T83A, T83B, T67BT…; a OP-083 tem 6 frentes, a OP-067 tem 11.
// É a divisão que a Engenharia já usa, então liberar por frente não inventa conceito novo.
//
// ⚠ CONJUNTO NÃO ENTRA NO PESO da frente: ele é a soma dos croquis dele, e somar os dois dobra.
// (mesma regra de lib/peso-op.js)

export const PRIORIDADES = ["ALTA", "MEDIA", "BAIXA"];
export const STATUS_LIB = ["LIBERADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"];

/**
 * As frentes de uma OP, com peso, peças e o que já foi liberado.
 * @returns {Promise<{temLpc:boolean, frentes:Array}>}
 */
export async function frentesDaOp(opId) {
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId, fonte: "LPC_IMPORT" },
    select: { opNumero: true, tipoPeca: true, qte: true, pesoTotalKg: true, status: true },
  });
  // ⚠ SEM LPC NÃO SE LIBERA. Vitor (25/08/2026): "no caso da OP-105 sem lista não tem como
  // programar, precisa ter ao menos a LPC para podermos liberar". Devolver frentes vazias é o que
  // faz a tela conseguir explicar o motivo em vez de só não mostrar nada.
  if (!pecas.length) return { temLpc: false, frentes: [] };

  const map = new Map();
  for (const p of pecas) {
    const f = String(p.opNumero || "").trim() || "(sem frente)";
    const g = map.get(f) || { frente: f, kg: 0, pecas: 0, conjuntos: 0, prontas: 0 };
    if (p.tipoPeca === "CONJUNTO") { g.conjuntos += Number(p.qte) || 1; }
    else {
      g.kg += Number(p.pesoTotalKg) || 0;
      g.pecas += Number(p.qte) || 1;
      if (p.status === "EXPEDIDO") g.prontas += Number(p.qte) || 1;
    }
    map.set(f, g);
  }

  const libs = await prisma.liberacaoProducao.findMany({ where: { opId } });
  const porFrente = new Map(libs.map((l) => [l.frente, l]));

  const frentes = [...map.values()]
    .map((g) => ({
      ...g,
      kg: Math.round(g.kg),
      liberacao: porFrente.get(g.frente)
        ? {
            id: porFrente.get(g.frente).id,
            status: porFrente.get(g.frente).status,
            prioridade: porFrente.get(g.frente).prioridade,
            setores: porFrente.get(g.frente).setores,
            liberadoEm: porFrente.get(g.frente).liberadoEm.toISOString(),
            liberadoPorNome: porFrente.get(g.frente).liberadoPorNome,
            dataMarco: porFrente.get(g.frente).dataMarco?.toISOString() || null,
            desvioDias: porFrente.get(g.frente).desvioDias,
            desvioMotivo: porFrente.get(g.frente).desvioMotivo,
          }
        : null,
    }))
    .sort((a, b) => b.kg - a.kg);

  return { temLpc: true, frentes };
}

/**
 * O desvio entre o marco e o dia em que se liberou, em dias corridos.
 * Negativo = adiantou. É o que o Planejamento vai ter de explicar.
 */
export function desvioDoMarco(dataMarco, quando = new Date()) {
  if (!dataMarco) return null;
  const m = new Date(dataMarco); m.setUTCHours(12, 0, 0, 0);
  const q = new Date(quando); q.setUTCHours(12, 0, 0, 0);
  return Math.round((q - m) / 86400000);
}

/** setores válidos para liberar (os mesmos da rota do portal) */
export const SETORES_LIBERAVEIS = FLUXO_SETORES.map((s) => ({ key: s.key, label: s.label }));
