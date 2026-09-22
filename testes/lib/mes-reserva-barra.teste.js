import { describe, it, expect, vi } from "vitest";
import { abrirLote, encerrarLote } from "@/lib/mes/lote";
import { transferirBarra, liberarBarra } from "@/lib/mes/transferencia";
import { reservarUnidade, reconciliarUnidades } from "@/lib/mes/unidade-reserva";

// ─── A MESMA BARRA NÃO PODE SER CORTADA EM DOIS POSTOS ───────────────────────
//
// ⚠⚠ O FURO QUE O CODEX APONTOU EM TRÊS PARECERES (22/09/2026). `comporTeto` conta cada unidade
// UMA vez, então a barra duplicada não dobra o teto — mas dois postos cortando a mesma barra
// lançam peças que existem uma vez só, e o excedente come o saldo legítimo de OUTRAS barras da
// mesma marca. O teto fecha a conta; a peça física, não.
//
// ⚠⚠ O FAKE IMITA O ÍNDICE PARCIAL ÚNICO, que é quem garante a exclusividade de verdade
// (`(unidadeId, ambiente) WHERE liberadaEm IS NULL`). Um fake que só guarda linhas provaria que o
// `if` da rota funciona — e o `if` não é a garantia: duas aberturas concorrentes em postos
// diferentes leem "livre" no mesmo instante, porque a trava do MES serializa por RECURSO.

function bancoFalso({ abertas = [], recursos = {} } = {}) {
  const reservas = [];
  const sessoes = [...abertas];
  const eventos = [];
  const auditoria = [];
  const aberta = (unidadeId, ambiente) =>
    reservas.find((r) => r.unidadeId === unidadeId && r.ambiente === ambiente && !r.liberadaEm) || null;

  const tx = {
    // ⚠⚠ O FAKE IMITA `INSERT ... ON CONFLICT DO NOTHING`, que é como a reserva entra: linha nova
    // quando a barra está livre, ZERO linhas quando já tem dona — e NUNCA uma exceção. Um fake que
    // lançasse `P2002` esconderia justamente o defeito que o Codex pegou: no Postgres a exceção
    // ABORTA a transação, e a consulta seguinte (a que descobre quem é a dona) morre junto.
    $executeRaw: vi.fn(async (partes, ...vals) => {
      if (!String(partes?.[0] || "").includes("MesUnidadeReserva")) return 1;
      const [id, unidadeId, ambiente, recursoId, loteId, operadorId] = vals;
      if (aberta(unidadeId, ambiente)) return 0;
      reservas.push({ id, unidadeId, ambiente, recursoId, loteId, operadorId, liberadaEm: null });
      return 1;
    }),
    mesUnidadeReserva: {
      findFirst: vi.fn(async ({ where }) => aberta(where.unidadeId, where.ambiente)),
      update: vi.fn(async ({ where, data }) => {
        const r = reservas.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      }),
    },
    mesSessao: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async ({ where }) => sessoes.filter((s) =>
        (!where.status || s.status === where.status)
        && (!where.lotes?.has || (s.lotes || []).includes(where.lotes.has))
        && (!where.nestingUnidades?.has || (s.nestingUnidades || []).includes(where.nestingUnidades.has))
        && (!where.recursoId || s.recursoId === where.recursoId))),
      create: vi.fn(async ({ data }) => {
        const s = { id: `s${sessoes.length + 1}`, status: "ABERTA", ...data };
        sessoes.push(s);
        return s;
      }),
      findUnique: vi.fn(async ({ where }) => sessoes.find((s) => s.id === where.id) || null),
      update: vi.fn(async ({ where, data }) => {
        const s = sessoes.find((x) => x.id === where.id);
        Object.assign(s, data);
        return s;
      }),
      count: vi.fn(async ({ where }) => sessoes.filter((s) =>
        s.status === "ABERTA"
        && (!where.recursoId || s.recursoId === where.recursoId)
        && (!where.nestingUnidades?.has || (s.nestingUnidades || []).includes(where.nestingUnidades.has))
        && (!where.id?.not || s.id !== where.id.not)).length),
    },
    mesEvento: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => { eventos.push(data); return data; }),
      upsert: vi.fn(async ({ create }) => { eventos.push(create); return create; }),
    },
    mesAuditoria: { create: vi.fn(async ({ data }) => { auditoria.push(data); return data; }) },
    mesApontamentoQtd: { aggregate: vi.fn(async () => ({ _sum: { boas: 0 } })) },
    mesRecurso: {
      findUnique: vi.fn(async ({ where }) => recursos[where.id] || { ambiente: "PROD", codigo: "LASER 2", nome: "Laser 2" }),
    },
  };
  const prisma = { $transaction: (fn) => fn(tx), ...tx };
  return { prisma, tx, reservas, sessoes, eventos, auditoria };
}

