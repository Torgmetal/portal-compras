import "server-only";
import { randomUUID } from "node:crypto";
import { STATUS, ESTADO } from "./estados";
import { abrirNaTransacao, encerrarNaTransacao } from "@/lib/mes/sessao";
import { comTravaDe } from "@/lib/mes/trava";
import { exigirPresenca, chaveDoCracha } from "@/lib/mes/cracha";
import { reservaAberta, reservarUnidade, recusaDeBarraOcupada, liberarUnidade } from "@/lib/mes/unidade-reserva";

// ─── TIRAR A BARRA DE UM POSTO E PÔR EM OUTRO ────────────────────────────────
//
// A reserva exclusiva (`lib/mes/unidade-reserva.js`) impede a barra de estar aberta em dois postos
// — e por isso mesmo precisa de uma saída legítima: a máquina quebrou, o corte mudou de laser, o
// turno virou. Sem ela, a única saída seria o ADMIN liberar à força.
//
// ⚠⚠ O QUE FOI PRODUZIDO NO POSTO ANTIGO FICA NO POSTO ANTIGO (parecer do Codex, 22/09/2026).
// Nenhum apontamento muda de `sessaoId`, nenhuma sessão muda de `recursoId`, nenhum evento é
// reescrito. Arrastar a produção falsificaria o OEE dos dois postos: o antigo devolveria horas que
// trabalhou, e o novo receberia peças que não cortou.

/** Trava recursos e crachá de uma vez — nunca aninhado, e com a ordem resolvida lá dentro. */
const chavesDa = (presenca, ...recursos) =>
  [presenca?.operadorId ? chaveDoCracha(presenca.operadorId) : null, ...recursos];

/**
 * @param {{marca:string, opNumero?:string, opId?:string, pecaId?:string, planejadoQtd?:number}[]} trabalhos
 */
export async function transferirBarra(prisma, {
  unidadeId, ambiente, paraRecursoId, trabalhos = [], operadorId = null, presenca = null,
  motivo = "", usuario = null, loteId = null,
}) {
  // ⚠ A origem é descoberta FORA da transação só para saber QUAIS chaves travar; lá dentro ela é
  // relida e conferida. Descobrir e confiar seria travar o posto errado (parecer do Codex).
  const { erro: impede, antes } = await origemDaBarra(prisma, { unidadeId, paraRecursoId, ambiente, trabalhos });
  if (impede) return { erro: impede };

  const lote = loteId || randomUUID();
  return comTravaDe(prisma, chavesDa(presenca, antes.recursoId, paraRecursoId), async (tx) => {
    const impedimento = await conferirDestino(tx, { presenca, paraRecursoId, unidadeId, ambiente, antes });
    if (impedimento) return { erro: impedimento };
    const agora = await reservaAberta(tx, unidadeId, ambiente);

    const { erro: naoDa, sessoes: daOrigem } = await daOrigemTransferivel(tx, agora.loteId);
    if (naoDa) return { erro: naoDa };

    // ⚠ Encerrar pelo caminho de sempre: é ele que libera a reserva (`reconciliarUnidades`), e é
    // por isso que aqui não existe um segundo "liberar".
    for (const s of daOrigem) await encerrarNaTransacao(tx, s.id, { operadorId, semEvento: true });
    await eventoDeFim(tx, agora.recursoId, operadorId, ambiente);

    const posse = await reservarUnidade(tx, { unidadeId, ambiente, recursoId: paraRecursoId, loteId: lote, operadorId });
    if (posse.ocupada) return { erro: await recusaDeBarraOcupada(tx, posse.ocupada) };

    const sessoes = [];
    for (const t of trabalhos) {
      const { sessao } = await abrirNaTransacao(tx, {
        ...t, recursoId: paraRecursoId, operadorId, ambiente,
        loteId: lote, nestingUnidadeId: unidadeId, semEvento: true,
      });
      sessoes.push(sessao);
    }
    await tx.mesEvento.create({
      data: {
        recursoId: paraRecursoId, sessaoId: null, operadorId, tipo: ESTADO.PRODUCAO,
        ocorridoEm: new Date(), ambiente, detalhe: `Barra recebida de outro posto · ${sessoes.length} marca(s)`,
      },
    });
    await tx.mesAuditoria.create({
      data: {
        userId: usuario?.id ?? null, action: "MES_TRANSFERIR_BARRA",
        entity: "MesUnidadeReserva", entityId: unidadeId, ambiente,
        diff: {
          de: agora.recursoId, para: paraRecursoId, loteAnterior: agora.loteId, loteNovo: lote,
          sessoesEncerradas: daOrigem.length, sessoesAbertas: sessoes.length, motivo: motivo || null,
        },
      },
    });
    return { loteId: lote, sessoes, deRecursoId: agora.recursoId, encerradasNaOrigem: daOrigem.length };
  });
}

/** As recusas que não dependem de trava nenhuma, e de onde a barra sai. */
async function origemDaBarra(prisma, { unidadeId, paraRecursoId, ambiente, trabalhos }) {
  if (!unidadeId || !paraRecursoId) return { erro: "Informe a barra e o posto de destino." };
  if (!trabalhos.length) return { erro: "Esta barra não tem marca nenhuma." };
  const antes = await reservaAberta(prisma, unidadeId, ambiente);
  if (!antes) return { erro: "Esta barra não está aberta em posto nenhum — é só abrir aqui." };
  if (antes.recursoId === paraRecursoId) return { erro: "Esta barra já está neste posto." };
  return { antes };
}

