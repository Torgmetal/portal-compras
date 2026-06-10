// Abatimento de estoque na cotação.
//
// Quando a Produção/Engenharia responde a Consulta de Estoque (sempre em
// quantidade de BARRAS/peças — a unidade original do item, nunca KG), a
// quantidade enviada ao fornecedor deve ser só o que falta comprar:
//   barras a cotar = qtd solicitada − barras disponíveis em estoque.
// Para itens de aço (peso > 0) a qtdCotada vai em KG, proporcional às barras.
import { prisma } from "@/lib/prisma";

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Calcula o abatimento de estoque para uma lista de RMItens, com base na
 * resposta MAIS RECENTE de consulta de estoque de cada item.
 *
 * @param {Array<{id: string, descricao: string, qtd: number, peso: number|null, unidade: string}>} itens
 * @returns {Promise<{
 *   porItem: Map<string, {barrasDisponiveis: number, barrasACotar: number, qtdCotada: number}>,
 *   abatidos: Array<{descricao: string, barrasDisponiveis: number, barrasACotar: number, unidade: string}>,
 *   excluidos: Array<{descricao: string, barrasDisponiveis: number, unidade: string}>,
 * }>}
 * porItem cobre TODOS os itens (com ou sem abatimento). Itens 100% em estoque
 * têm barrasACotar = 0 — o chamador decide excluí-los da cotação.
 */
export async function calcularAbatimentoEstoque(itens) {
  const porItem = new Map();
  const abatidos = [];
  const excluidos = [];
  if (itens.length === 0) return { porItem, abatidos, excluidos };

  // Resposta mais recente por rmItem (qualquer resposta, de consultas
  // RESPONDIDAS) — INDISPONIVEL precisa entrar no dedupe: uma resposta
  // INDISPONIVEL nova deve anular uma DISPONIVEL/PARCIAL antiga.
  const respostas = await prisma.consultaEstoqueItem.findMany({
    where: {
      rmItemId: { in: itens.map((i) => i.id) },
      resposta: { not: null },
      consulta: { status: "RESPONDIDA" },
    },
    orderBy: { respondidoEm: "desc" },
    select: { rmItemId: true, resposta: true, qtdDisponivel: true },
  });
  const ultimaPorItem = new Map();
  for (const r of respostas) {
    if (!ultimaPorItem.has(r.rmItemId)) ultimaPorItem.set(r.rmItemId, r);
  }

  for (const it of itens) {
    const qtd = Number(it.qtd) || 0;
    const peso = Number(it.peso) || 0;

    // Item sem qtd em barras/peças (lançado só pelo peso): não há como abater
    // por barras — fica fora do cálculo e é cotado normalmente pela cheia.
    if (qtd <= 0) continue;

    const resp = ultimaPorItem.get(it.id);

    let barrasDisponiveis = 0;
    if (resp?.resposta === "DISPONIVEL") {
      // DISPONIVEL sem qtd explícita (legado) = tudo em estoque.
      barrasDisponiveis = Number(resp.qtdDisponivel) || qtd;
    } else if (resp?.resposta === "PARCIAL") {
      const v = Number(resp.qtdDisponivel) || 0;
      // Guarda contra respostas legadas digitadas em KG (antes a tela mostrava
      // o solicitado em KG): valor acima do nº de barras solicitado é ambíguo
      // — ignora o abatimento em vez de tratar como cobertura total.
      barrasDisponiveis = v > qtd ? 0 : v;
    }
    // INDISPONIVEL (ou sem resposta) → 0.
    barrasDisponiveis = Math.min(Math.max(barrasDisponiveis, 0), qtd);

    const barrasACotar = Math.max(0, qtd - barrasDisponiveis);
    const fator = barrasACotar / qtd;
    const qtdCotada = peso > 0 ? round2(peso * fator) : barrasACotar;

    porItem.set(it.id, { barrasDisponiveis, barrasACotar, qtdCotada });

    if (barrasDisponiveis > 0) {
      if (barrasACotar <= 0) {
        excluidos.push({ descricao: it.descricao, barrasDisponiveis, unidade: it.unidade });
      } else {
        abatidos.push({ descricao: it.descricao, barrasDisponiveis, barrasACotar, unidade: it.unidade });
      }
    }
  }

  return { porItem, abatidos, excluidos };
}
