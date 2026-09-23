import "server-only";
import { prisma } from "@/lib/prisma";

// ─── O TETO DE CONSUMO ───────────────────────────────────────────────────────
//
// ⚠⚠⚠ CONFERIR O SALDO E INCREMENTAR DEPOIS DEIXA AS DUAS PASSAREM (parecer do Codex, 23/09/2026).
// Duas mensagens simultâneas do mesmo usuário leem o mesmo saldo, as duas concluem que cabe, e as
// duas gastam. A reserva aqui é UM `INSERT ... ON CONFLICT DO UPDATE ... WHERE` — quem decide se
// cabe é o Postgres, no mesmo comando que grava, e o índice único (userId, dia) serializa o resto.
//
// ⚠⚠ E A RESERVA VEM ANTES DA CHAMADA, não depois. Reservar depois é o mesmo furo com outro nome:
// o custo só é conhecido quando a resposta volta, e até lá outras chamadas já entraram.
//
// ⚠⚠ RESERVA DE EXECUÇÃO INTERROMPIDA NÃO É DEVOLVIDA AUTOMATICAMENTE (parecer do Codex). Se a
// rota morreu no meio, o custo REAL é desconhecido — pode ter havido consumo. Devolver por padrão
// transformaria queda de rota em jeito de furar o teto.

/** Em MICROS de real. ⚠ Inteiro: centavo em float acumula erro ao somar milhares de chamadas. */
const MILHAO = 1_000_000;

/**
 * ⚠ Tetos FOLGADOS de propósito — isto é anti-descontrole, não controle de fluxo. Medido no
 * desenho: uma pergunta média custa entre R$ 0,02 e R$ 0,08. R$ 15/dia por pessoa são ~200
 * perguntas; quem passa disso não está perguntando, está com um laço.
 */
export const TETO_DIA_USUARIO_MICROS = Number(process.env.FISCAL_IA_TETO_DIA_BRL ?? 15) * MILHAO;
export const TETO_DIA_GLOBAL_MICROS = Number(process.env.FISCAL_IA_TETO_DIA_GLOBAL_BRL ?? 120) * MILHAO;

/** ⚠⚠ A CHAVE DO TETO GLOBAL É UMA LINHA COM userId RESERVADO — o mesmo `ON CONFLICT` serve para
 *  os dois, sem uma segunda tabela que poderia divergir. `*` não é cuid, então nunca colide. */
const GLOBAL = "*";

/** ⚠ O dia é o de QUEM TRABALHA (America/Sao_Paulo), não o UTC: às 21h de SP já é amanhã em UTC,
 *  e o teto viraria à noite no meio do expediente de quem ficou até tarde. */
export const diaDeHoje = (agora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);

/**
 * ⚠⚠ QUANTO SE RESERVA ANTES DE SABER O CUSTO: um valor CONSERVADOR, maior que a média. Reservar
 * a média deixaria a cauda longa furar o teto; reservar o máximo teórico bloquearia gente que não
 * gastou nada. R$ 0,25 cobre com folga uma rodada com ferramentas e legislação recuperada.
 */
export const RESERVA_MICROS = Number(process.env.FISCAL_IA_RESERVA_BRL ?? 0.25) * MILHAO;

const reservarEm = async (tx, userId, dia, micros, teto) => {
  // ⚠⚠ O `WHERE` DO `DO UPDATE` É O QUE TORNA ISTO ATÔMICO. Sem ele, o UPDATE sempre aplica e o
  // teto vira enfeite. Com ele, quem estouraria simplesmente não atualiza — e `count` volta 0.
  const n = await tx.$executeRawUnsafe(
    `INSERT INTO "FiscalUsoIa" ("id","userId","dia","chamadas","custoMicros","atualizadoEm")
     VALUES (gen_random_uuid()::text, $1, $2, 1, $3, NOW())
     ON CONFLICT ("userId","dia") DO UPDATE
       SET "custoMicros" = "FiscalUsoIa"."custoMicros" + $3,
           "chamadas"    = "FiscalUsoIa"."chamadas" + 1,
           "atualizadoEm" = NOW()
       WHERE "FiscalUsoIa"."custoMicros" + $3 <= $4`,
    userId, dia, Math.round(micros), Math.round(teto),
  );
  return n > 0;
};

