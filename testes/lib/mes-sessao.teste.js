import { describe, it, expect, vi } from "vitest";
import { validarQuantidade, mudarEstado, apontarQuantidade, abrirSessao, saldoDaMarca, estadoDoRecurso, ESTADO, STATUS } from "@/lib/mes/sessao";

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

/**
 * Um Prisma mínimo: a trava vira "só execute a função", que é o que ela é fora do Postgres.
 *
 * `jaBoas` é quanto a MARCA já tem lançado somando todas as sessões dela — é o que
 * `saldoDaMarca` vai ler para decidir se ainda cabe.
 */
function prismaFalso({ sessao = null, recurso = "r1", jaBoas = 0, jaGravado = null } = {}) {
  // ⚠⚠ AS IRMÃS CARREGAM O PLANEJAMENTO (22/09/2026). O teto deixou de sair da sessão passada por
  // parâmetro: ele é COMPOSTO a partir das irmãs (`comporTeto`) — `planejadoManual` quando a marca
  // foi digitada, as barras do nesting quando veio de plano. Irmã sem esses campos é irmã sem
  // planejamento, e o teto some.
  const irmas = [
    { id: "s1", ...(sessao || {}), nestingUnidades: [] },
    { id: "s-ontem", ...(sessao || {}), nestingUnidades: [] },
  ];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    mesSessao: {
      findUnique: vi.fn().mockResolvedValue(sessao),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(irmas),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "s1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => ({ ...sessao, ...data })),
    },
    mesEvento: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "e1", ...data })),
      upsert: vi.fn().mockImplementation(({ create }) => ({ id: "e1", ...create })),
    },
    mesApontamentoQtd: {
      findUnique: vi.fn().mockResolvedValue(jaGravado),
      aggregate: vi.fn().mockResolvedValue({ _sum: { boas: jaBoas } }),
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

// ─── O TETO DO PLANEJADO ──────────────────────────────────────────────────────
//
// Matheus (11/09/2026): "quando lançar é importante que ele trave a quantidade que dá para lançar
// comparando na quantidade planejada". Trava que RECUSA — quem corrige o planejado é o PCP.

const PLANEJADA = { ...ABERTA, marca: "T82A-P25", opId: "op-82", planejadoQtd: 7, planejadoManual: 7 };

describe("saldoDaMarca — o teto é da marca, não da sessão", () => {
  it("desconta o que JÁ foi lançado em outras sessões da mesma marca", async () => {
    const { prisma, tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 5 });
    const r = await saldoDaMarca(tx, PLANEJADA);
    expect(r).toMatchObject({ planejado: 7, boas: 5, saldo: 2, semTeto: false });
    void prisma;
  });

  // ⚠⚠ É ESTE O BUG QUE A FUNÇÃO EXISTE PARA EVITAR. `planejadoQtd` é cópia feita na abertura: se o
  // saldo saísse dela, a sessão de hoje acharia que tem 7 inteiras pela frente depois de a de ontem
  // ter feito 5, e o total lançado chegaria a 12 numa marca de 7.
  it("não confia no planejadoQtd da própria sessão como se nada tivesse sido feito", async () => {
    const { tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 7 });
    expect((await saldoDaMarca(tx, PLANEJADA)).saldo).toBe(0);
  });

  // ⚠ Marca bipada à mão (fora da programação do Gantt) não tem planejado — e é o caso COMUM.
  it("planejado zero é SEM TETO, não proibido", async () => {
    const { tx } = prismaFalso({ sessao: ABERTA });
    expect((await saldoDaMarca(tx, ABERTA)).semTeto).toBe(true);
    expect(tx.mesApontamentoQtd.aggregate).not.toHaveBeenCalled();
  });

  it("nunca devolve saldo negativo, mesmo se já passou do planejado", async () => {
    const { tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 99 });
    expect((await saldoDaMarca(tx, PLANEJADA)).saldo).toBe(0);
  });
});