const MARCAS = [
  { marca: "T107A-P3", opNumero: "T107A", planejadoQtd: 2 },
  { marca: "T107A-P12", opNumero: "T107A", planejadoQtd: 3 },
];
const abrir = (prisma, recursoId, loteId) => abrirLote(prisma, {
  recursoId, operadorId: "op1", trabalhos: MARCAS, ambiente: "PROD",
  nestingUnidadeId: "u1", loteId,
});

describe("a barra tem um dono só", () => {
  it("o primeiro posto abre e fica com a barra", async () => {
    const { prisma, reservas } = bancoFalso();
    const r = await abrir(prisma, "r1", "lote-1");
    expect(r.erro).toBeUndefined();
    expect(reservas).toHaveLength(1);
    expect(reservas[0]).toMatchObject({ unidadeId: "u1", recursoId: "r1", loteId: "lote-1", liberadaEm: null });
  });

  // ⚠⚠ ERA O DEFEITO: os dois abriam, e as peças da barra saíam contadas duas vezes.
  it("o segundo posto é RECUSADO, e a recusa diz onde a barra está", async () => {
    const { prisma, sessoes } = bancoFalso({ recursos: { r1: { codigo: "LASER 1", nome: "Laser 1", ambiente: "PROD" } } });
    await abrir(prisma, "r1", "lote-1");
    const antes = sessoes.length;
    const r = await abrir(prisma, "r2", "lote-2");
    expect(r.erro).toMatch(/LASER 1/);
    // ⚠ E NENHUMA SESSÃO NASCE NO SEGUNDO POSTO: o lote é tudo-ou-nada, e a recusa vem antes.
    expect(sessoes.length).toBe(antes);
  });

  // ⚠⚠ A CORRIDA DE VERDADE: a leitura devolve "livre" para os dois, e a gravação do segundo é
  // engolida pelo `ON CONFLICT`. Quem ficou com a barra é uma PERGUNTA ao banco depois do insert —
  // e a resposta tem de ser recusa de negócio, nunca exceção.
  //
  // ⚠⚠ ERA UM `create` COM `catch` ATÉ O CODEX PEGAR (22/09/2026): no Postgres o erro ABORTA a
  // transação, e a consulta que descobriria a dona morria junto, virando 500 na cara do operador.
  it("dois postos lendo 'livre' ao mesmo tempo: um abre, o outro é recusado sem exceção", async () => {
    const { tx, reservas } = bancoFalso();
    await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l1" });
    tx.mesUnidadeReserva.findFirst.mockResolvedValueOnce(null); // o segundo também leu "livre"
    const posse = await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r2", loteId: "l2" });
    expect(posse.ocupada).toMatchObject({ recursoId: "r1" });
    expect(reservas).toHaveLength(1);
  });

  // ⚠ E nenhuma consulta é feita DEPOIS de um erro de gravação, porque não há erro de gravação:
  // o insert que não entra devolve zero linhas.
  it("a gravação que não entra não lança nada", async () => {
    const { tx } = bancoFalso();
    await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l1" });
    await expect(reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r2", loteId: "l2" }))
      .resolves.toBeTruthy();
  });

  // ⚠ DEMO e PROD são dois mundos: um plano de teste não pode travar a barra de quem produz.
  it("a mesma barra em ambientes diferentes não conflita", async () => {
    const { tx, reservas } = bancoFalso();
    await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l1" });
    const outra = await reservarUnidade(tx, { unidadeId: "u1", ambiente: "DEMO", recursoId: "r9", loteId: "l9" });
    expect(outra.reserva).toBeTruthy();
    expect(reservas).toHaveLength(2);
  });

  // ⚠ Reabrir a mesma barra no MESMO posto devolve a posse que já existe — é a barra que repete
  // marca voltando pelo mesmo comando.
  it("o mesmo posto reabrindo não cria segunda reserva", async () => {
    const { tx, reservas } = bancoFalso();
    await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l1" });
    const de_novo = await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l2" });
    expect(de_novo.reserva.loteId).toBe("l1");
    expect(reservas).toHaveLength(1);
  });
});

describe("a barra volta a ficar livre quando ninguém está com ela", () => {
  it("encerrar o lote solta a barra", async () => {
    const { prisma, reservas } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    await encerrarLote(prisma, { recursoId: "r1", loteId: "lote-1", operadorId: "op1" });
    expect(reservas[0].liberadaEm).toBeTruthy();
    const r = await abrir(prisma, "r2", "lote-2");
    expect(r.erro).toBeUndefined();
  });

  // ⚠⚠ A RECONCILIAÇÃO É CENTRALIZADA em `encerrarNaTransacao` justamente por causa disto: a tela
  // encerra marca a marca, e a barra não pode ficar presa a um posto que já terminou.
  it("sobrando marca aberta na barra, ela NÃO é solta", async () => {
    const { tx, reservas, sessoes } = bancoFalso();
    await reservarUnidade(tx, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", loteId: "l1" });
    sessoes.push({ id: "viva", status: "ABERTA", ambiente: "PROD", recursoId: "r1", nestingUnidades: ["u1"], lotes: ["l1"] });
    await reconciliarUnidades(tx, { unidades: ["u1"], ambiente: "PROD" });
    expect(reservas[0].liberadaEm).toBeFalsy();
  });
});

describe("trazer a barra para outro posto", () => {
  it("encerra na origem, abre no destino e a posse muda de mãos", async () => {
    const { prisma, reservas, sessoes, auditoria } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    const r = await transferirBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", paraRecursoId: "r2", trabalhos: MARCAS,
      operadorId: "op2", motivo: "laser parou", usuario: { id: "u" },
    });
    expect(r.erro).toBeUndefined();
    expect(r.deRecursoId).toBe("r1");
    expect(sessoes.filter((s) => s.recursoId === "r1" && s.status === "ABERTA")).toHaveLength(0);
    expect(sessoes.filter((s) => s.recursoId === "r2" && s.status === "ABERTA")).toHaveLength(2);
    expect(reservas.find((x) => !x.liberadaEm)).toMatchObject({ recursoId: "r2" });
    expect(auditoria[0]).toMatchObject({ action: "MES_TRANSFERIR_BARRA" });
  });

  // ⚠⚠ O QUE FOI PRODUZIDO NO POSTO ANTIGO FICA NO POSTO ANTIGO. Nenhuma sessão muda de
  // `recursoId` — arrastar a produção falsificaria o OEE dos dois postos.
  it("as sessões da origem não mudam de posto — só encerram", async () => {
    const { prisma, sessoes } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    await transferirBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", paraRecursoId: "r2", trabalhos: MARCAS, operadorId: "op2",
    });
    const velhas = sessoes.filter((s) => s.lotes?.includes("lote-1"));
    expect(velhas.every((s) => s.recursoId === "r1" && s.status === "ENCERRADA")).toBe(true);
  });

  // ⚠⚠ SESSÃO COMPARTILHADA COM OUTRO COMANDO NÃO SE TRANSFERE (risco levantado pelo Codex): o
  // apontamento carrega `sessaoId`, não a barra — mover a barra A deixaria a sessão aceitando
  // produção por causa da barra B, sem como dizer de qual veio a peça.
  it("recusa quando a barra divide marca com outro comando aberto", async () => {
    const { prisma, sessoes } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    for (const s of sessoes) s.lotes = [...s.lotes, "lote-outro"];
    const r = await transferirBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", paraRecursoId: "r2", trabalhos: MARCAS, operadorId: "op2",
    });
    expect(r.erro).toMatch(/divide marcas/i);
  });

  it("barra que não está aberta em posto nenhum manda abrir, não transferir", async () => {
    const { prisma } = bancoFalso();
    const r = await transferirBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", paraRecursoId: "r2", trabalhos: MARCAS,
    });
    expect(r.erro).toMatch(/só abrir aqui/i);
  });
});

