// ─── "ONDE A OBRA ESTÁ" É O REFLEXO DO CRONOGRAMA ─────────────────────────────
// Vitor (15/09/2026), OP-102, duas vezes na mesma tarde:
//   1. pôs Corte, Montagem e Solda em 100% à mão (a fábrica está na pintura, o Syneco atrasado) e o
//      bloco medido seguia "Preparação 6% · Montagem 26%" — "aqui ainda está fora com o de cima";
//   2. com o piso aplicado, o bloco virou "Solda 63% · Jato 36%" e ele: "está errado, precisa ser o
//      reflexo do cronograma acima — um fala uma coisa e outro fala outra".
//
// O bloco era uma DISTRIBUIÇÃO (cada peça numa etapa só, soma 100%); a linha do tempo é um AVANÇO
// por fase (quanto da estrutura já passou por ela). Duas leituras da mesma fábrica, lado a lado,
// com números que não batem — para o cliente é o portal se contradizendo. Agora o bloco é
// ACUMULADO por fase e, onde o cronograma tem a linha da fase, o percentual é o DA LINHA (medido
// pelo apontamento ou informado pelo planejamento — o mesmo que a barra acima mostra).
//
// ⚠ As PEÇAS continuam medidas: quantas já passaram por aquela etapa segundo o apontamento, com
// as fases dadas como 100% à mão valendo como piso (peça atrás do piso sobe até ele).
import { faseDaTarefa } from "./cronograma-syneco";

export const ORDEM_ETAPAS = ["Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
const NOME_FASE = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

/** Etapa (nome da ORDEM) que uma tarefa do cronograma mede, ou null. */
export const etapaDaTarefa = (t) => NOME_FASE[faseDaTarefa(t?.nome)] || null;

/** A etapa mais avançada declarada 100% à mão no cronograma, ou null. */
export function pisoDeclarado(tarefas) {
  const i = (tarefas || [])
    .filter((t) => t?.avancoManual && Number(t.percentualRealizado) >= 100 && !t.isSummary)
    .map((t) => ORDEM_ETAPAS.indexOf(etapaDaTarefa(t) || ""))
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

/**
 * O bloco do portal: acumulado por etapa (quanto já passou por ela), espelhando as linhas de fase do
 * cronograma quando existem.
 * @param {Map} dist  etapa → { n, kg } (distribuição medida, JÁ com o piso aplicado)
 * @param {number} kgTotal peso da estrutura
 * @param {Array} tarefas as tarefas do cronograma com `feito` (% que a linha do tempo mostra)
 * @returns {Array<{nome:string, pecas:number, kg:number, pct:number, origem:"cronograma"|"medido"}>}
 */
export function acumuladoPorEtapa(dist, kgTotal, tarefas) {
  const linhaDe = new Map();
  for (const t of tarefas || []) {
    const e = etapaDaTarefa(t);
    if (!e || t.isSummary) continue;
    const v = Number(t.feito ?? t.percentualRealizado);
    if (Number.isFinite(v)) linhaDe.set(e, Math.max(linhaDe.get(e) ?? -1, Math.min(100, v)));
  }
  const etapas = linhaDe.size ? ORDEM_ETAPAS.filter((e) => linhaDe.has(e)) : ORDEM_ETAPAS;
  return etapas.map((e) => {
    const idx = ORDEM_ETAPAS.indexOf(e);
    let n = 0, kg = 0;
    for (const [k, v] of dist) if (ORDEM_ETAPAS.indexOf(k) >= idx) { n += v.n; kg += v.kg; }
    const medido = kgTotal > 0 ? Math.round((kg / kgTotal) * 100) : 0;
    const daLinha = linhaDe.get(e);
    return { nome: e, pecas: n, kg: Math.round(kg), pct: daLinha != null ? Math.round(daLinha) : medido, origem: daLinha != null ? "cronograma" : "medido" };
  }).filter((x) => linhaDe.size || x.pecas > 0);
}
