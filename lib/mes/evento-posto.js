import "server-only";
import { STATUS, ESTADO } from "./estados";

// ─── OS EVENTOS QUE SÃO DO POSTO, E NÃO DA SESSÃO ────────────────────────────
//
// ⚠⚠ SAIU DE `lib/mes/lote.js` PORQUE A TRANSFERÊNCIA REPETIU A REGRA E ERROU (achado do Codex,
// 22/09/2026). `abrirLote` consultava o estado do recurso antes de gravar PRODUCAO; `transferirBarra`
// gravava direto — então trazer uma barra para uma máquina PARADA, em MANUTENÇÃO ou em SETUP
// apagava esse estado e o tempo dele parava de ser contado. É exatamente o achado que o próprio
// lote pagou para aprender ("abrir trabalho NÃO desfaz uma parada"), reaparecendo por outra porta.
//
// Regra escrita uma vez, usada pelos dois.

/** Estados que alguém pôs ali de propósito — abrir trabalho não os desfaz. */
export const ESCOLHIDOS = new Set([ESTADO.PARADA, ESTADO.MANUTENCAO, ESTADO.FORA_TURNO, ESTADO.SETUP]);

/** O que o recurso está fazendo agora — o último evento manda. */
export async function estadoAtual(tx, recursoId) {
  const evento = await tx.mesEvento.findFirst({
    where: { recursoId },
    orderBy: [{ ocorridoEm: "desc" }, { recebidoEm: "desc" }, { id: "desc" }],
    select: { tipo: true },
  });
  return evento?.tipo || null;
}

/**
 * COMEÇOU TRABALHO NO POSTO — um evento só, do recurso, e que respeita o estado escolhido.
 *
 * @returns {Promise<{estadoPreservado: string|null}>} o estado que foi mantido, quando foi.
 */
export async function comecarNoPosto(tx, { recursoId, operadorId = null, ambiente, detalhe }) {
  const estado = await estadoAtual(tx, recursoId);
  if (ESCOLHIDOS.has(estado)) return { estadoPreservado: estado };
  await tx.mesEvento.create({
    data: {
      recursoId, sessaoId: null, operadorId, tipo: ESTADO.PRODUCAO,
      ocorridoEm: new Date(), ambiente, detalhe,
    },
  });
  return { estadoPreservado: null };
}

/**
 * FIM DO TRABALHO NO POSTO — e só quando não sobrou marca aberta.
 *
 * ⚠⚠ O MUNDO VEM DO RECURSO, não de um literal nem do pedido (achado do Codex, 21/09/2026): este
 * evento é do POSTO ("fim do trabalho no posto"), e ele é gravado justamente quando não sobrou
 * sessão nenhuma de onde tirar o ambiente.
 *
 * ⚠ Gravando sempre, o fim de uma barra diria que a máquina parou enquanto as outras marcas ainda
 * produzem.
 */
export async function encerrarPostoSeVazio(tx, { recursoId, operadorId = null }) {
  const sobrou = await tx.mesSessao.count({ where: { recursoId, status: STATUS.ABERTA } });
  if (sobrou) return { encerrou: false, aindaAbertas: sobrou };
  const posto = await tx.mesRecurso.findUnique({ where: { id: recursoId }, select: { ambiente: true } });
  await tx.mesEvento.create({
    data: {
      recursoId, sessaoId: null, operadorId, tipo: ESTADO.ENCERRAMENTO,
      ocorridoEm: new Date(), ambiente: posto?.ambiente, detalhe: "Fim do trabalho no posto",
    },
  });
  return { encerrou: true, aindaAbertas: 0 };
}
