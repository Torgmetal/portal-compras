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
    select: { id: true, opNumero: true, tipoPeca: true, qte: true, pesoTotalKg: true, status: true },
  });
  // ⚠ SEM LPC NÃO SE LIBERA. Vitor (25/08/2026): "no caso da OP-105 sem lista não tem como
  // programar, precisa ter ao menos a LPC para podermos liberar". Devolver frentes vazias é o que
  // faz a tela conseguir explicar o motivo em vez de só não mostrar nada.
  if (!pecas.length) return { temLpc: false, frentes: [] };

  // ⚠⚠ CADA SETOR RECEBE UMA COISA DIFERENTE. Vitor (25/08/2026): "na preparação são as peças P e
  // as peças avulsas; já na montagem e demais setores são os conjuntos; no jato as peças avulsas
  // ficam disponíveis assim que sai do corte".
  //   croqui (peça P)   → só Preparação; depois ele vira parte do conjunto
  //   avulsa            → Preparação e, saindo do corte, direto para o Jato
  //   conjunto composto → Montagem em diante
  // Sem essa separação, liberar "Montagem" mandaria croqui junto — e croqui não se monta.
  const comCroqui = new Set(
    (await prisma.conjuntoCroqui.findMany({ where: { conjunto: { opId } }, select: { conjuntoId: true }, distinct: ["conjuntoId"] }))
      .map((x) => x.conjuntoId)
  );
  const natureza = (p) =>
    p.tipoPeca === "CROQUI" ? "croqui"
    : p.tipoPeca === "CONJUNTO" && comCroqui.has(p.id) ? "conjunto"
    : "avulsa";

  const map = new Map();
  for (const p of pecas) {
    const f = String(p.opNumero || "").trim() || "(sem frente)";
    const g = map.get(f) || {
      frente: f, kg: 0, pecas: 0, conjuntos: 0, prontas: 0,
      croqui: { kg: 0, n: 0 }, avulsa: { kg: 0, n: 0 }, conjunto: { kg: 0, n: 0 },
    };
    const q = Number(p.qte) || 1, kg = Number(p.pesoTotalKg) || 0;
    const nat = natureza(p);
    g[nat].n += q;
    // ⚠ o peso do CONJUNTO não entra no total da frente: ele é a soma dos croquis dele, e somar os
    // dois dobra a obra. Fica no bloco `conjunto` só para dimensionar a montagem.
    g[nat].kg += kg;
    if (nat !== "conjunto") {
      g.kg += kg;
      g.pecas += q;
      if (p.status === "EXPEDIDO") g.prontas += q;
    } else {
      g.conjuntos += q;
    }
    map.set(f, g);
  }

  const libs = await prisma.liberacaoProducao.findMany({ where: { opId } });
  const porFrente = new Map(libs.map((l) => [l.frente, l]));

  const frentes = [...map.values()]
    .map((g) => ({
      ...g,
      kg: Math.round(g.kg),
      croqui: { ...g.croqui, kg: Math.round(g.croqui.kg) },
      avulsa: { ...g.avulsa, kg: Math.round(g.avulsa.kg) },
      conjunto: { ...g.conjunto, kg: Math.round(g.conjunto.kg) },
      // o que cada setor de fato recebe desta frente
      escopo: {
        CORTE: { kg: Math.round(g.croqui.kg + g.avulsa.kg), n: g.croqui.n + g.avulsa.n, o: "peças P + avulsas" },
        JATO: { kg: Math.round(g.avulsa.kg + g.conjunto.kg), n: g.avulsa.n + g.conjunto.n, o: "avulsas (direto do corte) + conjuntos" },
        MONTAGEM: { kg: Math.round(g.conjunto.kg), n: g.conjunto.n, o: "conjuntos" },
        SOLDA: { kg: Math.round(g.conjunto.kg), n: g.conjunto.n, o: "conjuntos" },
        ACABAMENTO: { kg: Math.round(g.conjunto.kg), n: g.conjunto.n, o: "conjuntos" },
        PINTURA: { kg: Math.round(g.avulsa.kg + g.conjunto.kg), n: g.avulsa.n + g.conjunto.n, o: "avulsas + conjuntos" },
        EXPEDICAO: { kg: Math.round(g.avulsa.kg + g.conjunto.kg), n: g.avulsa.n + g.conjunto.n, o: "avulsas + conjuntos" },
      },
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
