import { describe, it, expect, vi } from "vitest";
import { validarQuantidade, mudarEstado, apontarQuantidade, abrirSessao, ESTADO, STATUS } from "@/lib/mes/sessao";

// MES — AS REGRAS DA SESSÃO DO TOTEM.
//
// ⚠⚠ O QUE ESTE ARQUIVO **NÃO** PROVA: exclusão mútua. `pg_advisory_xact_lock`, o índice parcial de
// sessão única e o `@@unique` da chave de idempotência são comportamento do POSTGRES — com o Prisma
// mockado, um teste de concorrência aqui provaria o mock. A prova de verdade roda contra o banco do
// laboratório, em `scripts/mes-lab/provar-concorrencia.mjs`, com conexões paralelas de verdade e as
// duas ordens da corrida forçadas. Os dois existem e cobrem coisas diferentes.
//
// Aqui ficam as recusas que valem antes de qualquer banco — as que impedem dado sem sentido de
// nascer.

/** Um Prisma mínimo: a trava vira "só execute a função", que é o que ela é fora do Postgres. */
function prismaFalso({ sessao = null, recurso = "r1" } = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    mesSessao: {
      findUnique: vi.fn().mockResolvedValue(sessao),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "s1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => ({ ...sessao, ...data })),
    },
    mesEvento: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "e1", ...data })),
      upsert: vi.fn().mockImplementation(({ create }) => ({ id: "e1", ...create })),
    },
    mesApontamentoQtd: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "q1", ...data })),
      upsert: vi.fn().mockImplementation(({ create }) => ({ id: "q1", ...create })),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: (fn) => fn(tx),
      mesSessao: { findUnique: vi.fn().mockResolvedValue(sessao ? { recursoId: recurso } : null) },
    },
  };
}

const ABERTA = { id: "s1", recursoId: "r1", status: STATUS.ABERTA, operadorId: "op1", ambiente: "PROD" };

describe("validarQuantidade — o que não pode nascer", () => {
  it("aceita um lançamento normal", () => {
    expect(validarQuantidade({ boas: 3 }).ok).toBe(true);
    expect(validarQuantidade({ boas: 0, rejeitadas: 1 }).ok).toBe(true);
  });

  // ⚠ Num modelo de eventos, desfazer é lançamento de CORREÇÃO rastreável — não um número negativo
  // que some no somatório e não deixa dizer o que aconteceu.
  it("recusa quantidade negativa", () => {
    expect(validarQuantidade({ boas: -1 }).ok).toBe(false);
    expect(validarQuantidade({ boas: 5, rejeitadas: -2 }).ok).toBe(false);
  });

  // ⚠ Não é apontamento, é um clique perdido. Gravado, polui o histórico com linha que não diz nada.
  it("recusa lançamento com tudo zero", () => {
    const r = validarQuantidade({ boas: 0, rejeitadas: 0, retrabalho: 0 });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/ao menos uma peça/i);
  });

  it("recusa texto e vazio em vez de tratar como zero", () => {
    expect(validarQuantidade({ boas: "abc" }).ok).toBe(false);
    expect(validarQuantidade({}).ok).toBe(false);
  });
});

describe("mudarEstado", () => {
  // ⚠⚠ PARADA SEM MOTIVO NÃO VIRA PARETO NEM OEE HONESTO — vira barra vermelha que ninguém explica,
  // que é o que o Syneco entrega hoje quando o operador pula o campo.
  it("recusa PARADA sem motivo", async () => {
    const { prisma } = prismaFalso({ sessao: ABERTA });
    const r = await mudarEstado(prisma, { sessaoId: "s1", tipo: ESTADO.PARADA });
    expect(r.erro).toMatch(/motivo/i);
  });

  it("aceita PARADA com motivo", async () => {
    const { prisma } = prismaFalso({ sessao: ABERTA });
    const r = await mudarEstado(prisma, { sessaoId: "s1", tipo: ESTADO.PARADA, motivoId: "m1" });
    expect(r.erro).toBeUndefined();
    expect(r.evento.tipo).toBe(ESTADO.PARADA);
  });

  it("recusa estado que não existe, em vez de gravar texto livre", async () => {
    const { prisma } = prismaFalso({ sessao: ABERTA });
    expect((await mudarEstado(prisma, { sessaoId: "s1", tipo: "ALMOÇO" })).erro).toMatch(/desconhecido/i);
  });

  // ⚠⚠ O STATUS É RELIDO DENTRO DA TRAVA. É o bug que a Conferência de Peça teve: a gravação passava
  // por cima de uma sessão que outra chamada acabara de encerrar, porque o status conferido era o de
  // antes da fila.
  it("recusa mudar estado de sessão já encerrada", async () => {
    const { prisma } = prismaFalso({ sessao: { ...ABERTA, status: STATUS.ENCERRADA } });
    const r = await mudarEstado(prisma, { sessaoId: "s1", tipo: ESTADO.SETUP });
    expect(r.erro).toMatch(/encerrada/i);
  });
});