describe("apontarQuantidade — a trava do planejado", () => {
  it("aceita o que cabe no saldo", async () => {
    const { prisma, tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 5 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 2 });
    expect(r.erro).toBeUndefined();
    expect(tx.mesApontamentoQtd.create).toHaveBeenCalled();
  });

  it("recusa o que passa do planejado, e diz quantas faltam", async () => {
    const { prisma, tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 5 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 3 });
    expect(r.erro).toMatch(/faltam 2/i);
    expect(tx.mesApontamentoQtd.create).not.toHaveBeenCalled();
  });

  it("quando o planejado já foi cumprido, a mensagem diz isso — não 'faltam 0'", async () => {
    const { prisma } = prismaFalso({ sessao: PLANEJADA, jaBoas: 7 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 1 });
    expect(r.erro).toMatch(/já foram lançadas/i);
    expect(r.erro).not.toMatch(/faltam 0/i);
  });

  // ⚠⚠ SÓ AS PRODUZIDAS CONSOMEM O SALDO. Retrabalho é PERDA: a peça passou pela máquina e continua
  // faltando. Descontando do planejado, uma refugação alta trancaria a marca antes de ela ficar
  // pronta — e o operador não teria como registrar as peças que ainda precisa fazer.
  it("retrabalho não consome o planejado", async () => {
    const { prisma, tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 7 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 0, retrabalho: 4 });
    expect(r.erro).toBeUndefined();
    expect(tx.mesApontamentoQtd.create).toHaveBeenCalled();
  });

  it("sem planejado, lança o que vier", async () => {
    const { prisma } = prismaFalso({ sessao: ABERTA });
    expect((await apontarQuantidade(prisma, { sessaoId: "s1", boas: 999 })).erro).toBeUndefined();
  });

  // ⚠⚠ É O `concluiu` QUE FECHA A MARCA NA TELA. Matheus (11/09/2026): "quando o operador lançar
  // 100% das peças planejadas naquela marca deve marcar como concluído e voltar para a listagem".
  // Quem decide é o SERVIDOR: o saldo que o navegador tem é de alguns segundos atrás, e dois totens
  // na mesma marca encerrariam a sessão um do outro — ou nenhum encerraria.
  it("avisa que a marca fechou quando a última peça entra", async () => {
    const { prisma } = prismaFalso({ sessao: PLANEJADA, jaBoas: 5 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 2 });
    expect(r.concluiu).toBe(true);
    expect(r.saldo).toMatchObject({ planejado: 7, boas: 7, saldo: 0 });
  });

  it("não avisa que fechou quando ainda falta peça", async () => {
    const { prisma } = prismaFalso({ sessao: PLANEJADA, jaBoas: 5 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 1 });
    expect(r.concluiu).toBe(false);
    expect(r.saldo.saldo).toBe(1);
  });

  // ⚠ Sem planejado não existe "100%" — e encerrar a sessão sozinho aqui tiraria do operador a
  // marca que ele bipou para trabalhar o dia inteiro.
  it("marca sem planejado nunca conclui sozinha", async () => {
    const { prisma } = prismaFalso({ sessao: ABERTA });
    expect((await apontarQuantidade(prisma, { sessaoId: "s1", boas: 500 })).concluiu).toBe(false);
  });

  it("retrabalho sozinho não conclui a marca", async () => {
    const { prisma } = prismaFalso({ sessao: PLANEJADA, jaBoas: 6 });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 0, retrabalho: 5 });
    expect(r.concluiu).toBe(false);
    expect(r.saldo.saldo).toBe(1);
  });

  // ⚠⚠ O SUSTO QUE A ORDEM DAS CHECAGENS EVITA. O toque repetido chega com a MESMA chave; se o
  // saldo fosse conferido antes, o reenvio bateria no teto que ele próprio acabou de ocupar e o
  // operador veria "não cabe mais" logo depois de um lançamento que deu certo.
  it("reenvio da mesma chave devolve o que já foi gravado, mesmo com o saldo esgotado", async () => {
    const gravado = { id: "q1", sessaoId: "s1", boas: 7, chaveOperacao: "k1" };
    const { prisma, tx } = prismaFalso({ sessao: PLANEJADA, jaBoas: 7, jaGravado: gravado });
    const r = await apontarQuantidade(prisma, { sessaoId: "s1", boas: 7, chaveOperacao: "k1" });
    expect(r.erro).toBeUndefined();
    expect(r.jaEstava).toBe(true);
    expect(tx.mesApontamentoQtd.upsert).not.toHaveBeenCalled();
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
    const r = await abrirSessao(prisma, { recursoId: "r1", ambiente: "PROD" });
    expect(r.jaExistia).toBe(true);
    expect(r.sessao.id).toBe("s1");
    expect(tx.mesSessao.create).not.toHaveBeenCalled();
  });

  it("abre a primeira sessão já em PRODUÇÃO — o operador foi ao totem para produzir", async () => {
    const { prisma, tx } = prismaFalso();
    const r = await abrirSessao(prisma, { recursoId: "r1", marca: "T102A1", ambiente: "PROD" });
    expect(r.jaExistia).toBe(false);
    expect(r.sessao.status).toBe(STATUS.ABERTA);
    expect(tx.mesEvento.create.mock.calls[0][0].data.tipo).toBe(ESTADO.PRODUCAO);
  });
});


// ─── O ESTADO DO POSTO ───────────────────────────────────────────────────────
//
// ⚠⚠ ESTE TESTE EXISTE PORQUE A FUNÇÃO SUMIU SEM NINGUÉM NOTAR (13/09/2026). Refatorando o
// encerramento, apaguei `estadoDoRecurso` junto — 1.239 testes continuaram passando, e o defeito só
// apareceu quando o totem devolveu 500 no navegador. Toda função que a tela chama precisa de pelo
// menos um teste, nem que seja para provar que ela existe.

describe("estadoDoRecurso", () => {
  const prismaFalso = (sessoes, evento) => ({
    mesSessao: { findMany: vi.fn().mockResolvedValue(sessoes) },
    mesEvento: { findFirst: vi.fn().mockResolvedValue(evento) },
  });

  it("devolve todas as marcas abertas no posto, e a primeira como principal", async () => {
    const abertas = [{ id: "s1", marca: "A" }, { id: "s2", marca: "B" }];
    const r = await estadoDoRecurso(prismaFalso(abertas, { tipo: "PRODUCAO", ocorridoEm: new Date("2026-09-13") }), "r1");
    expect(r.sessoes).toHaveLength(2);
    expect(r.sessao.id).toBe("s1");
    expect(r.estado).toBe("PRODUCAO");
  });

  // ⚠ Sem evento não é "parado", é desconhecido (§7.3): conectividade é dimensão separada do
  // estado produtivo, e pintar de vermelho o que ninguém sabe envenena o Pareto.
  it("posto sem evento não vira parado", async () => {
    const r = await estadoDoRecurso(prismaFalso([], null), "r1");
    expect(r).toMatchObject({ estado: null, desde: null, sessao: null });
  });
});
