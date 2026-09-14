import "server-only";
import { randomUUID } from "node:crypto";
import { STATUS, ESTADO, abrirNaTransacao, encerrarNaTransacao } from "@/lib/mes/sessao";
import { comTravaDe } from "@/lib/mes/trava";
import { exigirPresenca, chaveDoCracha } from "@/lib/mes/cracha";

// ─── ABRIR VÁRIAS MARCAS DE UMA VEZ NA MESMA MÁQUINA ─────────────────────────
//
// Matheus (13/09/2026): *"o nesting vai servir para ABRIR TODAS AS MARCAS e iniciar a produção
// delas sem que o operador precise abrir uma por uma (…) tem que ser possível multi marcas ao mesmo
// tempo numa máquina"*.
//
// ⚠⚠ UMA TRANSAÇÃO, UM COMANDO, UM EVENTO. Chamar `abrirSessao` N vezes daria N transações e N
// travas — metade do lote podia entrar e a outra metade falhar, deixando a barra pela metade no
// chão de fábrica (pedido do Codex). E daria N eventos de PRODUCAO no mesmo instante, inflando o
// tempo do recurso N vezes.
//
// ⚠⚠ O ESTADO É DO RECURSO, NÃO DAS SESSÕES (achado do Codex, o mais importante deste trabalho).
// Até aqui, abrir sessão gravava PRODUCAO e encerrar gravava ENCERRAMENTO. Repetindo isso por
// marca: abrir uma marca APAGARIA UMA PARADA em curso, e fechar uma marca LIBERARIA A MÁQUINA
// INTEIRA enquanto as outras ainda produzem. Agora a transição compartilhada é um evento do recurso
// (`sessaoId: null`), e só acontece quando o recurso NÃO está num estado que alguém escolheu.

// ⚠ O crachá entra no MESMO conjunto de travas, nunca aninhado — ver `lib/mes/sessao.js`.
const chavesDo = (presenca, recursoId) =>
  [presenca?.operadorId ? chaveDoCracha(presenca.operadorId) : null, recursoId];
const recusaDeCracha = (tx, presenca, recursoId) =>
  (presenca?.operadorId ? exigirPresenca(tx, { ...presenca, recursoId }) : Promise.resolve(null));

/** Estados que alguém pôs ali de propósito — abrir trabalho não os desfaz. */
const ESCOLHIDOS = new Set([ESTADO.PARADA, ESTADO.MANUTENCAO, ESTADO.FORA_TURNO, ESTADO.SETUP]);

/**
 * @param {{marca:string, opNumero?:string, opId?:string, pecaId?:string, planejadoQtd?:number}[]} trabalhos
 */
export async function abrirLote(prisma, { recursoId, operadorId = null, trabalhos = [], ambiente = "PROD", loteId = null, nestingUnidadeId = null, presenca = null }) {
  if (!recursoId) return { erro: "Informe o recurso." };
  if (!trabalhos.length) return { erro: "Nenhuma marca para abrir." };

  // ⚠ O id do lote vem de fora quando o chamador quer idempotência (o mesmo toque repetido devolve
  // o mesmo lote); senão nasce aqui.
  const lote = loteId || randomUUID();

  return comTravaDe(prisma, chavesDo(presenca, recursoId), async (tx) => {
    // ⚠⚠ O CRACHÁ É CONFERIDO ANTES DO LAÇO (pedido do Codex). `abrirNaTransacao` devolve `{erro}`
    // e este chamador só desestrutura `{ sessao }` — uma recusa lá dentro seria ENGOLIDA e a barra
    // entraria pela metade. Validando aqui, ou o lote inteiro entra ou nada entra, que é a razão
    // de ele ser uma transação só.
    const recusa = await recusaDeCracha(tx, presenca, recursoId);
    if (recusa) return { erro: recusa };

    const jaEra = await tx.mesSessao.findFirst({ where: { lotes: { has: lote } }, select: { id: true } });
    if (jaEra) return { loteId: lote, jaExistia: true, sessoes: await doLote(tx, lote) };

    const sessoes = [];
    for (const t of trabalhos) {
      const { sessao } = await abrirNaTransacao(tx, {
        ...t, recursoId, operadorId, ambiente, loteId: lote, nestingUnidadeId,
        // ⚠ Nenhuma sessão grava evento próprio: o evento do comando é UM, e é do recurso.
        semEvento: true,
      });
      sessoes.push(sessao);
    }

    const estado = await estadoAtual(tx, recursoId);
    const mexeuNoEstado = !ESCOLHIDOS.has(estado);
    if (mexeuNoEstado) {
      await tx.mesEvento.create({
        data: {
          recursoId, sessaoId: null, operadorId, tipo: ESTADO.PRODUCAO,
          ocorridoEm: new Date(), ambiente, detalhe: `Abertura de ${sessoes.length} marca(s)`,
        },
      });
    }
    return { loteId: lote, jaExistia: false, sessoes, estadoPreservado: mexeuNoEstado ? null : estado };
  });
}

