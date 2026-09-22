import { describe, expect, it, vi } from "vitest";
import { AMBIENTE, ambientePedido, ambienteValido, divergenciaDeAmbiente } from "@/lib/mes/ambiente";
import { saldoDaMarca, saldosDasMarcas } from "@/lib/mes/saldo";

// ⚠⚠ O MODO SOMBRA EXISTIA NO SCHEMA E NÃO ISOLAVA NADA (medido em 21/09/2026). `ambiente` estava
// declarado em 8 models de fato, mas nenhuma rota o passava — todas as funções tinham
// `ambiente = "PROD"` como default e ninguém sobrescrevia. Matheus decidiu DEMO e PROD separados:
// ele vai simular o operador em postos que já estão produzindo de verdade.

describe("o ambiente que vem de fora", () => {
  // ⚠ Ausência é PROD: é o mundo de verdade, e é o que o terminal da fábrica abre.
  it("ausente é PROD", () => {
    for (const v of [undefined, null, ""]) expect(ambientePedido(v)).toBe(AMBIENTE.PROD);
  });

  it("aceita os dois do domínio, em qualquer caixa", () => {
    expect(ambientePedido("demo")).toBe("DEMO");
    expect(ambientePedido(" Prod ")).toBe("PROD");
  });

  // ⚠⚠ FORA DO DOMÍNIO É ERRO, NÃO PROD SILENCIOSO. "DEM" na URL viraria apontamento no mundo
  // errado sem ninguém perceber — e apontamento no mundo errado não se desfaz.
  it("valor fora do domínio é recusa, não PROD por garantia", () => {
    for (const v of ["DEM", "producao", "teste", "0"]) expect(ambientePedido(v), v).toBe(null);
  });

  it("ambienteValido só conhece os dois", () => {
    expect(ambienteValido("PROD")).toBe(true);
    expect(ambienteValido("DEMO")).toBe(true);
    expect(ambienteValido("demo")).toBe(false);
    expect(ambienteValido(undefined)).toBe(false);
  });
});

describe("entidades de mundos diferentes no mesmo comando", () => {
  // ⚠⚠ A CHAVE ESTRANGEIRA NÃO GARANTE ISSO (achado do Codex). Nada no banco impede um operador
  // PROD de entrar num recurso DEMO — sem esta conferência o isolamento seria convenção.
  it("acusa a divergência dizendo QUAL entidade e de que mundo ela é", () => {
    const r = divergenciaDeAmbiente("PROD", [{ rotulo: "O operador", entidade: { ambiente: "DEMO" } }]);
    expect(r).toMatch(/operador/i);
    expect(r).toMatch(/DEMO/);
  });

  it("mesmo mundo passa", () => {
    expect(divergenciaDeAmbiente("DEMO", [{ rotulo: "X", entidade: { ambiente: "DEMO" } }])).toBe(null);
  });

  // ⚠ Entidade ausente não é divergência: quem valida existência é o chamador, e "não achei" não
  // pode virar "mundos diferentes" na cara do operador.
  it("entidade ausente não vira divergência", () => {
    expect(divergenciaDeAmbiente("PROD", [
      { rotulo: "A", entidade: null }, { rotulo: "B", entidade: undefined }, { rotulo: "C", entidade: {} },
    ])).toBe(null);
  });
});

describe("o saldo da marca não atravessa os mundos", () => {
  // ⚠⚠ ERA O VAZAMENTO DE ALTA (achado do Codex, 21/09/2026). Esta busca casa por obra+MARCA, que
  // são strings — não por `recursoId`. Então "a chave estrangeira já carrega o mundo" falha aqui:
  // uma simulação lançando 10 peças de T89A10 consumiria o saldo real da marca, e o operador de
  // verdade ouviria "já foram lançadas" por causa de um teste.
  it("só soma sessões do MESMO ambiente da sessão", async () => {
    const tx = {
      mesSessao: { findMany: vi.fn(async () => [{ id: "s1", planejadoManual: 10, nestingUnidades: [] }]) },
      mesApontamentoQtd: { aggregate: vi.fn(async () => ({ _sum: { boas: 4 } })) },
    };
    const conta = await saldoDaMarca(tx, {
      planejadoQtd: 10, planejadoManual: 10, marca: "T89A10", opId: "op1", ambiente: "DEMO",
    });
    expect(tx.mesSessao.findMany.mock.calls[0][0].where).toMatchObject({ ambiente: "DEMO" });
    expect(conta).toMatchObject({ planejado: 10, boas: 4, saldo: 6 });
  });
});

describe("os saldos de várias marcas em duas consultas", () => {
  // ⚠⚠ O GET DO TOTEM CUSTAVA `4 + 3N` (levantado em 20/09/2026): um aggregate e as duas de
  // `saldoDaMarca` PARA CADA marca aberta. Desde o nesting o posto abre a barra inteira, e com
  // ~30 terminais o dia todo isso deixa de ser custo de tela e vira carga de banco.
  const sessoes = [
    { id: "s1", marca: "T89A10", opId: "op1", ambiente: "PROD", planejadoQtd: 1, planejadoManual: 10 },
    { id: "s2", marca: "T89A11", opId: "op1", ambiente: "PROD", planejadoQtd: 4, planejadoManual: 4 },
    { id: "s3", marca: "T89A12", opId: "op1", ambiente: "PROD", planejadoQtd: 0, planejadoManual: 0 },
  ];

  const tx = (irmas, somas) => ({
    mesSessao: { findMany: vi.fn(async () => irmas) },
    mesApontamentoQtd: { groupBy: vi.fn(async () => somas) },
  });

  it("duas consultas para três marcas, não seis", async () => {
    const t = tx(sessoes, []);
    await saldosDasMarcas(t, sessoes);
    expect(t.mesSessao.findMany).toHaveBeenCalledTimes(1);
    expect(t.mesApontamentoQtd.groupBy).toHaveBeenCalledTimes(1);
  });

  // ⚠ O casamento das irmãs repete a regra de `saldoDaMarca` linha a linha: uma marca produzida em
  // outro turno ou outro posto do setor conta no mesmo saldo.
  it("soma as sessões irmãs da mesma obra e marca", async () => {
    const irmas = [...sessoes, { id: "s1b", marca: "T89A10", opId: "op1", ambiente: "PROD" }];
    const contas = await saldosDasMarcas(
      tx(irmas, [{ sessaoId: "s1", _sum: { boas: 3 } }, { sessaoId: "s1b", _sum: { boas: 4 } }]),
      sessoes,
    );
    expect(contas.get("s1")).toMatchObject({ planejado: 10, boas: 7, saldo: 3 });
  });

  // ⚠⚠ O MESMO ISOLAMENTO DO `saldoDaMarca`: sessão de outro mundo não entra na conta.
  it("não soma sessão de outro ambiente", async () => {
    const irmas = [sessoes[0], { id: "sx", marca: "T89A10", opId: "op1", ambiente: "DEMO", planejadoManual: 10, nestingUnidades: [] }];
    const contas = await saldosDasMarcas(
      tx(irmas, [{ sessaoId: "sx", _sum: { boas: 99 } }]),
      [sessoes[0]],
    );
    expect(contas.get("s1")).toMatchObject({ boas: 0, saldo: 10 });
  });

  // ⚠ Planejado zero é "sem teto", não "saldo zero" — a trava não pode proibir todo apontamento
  // não programado (mesma regra de `saldoDaMarca`).
  it("planejado zero fica sem teto", async () => {
    const contas = await saldosDasMarcas(tx(sessoes, []), sessoes);
    expect(contas.get("s3")).toMatchObject({ semTeto: true, saldo: null });
  });
});
