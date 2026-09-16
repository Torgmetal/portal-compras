// ─── O ESCOPO DAS RMs DO PAINEL DE COMPRAS ─────────────────────────────────────
//
// ⚠⚠ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: cortar a lista ANTES de filtrar por obra.
// Matheus (16/09/2026): "existe 7 RMs mas na tela de RMs histórico e filtro por OP-097 só aparece
// 3 (…) eu preciso ter um filtro completo de tudo referente a obra, não pode ocorrer isso."
//
// As duas telas buscavam as 100 RMs mais recentes e o filtro de obra rodava DEPOIS, no navegador,
// sobre esse recorte. Medido no banco em 16/09/2026, com 211 RMs no histórico:
//   • 111 RMs invisíveis em qualquer tela;
//   • 24 das 37 obras mostrando menos RMs do que têm (a OP-060 mostrava 1 de 21);
//   • 11 obras com ZERO linhas na janela — e por isso ausentes até do seletor de OP, porque as
//     opções do seletor eram montadas a partir das mesmas 100 linhas. A obra sumia do filtro
//     inteiro, sem aviso nenhum.
//
// ⚠⚠ A REGRA AGORA: com obra escolhida a consulta filtra NO BANCO e NÃO CORTA — a obra vem
// inteira, sempre (a maior tem 21 RMs). Sem obra escolhida o teto continua, mas a tela diz que
// está cortando. Truncamento silencioso foi o que deixou isso passar despercebido.
//
// ⚠ O teto NÃO subiu para 250. Isso só adiaria o mesmo defeito para quando o histórico crescer,
// e com o Neon pequeno (OOM 53200 documentado no CLAUDE.md) carregar tudo não é opção.

import { prisma } from "@/lib/prisma";

const ATIVAS = ["ABERTA", "EM_COTACAO", "COTADA"];
const ARQUIVADAS = ["PEDIDO_GERADO", "CANCELADA"];

/** Teto de linhas quando NENHUMA obra foi escolhida. Com obra, não há teto. */
export const LIMITE_SEM_OBRA = 100;

/** O recorte de tipo + situação que a aba pediu. Uma definição só para as duas telas. */
export const escopoRMs = (tipoRM, verArquivadas) => ({
  tipoRM,
  status: { in: verArquivadas ? ARQUIVADAS : ATIVAS },
});

/**
 * O número de OP vindo da URL, saneado.
 *
 * ⚠ OP inexistente devolve lista VAZIA, nunca "todas". Cair no sem-filtro faria a tela responder
 * uma pergunta diferente da que foi feita — exatamente o tipo de silêncio que causou este bug.
 */
export function normalizarOp(valor) {
  const t = String(valor || "").trim();
  return t && /^[\w.-]{1,20}$/.test(t) ? t : null;
}

const numeroDaOP = (s) => parseInt(String(s).match(/\d+/)?.[0] || "0", 10);

/**
 * As obras que têm RM DENTRO do escopo, com quantas cada uma tem.
 *
 * ⚠⚠ SAI DE CONSULTA PRÓPRIA, não das linhas carregadas. É a correção do sintoma mais grave: uma
 * obra fora da janela deixava de existir como opção, então nem dava para pedir para vê-la.
 *
 * ⚠ `groupBy` por `opId` em vez de carregar as RMs — a contagem vem do Postgres e nenhum item ou
 * cotação viaja para o Node só para montar um `<select>`.
 */
export async function obrasDoEscopo(escopo) {
  const grupos = await prisma.rM.groupBy({
    by: ["opId"],
    where: escopo,
    _count: { _all: true },
  });
  const ids = grupos.map((g) => g.opId).filter(Boolean);
  if (ids.length === 0) return [];

  const ops = await prisma.oP.findMany({
    where: { id: { in: ids } },
    select: { id: true, numero: true, cliente: true },
  });
  const porId = new Map(ops.map((o) => [o.id, o]));

  return grupos
    .map((g) => {
      const op = porId.get(g.opId);
      return op ? { numero: op.numero, cliente: op.cliente || "", quantidade: g._count._all } : null;
    })
    .filter(Boolean)
    .sort((a, b) => numeroDaOP(b.numero) - numeroDaOP(a.numero));
}

const INCLUDE_PAINEL = {
  op: { select: { numero: true, cliente: true } },
  createdBy: { select: { name: true } },
  itens: {
    orderBy: { ordem: "asc" },
    select: { id: true, descricao: true, status: true, qtd: true, unidade: true, peso: true },
  },
  _count: { select: { cotacoes: true, itens: true } },
};

