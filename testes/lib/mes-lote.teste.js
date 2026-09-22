import { describe, it, expect, vi } from "vitest";
import { abrirLote, encerrarLote } from "@/lib/mes/lote";

// ABRIR VÁRIAS MARCAS DE UMA VEZ NA MESMA MÁQUINA.
//
// Matheus (13/09/2026): "o nesting vai servir para ABRIR TODAS AS MARCAS e iniciar a produção delas
// sem que o operador precise abrir uma por uma (…) tem que ser possível multi marcas ao mesmo tempo
// numa máquina".

function bancoFalso({ eventoAtual = null, abertas = [], loteExistente = null } = {}) {
  const criadas = [];
  const eventos = [];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    mesSessao: {
      findFirst: vi.fn(async ({ where }) =>
        (where.lotes?.has && loteExistente) ? { id: "s-velha" } : null),
      findMany: vi.fn(async () => abertas),
      create: vi.fn(async ({ data }) => { const s = { id: `s${criadas.length + 1}`, ...data }; criadas.push(s); return s; }),
      findUnique: vi.fn(async ({ where }) => abertas.find((s) => s.id === where.id) || null),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      count: vi.fn(async () => 0),
    },
    mesEvento: {
      findFirst: vi.fn(async () => (eventoAtual ? { tipo: eventoAtual } : null)),
      create: vi.fn(async ({ data }) => { eventos.push(data); return data; }),
      upsert: vi.fn(async ({ create }) => { eventos.push(create); return create; }),
    },
    mesApontamentoQtd: { aggregate: vi.fn(async () => ({ _sum: { boas: 0 } })) },
    // ⚠ O evento "fim do trabalho no posto" é do RECURSO, e pega o ambiente dele — não de uma
    // sessão, que a essa altura já não existe nenhuma (21/09/2026).
    mesRecurso: { findUnique: vi.fn(async () => ({ ambiente: "PROD" })) },
  };
  const prisma = { $transaction: (fn) => fn(tx), ...tx };
  return { prisma, tx, criadas, eventos };
}

const TRABALHOS = [
  { marca: "T107A-P3", opNumero: "T107A", planejadoQtd: 10 },
  { marca: "T107A-P12", opNumero: "T107A", planejadoQtd: 2 },
  { marca: "T107A-P28", opNumero: "T107A", planejadoQtd: 5 },
];

