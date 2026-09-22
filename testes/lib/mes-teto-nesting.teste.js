import { describe, expect, it, vi } from "vitest";
import { comporTeto, recusaPorSaldo, saldoDaMarca, saldosDasMarcas } from "@/lib/mes/saldo";

// ─── O TETO DA MARCA QUANDO O NESTING ABRE VÁRIAS BARRAS ──────────────────────────────────────
//
// ⚠⚠ TRÊS RODADAS DO CODEX PARA CHEGAR AQUI (22/09/2026). O erro de raiz era `planejadoQtd` querer
// dizer coisas diferentes nos dois caminhos: no MANUAL é o total da marca, no NESTING é a
// quantidade daquela BARRA. Como o saldo soma as BOAS de todas as irmãs, tomar o planejado de UMA
// sessão bloqueava a segunda barra — e as minhas duas primeiras correções só cobriram o caso da
// sessão ainda ABERTA. Barras produzidas em sequência abrem sessão NOVA, e o furo voltava.

const irma = (id, extra = {}) => ({
  id, marca: "T107A-P3", opId: "op1", opNumero: "T107A", ambiente: "PROD", operacao: "PREPARACAO",
  planejadoQtd: 0, planejadoManual: 0, nestingUnidades: [], ...extra,
});

describe("comporTeto — a regra, sem banco", () => {
  it("só manual: o total digitado manda", () => {
    expect(comporTeto([irma("a", { planejadoManual: 10 })], 0))
      .toMatchObject({ planejado: 10, semTeto: false });
  });

  it("sem planejamento nenhum é SEM TETO — a marca bipada à mão fora do Gantt", () => {
    expect(comporTeto([irma("a")], 0)).toMatchObject({ semTeto: true });
  });

  // ⚠⚠ O CASO QUE BLOQUEAVA. Duas barras de 2 peças: o teto é 4, venham elas juntas, em sequência
  // ou em postos diferentes da mesma etapa — porque sai das UNIDADES, não da sessão.
  it("só nesting: soma as barras, contando cada uma UMA vez", () => {
    const irmas = [irma("a", { nestingUnidades: ["u1"] }), irma("b", { nestingUnidades: ["u2", "u1"] })];
    expect(comporTeto(irmas, 4)).toMatchObject({ planejado: 4, semTeto: false });
  });

  // ⚠⚠ `max`, NÃO SOMA (parecer do Codex): o número digitado é o total da marca e as barras são um
  // recorte dele. Somar inflaria o teto.
  it("manual E nesting: vale o MAIOR planejamento conhecido", () => {
    const irmas = [irma("a", { planejadoManual: 10 }), irma("b", { nestingUnidades: ["u1"] })];
    expect(comporTeto(irmas, 4).planejado).toBe(10);
    expect(comporTeto(irmas, 12).planejado).toBe(12);
  });

  // ⚠⚠ O FURO QUE O `filter(sem unidades)` DEIXAVA. Sessão aberta à mão com total 10 que DEPOIS
  // recebe uma barra: o total tem de sobreviver à chegada da barra, senão o teto desaba para 2 e
  // bloqueia 8 peças legítimas.
  it("a sessão manual que recebe uma barra NÃO perde o total digitado", () => {
    const misto = [irma("a", { planejadoManual: 10, nestingUnidades: ["u1"] })];
    expect(comporTeto(misto, 2).planejado).toBe(10);
  });

  // ⚠⚠ ZERO QUER DIZER ILIMITADO, e é por isso que referência quebrada NÃO pode virar zero: plano
  // apagado ou reimportado transformaria o buraco no cadastro em licença para lançar o que quiser.
  it("barra que não devolve item nenhum é REFERÊNCIA QUEBRADA, não liberdade", () => {
    const r = comporTeto([irma("a", { nestingUnidades: ["sumiu"] })], 0);
    expect(r).toMatchObject({ semTeto: false, referenciaQuebrada: true });
    expect(recusaPorSaldo({ ...r, saldo: 0, boas: 0 }, 1, "T107A-P3")).toMatch(/plano de corte/i);
  });

  it("mas com total digitado ao lado, o digitado segura a marca", () => {
    const r = comporTeto([irma("a", { planejadoManual: 10, nestingUnidades: ["sumiu"] })], 0);
    expect(r).toMatchObject({ planejado: 10, referenciaQuebrada: false });
  });
});