/**
 * As RMs da tela, já com o filtro de obra aplicado NO BANCO.
 *
 * @param {string} tipoRM          ENGENHARIA (materiais) ou INTERNA (consumíveis)
 * @param {boolean} verArquivadas  aba Histórico em vez de Ativas
 * @param {string|null} opNumero   obra escolhida; null = todas (aí vale o teto)
 * @returns {Promise<{rms:object[], obras:object[], total:number, truncada:boolean}>}
 */
export async function buscarRMsDoPainel(tipoRM, verArquivadas, opNumero) {
  const escopo = escopoRMs(tipoRM, verArquivadas);
  // ⚠ `OP.numero` é @unique e `RM.opId` é indexado — o filtro relacional resolve sem uma consulta
  // extra só para traduzir número em id.
  const where = opNumero ? { ...escopo, op: { numero: opNumero } } : escopo;

  const [rms, total, obras] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // ⚠⚠ SEM TETO QUANDO HÁ OBRA ESCOLHIDA. É a linha que responde ao pedido: a obra vem
      // completa. Com teto aqui, o filtro voltaria a mentir na obra que passar de 100 RMs.
      ...(opNumero ? {} : { take: LIMITE_SEM_OBRA }),
      include: INCLUDE_PAINEL,
    }),
    prisma.rM.count({ where }),
    obrasDoEscopo(escopo),
  ]);

  return { rms, obras, total, truncada: rms.length < total };
}

/** rmId -> Set<cotacaoId>, incluindo as consolidadas que só tocam a RM por um item. */
function mapearCotacoesPorRm(cotItens) {
  const porRm = new Map();
  const todas = new Set();
  for (const ci of cotItens) {
    const rid = ci.rmItem?.rmId;
    if (!rid) continue;
    if (!porRm.has(rid)) porRm.set(rid, new Set());
    porRm.get(rid).add(ci.cotacaoId);
    todas.add(ci.cotacaoId);
  }
  return { porRm, todas };
}

/**
 * ⚠ Atrasada é cotação PENDENTE cujo prazo já venceu. Proposta que chegou não atrasa mais, e
 * cotação de RM já resolvida por outro fornecedor não é pendência de ninguém.
 */
function resumoDeUmaRM(cotIds, cotsMap, agora) {
  const recebidas = new Set(); const pendentes = new Set(); const atrasadas = new Set();
  for (const cotId of cotIds) {
    const cot = cotsMap.get(cotId);
    if (!cot) continue;
    if (cot.status === "RECEBIDA") recebidas.add(cot.id);
    else if (cot.status === "PENDENTE") {
      pendentes.add(cot.id);
      if (cot.prazoResposta && new Date(cot.prazoResposta).getTime() < agora) atrasadas.add(cot.id);
    }
  }
  return { recebidas: recebidas.size, pendentes: pendentes.size, atrasadas: atrasadas.size };
}

/**
 * Preenche `_count.cotacoes`, `recebidas`, `pendentes` e `atrasadas` em cada RM.
 *
 * ⚠ Usa `CotacaoItem` como ponte leve para descobrir os cotacaoIds e depois busca as cotações por
 * ID direto. O `OR` com subquery aninhada que isso substitui causava OOM no Neon.
 *
 * ⚠ Cotação consolidada conta para TODAS as RMs que ela toca, não só para a primária — por isso a
 * contagem vem daqui e não do `_count` do Prisma.
 *
 * ⚠ Falhar aqui não derruba a tela: a lista de RMs é o dado; o resumo de cotações é enfeite.
 */
export async function agregarCotacoes(rms, registro, origem) {
  for (const rm of rms) { rm.recebidas = 0; rm.pendentes = 0; rm.atrasadas = 0; }
  if (rms.length === 0) return;
  try {
    await preencherResumoDeCotacoes(rms);
  } catch (e) {
    registro?.erro?.(`[${origem}] Falha agregando cotacoes:`, e?.message);
  }
}

/** O trabalho de verdade — separado só para o `try` acima ficar legível. */
async function preencherResumoDeCotacoes(rms) {
  const cotItens = await prisma.cotacaoItem.findMany({
    where: { rmItem: { rmId: { in: rms.map((r) => r.id) } } },
    select: { cotacaoId: true, rmItem: { select: { rmId: true } } },
  });
  const { porRm, todas } = mapearCotacoesPorRm(cotItens);
  for (const rm of rms) {
    if (rm._count) rm._count.cotacoes = porRm.get(rm.id)?.size ?? rm._count.cotacoes;
  }
  if (todas.size === 0) return;

  const cots = await prisma.cotacao.findMany({
    where: { id: { in: [...todas] } },
    select: { id: true, status: true, prazoResposta: true },
  });
  const cotsMap = new Map(cots.map((c) => [c.id, c]));
  const agora = Date.now();
  for (const rm of rms) Object.assign(rm, resumoDeUmaRM(porRm.get(rm.id) || [], cotsMap, agora));
}
