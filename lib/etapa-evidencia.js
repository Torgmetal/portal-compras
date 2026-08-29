import "server-only";
import { prisma } from "./prisma";

// ─── A TAREFA LÊ O QUE O PORTAL JÁ SABE ───────────────────────────────────────
// Vitor (29/08/2026): "mas LE e LPC não são enviadas por e-mail".
//
// ⚠⚠ CADA ETAPA TEM O SEU SENSOR, E NÃO É SEMPRE O E-MAIL. Isso separa duas coisas que estavam
// misturadas:
//
//   · APROVAÇÃO do cliente → chega por E-MAIL. É conversa com quem está de fora.
//   · LISTAS (LE e LPC)    → chega pelo PORTAL. É a importação, aqui dentro. E-mail nenhum vai
//                            avisar, porque a lista não é enviada por e-mail.
//
// O agente de e-mail nunca ia dar baixa na tarefa "LE e LPC" — não porque erra, mas porque o fato
// não passa por lá. Quem sabe é o próprio portal: a OP tem (ou não tem) as peças importadas.
//
// ⚠ A DATA DA BAIXA É A DA EVIDÊNCIA, NÃO A DO CLIQUE. As listas da OP-115 entraram em 24 e 25/08
// com prazo 21/08: dar baixa com a data de hoje registraria 8 dias de atraso onde houve 4, e o
// indicador de aderência mediria a memória de quem clicou em vez da entrega.

/**
 * A etapa LISTAS desta OP foi atendida? Devolve a evidência ou null.
 * @param {string} opId
 */
export async function evidenciaDeListas(opId) {
  if (!opId) return null;
  const [le, lpc] = await Promise.all([
    prisma.pecaConjunto.aggregate({ where: { opId, fonte: "LE_IMPORT" }, _count: true, _min: { criadoEm: true } }),
    prisma.pecaConjunto.aggregate({ where: { opId, fonte: "LPC_IMPORT" }, _count: true, _min: { criadoEm: true } }),
  ]);
  const temLE = le._count > 0, temLPC = lpc._count > 0;
  if (!temLE && !temLPC) return null;

  // ⚠ a etapa só está COMPLETA com as duas: a tarefa se chama "LE e LPC". Com uma só, a evidência
  // vai como parcial — é informação útil ("falta a LE"), não baixa.
  const completa = temLE && temLPC;
  // a mais recente das duas é quando a etapa terminou de fato
  const datas = [temLE && le._min.criadoEm, temLPC && lpc._min.criadoEm].filter(Boolean).map((d) => +d);
  return {
    completa,
    atendidaEm: completa ? new Date(Math.max(...datas)) : null,
    resumo: [
      temLPC ? `LPC importada (${lpc._count} peças)` : "falta a LPC",
      temLE ? `LE importada (${le._count} peças)` : "falta a LE",
    ].join(" · "),
  };
}

/**
 * Evidências para uma lista de tarefas, em lote (uma consulta por OP, não por tarefa).
 * @param {Array} tarefas  [{ id, etapa, opId }]
 * @returns {Promise<Map<string, object>>} id da tarefa → evidência
 */
export async function evidenciasDasTarefas(tarefas) {
  const out = new Map();
  const deListas = (tarefas || []).filter((t) => t.etapa === "LISTAS" && t.opId && !t.fimReal);
  const ops = [...new Set(deListas.map((t) => t.opId))];
  const porOp = new Map();
  for (const opId of ops) porOp.set(opId, await evidenciaDeListas(opId));
  for (const t of deListas) {
    const e = porOp.get(t.opId);
    if (e) out.set(t.id, e);
  }
  return out;
}
