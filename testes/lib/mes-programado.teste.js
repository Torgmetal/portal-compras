import { describe, it, expect, vi } from "vitest";
import { programadoPara } from "@/lib/mes/programado";

// A LISTA DO TOTEM — o que o PCP programou, e o que JÁ SAIU.
//
// ⚠⚠ Matheus (11/09/2026): "na listagem marcar que aquela marca foi produzida". Sem isso, o operador
// termina uma marca, volta para a lista e vê tudo igual ao que era antes de começar — e a dúvida
// seguinte é se o lançamento se perdeu.

const RECURSO = { codigo: "LASER_CHAPA", setor: { codigo: "PREPARACAO" } };
// ⚠ No Acabamento o Gantt planeja em BALDE (uma bancada só, código "ACABAMENTO") e o chão tem 10
// postos físicos — decisão do Matheus em 10/09/2026, porque 7 postos apontaram no mesmo dia.
const POSTO_DE_ACABAMENTO = { codigo: "ACABAMENTO05", setor: { codigo: "ACABAMENTO" } };

const peca = (id, marca, qte, extra = {}) => ({
  id, marca, qte, descricao: "COLUNA", perfil: "", pesoTotalKg: 100,
  opNumero: "097", opId: "op-97", corteDiaProgramado: new Date("2026-09-11"), ...extra,
});

/**
 * `sessoes` é o que existe em MesSessao; `boasPorSessao` o total lançado em cada uma.
 */
function prismaFalso({ pecas = [], sessoes = [], boasPorSessao = {} } = {}) {
  return {
    pecaConjunto: { findMany: vi.fn().mockResolvedValue(pecas) },
    mesSessao: { findMany: vi.fn().mockResolvedValue(sessoes) },
    mesApontamentoQtd: {
      groupBy: vi.fn().mockResolvedValue(
        Object.entries(boasPorSessao).map(([sessaoId, boas]) => ({ sessaoId, _sum: { boas } })),
      ),
    },
  };
}

const marcasDe = async (prisma) => (await programadoPara(prisma, RECURSO)).lotes[0].marcas;

describe("programadoPara — a marca produzida aparece marcada", () => {
  it("marca como concluída quando as boas chegam ao planejado", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A16", 1)],
      sessoes: [{ id: "s1", marca: "T97A16", opId: "op-97", opNumero: "097" }],
      boasPorSessao: { s1: 1 },
    });
    const [m] = await marcasDe(prisma);
    expect(m).toMatchObject({ marca: "T97A16", qte: 1, feitas: 1, concluida: true });
  });

  // ⚠⚠ SOMA TODAS AS SESSÕES DA MARCA, não a última. Uma marca de 3 peças feita em dois turnos
  // (2 ontem, 1 hoje) está pronta — olhando só uma sessão, ela pareceria eternamente pela metade.
  it("soma o que foi feito em sessões diferentes da mesma marca", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A43", 3)],
      sessoes: [
        { id: "s-ontem", marca: "T97A43", opId: "op-97", opNumero: "097" },
        { id: "s-hoje", marca: "T97A43", opId: "op-97", opNumero: "097" },
      ],
      boasPorSessao: { "s-ontem": 2, "s-hoje": 1 },
    });
    const [m] = await marcasDe(prisma);
    expect(m).toMatchObject({ feitas: 3, concluida: true });
  });

  // ⚠ O PARCIAL TAMBÉM PRECISA APARECER: marca começada por outro turno parecia intocada, e o
  // operador só descobria o que já existia depois de abrir a sessão.
  it("mostra o parcial sem dar a marca como pronta", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A43", 3)],
      sessoes: [{ id: "s1", marca: "T97A43", opId: "op-97", opNumero: "097" }],
      boasPorSessao: { s1: 1 },
    });
    const [m] = await marcasDe(prisma);
    expect(m).toMatchObject({ feitas: 1, concluida: false });
  });

  it("marca sem nenhum apontamento fica zerada, não concluída", async () => {
    const prisma = prismaFalso({ pecas: [peca("p1", "T97A16", 1)] });
    const [m] = await marcasDe(prisma);
    expect(m).toMatchObject({ feitas: 0, concluida: false });
  });

  // ⚠⚠ A MESMA MARCA EM OUTRA OBRA NÃO CONTA. Marca se repete entre obras; somando sem olhar a OP,
  // a T97A16 da 097 apareceria pronta porque alguém produziu a T97A16 da 102.
  it("não conta apontamento de outra obra", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A16", 1)],
      sessoes: [{ id: "s1", marca: "T97A16", opId: "op-102", opNumero: "102" }],
      boasPorSessao: { s1: 9 },
    });
    const [m] = await marcasDe(prisma);
    expect(m).toMatchObject({ feitas: 0, concluida: false });
  });

  // ⚠ A sessão do caminho de BIPAR não guarda `opId`, só o número da obra — casar só por `opId`
  // perderia justamente os apontamentos desse caminho, que é o comum.
  it("casa pela obra quando a sessão só tem o número", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A16", 1)],
      sessoes: [{ id: "s1", marca: "T97A16", opId: null, opNumero: "097" }],
      boasPorSessao: { s1: 1 },
    });
    const [m] = await marcasDe(prisma);
    expect(m.concluida).toBe(true);
  });

  it("o cabeçalho da obra conta quantas marcas já saíram", async () => {
    const prisma = prismaFalso({
      pecas: [peca("p1", "T97A16", 1), peca("p2", "T97A18", 1)],
      sessoes: [{ id: "s1", marca: "T97A16", opId: "op-97", opNumero: "097" }],
      boasPorSessao: { s1: 1 },
    });
    const [lote] = (await programadoPara(prisma, RECURSO)).lotes;
    expect(lote.concluidas).toBe(1);
    expect(lote.marcas).toHaveLength(2);
  });

  // ⚠ Peça com `qte` 0 não é "marca pronta": seria dar por feito o que não tem quantidade nenhuma.
  it("planejado zero nunca vira concluída", async () => {
    const prisma = prismaFalso({ pecas: [peca("p1", "T97A16", 0)] });
    expect((await marcasDe(prisma))[0].concluida).toBe(false);
  });

  it("setor sem mapa para o Gantt não quebra — devolve vazio", async () => {
    const r = await programadoPara(prismaFalso(), { codigo: "X", setor: { codigo: "EXPEDICAO" } });
    expect(r).toMatchObject({ lotes: [], semMapa: true });
  });
});

