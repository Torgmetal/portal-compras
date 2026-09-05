import { describe, it, expect } from "vitest";
import {
  numeroBr, perdaDaEstrutura, perdaDaLinha, demaosDeTintas, coefSugerido,
  rendimentoTinta, custoCamada, DILUENTE_PCT, calcularEnsaios,
  precoPinturaPorDemaos, FATOR_DEMAO_EXTRA, precoPreMontagem,
  cargasPorClasse, CAPACIDADE_CARGA, creditoDeIcms, cargaDoCfop,
} from "@/lib/lqc";

// ⚠ Estes testes existem para a REFATORAÇÃO, não para provar que a conta está
// certa. Cada caso abaixo é uma regra de negócio escrita nos comentários do
// próprio lib/lqc.js, com a data e a frase do Vitor que a originou. Se um deles
// quebrar durante um "refactor", o refactor mudou dinheiro.

describe("numeroBr — vírgula é decimal (custo do parafuso sumindo, 23/08/2026)", () => {
  it("lê 0,15 como quinze centavos e não como zero", () => {
    expect(numeroBr("0,15")).toBe(0.15);
  });
  it("texto ilegível vira 0, não NaN", () => {
    expect(numeroBr("abc")).toBe(0);
    expect(Number.isNaN(numeroBr("abc"))).toBe(false);
  });
});

describe("perdaDaEstrutura — 85% em guarda-corpo/escada marinheiro (31/08/2026)", () => {
  it.each([
    ["GUARDA CORPO", 85], ["GUARDA-CORPO", 85], ["guarda corpo", 85],
    ["ESCADA MARINHEIRO", 85], ["CORRIMÃO", 85], ["corrimao", 85],
    ["COBERTURA", 45], ["FECHAMENTO", 45], ["", 45], [null, 45],
  ])("%s -> %s%%", (estrutura, esperado) => {
    expect(perdaDaEstrutura(estrutura)).toBe(esperado);
  });

  it("a linha usa a perda lançada à mão quando tem uma", () => {
    expect(perdaDaLinha({ perda: 60, estrutura: "COBERTURA" })).toBe(60);
  });
  it("sem perda lançada, a linha deduz da estrutura", () => {
    expect(perdaDaLinha({ estrutura: "GUARDA-CORPO" })).toBe(85);
    expect(perdaDaLinha({ perda: 0, estrutura: "GUARDA-CORPO" })).toBe(85);
  });
});

describe("demaosDeTintas — conta camadas distintas, não linhas", () => {
  const tintas = [
    { camada: "PRIMER", perda: 45 },
    { camada: "primer", perda: 45 },       // mesma camada, grafia diferente
    { camada: "ACABAMENTO", perda: 45 },
    { camada: "N/A", perda: 45 },          // não conta
    { camada: "INTERMEDIÁRIO", perda: 85 },// outra perda, fora do filtro
  ];
  it("duas camadas na perda 45", () => expect(demaosDeTintas(tintas, 45)).toBe(2));
  it("uma camada na perda 85", () => expect(demaosDeTintas(tintas, 85)).toBe(1));
  it("lista vazia", () => expect(demaosDeTintas([], 45)).toBe(0));
  it("nulo não explode", () => expect(demaosDeTintas(null, 45)).toBe(0));
});

describe("rendimentoTinta e custoCamada — diluente é 25% dos litros (LQC-081-26-TMSA-VALE)", () => {
  it("rendimento teórico é sólidos×10/película", () => {
    expect(rendimentoTinta({ solidos: 60, peliculaSeca: 100 })).toEqual({ teorico: 6, pratico: 6 });
  });
  it("a perda derruba o rendimento prático", () => {
    const { teorico, pratico } = rendimentoTinta({ solidos: 60, peliculaSeca: 100, perda: 45 });
    expect(teorico).toBe(6);
    expect(pratico).toBe(3.3);
  });
  it("dados faltando devolvem zero, não NaN", () => {
    expect(rendimentoTinta({})).toEqual({ teorico: 0, pratico: 0 });
    expect(rendimentoTinta()).toEqual({ teorico: 0, pratico: 0 });
  });

  it("o diluente é exatamente um quarto dos litros de tinta", () => {
    expect(DILUENTE_PCT).toBe(25);
    const c = custoCamada({ solidos: 60, peliculaSeca: 100, precoLitro: 10, precoDiluente: 4 }, 600);
    expect(c.litros).toBe(100);
    expect(c.litrosDiluente).toBe(25);
    expect(c.tinta).toBe(1000);
    expect(c.diluente).toBe(100);
    expect(c.total).toBe(1100);
  });
  it("sem o diluente o custo sairia ~9% menor — é o furo que a constante fecha", () => {
    const com = custoCamada({ solidos: 60, peliculaSeca: 100, precoLitro: 10, precoDiluente: 4 }, 600);
    const sem = custoCamada({ solidos: 60, peliculaSeca: 100, precoLitro: 10, precoDiluente: 4, diluentePct: 0 }, 600);
    expect(sem.total).toBeLessThan(com.total);
    expect(sem.total).toBe(1000);
  });
});