describe("apontarQuantidade", () => {
  it("recusa quantidade inválida antes de tocar no banco", async () => {
    const { prisma, tx } = prismaFalso({ sessao: ABERTA });
    expect((await apontarQuantidade(prisma, { sessaoId: "s1", boas: -3 })).erro).toBeTruthy();
    expect(tx.mesApontamentoQtd.create).not.toHaveBeenCalled();
    expect(tx.mesApontamentoQtd.upsert).not.toHaveBeenCalled();
  });

  it("recusa lançar em sessão encerrada", async () => {
    const { prisma } = prismaFalso({ sessao: { ...ABERTA, status: STATUS.ENCERRADA } });
    expect((await apontarQuantidade(prisma, { sessaoId: "s1", boas: 1 })).erro).toMatch(/encerrada/i);
  });

  // ⚠ COM CHAVE USA `upsert`, SEM CHAVE USA `create` — e a diferença não é estética. Vários NULL não
  // colidem num índice único do Postgres, então `upsert` sem chave criaria duplicata silenciosa em
  // vez de devolver o que já existe.
  it("com chave de idempotência grava por upsert", async () => {
    const { prisma, tx } = prismaFalso({ sessao: ABERTA });
    await apontarQuantidade(prisma, { sessaoId: "s1", boas: 2, chaveOperacao: "k1" });
    expect(tx.mesApontamentoQtd.upsert).toHaveBeenCalled();
    expect(tx.mesApontamentoQtd.create).not.toHaveBeenCalled();
  });

  it("sem chave grava direto", async () => {
    const { prisma, tx } = prismaFalso({ sessao: ABERTA });
    await apontarQuantidade(prisma, { sessaoId: "s1", boas: 2 });
    expect(tx.mesApontamentoQtd.create).toHaveBeenCalled();
    expect(tx.mesApontamentoQtd.upsert).not.toHaveBeenCalled();
  });

  it("herda o operador da sessão quando o lançamento não diz quem foi", async () => {
    const { prisma, tx } = prismaFalso({ sessao: ABERTA });
    await apontarQuantidade(prisma, { sessaoId: "s1", boas: 1 });
    expect(tx.mesApontamentoQtd.create.mock.calls[0][0].data.operadorId).toBe("op1");
  });
});

describe("abrirSessao", () => {
  it("exige o recurso", async () => {
    const { prisma } = prismaFalso();
    expect((await abrirSessao(prisma, {})).erro).toMatch(/recurso/i);
  });

  // ⚠⚠ QUEM CHEGA DEPOIS ENTRA NA SESSÃO QUE EXISTE, não leva erro. A máquina é uma só: o que está
  // rodando nela está rodando para quem quer que chegue ao totem. Recusar faria o segundo operador
  // achar que o sistema quebrou.
  it("devolve a sessão que já está aberta no recurso, sem criar outra", async () => {
    const { prisma, tx } = prismaFalso();
    tx.mesSessao.findFirst.mockResolvedValue(ABERTA);
    const r = await abrirSessao(prisma, { recursoId: "r1" });
    expect(r.jaExistia).toBe(true);
    expect(r.sessao.id).toBe("s1");
    expect(tx.mesSessao.create).not.toHaveBeenCalled();
  });

  it("abre a primeira sessão já em PRODUÇÃO — o operador foi ao totem para produzir", async () => {
    const { prisma, tx } = prismaFalso();
    const r = await abrirSessao(prisma, { recursoId: "r1", marca: "T102A1" });
    expect(r.jaExistia).toBe(false);
    expect(r.sessao.status).toBe(STATUS.ABERTA);
    expect(tx.mesEvento.create.mock.calls[0][0].data.tipo).toBe(ESTADO.PRODUCAO);
  });
});
