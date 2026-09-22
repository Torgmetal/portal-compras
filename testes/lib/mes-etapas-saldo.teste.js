import { describe, expect, it, vi } from "vitest";
import { saldoDaMarca, saldosDasMarcas } from "@/lib/mes/saldo";
import { abrirNaTransacao, encerrarNaTransacao } from "@/lib/mes/sessao";

// ─── OS TRÊS FUROS DE REGRA QUE O CODEX ACHOU EM 22/09/2026 ───────────────────────────────────

describe("uma etapa não come o saldo da seguinte", () => {
  // ⚠⚠ O PIOR DOS TRÊS. `MesSessao.operacao` guarda o setor da vez e a rota já a gravava
  // (`recurso.setor.codigo`), mas ela não participava de conta nenhuma: cortar as 10 peças de uma
  // marca na PREPARAÇÃO fazia a MONTAGEM e a SOLDA verem as mesmas 10 como produzidas e recusarem
  // o PRIMEIRO apontamento delas.
  it("o saldo filtra pela operação da sessão", async () => {
    const tx = {
      mesSessao: { findMany: vi.fn(async () => [{ id: "s1" }]) },
      mesApontamentoQtd: { aggregate: vi.fn(async () => ({ _sum: { boas: 0 } })) },
    };
    await saldoDaMarca(tx, {
      planejadoQtd: 10, planejadoManual: 10, marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "MONTAGEM",
    });
    expect(tx.mesSessao.findMany.mock.calls[0][0].where).toMatchObject({ operacao: "MONTAGEM" });
  });

  // ⚠ Entre POSTOS da mesma etapa continua somando: dois operadores do Acabamento na mesma marca
  // dividem um teto só, que é o que a peça física permite.
  it("mas continua somando os postos da MESMA etapa", async () => {
    const irmas = [
      { id: "a", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "ACABAMENTO", planejadoManual: 10, nestingUnidades: [] },
      { id: "b", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "ACABAMENTO", planejadoManual: 10, nestingUnidades: [] },
    ];
    const contas = await saldosDasMarcas({
      mesSessao: { findMany: vi.fn(async () => irmas) },
      mesApontamentoQtd: { groupBy: vi.fn(async () => [
        { sessaoId: "a", _sum: { boas: 3 } }, { sessaoId: "b", _sum: { boas: 2 } },
      ]) },
    }, [{ id: "a", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "ACABAMENTO", planejadoQtd: 1, planejadoManual: 10 }]);
    expect(contas.get("a")).toMatchObject({ boas: 5, saldo: 5 });
  });

  it("e não soma a sessão de outra etapa", async () => {
    const irmas = [
      { id: "a", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "MONTAGEM", planejadoManual: 10, nestingUnidades: [] },
      { id: "corte", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "PREPARACAO", planejadoManual: 10, nestingUnidades: [] },
    ];
    const contas = await saldosDasMarcas({
      mesSessao: { findMany: vi.fn(async () => irmas) },
      mesApontamentoQtd: { groupBy: vi.fn(async () => [{ sessaoId: "corte", _sum: { boas: 10 } }]) },
    }, [{ id: "a", marca: "T89A10", opId: "op1", ambiente: "PROD", operacao: "MONTAGEM", planejadoQtd: 1, planejadoManual: 10 }]);
    expect(contas.get("a")).toMatchObject({ boas: 0, saldo: 10 });
  });
});

