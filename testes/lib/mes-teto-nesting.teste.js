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

describe("manual e nesting na mesma obra — as duas contas batem", () => {
  // ⚠⚠ O EXEMPLO DO PARECER (achado do Codex, 22/09/2026): sessão manual encerrada com planejado
  // 10 e 2 boas, depois um nesting de 2 peças da MESMA marca, obra e etapa. A tela dizia teto 2 e
  // saldo 2; a gravação dizia teto 10 e saldo 8 — o operador vê um número e recebe outro.
  //
  // ⚠ A causa: `abrirNesting` manda só `opNumero`, a abertura pelo Gantt manda `opId` também. A
  // busca preferia `opId` (e varria a obra pelo número), o agrupamento particionava por `opId` —
  // e separava justamente as sessões que a busca tinha juntado.
  const MANUAL = {
    id: "manual", marca: "T107A-P3", opId: "op-107", opNumero: "T107A",
    ambiente: "PROD", operacao: "PREPARACAO", planejadoQtd: 10, planejadoManual: 10,
    nestingUnidades: [],
  };
  const NESTING = {
    id: "barra", marca: "T107A-P3", opId: null, opNumero: "T107A",
    ambiente: "PROD", operacao: "PREPARACAO", planejadoQtd: 2, planejadoManual: 0,
    nestingUnidades: ["u1"],
  };
  const tx = () => ({
    mesSessao: { findMany: vi.fn(async () => [MANUAL, NESTING]) },
    mesNestingItem: {
      groupBy: vi.fn(async () => [{ unidadeId: "u1", marca: "T107A-P3", opNumero: "T107A", _sum: { qtd: 2 } }]),
    },
    mesApontamentoQtd: {
      aggregate: vi.fn(async () => ({ _sum: { boas: 2 } })),
      groupBy: vi.fn(async () => [{ sessaoId: "manual", _sum: { boas: 2 } }, { sessaoId: "barra", _sum: { boas: 0 } }]),
    },
  });

  it("a gravação e a tela devolvem o MESMO teto e o MESMO saldo", async () => {
    const naGravacao = await saldoDaMarca(tx(), NESTING);
    const naTela = (await saldosDasMarcas(tx(), [NESTING])).get("barra");
    expect(naGravacao).toMatchObject({ planejado: 10, boas: 2, saldo: 8 });
    expect(naTela).toMatchObject({ planejado: 10, boas: 2, saldo: 8 });
  });

  // ⚠ E no sentido contrário: partindo da sessão MANUAL, a barra do nesting entra na mesma conta.
  it("partindo da manual, a barra do nesting entra na mesma conta", async () => {
    const naGravacao = await saldoDaMarca(tx(), MANUAL);
    const naTela = (await saldosDasMarcas(tx(), [MANUAL])).get("manual");
    expect(naGravacao.planejado).toBe(naTela.planejado);
    expect(naGravacao.saldo).toBe(naTela.saldo);
  });

  // ⚠ Obra diferente continua separada — juntar tudo pelo número não pode virar juntar tudo.
  it("obra diferente não entra", async () => {
    const outra = { ...NESTING, id: "outra", opNumero: "T999" };
    const t = { ...tx(), mesSessao: { findMany: vi.fn(async () => [outra]) } };
    const contas = await saldosDasMarcas(t, [NESTING]);
    expect(contas.get("barra").planejado).toBe(0);
  });
});