/**
 * Reserva a vez ANTES da chamada. Devolve `{ ok }` ou `{ ok: false, motivo }`.
 *
 * ⚠⚠ O TETO GLOBAL É RESERVADO PRIMEIRO E DEVOLVIDO SE O PESSOAL FALHAR. Sem essa devolução, um
 * usuário no limite pessoal consumiria o orçamento da empresa sem nunca fazer uma pergunta.
 */
export async function reservar(userId, { micros = RESERVA_MICROS } = {}) {
  const dia = diaDeHoje();
  return prisma.$transaction(async (tx) => {
    if (!await reservarEm(tx, GLOBAL, dia, micros, TETO_DIA_GLOBAL_MICROS)) {
      return { ok: false, motivo: "O teto diário de consumo de IA do portal foi atingido. O assistente volta amanhã, ou um administrador pode elevar o limite." };
    }
    if (!await reservarEm(tx, userId, dia, micros, TETO_DIA_USUARIO_MICROS)) {
      await devolverEm(tx, GLOBAL, dia, micros);
      return { ok: false, motivo: "Você atingiu o seu teto diário de uso do assistente fiscal. As consultas às abas de NCM, CFOP e Simulador continuam disponíveis." };
    }
    return { ok: true, dia, reservado: micros };
  });
}

const devolverEm = (tx, userId, dia, micros) => tx.$executeRawUnsafe(
  `UPDATE "FiscalUsoIa" SET "custoMicros" = GREATEST(0, "custoMicros" - $3), "chamadas" = GREATEST(0, "chamadas" - 1) WHERE "userId" = $1 AND "dia" = $2`,
  userId, dia, Math.round(micros),
);

/**
 * Concilia a reserva com o consumo REAL depois da chamada.
 * ⚠ Só o DELTA é aplicado — a reserva já entrou. Gastou menos, devolve a diferença; gastou mais,
 * cobra a diferença SEM teto (o gasto já aconteceu; recusar agora não desfaz a chamada).
 */
export async function conciliar(userId, { dia, reservado, micros, tokensEntrada = 0, tokensSaida = 0 }) {
  const delta = Math.round(micros - reservado);
  await prisma.$executeRawUnsafe(
    `UPDATE "FiscalUsoIa"
        SET "custoMicros" = GREATEST(0, "custoMicros" + $3),
            "tokensEntrada" = "tokensEntrada" + $4, "tokensSaida" = "tokensSaida" + $5, "atualizadoEm" = NOW()
      WHERE "userId" = ANY($1::text[]) AND "dia" = $2`,
    [userId, GLOBAL], dia, delta, tokensEntrada, tokensSaida,
  );
}

/** O que o painel e a tela mostram — e o que a pessoa já gastou hoje. */
export async function consumoDoDia(userId) {
  const dia = diaDeHoje();
  const [meu, global] = await Promise.all([
    prisma.fiscalUsoIa.findUnique({ where: { userId_dia: { userId, dia } } }),
    prisma.fiscalUsoIa.findUnique({ where: { userId_dia: { userId: GLOBAL, dia } } }),
  ]);
  const reais = (m) => Math.round((m ?? 0) / 10000) / 100;
  return {
    dia,
    meu: { chamadas: meu?.chamadas ?? 0, reais: reais(meu?.custoMicros), tetoReais: reais(TETO_DIA_USUARIO_MICROS) },
    portal: { chamadas: global?.chamadas ?? 0, reais: reais(global?.custoMicros), tetoReais: reais(TETO_DIA_GLOBAL_MICROS) },
  };
}
