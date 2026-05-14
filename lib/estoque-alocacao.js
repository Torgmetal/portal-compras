// Lógica de alocacao automatica de saidas de estoque entre OPs (FIFO).
// FIFO regra: OP com dataInicio mais antiga consome primeiro, ate completar
// o saldo da reserva. Quando uma reserva acaba (qtdConsumida == qtdReservada),
// passa pra proxima OP.
//
// Saidas que nao casam com nenhuma reserva ativa do material ficam "sem
// alocacao" — visiveis na tela pra ajuste manual.
import { prisma } from "@/lib/prisma";

// Aloca uma SAIDA de estoque entre as reservas ativas da OP via FIFO.
// Retorna { alocadas: [{ opId, quantidade, valorCMC }], sobra: number }
//   sobra > 0 = quantidade que nao bateu com nenhuma reserva (precisa ajuste manual)
export async function alocarSaidaFIFO({ itemEstoqueId, quantidade, cmcMomento }) {
  if (quantidade <= 0) return { alocadas: [], sobra: 0 };

  // Busca reservas ativas desse item, ordenadas pela OP mais antiga primeiro
  const reservas = await prisma.estoqueReserva.findMany({
    where: {
      itemEstoqueId,
      status: "ATIVA",
    },
    include: { op: { select: { id: true, dataInicio: true, createdAt: true } } },
  });

  // Ordena: dataInicio (asc, nulls last), depois createdAt
  reservas.sort((a, b) => {
    const aDate = a.op.dataInicio ? new Date(a.op.dataInicio).getTime() : Infinity;
    const bDate = b.op.dataInicio ? new Date(b.op.dataInicio).getTime() : Infinity;
    if (aDate !== bDate) return aDate - bDate;
    return new Date(a.op.createdAt).getTime() - new Date(b.op.createdAt).getTime();
  });

  let restante = quantidade;
  const alocadas = [];

  for (const r of reservas) {
    if (restante <= 0) break;
    const saldoReserva = r.qtdReservada - r.qtdConsumida;
    if (saldoReserva <= 0) {
      // Reserva ja cheia — marca como concluida (defensivo)
      if (r.status === "ATIVA") {
        await prisma.estoqueReserva.update({
          where: { id: r.id },
          data: { status: "CONCLUIDA" },
        }).catch(() => {});
      }
      continue;
    }
    const aAlocar = Math.min(restante, saldoReserva);
    alocadas.push({
      reservaId: r.id,
      opId: r.opId,
      quantidade: aAlocar,
      valorCMC: aAlocar * (cmcMomento || 0),
    });
    // Atualiza a reserva
    const novaConsumida = r.qtdConsumida + aAlocar;
    await prisma.estoqueReserva.update({
      where: { id: r.id },
      data: {
        qtdConsumida: novaConsumida,
        status: novaConsumida >= r.qtdReservada ? "CONCLUIDA" : "ATIVA",
      },
    });
    restante -= aAlocar;
  }

  return { alocadas, sobra: restante };
}

// Aplica alocacao FIFO numa movimentacao de SAIDA existente.
// Cria registros EstoqueAlocacao + atualiza reservas.
// Chamado: (1) quando sync cria nova SAIDA do Omie, (2) on-demand pra reprocessar
export async function aplicarAlocacaoMovimentacao(movimentacaoId) {
  const mov = await prisma.estoqueMovimentacao.findUnique({
    where: { id: movimentacaoId },
    include: { alocacoes: true },
  });
  if (!mov) return { error: "Movimentacao nao encontrada" };
  if (mov.tipo !== "SAIDA") return { error: "So aplica FIFO em SAIDAs" };
  if (mov.alocacoes.length > 0) {
    return { error: "Movimentacao ja alocada" };
  }

  const { alocadas, sobra } = await alocarSaidaFIFO({
    itemEstoqueId: mov.itemEstoqueId,
    quantidade: mov.quantidade,
    cmcMomento: mov.cmcMomento || 0,
  });

  // Cria EstoqueAlocacao pra cada
  for (const a of alocadas) {
    await prisma.estoqueAlocacao.create({
      data: {
        movimentacaoId: mov.id,
        opId: a.opId,
        reservaId: a.reservaId,
        quantidade: a.quantidade,
        valorCMC: a.valorCMC,
        ajustadoManual: false,
      },
    });
  }

  return { alocadas: alocadas.length, sobra };
}

// Reajuste manual: substitui as alocacoes existentes por novas
// (passadas pelo usuario). Atualiza reservas correspondentes.
// alocacoesNovas: [{ opId, quantidade }]
export async function reajustarAlocacaoManual({ movimentacaoId, alocacoesNovas, userId }) {
  const mov = await prisma.estoqueMovimentacao.findUnique({
    where: { id: movimentacaoId },
    include: { alocacoes: true },
  });
  if (!mov) return { error: "Movimentacao nao encontrada" };
  if (mov.tipo !== "SAIDA") return { error: "So reajusta SAIDAs" };

  const total = alocacoesNovas.reduce((s, a) => s + (Number(a.quantidade) || 0), 0);
  if (Math.abs(total - mov.quantidade) > 0.001) {
    return { error: `Soma das alocacoes (${total}) tem que bater com qtd da movimentacao (${mov.quantidade})` };
  }

  await prisma.$transaction(async (tx) => {
    // Reverte alocacoes antigas — devolve qtdConsumida das reservas
    for (const a of mov.alocacoes) {
      if (a.reservaId) {
        await tx.estoqueReserva.update({
          where: { id: a.reservaId },
          data: {
            qtdConsumida: { decrement: a.quantidade },
            status: "ATIVA",
          },
        });
      }
    }
    // Remove alocacoes antigas
    await tx.estoqueAlocacao.deleteMany({ where: { movimentacaoId: mov.id } });
    // Cria as novas
    for (const a of alocacoesNovas) {
      // Tenta achar reserva ativa dessa OP pro item
      const reserva = await tx.estoqueReserva.findFirst({
        where: { itemEstoqueId: mov.itemEstoqueId, opId: a.opId, status: "ATIVA" },
      });
      await tx.estoqueAlocacao.create({
        data: {
          movimentacaoId: mov.id,
          opId: a.opId,
          reservaId: reserva?.id || null,
          quantidade: Number(a.quantidade),
          valorCMC: Number(a.quantidade) * (mov.cmcMomento || 0),
          ajustadoManual: true,
          ajustadoById: userId,
        },
      });
      if (reserva) {
        const novaConsumida = reserva.qtdConsumida + Number(a.quantidade);
        await tx.estoqueReserva.update({
          where: { id: reserva.id },
          data: {
            qtdConsumida: novaConsumida,
            status: novaConsumida >= reserva.qtdReservada ? "CONCLUIDA" : "ATIVA",
          },
        });
      }
    }
  });

  return { ok: true };
}
