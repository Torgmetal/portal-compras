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

  // Resposta mais recente por rmItem (só de consultas RESPONDIDAS).
  const respostas = await prisma.consultaEstoqueItem.findMany({
    where: {
      rmItemId: { in: itens.map((i) => i.id) },
      resposta: { in: ["DISPONIVEL", "PARCIAL"] },
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
    const resp = ultimaPorItem.get(it.id);

    // DISPONIVEL sem qtd explícita = tudo em estoque.
    let barrasDisponiveis = 0;
    if (resp) {
      barrasDisponiveis = resp.resposta === "DISPONIVEL"
        ? (Number(resp.qtdDisponivel) || qtd)
        : (Number(resp.qtdDisponivel) || 0);
      barrasDisponiveis = Math.min(Math.max(barrasDisponiveis, 0), qtd);
    }

    const barrasACotar = Math.max(0, qtd - barrasDisponiveis);
    const fator = qtd > 0 ? barrasACotar / qtd : 1;
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