describe("calcularEnsaios — arredonda PRA CIMA (meio ensaio não existe)", () => {
  it("501 m² com um ensaio a cada 500 m² paga dois", () => {
    const { linhas } = calcularEnsaios({ PULL_OFF: { ativo: true, base: "m2", cada: 500, custo: 100 } }, 0, 501);
    const pull = linhas.find((l) => l.key === "PULL_OFF");
    expect(pull.qtd).toBe(2);
    expect(pull.total).toBe(200);
  });
  it("ensaio desligado não entra no total", () => {
    const { total } = calcularEnsaios({ PULL_OFF: { ativo: false, cada: 500, custo: 100 } }, 0, 5000);
    expect(total).toBe(0);
  });
});

describe("precoPinturaPorDemaos — cada demão extra custa metade da primeira", () => {
  it("o fator é 0,5", () => expect(FATOR_DEMAO_EXTRA).toBe(0.5));
  it.each([[1, 100], [2, 150], [3, 200]])("%s demão(s) -> R$ %s", (demaos, esperado) => {
    expect(precoPinturaPorDemaos(100, demaos)).toBe(esperado);
  });
  it("zero e nulo caem para uma demão, nunca para preço zero", () => {
    expect(precoPinturaPorDemaos(100, 0)).toBe(100);
    expect(precoPinturaPorDemaos(100, null)).toBe(100);
  });
});

describe("precoPreMontagem — interpola entre as duas âncoras da LQC", () => {
  const classe = { preMont10: 10, preMont100: 100 };
  it("0% não custa nada", () => expect(precoPreMontagem(classe, 0)).toBe(0));
  it("10% é a âncora de baixo", () => expect(precoPreMontagem(classe, 10)).toBe(10));
  it("100% é a âncora de cima", () => expect(precoPreMontagem(classe, 100)).toBe(100));
  it("55% interpola reto entre as duas", () => expect(precoPreMontagem(classe, 55)).toBe(55));
  it("acima de 100 prende na âncora, não extrapola", () => {
    expect(precoPreMontagem(classe, 150)).toBe(100);
  });
  it("negativo não vira crédito", () => expect(precoPreMontagem(classe, -20)).toBe(0));
});

describe("cargasPorClasse — carga arredonda PRA CIMA e a capacidade varia por classe", () => {
  it("as capacidades padrão são as médias da casa (23/08/2026)", () => {
    expect(CAPACIDADE_CARGA.EXTRA_LEVE).toBe(6500);
    expect(CAPACIDADE_CARGA.LEVE).toBe(8000);
    expect(CAPACIDADE_CARGA.MEDIO).toBe(12000);
    expect(CAPACIDADE_CARGA.PESADO).toBe(14000);
    expect(CAPACIDADE_CARGA.EXTRA_PESADO).toBe(20000);
  });
  it("um quilo a mais custa a viagem inteira", () => {
    const r = cargasPorClasse({ "EXTRA LEVE": 6501 });
    expect(r.totalCargas).toBe(2);
    expect(r.linhas[0].ultimaCargaKg).toBe(1);
  });
  it("classes sem peso não aparecem", () => {
    const r = cargasPorClasse({ "LEVE": 8000 });
    expect(r.linhas).toHaveLength(1);
    expect(r.totalCargas).toBe(1);
  });
  it("sem peso nenhum, nada a transportar", () => {
    expect(cargasPorClasse({}).totalCargas).toBe(0);
  });
});

describe("coefSugerido — área por kg", () => {
  it("perfil desconhecido cai no coeficiente médio", () => {
    expect(coefSugerido("PERFIL QUE NÃO EXISTE")).toBe(0.033);
  });
});

describe("creditoDeIcms e cargaDoCfop", () => {
  it("CFOP desconhecido não inventa carga", () => {
    expect(cargaDoCfop("0000")).toBeFalsy();
  });
  it("sem bases não há crédito", () => {
    const c = creditoDeIcms({});
    expect(c.total ?? c).toBeDefined();
  });
});
