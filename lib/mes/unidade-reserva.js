import "server-only";
import { STATUS } from "@/lib/mes/sessao";

// ─── A POSSE DA BARRA DE NESTING ─────────────────────────────────────────────
//
// ⚠⚠ O QUE ISTO IMPEDE, E O QUE NÃO IMPEDE. Impede que a MESMA barra esteja aberta em dois postos
// ao mesmo tempo — que era o furo apontado pelo Codex em três pareceres seguidos: o `Set` de
// `comporTeto` evita dobrar o TETO, mas dois postos cortando a mesma barra lançam peças que
// existem uma vez só, e o excedente come o saldo legítimo de outras barras da mesma marca.
//
// ⚠⚠ NÃO impede que a barra seja liberada e REABERTA depois, em outro posto, e produza de novo
// (limite declarado pelo Codex, 22/09/2026). Fechar isso exigiria atribuir cada apontamento à
// UNIDADE — hoje o apontamento conhece a sessão, e a sessão é por MARCA, não por barra. É trabalho
// de outro tamanho e está escrito em `docs/mes-proprio.md` como o que falta.

/** A chave que o índice parcial único protege. */
const daUnidade = (unidadeId, ambiente) => ({ unidadeId, ambiente, liberadaEm: null });

/** Quem está com a barra agora — `null` quando ninguém. */
export function reservaAberta(tx, unidadeId, ambiente) {
  return tx.mesUnidadeReserva.findFirst({ where: daUnidade(unidadeId, ambiente) });
}

/**
 * TOMAR A BARRA — ou dizer quem está com ela.
 *
 * ⚠⚠ O `findFirst` ANTES É CONVENIÊNCIA; QUEM DECIDE É O ÍNDICE. Duas aberturas concorrentes da
 * mesma barra leem "livre" no mesmo instante — a trava do MES serializa por RECURSO, e aqui os
 * recursos são dois. O `P2002` do índice parcial é o que sobra de verdade, e por isso ele é
 * tratado como recusa de negócio e não como erro 500.
 *
 * ⚠ Reabrir a MESMA barra no MESMO posto devolve a reserva que já existe, sem criar outra: é o
 * caso da barra que repete marca e volta pelo mesmo comando (idempotência do `loteId`).
 *
 * @returns {Promise<{reserva:object}|{ocupada:object}>}
 */
const posseDe = (reserva, recursoId) => (reserva.recursoId === recursoId ? { reserva } : { ocupada: reserva });

/** Só o conflito DESTE índice quer dizer "barra ocupada"; qualquer outro P2002 é defeito. */
const ehConflitoDaReserva = (e) =>
  e?.code === "P2002" && String(e?.meta?.target || "").includes("MesUnidadeReserva");

export async function reservarUnidade(tx, { unidadeId, ambiente, recursoId, loteId, operadorId = null }) {
  const dona = await reservaAberta(tx, unidadeId, ambiente);
  if (dona) return posseDe(dona, recursoId);
  try {
    const reserva = await tx.mesUnidadeReserva.create({
      data: { unidadeId, ambiente, recursoId, loteId, operadorId },
    });
    return { reserva };
  } catch (e) {
    if (!ehConflitoDaReserva(e)) throw e;
    const outra = await reservaAberta(tx, unidadeId, ambiente);
    if (!outra) throw e;
    return posseDe(outra, recursoId);
  }
}

/** A recusa que o operador lê — com o posto que está com a barra, não um "erro". */
export async function recusaDeBarraOcupada(tx, ocupada) {
  const posto = await tx.mesRecurso.findUnique({ where: { id: ocupada.recursoId }, select: { codigo: true, nome: true } });
  const onde = posto ? `${posto.codigo}${posto.nome ? ` — ${posto.nome}` : ""}` : "outro posto";
  return `Esta barra já está aberta em ${onde}. Encerre lá, ou peça ao ADMIN para liberar, antes de abrir aqui.`;
}

/**
 * DEVOLVER A BARRA QUANDO NÃO SOBROU TRABALHO ABERTO NELA.
 *
 * ⚠⚠ A RECONCILIAÇÃO É CENTRALIZADA, E NÃO MORA NO `encerrarLote` (parecer do Codex, 22/09/2026).
 * A tela também encerra marca a marca — implementar a liberação só no caminho do lote deixaria
 * reservas de pé sem nenhuma sessão aberta, e a barra ficaria presa a um posto que não a está mais
 * cortando. Por isso quem chama é `encerrarNaTransacao`, que é por onde TODO encerramento passa.
 *
 * ⚠ A pergunta é "sobrou sessão ABERTA com esta unidade neste ambiente?", e não "este lote
 * terminou": a mesma barra pode ter sido reaberta no mesmo posto por outro comando.
 */
export async function reconciliarUnidades(tx, { unidades = [], ambiente }) {
  const soltas = [];
  for (const unidadeId of [...new Set(unidades.filter(Boolean))]) {
    const reserva = await reservaAberta(tx, unidadeId, ambiente);
    if (!reserva) continue;
    const aindaAberta = await tx.mesSessao.count({
      where: { nestingUnidades: { has: unidadeId }, ambiente, status: STATUS.ABERTA },
    });
    if (aindaAberta) continue;
    await tx.mesUnidadeReserva.update({
      where: { id: reserva.id },
      data: { liberadaEm: new Date(), motivo: "Fim do trabalho na barra" },
    });
    soltas.push(unidadeId);
  }
  return soltas;
}

/**
 * A LIBERAÇÃO DO ADMIN — a saída para a barra presa num posto que ninguém encerrou.
 *
 * ⚠⚠ ELA ENCERRA O TRABALHO JUNTO (parecer do Codex). Soltar a posse deixando as sessões abertas
 * no posto antigo faria a barra ser cortada em dois lugares com a bênção do sistema — o oposto do
 * que a reserva existe para garantir. Nada de apontamento ou evento é apagado: o que foi produzido
 * lá continua lá, e é do posto que produziu.
 *
 * ⚠ Exige motivo, como toda quebra de regra no MES: a barra volta a ficar livre e alguém vai
 * perguntar por quê.
 */
export async function liberarUnidade(tx, { unidadeId, ambiente, porQuem, motivo, encerrarSessoes }) {
  const reserva = await reservaAberta(tx, unidadeId, ambiente);
  if (!reserva) return { erro: "Esta barra não está reservada por nenhum posto." };
  const abertas = await tx.mesSessao.findMany({
    where: { nestingUnidades: { has: unidadeId }, ambiente, status: STATUS.ABERTA },
    select: { id: true },
  });
  for (const s of abertas) await encerrarSessoes(tx, s.id);
  const liberada = await tx.mesUnidadeReserva.update({
    where: { id: reserva.id },
    data: { liberadaEm: new Date(), liberadaPor: porQuem || null, motivo: motivo || "Liberada pelo ADMIN" },
  });
  return { reserva: liberada, encerradas: abertas.length };
}
