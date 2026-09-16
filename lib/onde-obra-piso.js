// ─── "ONDE A OBRA ESTÁ" NÃO CONTRADIZ O QUE O PLANEJAMENTO DECLAROU ───────────
// Vitor (15/09/2026), OP-102: pôs Corte, Montagem e Solda em 100% à mão no cronograma (a fábrica
// está na pintura; o Syneco está atrasado) e o bloco medido do portal continuava "Preparação 6% ·
// Montagem 26%" logo abaixo — "aqui ainda está fora com o de cima".
//
// Fase que o cronograma dá como 100% MANUAL vira piso: peça que o apontamento deixou atrás dela
// sobe até ela, e a não iniciada também. Só o percentual DIGITADO conta — o automático já é o
// mesmo apontamento que alimenta o bloco, e usá-lo seria circular.
import { faseDaTarefa } from "./cronograma-syneco";

export const ORDEM_ETAPAS = ["Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
const NOME_FASE = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

/** A etapa mais avançada declarada 100% à mão no cronograma, ou null. */
export function pisoDeclarado(tarefas) {
  const i = (tarefas || [])
    .filter((t) => t?.avancoManual && Number(t.percentualRealizado) >= 100 && !t.isSummary)
    .map((t) => ORDEM_ETAPAS.indexOf(NOME_FASE[faseDaTarefa(t.nome)] || ""))
    .reduce((m, x) => Math.max(m, x), -1);
  return i >= 0 ? ORDEM_ETAPAS[i] : null;
}

/**
 * Sobe para o piso tudo que ficou atrás dele. `dist` é Map etapa → { n, kg }; devolve a
 * distribuição e o "não iniciado" já ajustados (sem mutar os originais).
 */
export function aplicarPiso(dist, naoIniciada, piso) {
  const saida = new Map([...dist].map(([k, v]) => [k, { ...v }]));
  if (!piso) return { dist: saida, naoIniciada: { ...naoIniciada } };
  const idx = ORDEM_ETAPAS.indexOf(piso);
  const g = saida.get(piso) || { n: 0, kg: 0 };
  for (const k of ORDEM_ETAPAS.slice(0, idx)) { const d = saida.get(k); if (d) { g.n += d.n; g.kg += d.kg; saida.delete(k); } }
  g.n += naoIniciada.n || 0; g.kg += naoIniciada.kg || 0;
  saida.set(piso, g);
  return { dist: saida, naoIniciada: { n: 0, kg: 0 } };
}
