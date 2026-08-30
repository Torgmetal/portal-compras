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
 * Evidências para uma lista de tarefas, em lote (uma consulta por OP+família, não por tarefa).
 * @param {Array} tarefas  [{ id, etapa, nome, opId, fimReal }]
 * @returns {Promise<Map<string, object>>} id da tarefa → evidência
 */
export async function evidenciasDasTarefas(tarefas) {
  const out = new Map();
  const abertas = (tarefas || []).filter((t) => t.opId && !t.fimReal);

  // ── etapa de LISTAS (Engenharia): a importação da LE/LPC ──
  const deListas = abertas.filter((t) => t.etapa === "LISTAS");
  const porOpListas = new Map();
  for (const opId of new Set(deListas.map((t) => t.opId))) porOpListas.set(opId, await evidenciaDeListas(opId));
  for (const t of deListas) {
    const e = porOpListas.get(t.opId);
    if (e) out.set(t.id, { ...e, origem: "LISTAS" });
  }

  // ── RECEBIMENTO (Suprimentos): o que o Almoxarifado lançou ──
  // ⚠ uma consulta por par OP+família, não por tarefa: a mesma obra tem quatro tarefas de
  // recebimento, e sem o cache seriam quatro varreduras iguais dos recebimentos dela.
  const deReceb = abertas
    .map((t) => ({ t, familia: familiaDeRecebimento(t.nome) }))
    .filter((x) => x.familia);
  const cache = new Map();
  for (const { t, familia } of deReceb) {
    const chave = `${t.opId}|${familia}`;
    if (!cache.has(chave)) cache.set(chave, await evidenciaDeRecebimento(t.opId, familia));
    const e = cache.get(chave);
    if (e) out.set(t.id, { ...e, origem: "RECEBIMENTO", completa: true });
  }
  return out;
}

// ─── RECEBIMENTO DE MATERIAL (SUPRIMENTOS) ────────────────────────────────────
// Vitor (29/08/2026): "sobre as tarefas de suprimentos, com base nos recebimentos do CMR você não
// consegue já dar baixa e avançar o cronograma? já marcar as datas reais e já fechar esse ciclo?"
//
// Mesmo princípio da etapa de listas: o fato NÃO chega por e-mail nem por alguém lembrar de marcar
// — ele já está no portal, no recebimento que o Almoxarifado lançou. São 105 tarefas de Suprimentos
// em aberto e 39 nomes distintos, mas os nomes se repetem em quatro famílias.
//
// ⚠⚠ A DATA É A DO ÚLTIMO RECEBIMENTO DA FAMÍLIA, e a baixa é PROPOSTA, não automática. O portal
// sabe que chegou tinta; não sabe se chegou TODA a tinta — isso dependeria de comparar com o que
// foi pedido, item a item, e pedido tem saldo, item cancelado e entrega parcial. Marcar sozinho
// fecharia tarefa com material faltando, que é pior que a tarefa aberta.
const FAMILIAS = [
  { id: "ACO",       rx_tarefa: /mat[ée]ria[\s-]?prima|\ba[çc]o\b|perfil/i,
    rx_item: /\b(perfil|viga|coluna|chapa|cantoneira|barra|tubo|u\s?laminad|w\d|hp\d|ue?\s?dobrad|metalon|treli)/i,
    label: "matéria-prima (aço)" },
  { id: "TINTA",     rx_tarefa: /tinta|pintura/i,
    rx_item: /\b(tinta|esmalte|primer|fundo|ep[óo]xi|poliuretano|industhane|indusdur|endurecedor|diluente|thinner|solvente)/i,
    label: "tinta" },
  { id: "COBERTURA", rx_tarefa: /cobertura|piso|telha/i,
    rx_item: /\b(telha|calha|rufo|cumeeira|tapa[\s-]?vista|policarbonato|galvalume|grade\s*de\s*piso|piso)/i,
    label: "cobertura e piso" },
  { id: "FIXACAO",   rx_tarefa: /parafus|fixa[çc]|fixador/i,
    rx_item: /\b(parafuso|paraf\.|porca|arruela|chumbador|para[\s._-]?bolt|autobrocante|autoperfurante|rebite|pino|prisioneiro)/i,
    label: "parafusos e fixação" },
];

/**
 * A tarefa de Suprimentos fala de RECEBER material? De qual família?
 *
 * ⚠ só "recebimento": "Cotação de tinta" e "Compra de Tintas" NÃO se comprovam pelo recebimento —
 * cotar e comprar acontecem antes, e dar baixa nelas pelo material que chegou apagaria o prazo real
 * de cada etapa da compra.
 *
 * ⚠⚠ E "GERAL" QUANDO O NOME NÃO DIZ QUAL. "Recebimento dos Materiais" é o nome mais comum nos
 * cronogramas (OP-092, OP-097) e não nomeia família nenhuma. Devolver null ali seria esconder que
 * chegaram 50 recebimentos na obra; a saída honesta é mostrar o que chegou SEM afirmar que é o
 * material daquela tarefa — quem confere decide, com a lista na frente.
 */
export function familiaDeRecebimento(nome) {
  const n = String(nome || "");
  if (!/receb/i.test(n)) return null;
  return FAMILIAS.find((f) => f.rx_tarefa.test(n))?.id || "GERAL";
}

export const FAMILIA_LABEL = Object.fromEntries(FAMILIAS.map((f) => [f.id, f.label]));

/** Evidência de recebimento dessa família nessa OP: quantos, o último e o que chegou. */
export async function evidenciaDeRecebimento(opId, familiaId) {
  // GERAL = a tarefa não nomeia família; vale qualquer recebimento da obra, e o texto avisa disso
  const familia = familiaId === "GERAL"
    ? { id: "GERAL", rx_item: /./, label: "material" }
    : FAMILIAS.find((f) => f.id === familiaId);
  if (!opId || !familia) return null;
  const recs = await prisma.recebimento.findMany({
    where: { rmItem: { rm: { opId } } },
    select: { dataRecebimento: true, qtdRecebida: true, unidade: true, nfNumero: true,
              rmItem: { select: { descricao: true } } },
    orderBy: { dataRecebimento: "asc" },
  });
  const daFamilia = recs.filter((r) => familia.rx_item.test(String(r.rmItem?.descricao || "")));
  if (!daFamilia.length) return null;
  const ultimo = daFamilia[daFamilia.length - 1];
  return {
    familia: familiaId,
    quantos: daFamilia.length,
    atendidaEm: ultimo.dataRecebimento,
    generica: familiaId === "GERAL",
    resumo: (familiaId === "GERAL"
      // ⚠ sem prometer que é O material da tarefa: a tarefa não disse qual é
      ? `${daFamilia.length} recebimento(s) nesta obra — o último em ${new Date(ultimo.dataRecebimento).toLocaleDateString("pt-BR")}`
      : `${daFamilia.length} recebimento(s) de ${familia.label} — o último em ${new Date(ultimo.dataRecebimento).toLocaleDateString("pt-BR")}`)
      + (ultimo.nfNumero ? ` (NF ${ultimo.nfNumero})` : ""),
    // ⚠ a última descrição vai junto: é ela que deixa quem confere reconhecer se é o material certo
    ultimoItem: String(ultimo.rmItem?.descricao || "").slice(0, 60),
  };
}
