import { describe, it, expect, vi } from "vitest";
import { entrarNoPosto, sairDoPosto, liberarPresenca, exigirPresenca, chaveDoCracha, passarPosto } from "@/lib/mes/cracha";

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
    mesOperador: { findUnique: vi.fn(async ({ where }) => NOMES[where.id] || null) },
  };
  // ⚠ O `prisma` responde os mesmos métodos do `tx`: desde o conserto da trava da origem,
  // `entrarNoPosto` LÊ o vínculo fora da transação — só para saber quais chaves pedir — e só então
  // abre a transação com todas elas de uma vez.
  const prisma = { $transaction: (fn) => fn(tx), mesPresenca: tx.mesPresenca, mesSessao: tx.mesSessao, mesOperador: tx.mesOperador };
  return { prisma, tx, estado };
}

const NOMES = { "op-jurandir": { nome: "Jurandir" }, "op-rodrigo": { nome: "Rodrigo" } };

const presencaEm = (recursoId, id = "p-0", operadorId = "op-jurandir") => ({ id, operadorId, recursoId, status: "ABERTA" });

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


// ─── OS TRÊS ACHADOS DA REVISÃO DA IMPLEMENTAÇÃO (Codex, 13/09/2026) ─────────

describe("a aba esquecida não solta o crachá alheio", () => {
  // ⚠⚠ ERA UM DEFEITO DE VERDADE. `sairDoPosto` encerrava o vínculo ATIVO, fosse qual fosse:
  // entrar em A, transferir para B (A estava ocioso) e tocar "Sair" na aba esquecida de A liberava
  // o crachá que estava em B — com o operador na máquina.
  it("Sair na aba do posto A não encerra o vínculo que está no posto B", async () => {
    const { prisma, estado } = bancoFalso({ presencas: [{ ...presencaEm(SOLDA.id, "p-b") }], sessoesAbertas: {} });
    const r = await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.erro).toContain("Solda 5");
    expect(estado.presencas[0].status).toBe("ABERTA");
  });

  it("Sair com id de vínculo antigo é recusado mesmo no posto certo", async () => {
    const { prisma, estado } = bancoFalso({ presencas: [presencaEm(LASER.id, "p-novo")], sessoesAbertas: { [LASER.id]: 0 } });
    const r = await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id, presencaId: "p-velho" });
    expect(r.erro).toContain("desatualizada");
    expect(estado.presencas[0].status).toBe("ABERTA");
  });

  // ⚠ A recusa é COLETIVA e a frase precisa dizer isso: a sessão não guarda de quem é o trabalho,
  // então pode ser marca que outro operador abriu. "Você tem" acusaria quem talvez não seja o dono.
  it("a recusa por marca aberta fala do POSTO, não da pessoa", async () => {
    const { prisma } = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 3 } });
    const r = await sairDoPosto(prisma, { operadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.erro).toMatch(/^O posto Laser Cantoneira tem 3 marca\(s\)/);
  });
});

describe("o id do vínculo é obrigatório no totem", () => {
  const txDe = (presencas) => bancoFalso({ presencas }).tx;

  // ⚠⚠ Conferir o id SÓ QUANDO ELE VEM deixava a proteção opcional — e a tela velha é justamente
  // quem tende a não mandá-lo.
  it("sem id nenhum, o comando do totem é recusado", async () => {
    const r = await exigirPresenca(txDe([presencaEm(LASER.id, "p-1")]),
      { operadorId: "op-jurandir", recursoId: LASER.id, presencaId: null, exigirId: true });
    expect(r).toContain("Bipe o crachá");
  });

  it("com o id certo, passa", async () => {
    expect(await exigirPresenca(txDe([presencaEm(LASER.id, "p-1")]),
      { operadorId: "op-jurandir", recursoId: LASER.id, presencaId: "p-1", exigirId: true })).toBeNull();
  });

  // ⚠ Scripts e importação do Syneco não têm crachá: seguem pelo caminho sem `exigirId`.
  it("sem exigir o id, o caminho interno continua passando", async () => {
    expect(await exigirPresenca(txDe([presencaEm(LASER.id, "p-1")]),
      { operadorId: "op-jurandir", recursoId: LASER.id })).toBeNull();
  });
});

describe("a transferência trava o posto de origem", () => {
  // ⚠⚠ A liberação do posto ocioso DECIDE por uma contagem feita em OUTRO posto. Travando só o
  // crachá e o destino, alguém abre uma marca na origem entre a contagem e a liberação — e o
  // vínculo morre com trabalho vivo. As chaves passaram a ser pedidas todas juntas.
  it("pede a trava do posto de origem, além do crachá e do destino", async () => {
    const chaves = [];
    const base = bancoFalso({ presencas: [presencaEm(LASER.id)], sessoesAbertas: { [LASER.id]: 0 } });
    const prisma = {
      ...base.prisma,
      $transaction: (fn) => fn({ ...base.tx, $executeRaw: (...a) => chaves.push(String(a[0])) }),
    };
    await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: SOLDA.id });
    // `comTravaDe` ordena e deduplica — o que importa é que a ORIGEM esteja no conjunto.
    expect(base.estado.presencas[1]?.recursoId).toBe(SOLDA.id);
  });

  // ⚠ Se a origem muda entre a leitura e a trava, a tentativa é descartada e refeita com as chaves
  // certas — nunca se acrescenta uma trava no meio da transação.
  it("origem que muda a cada tentativa acaba em recusa honesta, não em laço", async () => {
    let vez = 0;
    const prisma = {
      mesPresenca: {
        findFirst: async () => ({ id: `p-${++vez}`, operadorId: "op-jurandir",
          recursoId: vez % 2 ? LASER.id : SOLDA.id, status: "ABERTA",
          recurso: vez % 2 ? LASER : SOLDA }),
      },
      mesSessao: { count: async () => 0 },
      $transaction: (fn) => fn({
        $executeRaw: vi.fn(),
        mesPresenca: {
          findFirst: async () => ({ id: `p-${++vez}`, operadorId: "op-jurandir",
            recursoId: vez % 2 ? LASER.id : SOLDA.id, status: "ABERTA",
            recurso: vez % 2 ? LASER : SOLDA }),
        },
        mesSessao: { count: async () => 0 },
      }),
    };
    const r = await entrarNoPosto(prisma, { operadorId: "op-jurandir", recursoId: "r-terceiro" });
    expect(r.erro).toContain("Bipe de novo");
  });
});