// ─── QUANDO O PCP PLANEJA EM BALDE E O CHÃO TEM VÁRIOS POSTOS ─────────────────
//
// ⚠⚠ O DEFEITO QUE ESTES TESTES CONGELAM (13/09/2026). O Gantt grava `acabamentoBancada =
// "ACABAMENTO"` (83 peças) e `pinturaBancada = "GALPAO_1"` (3 peças) — códigos de BALDE, do
// planejamento. O MES cadastra os postos FÍSICOS: ACABAMENTO01…10, PINTURAAIRLESS. Buscando por
// recurso, o totem do acabamento procurava `acabamentoBancada = "ACABAMENTO05"` e NUNCA achava
// nada: dizia "nada programado para este posto hoje" todo dia, para sempre. Solda e Preparação
// batem código a código, e foi por isso que passou despercebido.
//
// O vínculo entre planejamento e execução é o SETOR — está escrito no próprio semeador. Quando o
// posto não é um código que o Gantt conhece, a lista passa a ser a DO SETOR.

describe("programadoPara — posto físico dentro de um balde do Gantt", () => {
  it("lista o programado do SETOR quando o posto não é um código do Gantt", async () => {
    const prisma = prismaFalso({ pecas: [peca("p1", "T97A16", 1)] });
    const r = await programadoPara(prisma, POSTO_DE_ACABAMENTO);

    expect(r.doSetor).toBe(true);
    // ⚠ O filtro NÃO pode citar o código do posto: é justamente ele que não existe no Gantt.
    const onde = prisma.pecaConjunto.findMany.mock.calls[0][0].where;
    expect(onde.acabamentoBancada).toBeUndefined();
    expect(onde.acabamentoDiaProgramado).toBeTruthy();
    expect(r.lotes[0].marcas).toHaveLength(1);
  });

  it("o posto que o Gantt conhece continua filtrando por ele mesmo", async () => {
    const prisma = prismaFalso({ pecas: [peca("p1", "T97A16", 1)] });
    const r = await programadoPara(prisma, RECURSO);

    expect(r.doSetor).toBe(false);
    expect(prisma.pecaConjunto.findMany.mock.calls[0][0].where.maquina).toBe("LASER_CHAPA");
  });

  // ⚠ A bancada única do acabamento é um código do Gantt: quem cadastrar um posto com ESSE código
  // tem de continuar filtrando por recurso, senão o balde vira lista do setor sem necessidade.
  it("o próprio código do balde continua sendo filtro de recurso", async () => {
    const prisma = prismaFalso({ pecas: [] });
    const r = await programadoPara(prisma, { codigo: "ACABAMENTO", setor: { codigo: "ACABAMENTO" } });
    expect(r.doSetor).toBe(false);
    expect(prisma.pecaConjunto.findMany.mock.calls[0][0].where.acabamentoBancada).toBe("ACABAMENTO");
  });

  // ⚠ Peça do setor ainda SEM posto atribuído (`recurso: null` no Gantt) é trabalho que alguém tem
  // de fazer — e some se a busca exigir recurso preenchido.
  it("traz também a peça do setor que ainda não tem posto atribuído", async () => {
    const prisma = prismaFalso({ pecas: [peca("p1", "T97A16", 1, { acabamentoBancada: null })] });
    const r = await programadoPara(prisma, POSTO_DE_ACABAMENTO);
    expect(r.lotes[0].marcas).toHaveLength(1);
  });
});