/**
 * Encerra o que ESTE lote abriu.
 *
 * ⚠⚠ NUNCA "TODAS AS ABERTAS DO RECURSO" (pedido do Codex). O posto pode ter trabalho de outro
 * lote, ou aberto à mão pelo operador; encerrar tudo junto fecharia o que ninguém mandou fechar.
 *
 * ⚠ Marca com saldo PODE ser encerrada: a sessão produz parte do saldo e o resto continua
 * disponível para a próxima — regra que já valia em `encerrarSessao`. Encerrar não é concluir.
 *
 * ⚠ O ENCERRAMENTO do recurso só é gravado quando NÃO sobrou trabalho aberto. Gravando sempre, o
 * fim de uma barra diria que a máquina parou enquanto as outras marcas ainda produzem.
 */
export async function encerrarLote(prisma, { recursoId, loteId, operadorId = null, presenca = null }) {
  if (!recursoId || !loteId) return { erro: "Informe o recurso e o lote." };

  return comTravaDe(prisma, chavesDo(presenca, recursoId), async (tx) => {
    const recusa = await recusaDeCracha(tx, presenca, recursoId);
    if (recusa) return { erro: recusa };

    const daExecucao = await tx.mesSessao.findMany({
      where: { lotes: { has: loteId }, recursoId, status: STATUS.ABERTA },
      select: { id: true, lotes: true },
    });

    // ⚠⚠ SÓ FECHA O QUE NÃO ESTÁ SENDO USADO POR OUTRO COMANDO AINDA ABERTO (pedido do Codex,
    // provado contra o banco em 13/09/2026: duas barras do mesmo plano abertas juntas repetiam 3
    // marcas, e encerrar a primeira fechava marca que a segunda ainda cortava). A sessão sai do
    // comando; só quando não sobra nenhum é que ela encerra de verdade.
    let encerradas = 0;
    for (const s of daExecucao) {
      const restantes = s.lotes.filter((l) => l !== loteId);
      if (restantes.length) {
        await tx.mesSessao.update({ where: { id: s.id }, data: { lotes: restantes } });
        continue;
      }
      await encerrarNaTransacao(tx, s.id, { operadorId, semEvento: true });
      encerradas += 1;
    }

    const sobrou = await tx.mesSessao.count({ where: { recursoId, status: STATUS.ABERTA } });
    if (!sobrou) {
      await tx.mesEvento.create({
        data: {
          recursoId, sessaoId: null, operadorId, tipo: ESTADO.ENCERRAMENTO,
          ocorridoEm: new Date(), ambiente: "PROD", detalhe: "Fim do trabalho no posto",
        },
      });
    }
    return { encerradas, seguemEmOutroLote: daExecucao.length - encerradas, aindaAbertas: sobrou };
  });
}

/** O que está aberto neste posto agora — é o que o totem lista. */
export async function trabalhosAbertos(prisma, recursoId) {
  return prisma.mesSessao.findMany({
    where: { recursoId, status: STATUS.ABERTA },
    orderBy: { abertaEm: "asc" },
    include: { operador: { select: { nome: true } } },
  });
}

const doLote = (tx, loteId) => tx.mesSessao.findMany({ where: { lotes: { has: loteId } }, orderBy: { abertaEm: "asc" } });

async function estadoAtual(tx, recursoId) {
  const evento = await tx.mesEvento.findFirst({
    where: { recursoId },
    orderBy: [{ ocorridoEm: "desc" }, { recebidoEm: "desc" }, { id: "desc" }],
    select: { tipo: true },
  });
  return evento?.tipo || null;
}
