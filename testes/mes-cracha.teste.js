import { describe, it, expect, vi } from "vitest";
import { entrarNoPosto, sairDoPosto, liberarPresenca, exigirPresenca, chaveDoCracha } from "@/lib/mes/cracha";

// ─── UM CRACHÁ, UM POSTO ─────────────────────────────────────────────────────
//
// Matheus (13/09/2026): "quando um crachá de usuário estiver ativado em uma máquina, não pode ser
// aberto em outro até ele fechar operação dele na máquina aberta".
//
// ⚠⚠ O VÍNCULO NÃO SE INFERE DE `MesSessao.operadorId` (achado do Codex). Aquele campo é autoria da
// abertura, e como "quem chega depois entra na sessão que já existe", ele guarda o nome de quem
// abriu — não de quem está lá. O teste do fim deste arquivo é o que prova a diferença.

const LASER = { id: "r-laser", codigo: "LASER_CANTONEIRA", nome: "Laser Cantoneira" };
const SOLDA = { id: "r-solda", codigo: "SOLDA 5", nome: "Solda 5" };

/** Um Prisma de mentira com o bastante para a regra: presenças, sessões e transação. */
function bancoFalso({ presencas = [], sessoesAbertas = {} } = {}) {
  const estado = { presencas: presencas.map((p) => ({ ...p })), criadas: 0 };
  const recursoDe = (id) => [LASER, SOLDA].find((r) => r.id === id);
  const tx = {
    $executeRaw: vi.fn(),
    mesPresenca: {
      findFirst: vi.fn(async ({ where }) => {
        const achada = estado.presencas.find((p) => p.operadorId === where.operadorId && p.status === where.status);
        return achada ? { ...achada, recurso: recursoDe(achada.recursoId) } : null;
      }),
      create: vi.fn(async ({ data }) => {
        const nova = { id: `p-${++estado.criadas}`, ...data };
        estado.presencas.push(nova);
        return { ...nova, recurso: recursoDe(nova.recursoId) };
      }),
      update: vi.fn(async ({ where, data }) => {
        const alvo = estado.presencas.find((p) => p.id === where.id);
        Object.assign(alvo, data);
        return alvo;
      }),
    },
    mesSessao: { count: vi.fn(async ({ where }) => sessoesAbertas[where.recursoId] || 0) },
  };
  return { prisma: { $transaction: (fn) => fn(tx) }, tx, estado };
}

const presencaEm = (recursoId, id = "p-0") => ({ id, operadorId: "op-jurandir", recursoId, status: "ABERTA" });

describe("entrar no posto", () => {
  it("sem vínculo nenhum, o crachá entra", async () => {
    const { prisma, estado } = bancoFalso();
    const r = await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.erro).toBeUndefined();
    expect(r.jaEstava).toBe(false);
    expect(estado.presencas).toHaveLength(1);
  });

  // ⚠ Bipar de novo no mesmo posto é o gesto natural (o operador volta do almoço), não um erro.
  it("bipar de novo no mesmo posto devolve o mesmo vínculo, sem criar outro", async () => {
    const { prisma, tx } = bancoFalso({ presencas: [presencaEm(LASER.id)] });
    const r = await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.jaEstava).toBe(true);
    expect(tx.mesPresenca.create).not.toHaveBeenCalled();
  });

  // ⚠⚠ O PEDIDO, EM UMA LINHA.
  it("com marca aberta em outro posto, recusa — e diz onde e quantas", async () => {
    const { prisma } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 6 } });
    const r = await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: SOLDA.id });
    expect(r.erro).toContain("Laser Cantoneira");
    expect(r.erro).toContain("6 marca(s)");
    expect(r.ocupadoEm).toEqual({ codigo: LASER.codigo, nome: LASER.nome, marcas: 6 });
  });

  // ⚠⚠ SEM ISTO A TRAVA VIRA ARMADILHA. Quem bipou num totem por engano ficaria preso àquele posto
  // no dia seguinte, e o conserto exigiria voltar fisicamente até lá.
  it("posto antigo sem marca nenhuma libera sozinho e o crachá entra no novo", async () => {
    const { prisma, estado } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 0 } });
    const r = await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: SOLDA.id });
    expect(r.erro).toBeUndefined();
    expect(r.liberou).toBe("Laser Cantoneira");
    expect(estado.presencas[0]).toMatchObject({ status: "ENCERRADA", motivoFim: "posto ocioso" });
    expect(estado.presencas[1]).toMatchObject({ recursoId: SOLDA.id, status: "ABERTA" });
  });
});