describe("a obra escrita de duas maneiras — com o filtro do banco valendo", () => {
  // ⚠⚠ O ESPELHO DO DEFEITO ANTERIOR (achado do Codex, 22/09/2026, terceira vez na mesma linha).
  // `{ opId }` solto na busca não particiona nada: a sessão aberta SÓ por id varria também as que
  // têm id E número, mas o agrupamento separava as duas. A={opId:"op1"} e B={opId:"op1",
  // opNumero:"107"}, ambas com planejadoManual 10 e 2 boas em B → a tela de A dizia saldo 10 e a
  // gravação calculava 8.
  //
  // ⚠⚠ O FAKE APLICA O `where` DE VERDADE, e é isso que dá valor ao teste (pedido do parecer). Um
  // mock que devolve a lista inteira prova só que as duas funções somam igual; o que precisa ser
  // provado é que elas escolhem as MESMAS irmãs.
  const casa = (w, s) =>
    Object.entries(w).every(([k, v]) => (v === null ? (s[k] ?? null) === null : s[k] === v));
  const tx = (sessoes) => ({
    mesSessao: {
      findMany: vi.fn(async ({ where }) => sessoes.filter((s) =>
        where.OR ? where.OR.some((w) => casa(w, s)) : casa(where, s))),
    },
    mesNestingItem: { groupBy: vi.fn(async () => []) },
    mesApontamentoQtd: {
      aggregate: vi.fn(async ({ where }) => ({
        _sum: { boas: sessoes.filter((s) => where.sessaoId.in.includes(s.id))
          .reduce((t, s) => t + (s.boas || 0), 0) },
      })),
      groupBy: vi.fn(async ({ where }) => sessoes.filter((s) => where.sessaoId.in.includes(s.id))
        .map((s) => ({ sessaoId: s.id, _sum: { boas: s.boas || 0 } }))),
    },
  });
  const base = {
    marca: "T107A-P3", ambiente: "PROD", operacao: "PREPARACAO",
    planejadoQtd: 10, planejadoManual: 10, nestingUnidades: [], boas: 0,
  };
  const SO_ID = { ...base, id: "a", opId: "op1", opNumero: null };
  const COM_NUMERO = { ...base, id: "b", opId: "op1", opNumero: "107", boas: 2 };

  it("a sessão só com id: tela e gravação devolvem o MESMO saldo", async () => {
    const sessoes = [SO_ID, COM_NUMERO];
    const naGravacao = await saldoDaMarca(tx(sessoes), SO_ID);
    const naTela = (await saldosDasMarcas(tx(sessoes), [SO_ID])).get("a");
    expect(naGravacao.saldo).toBe(naTela.saldo);
    expect(naGravacao.planejado).toBe(naTela.planejado);
  });

  it("e a sessão com número também — nos dois sentidos", async () => {
    const sessoes = [SO_ID, COM_NUMERO];
    const naGravacao = await saldoDaMarca(tx(sessoes), COM_NUMERO);
    const naTela = (await saldosDasMarcas(tx(sessoes), [COM_NUMERO])).get("b");
    expect(naGravacao).toMatchObject({ planejado: 10, boas: 2, saldo: 8 });
    expect(naTela).toMatchObject({ planejado: 10, boas: 2, saldo: 8 });
  });

  // ⚠ "Ser irmã" virou relação de EQUIVALÊNCIA: quem eu vejo me vê, e o grupo é o mesmo dos dois
  // lados. Era exatamente o que faltava — a busca antiga era assimétrica.
  it("ser irmã é simétrico: as duas, juntas na tela, não discordam entre si", async () => {
    const sessoes = [SO_ID, COM_NUMERO];
    const contas = await saldosDasMarcas(tx(sessoes), [SO_ID, COM_NUMERO]);
    expect(contas.get("a").planejado).toBe(10);
    expect(contas.get("b")).toMatchObject({ boas: 2, saldo: 8 });
    // ⚠ Sem número, a obra é `{opNumero: null, opId}` — as duas condições juntas. A sessão só com
    // id NÃO arrasta a que tem número, senão a assimetria voltava por outro caminho.
    expect(contas.get("a").boas).toBe(0);
  });

  // ⚠ Duas sessões sem número nenhum continuam separadas por obra — o id ainda identifica.
  it("sem número, o id ainda separa obras diferentes", async () => {
    const outra = { ...SO_ID, id: "c", opId: "op2", boas: 5 };
    const contas = await saldosDasMarcas(tx([SO_ID, outra]), [SO_ID]);
    expect(contas.get("a").boas).toBe(0);
  });
});