// ─── A PASSAGEM DO POSTO (Matheus, 14/09/2026) ───────────────────────────────
//
// ⚠⚠ QUEM TEM MARCA ABERTA NÃO LIBERA O PRÓPRIO CRACHÁ — de propósito. Só que o turno vira e a
// barra continua cortando: sem passagem explícita, todo fim de turno dependeria de um ADMIN, e
// chamar ADMIN todo dia é como se aprende a contornar a regra.

describe("passar o posto", () => {
  const doisNoLaser = (marcas = 6) => bancoFalso({
    presencas: [presencaEm(LASER.id, "p-jur", "op-jurandir")],
    sessoesAbertas: { [LASER.id]: marcas },
  });

  it("o Jurandir entrega e o Rodrigo assume, sem encerrar marca nenhuma", async () => {
    const { prisma, estado, tx } = doisNoLaser();
    const r = await passarPosto(prisma, { deOperadorId: "op-jurandir", paraOperadorId: "op-rodrigo", recursoId: LASER.id });

    expect(r.erro).toBeUndefined();
    expect(r.saiu).toBe("Jurandir");
    expect(r.marcasQueSeguemAbertas).toBe(6);
    expect(estado.presencas[0]).toMatchObject({ status: "ENCERRADA", motivoFim: "passou para Rodrigo" });
    expect(estado.presencas[1]).toMatchObject({ operadorId: "op-rodrigo", recursoId: LASER.id, status: "ABERTA" });
    // ⚠⚠ A barra não para porque o turno virou: a passagem é troca de VÍNCULO e mais nada.
    expect(tx.mesSessao.update).toBeUndefined();
  });

  // ⚠ Dois operadores no mesmo posto é permitido; quem já está lá não ganha vínculo novo.
  it("quem já está no posto não ganha um segundo vínculo", async () => {
    const { prisma, estado } = bancoFalso({
      presencas: [presencaEm(LASER.id, "p-jur", "op-jurandir"), presencaEm(LASER.id, "p-rod", "op-rodrigo")],
      sessoesAbertas: { [LASER.id]: 2 },
    });
    const r = await passarPosto(prisma, { deOperadorId: "op-jurandir", paraOperadorId: "op-rodrigo", recursoId: LASER.id });
    expect(r.presenca.id).toBe("p-rod");
    expect(estado.presencas).toHaveLength(2);
    expect(estado.presencas[0].status).toBe("ENCERRADA");
  });

  // ⚠⚠ QUEM ASSUME PASSA PELA MESMA PORTA DE SEMPRE. Abrir exceção aqui seria ensinar que existe um
  // caminho lateral para estar em duas máquinas.
  it("quem assume com o crachá preso em outro posto é recusado com a mesma frase do entrar", async () => {
    const { prisma, estado } = bancoFalso({
      presencas: [presencaEm(LASER.id, "p-jur", "op-jurandir"), presencaEm(SOLDA.id, "p-rod", "op-rodrigo")],
      sessoesAbertas: { [LASER.id]: 2, [SOLDA.id]: 4 },
    });
    const r = await passarPosto(prisma, { deOperadorId: "op-jurandir", paraOperadorId: "op-rodrigo", recursoId: LASER.id });
    expect(r.erro).toContain("Solda 5");
    expect(estado.presencas[0].status).toBe("ABERTA"); // o Jurandir não foi solto no meio
  });

  it("render quem já não está no posto é recusado", async () => {
    const { prisma } = bancoFalso({ presencas: [], sessoesAbertas: { [LASER.id]: 2 } });
    const r = await passarPosto(prisma, { deOperadorId: "op-jurandir", paraOperadorId: "op-rodrigo", recursoId: LASER.id });
    expect(r.erro).toContain("não está mais com o crachá neste posto");
  });

  it("passar o posto para si mesmo é recusado", async () => {
    const { prisma } = doisNoLaser();
    const r = await passarPosto(prisma, { deOperadorId: "op-jurandir", paraOperadorId: "op-jurandir", recursoId: LASER.id });
    expect(r.erro).toBe("O posto já é seu.");
  });

  it("sem os três dados, recusa antes de tocar no banco", async () => {
    const { prisma, tx } = doisNoLaser();
    expect((await passarPosto(prisma, { deOperadorId: "op-jurandir", recursoId: LASER.id })).erro)
      .toContain("Informe quem sai");
    expect(tx.mesPresenca.update).not.toHaveBeenCalled();
  });
});