/**
 * O que precisa ser verdade DEPOIS da trava — crachá no posto de destino e a barra ainda sendo a
 * mesma que se decidiu trazer.
 *
 * ⚠⚠ RELEITURA DEPOIS DA TRAVA (parecer do Codex). Entre descobrir a origem e conseguir o lock,
 * outra transação pode ter encerrado, liberado ou transferido a barra — e aí as chaves travadas já
 * não são as certas. Abortar e deixar o operador tocar de novo é o único desfecho honesto.
 */
async function conferirDestino(tx, { presenca, paraRecursoId, unidadeId, ambiente, antes }) {
  if (presenca?.operadorId) {
    const recusa = await exigirPresenca(tx, { ...presenca, recursoId: paraRecursoId });
    if (recusa) return recusa;
  }
  const agora = await reservaAberta(tx, unidadeId, ambiente);
  if (!agora || agora.id !== antes.id) return "A barra mudou de estado agora mesmo. Tente de novo.";
  return null;
}

/**
 * As sessões que este comando pode levar — ou o motivo de não poder.
 *
 * ⚠⚠ SESSÃO COMPARTILHADA COM OUTRO COMANDO NÃO SE TRANSFERE (risco levantado pelo Codex,
 * 22/09/2026). O apontamento carrega `sessaoId`, não a barra: se a barra A e a barra B dividem a
 * mesma sessão (a mesma marca nas duas), mover A deixaria a sessão aceitando produção por causa de
 * B — e não haveria como dizer de qual barra veio a peça. Recusar é a resposta certa enquanto o
 * apontamento não souber a que unidade pertence.
 */
async function daOrigemTransferivel(tx, loteId) {
  const sessoes = await tx.mesSessao.findMany({
    where: { lotes: { has: loteId }, status: STATUS.ABERTA },
    select: { id: true, lotes: true, recursoId: true },
  });
  if (sessoes.some((s) => s.lotes.length > 1)) {
    return { erro: "Esta barra divide marcas com outro comando aberto no posto. Encerre lá antes de trazer." };
  }
  return { sessoes };
}

/**
 * A SAÍDA DE EMERGÊNCIA — o ADMIN solta a barra presa num posto que ninguém encerrou.
 *
 * ⚠ Mesma forma da liberação de crachá que já existe: libera e nada mais inventa. O que foi
 * produzido continua onde foi produzido.
 */
export async function liberarBarra(prisma, { unidadeId, ambiente, recursoId, motivo, usuario }) {
  if (!unidadeId) return { erro: "Informe a barra." };
  const porque = String(motivo ?? "").trim();
  if (!porque) return { erro: "Diga por que a barra está sendo liberada — isso encerra o trabalho aberto nela." };
  const dona = await reservaAberta(prisma, unidadeId, ambiente);
  if (!dona) return { erro: "Esta barra não está reservada por nenhum posto." };

  return comTravaDe(prisma, [dona.recursoId, recursoId].filter(Boolean), async (tx) => {
    // ⚠⚠ A DONA É RELIDA DEPOIS DA TRAVA, E SE MUDOU A LIBERAÇÃO É RECUSADA (achado do Codex,
    // 22/09/2026). As chaves travadas saem da leitura FEITA ANTES: se a barra for transferida
    // enquanto esta chamada espera na fila, quem está com ela agora é outro posto — e este código
    // encerraria as sessões DELE sem nunca ter travado a máquina dele, que é a corrida que a trava
    // existe para impedir. O evento e a auditoria também sairiam com o posto errado.
    const agora = await reservaAberta(tx, unidadeId, ambiente);
    if (!agora || agora.id !== dona.id) {
      return { erro: "A barra mudou de posto agora mesmo. Abra a tela de novo e confira onde ela está." };
    }

    const r = await liberarUnidade(tx, {
      unidadeId, ambiente, porQuem: usuario?.name || usuario?.email || null, motivo: porque,
      encerrarSessoes: (t, id) => encerrarNaTransacao(t, id, { semEvento: true }),
    });
    if (r.erro) return r;
    await eventoDeFim(tx, agora.recursoId, null, ambiente);
    await tx.mesAuditoria.create({
      data: {
        userId: usuario?.id ?? null, action: "MES_LIBERAR_BARRA",
        entity: "MesUnidadeReserva", entityId: unidadeId, ambiente,
        diff: { posto: agora.recursoId, loteId: agora.loteId, encerradas: r.encerradas, motivo: porque },
      },
    });
    return { liberada: true, encerradas: r.encerradas, deRecursoId: agora.recursoId };
  });
}

/**
 * ⚠⚠ O ENCERRAMENTO É DO POSTO E SÓ VALE QUANDO NÃO SOBROU MARCA ABERTA — a mesma regra de
 * `encerrarLote` e de `encerrarNaTransacao`. Gravando sempre, tirar uma barra de um laser que
 * segue cortando outra diria que a máquina parou.
 */
async function eventoDeFim(tx, recursoId, operadorId, ambiente) {
  const sobrou = await tx.mesSessao.count({ where: { recursoId, status: STATUS.ABERTA } });
  if (sobrou) return;
  await tx.mesEvento.create({
    data: {
      recursoId, sessaoId: null, operadorId, tipo: ESTADO.ENCERRAMENTO,
      ocorridoEm: new Date(), ambiente, detalhe: "Fim do trabalho no posto",
    },
  });
}