describe("abrirLote", () => {
  it("abre todas as marcas da barra de uma vez", async () => {
    const { prisma, criadas } = bancoFalso();
    const r = await abrirLote(prisma, { recursoId: "r1", operadorId: "op1", trabalhos: TRABALHOS, ambiente: "PROD" });
    expect(r.sessoes).toHaveLength(3);
    expect(criadas.map((s) => s.marca)).toEqual(["T107A-P3", "T107A-P12", "T107A-P28"]);
  });

  // ⚠⚠ A CHAVE DO TRABALHO CARREGA A OBRA (achado do Codex): `(recurso, marca)` misturaria a
  // T97A16 da obra 097 com a da 102, e uma impediria a outra de abrir.
  it("cada sessão nasce com a chave do trabalho, com a obra dentro", async () => {
    const { prisma, criadas } = bancoFalso();
    await abrirLote(prisma, { recursoId: "r1", trabalhos: [{ marca: "T97A16", opNumero: "097" }], ambiente: "PROD" });
    expect(criadas[0].chaveTrabalho).toBe("97|T97A16");
  });

  // ⚠⚠ UM EVENTO POR COMANDO, E DO RECURSO. N eventos de PRODUCAO no mesmo instante inflariam o
  // tempo do recurso N vezes; e evento preso a uma sessão faria o monitor ignorar as outras.
  it("grava UM evento, do recurso, não um por marca", async () => {
    const { prisma, eventos } = bancoFalso();
    await abrirLote(prisma, { recursoId: "r1", trabalhos: TRABALHOS, ambiente: "PROD" });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ recursoId: "r1", sessaoId: null, tipo: "PRODUCAO" });
  });

  // ⚠⚠ O ACHADO MAIS IMPORTANTE DA REVISÃO: abrir trabalho NÃO desfaz uma parada. Antes, toda
  // abertura gravava PRODUCAO — e o operador que abrisse uma marca com a máquina parada apagaria a
  // parada em curso, levando junto o Pareto e a Disponibilidade.
  it("não apaga uma PARADA em curso", async () => {
    const { prisma, eventos } = bancoFalso({ eventoAtual: "PARADA" });
    const r = await abrirLote(prisma, { recursoId: "r1", trabalhos: TRABALHOS, ambiente: "PROD" });
    expect(eventos).toHaveLength(0);
    expect(r.estadoPreservado).toBe("PARADA");
  });

  it("também não desfaz MANUTENCAO nem SETUP", async () => {
    for (const estado of ["MANUTENCAO", "SETUP", "FORA_TURNO"]) {
      const { prisma, eventos } = bancoFalso({ eventoAtual: estado });
      await abrirLote(prisma, { recursoId: "r1", trabalhos: TRABALHOS, ambiente: "PROD" });
      expect(eventos).toHaveLength(0);
    }
  });

  // ⚠ Reenvio depois de uma resposta perdida não pode abrir o lote duas vezes.
  it("o mesmo lote reenviado devolve o que já existe", async () => {
    const { prisma, criadas } = bancoFalso({ loteExistente: true });
    const r = await abrirLote(prisma, { recursoId: "r1", trabalhos: TRABALHOS, loteId: "lote-1", ambiente: "PROD" });
    expect(r.jaExistia).toBe(true);
    expect(criadas).toHaveLength(0);
  });

  it("recusa lote sem recurso e lote vazio", async () => {
    const { prisma } = bancoFalso();
    expect((await abrirLote(prisma, { trabalhos: TRABALHOS, ambiente: "PROD" })).erro).toMatch(/recurso/i);
    expect((await abrirLote(prisma, { recursoId: "r1", trabalhos: [], ambiente: "PROD" })).erro).toMatch(/Nenhuma marca/);
  });

  // ⚠⚠ TUDO NUMA TRANSAÇÃO SÓ (pedido do Codex): N chamadas a `abrirSessao` dariam N transações, e
  // metade do lote podia entrar e a outra metade falhar — a barra fica pela metade no chão.
  it("abre o lote inteiro numa transação só", async () => {
    const { prisma } = bancoFalso();
    const espia = vi.spyOn(prisma, "$transaction");
    await abrirLote(prisma, { recursoId: "r1", trabalhos: TRABALHOS, ambiente: "PROD" });
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

describe("encerrarLote", () => {
  const abertas = [{ id: "s1", status: "ABERTA", lotes: ["lote-1"] }, { id: "s2", status: "ABERTA", lotes: ["lote-1"] }];

  it("encerra o que ESTE lote abriu", async () => {
    const { prisma, tx } = bancoFalso({ abertas });
    const r = await encerrarLote(prisma, { recursoId: "r1", loteId: "lote-1" });
    expect(r.encerradas).toBe(2);
    expect(tx.mesSessao.findMany.mock.calls[0][0].where).toMatchObject({ lotes: { has: "lote-1" }, recursoId: "r1" });
  });

  // ⚠⚠ NUNCA "TODAS AS ABERTAS DO RECURSO" (pedido do Codex): o posto pode ter trabalho de outro
  // lote, ou aberto à mão — encerrar tudo junto fecharia o que ninguém mandou fechar.
  it("o filtro é o lote, não o recurso", async () => {
    const { prisma, tx } = bancoFalso({ abertas });
    await encerrarLote(prisma, { recursoId: "r1", loteId: "lote-1" });
    expect(tx.mesSessao.findMany.mock.calls[0][0].where.lotes).toEqual({ has: "lote-1" });
  });

  // ⚠⚠ Gravando ENCERRAMENTO sempre, o fim de uma barra diria que a máquina parou enquanto as
  // outras marcas ainda produzem.
  it("só declara o posto encerrado quando não sobrou trabalho aberto", async () => {
    const { prisma, tx, eventos } = bancoFalso({ abertas });
    tx.mesSessao.count.mockResolvedValueOnce(3);
    await encerrarLote(prisma, { recursoId: "r1", loteId: "lote-1" });
    expect(eventos).toHaveLength(0);

    const segundo = bancoFalso({ abertas });
    await encerrarLote(segundo.prisma, { recursoId: "r1", loteId: "lote-1" });
    expect(segundo.eventos[0]).toMatchObject({ tipo: "ENCERRAMENTO", sessaoId: null });
  });

  // ⚠⚠ O CASO QUE A PROVA CONTRA O BANCO REVELOU (13/09/2026): duas barras do mesmo plano abertas
  // juntas repetem marcas, e a sessão é UMA só (a trava é por obra+marca). Encerrar a primeira
  // barra fechava marca que a segunda ainda estava cortando.
  it("não fecha a marca que outro lote ainda usa — só a desliga deste", async () => {
    const compartilhada = [
      { id: "s1", status: "ABERTA", lotes: ["lote-1"] },
      { id: "s2", status: "ABERTA", lotes: ["lote-1", "lote-2"] },
    ];
    const { prisma, tx } = bancoFalso({ abertas: compartilhada });
    const r = await encerrarLote(prisma, { recursoId: "r1", loteId: "lote-1" });
    expect(r).toMatchObject({ encerradas: 1, seguemEmOutroLote: 1 });
    expect(tx.mesSessao.update).toHaveBeenCalledWith({ where: { id: "s2" }, data: { lotes: ["lote-2"] } });
  });

  it("recusa sem recurso ou sem lote", async () => {
    const { prisma } = bancoFalso();
    expect((await encerrarLote(prisma, { recursoId: "r1" })).erro).toBeTruthy();
  });
});