describe("a saída de emergência do ADMIN", () => {
  it("libera a barra E encerra o trabalho que ficou aberto lá", async () => {
    const { prisma, reservas, sessoes, auditoria } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    const r = await liberarBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", recursoId: "r2", motivo: "tablet morreu",
      usuario: { id: "u", name: "Matheus" },
    });
    expect(r).toMatchObject({ liberada: true, encerradas: 2 });
    expect(reservas[0]).toMatchObject({ liberadaPor: "Matheus", motivo: "tablet morreu" });
    expect(sessoes.every((s) => s.status === "ENCERRADA")).toBe(true);
    expect(auditoria[0]).toMatchObject({ action: "MES_LIBERAR_BARRA" });
  });

  // ⚠⚠ A DONA É RELIDA DEPOIS DA TRAVA (achado do Codex, 22/09/2026). As chaves travadas saem da
  // leitura feita ANTES: se a barra for transferida enquanto a liberação espera na fila, este
  // código encerraria as sessões do NOVO posto sem nunca ter travado a máquina dele.
  it("se a barra trocou de posto enquanto esperava, a liberação é recusada", async () => {
    const { prisma, reservas, sessoes } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    // a barra muda de mãos entre a leitura da origem e a trava
    prisma.mesUnidadeReserva.findFirst.mockImplementationOnce(async () => reservas[0]);
    prisma.mesUnidadeReserva.findFirst.mockImplementationOnce(async () => ({ ...reservas[0], id: "outra", recursoId: "r9" }));
    const r = await liberarBarra(prisma, {
      unidadeId: "u1", ambiente: "PROD", recursoId: "r2", motivo: "tablet morreu", usuario: {},
    });
    expect(r.erro).toMatch(/mudou de posto/i);
    expect(sessoes.every((s) => s.status === "ABERTA")).toBe(true);
  });

  // ⚠⚠ MOTIVO EM BRANCO NÃO PASSA. A liberação ENCERRA trabalho aberto: sem justificativa, quem
  // lesse a auditoria depois encontraria um texto genérico e `motivo: null`.
  it.each(["", "   ", undefined])("motivo vazio (%p) é recusado ANTES de encerrar nada", async (motivo) => {
    const { prisma, reservas, sessoes } = bancoFalso();
    await abrir(prisma, "r1", "lote-1");
    const r = await liberarBarra(prisma, { unidadeId: "u1", ambiente: "PROD", recursoId: "r2", motivo, usuario: {} });
    expect(r.erro).toMatch(/por que/i);
    expect(sessoes.every((s) => s.status === "ABERTA")).toBe(true);
    expect(reservas[0].liberadaEm).toBeFalsy();
  });

  // ⚠ Soltar a posse deixando as sessões abertas faria a barra ser cortada em dois lugares com a
  // bênção do sistema — o oposto do que a reserva existe para garantir.
  it("barra sem dono não é 'liberada' em silêncio", async () => {
    const { prisma } = bancoFalso();
    const r = await liberarBarra(prisma, { unidadeId: "u1", ambiente: "PROD", recursoId: "r1", motivo: "sumiu", usuario: {} });
    expect(r.erro).toMatch(/não está reservada/i);
  });
});