describe("encerrar uma marca não encerra o posto", () => {
  const sessao = { id: "s1", recursoId: "r1", status: "ABERTA", ambiente: "PROD" };
  const banco = (outras) => {
    const eventos = [];
    return { eventos, tx: {
      mesSessao: {
        findUnique: vi.fn(async () => sessao),
        count: vi.fn(async () => outras),
        update: vi.fn(async ({ data }) => ({ ...sessao, ...data })),
      },
      mesEvento: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => { eventos.push(data); return data; }),
        upsert: vi.fn(async ({ create }) => { eventos.push(create); return create; }),
      },
      mesApontamentoQtd: { aggregate: vi.fn(async () => ({ _sum: { boas: 0 } })) },
    } };
  };

  // ⚠⚠ A TELA CHAMA `encerrar` SOZINHA quando um apontamento conclui a marca. Num nesting de três,
  // concluir a primeira gravava ENCERRAMENTO enquanto as outras duas ainda produziam: o monitor
  // mostrava a máquina parada, e a duração desse estado entrava no OEE como tempo que ninguém
  // viveu (`estadoDoRecurso` lê o ÚLTIMO evento do posto).
  it("com outra marca aberta, NÃO grava o encerramento do posto", async () => {
    const { eventos, tx } = banco(2);
    await encerrarNaTransacao(tx, "s1", {});
    expect(eventos).toHaveLength(0);
    expect(tx.mesSessao.update).toHaveBeenCalled(); // a marca encerra; o posto é que não
  });

  it("na última marca, grava", async () => {
    const { eventos, tx } = banco(0);
    await encerrarNaTransacao(tx, "s1", {});
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe("ENCERRAMENTO");
  });

  // ⚠ No caminho do LOTE quem decide o evento é `encerrarLote` — e ali a contagem nem é feita,
  // senão seria uma consulta a mais por marca encerrada.
  it("com semEvento, nem consulta as outras", async () => {
    const { eventos, tx } = banco(0);
    await encerrarNaTransacao(tx, "s1", { semEvento: true });
    expect(eventos).toHaveLength(0);
    expect(tx.mesSessao.count).not.toHaveBeenCalled();
  });
});

describe("o vínculo da barra com a sessão aberta", () => {
  const aberta = { id: "s1", lotes: ["lote-1"], nestingUnidades: ["u1"], planejadoQtd: 2 };
  const tx = () => ({
    mesSessao: {
      findFirst: vi.fn(async () => aberta),
      update: vi.fn(async ({ data }) => ({ ...aberta, ...data })),
      create: vi.fn(),
    },
  });

  // ⚠ A barra nova entra na lista da sessão e soma no número QUE A TELA MOSTRA. O TETO não sai
  // mais daqui — ele é derivado das unidades (`comporTeto`), porque acumular no campo só
  // consertava a sessão ainda ABERTA (3ª rodada do Codex, 22/09/2026).
  it("a barra nova entra na sessão e soma no número da tela", async () => {
    const t = tx();
    await abrirNaTransacao(t, {
      recursoId: "r1", ambiente: "PROD", marca: "T107A-P3", opNumero: "T107A",
      loteId: "lote-2", nestingUnidadeId: "u2", planejadoQtd: 2, semEvento: true,
    });
    const dados = t.mesSessao.update.mock.calls[0][0].data;
    expect(dados.planejadoQtd).toEqual({ increment: 2 });
    expect(dados.nestingUnidades).toEqual({ push: "u2" });
  });

  // ⚠⚠ REENVIO NÃO INFLA NADA, e a chave é a UNIDADE — não o lote. O mesmo corte reenviado com
  // outro id de lote acrescentaria peça que não existe.
  it("a mesma unidade reenviada com outro lote não soma de novo", async () => {
    const t = tx();
    await abrirNaTransacao(t, {
      recursoId: "r1", ambiente: "PROD", marca: "T107A-P3", opNumero: "T107A",
      loteId: "lote-9", nestingUnidadeId: "u1", planejadoQtd: 2, semEvento: true,
    });
    expect(t.mesSessao.update.mock.calls[0][0].data.planejadoQtd).toBeUndefined();
  });

  // ⚠ O caminho MANUAL não mexe em nada: reabrir a marca é reabrir a mesma.
  it("reabrir a marca à mão não mexe na sessão", async () => {
    const t = tx();
    await abrirNaTransacao(t, {
      recursoId: "r1", ambiente: "PROD", marca: "T107A-P3", opNumero: "T107A",
      planejadoQtd: 5, semEvento: true,
    });
    expect(t.mesSessao.update).not.toHaveBeenCalled();
  });
});