describe("sair do posto", () => {
  // ⚠⚠ É ISTO QUE DÁ DENTE À REGRA. Se "Sair" liberasse sempre, bastariam dois toques para abrir a
  // mesma pessoa noutra máquina com a barra ainda cortando aqui.
  it("com marca aberta, não solta o crachá", async () => {
    const { prisma, estado } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 2 } });
    const r = await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.erro).toContain("2 marca(s)");
    expect(estado.presencas[0].status).toBe("ABERTA");
  });

  it("sem marca aberta, sai e libera", async () => {
    const { prisma, estado } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 0 } });
    const r = await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.liberou).toBe("Laser Cantoneira");
    expect(estado.presencas[0]).toMatchObject({ status: "ENCERRADA", motivoFim: "saiu" });
  });

  it("sair sem vínculo nenhum não é erro", async () => {
    const { prisma } = bancoFalso();
    expect(await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id })).toEqual({ jaEstava: true });
  });
});

describe("liberação pelo ADMIN — a saída de emergência", () => {
  // ⚠⚠ LIBERA O VÍNCULO E NADA MAIS. Fabricar um encerramento que ninguém viveu no chão de fábrica
  // envenena o OEE com tempo que não existiu.
  it("solta o crachá, registra quem soltou e NÃO encerra as marcas", async () => {
    const { prisma, estado, tx } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 6 } });
    const r = await liberarPresenca(prisma, { operadorId: "op-jurandir", porQuem: "Matheus" });
    expect(r.liberou).toBe("Laser Cantoneira");
    expect(r.marcasQueSeguemAbertas).toBe(6);
    expect(estado.presencas[0].motivoFim).toBe("liberada por Matheus");
    expect(tx.mesSessao.count).toHaveBeenCalled();
  });
});

describe("o porteiro de toda mutação", () => {
  const tx = (presencas, sessoes) => bancoFalso({ presencas, sessoesAbertas: sessoes }).tx;

  it("sem crachá aberto, recusa", async () => {
    expect(await exigirPresenca(tx([]), { operadorId: "op-jurandir", recursoId: LASER.id }))
      .toContain("Bipe o crachá");
  });

  // ⚠⚠ VALIDAR SÓ A ABERTURA DEIXA O RESTO DESCOBERTO (achado do Codex): o totem reenvia o crachá em
  // todo comando, então quem foi recusado ao entrar ainda poderia apontar numa sessão que já existe.
  it("crachá aberto em OUTRO posto não aponta aqui", async () => {
    expect(await exigirPresenca(tx([presencaEm(LASER.id)]), { operadorId: "op-jurandir", recursoId: SOLDA.id }))
      .toContain("Laser Cantoneira");
  });

  // ⚠ A aba que ficou aberta desde antes de uma liberação carrega o id de um vínculo morto.
  it("tela velha, com id de vínculo antigo, é recusada mesmo no posto certo", async () => {
    const r = await exigirPresenca(tx([presencaEm(LASER.id, "p-novo")]),
      { operadorId: "op-jurandir", recursoId: LASER.id, presencaId: "p-velho" });
    expect(r).toContain("desatualizada");
  });

  it("crachá aberto neste posto passa", async () => {
    expect(await exigirPresenca(tx([presencaEm(LASER.id, "p-1")]),
      { operadorId: "op-jurandir", recursoId: LASER.id, presencaId: "p-1" })).toBeNull();
  });
});

describe("a trava", () => {
  it("a chave do crachá é do OPERADOR, não do posto — é ela que atravessa as máquinas", () => {
    expect(chaveDoCracha("op-jurandir")).toBe("cracha:op-jurandir");
  });
});