describe("as duas barras, de ponta a ponta", () => {
  const tx = (irmas, qtdDasBarras, boas) => ({
    mesSessao: { findMany: vi.fn(async () => irmas) },
    mesNestingItem: {
      aggregate: vi.fn(async () => ({ _sum: { qtd: qtdDasBarras } })),
      groupBy: vi.fn(async () => [...new Set(irmas.flatMap((i) => i.nestingUnidades || []))]
        .map((u) => ({ unidadeId: u, marca: "T107A-P3", opNumero: "T107A", _sum: { qtd: 2 } }))),
    },
    mesApontamentoQtd: {
      aggregate: vi.fn(async () => ({ _sum: { boas } })),
      groupBy: vi.fn(async () => irmas.map((i) => ({ sessaoId: i.id, _sum: { boas: i.id === "a" ? boas : 0 } }))),
    },
  });

  // ⚠⚠ O CENÁRIO EXATO DA TERCEIRA RODADA: a barra 1 foi produzida e a tela ENCERROU a sessão; a
  // barra 2 abre sessão nova. Antes disto o saldo dava zero e as 2 peças legítimas eram recusadas.
  it("SEQUENCIAL: barra 1 encerrada, barra 2 aberta — sobram as 2 da barra 2", async () => {
    const irmas = [
      irma("a", { nestingUnidades: ["u1"] }),   // encerrada, já produziu 2
      irma("b", { nestingUnidades: ["u2"] }),   // a nova
    ];
    const conta = await saldoDaMarca(tx(irmas, 4, 2), irmas[1]);
    expect(conta).toMatchObject({ planejado: 4, boas: 2, saldo: 2, semTeto: false });
  });

  // ⚠ Em POSTOS DIFERENTES da mesma etapa também não há reuso de sessão — e o teto tem de ser o
  // mesmo, porque é a peça física que manda.
  it("POSTOS DIFERENTES da mesma etapa dividem o mesmo teto", async () => {
    const irmas = [
      irma("a", { nestingUnidades: ["u1"] }),
      irma("b", { nestingUnidades: ["u2"] }),
    ];
    const contas = await saldosDasMarcas(tx(irmas, 4, 2), [irmas[1]]);
    expect(contas.get("b")).toMatchObject({ planejado: 4, boas: 2, saldo: 2 });
  });

  // ⚠ A MESMA barra em duas sessões conta UMA vez — o `Set` das unidades distintas.
  it("a mesma barra em duas sessões não dobra o teto", async () => {
    const irmas = [irma("a", { nestingUnidades: ["u1"] }), irma("b", { nestingUnidades: ["u1"] })];
    const contas = await saldosDasMarcas(tx(irmas, 2, 0), [irmas[0]]);
    expect(contas.get("a").planejado).toBe(2);
  });
});

describe("a obra do item da barra — leitura e gravação respondem igual", () => {
  // ⚠⚠ ERA O PIOR TIPO DE DIVERGÊNCIA (achado do Codex, 22/09/2026): a TELA dizia que cabia e a
  // GRAVAÇÃO recusava. A leitura em lote aceitava o item com `opNumero` nulo; a individual exigia
  // igualdade e o excluía — soma zero, "referência quebrada", apontamento legítimo negado.
  //
  // ⚠ Item sem obra HERDA a do plano, que é como `abrirNesting` já resolvia
  // (`i.opNumero ?? unidade.nesting.opNumero`). Abertura, leitura e gravação, a mesma resposta.
  const sessao = {
    id: "a", marca: "T107A-P3", opNumero: "T107A", ambiente: "PROD", operacao: "PREPARACAO",
    planejadoQtd: 0, planejadoManual: 0, nestingUnidades: ["u1"],
  };
  const SEM_OBRA = [{ unidadeId: "u1", marca: "T107A-P3", opNumero: null, _sum: { qtd: 3 } }];
  const tx = () => ({
    mesSessao: { findMany: vi.fn(async () => [sessao]) },
    mesNestingItem: { groupBy: vi.fn(async () => SEM_OBRA) },
    mesApontamentoQtd: {
      aggregate: vi.fn(async () => ({ _sum: { boas: 0 } })),
      groupBy: vi.fn(async () => []),
    },
  });

  it("a gravação conta o item sem obra, em vez de chamar de referência quebrada", async () => {
    const conta = await saldoDaMarca(tx(), sessao);
    expect(conta).toMatchObject({ planejado: 3, saldo: 3, semTeto: false });
    expect(conta.referenciaQuebrada).toBe(false);
  });

  it("e a tela devolve o MESMO teto", async () => {
    const contas = await saldosDasMarcas(tx(), [sessao]);
    expect(contas.get("a")).toMatchObject({ planejado: 3, saldo: 3 });
  });

  // ⚠ Mas item de OUTRA obra continua fora — aceitar o nulo não é aceitar qualquer um.
  it("item de outra obra continua fora das duas contas", async () => {
    const outra = [{ unidadeId: "u1", marca: "T107A-P3", opNumero: "T999", _sum: { qtd: 99 } }];
    const t = { ...tx(), mesNestingItem: { groupBy: vi.fn(async () => outra) } };
    expect((await saldoDaMarca(t, sessao)).referenciaQuebrada).toBe(true);
    expect((await saldosDasMarcas(t, [sessao])).get("a").referenciaQuebrada).toBe(true);
  });
});
