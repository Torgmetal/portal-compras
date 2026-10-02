// Relatórios de SAIS (ISO 8502-6/9) e de POEIRA (ISO 8502-3) — Vitor (02/10/2026): "preciso incluir na
// aba inspeções e na aba inspeção de campo os relatórios de salinidade e poeira (…) garanta que todos os
// campos de informações tenham como preencher". Os modelos são "Relatório de Sais.xlsx" e "Relatório de
// Poeira.xlsx", em Administrativo/Modelos de Documentos/Relatórios de Inspeção da Qualidade.
import { describe, it, expect } from "vitest";
import {
  N_AMOSTRAS, VOLUME_PADRAO_ML, AREA_PADRAO_CM2, deltaCondutividade, densidadeSais, amostrasCalculadas,
  mediaDensidade, laudoSais, pendenciasSais, camposCabecalhoSais, numeroMedida, arredondar, divergenciasDensidade,
} from "@/lib/sais-campos";
import {
  TESTES_POEIRA, CLASSES_POEIRA, mediaQuantidade, classificacaoParticulas, pendenciasPoeira, camposCabecalhoPoeira, maiorTamanhoAcima,
} from "@/lib/poeira-campos";

// o aparelho identificado — sem modelo e tag a leitura não se liga ao condutivímetro (pendência)
const APARELHO = { apModelo: "Horiba EC-33", apTag: "CD-01" };

describe("sais (ISO 8502-6/9)", () => {
  it("o modelo tem 5 amostras, e o Bresle padrão é 3 ml numa célula de 12,5 cm²", () => {
    expect(N_AMOSTRAS).toBe(5);
    expect(VOLUME_PADRAO_ML).toBe(3);
    expect(AREA_PADRAO_CM2).toBe(12.5);
  });

  it("Δ condutividade = amostra − água deionizada, como a fórmula da planilha (vazio fica vazio)", () => {
    expect(deltaCondutividade({ condAgua: "2", condAmostra: "18,5" })).toBeCloseTo(16.5, 5);
    expect(deltaCondutividade({ condAgua: "2", condAmostra: "" })).toBeNull();
    expect(deltaCondutividade({})).toBeNull();
  });

  it("densidade de sais pela ISO 8502-9: 5 × V × Δγ / A — com 3 ml e 12,5 cm² é 1,2 × Δγ", () => {
    expect(densidadeSais(10, 3, 12.5)).toBeCloseTo(12, 5);
    expect(densidadeSais(10, 2.5, 12.5)).toBeCloseTo(10, 5);
    expect(densidadeSais(null, 3, 12.5)).toBeNull();
    expect(densidadeSais(10, "", 12.5)).toBeNull(); // sem volume não há conta
  });

  it("densidade digitada (lida no aparelho) vale mais que a calculada", () => {
    const [a] = amostrasCalculadas({ volumeAgua: "3", areaCelula: "12,5", amostras: [{ condAgua: "1", condAmostra: "11", densidade: "9,8" }] });
    expect(a.delta).toBeCloseTo(10, 5);
    expect(a.densidade).toBeCloseTo(9.8, 5);
    expect(a.densidadeCalculada).toBe(false);
  });

  it("média de 1 casa sobre as amostras preenchidas; laudo APROVADO se média ≤ requisito", () => {
    const res = { volumeAgua: "3", areaCelula: "12,5", requisito: "20", amostras: [
      { condAgua: "1", condAmostra: "11" }, { condAgua: "1", condAmostra: "13" }, {}, {}, {},
    ] };
    expect(mediaDensidade(res)).toBeCloseTo(13.2, 5); // (12 + 14,4) / 2
    expect(laudoSais(res)).toBe("APROVADO");
    expect(laudoSais({ ...res, requisito: "10" })).toBe("REPROVADO");
    expect(laudoSais({ ...res, requisito: "" })).toBe(""); // sem requisito o portal não afirma laudo
  });

  it("não vai para assinatura sem peça, etapa, volume, área, requisito e ao menos uma amostra completa", () => {
    const p = pendenciasSais({ marcas: [], resultados: {} });
    expect(p.join(" ")).toMatch(/peça/i);
    expect(p.join(" ")).toMatch(/etapa/i);
    expect(p.join(" ")).toMatch(/requisito/i);
    expect(p.join(" ")).toMatch(/amostra/i);
    const ok = pendenciasSais({ marcas: ["T112A1"], resultados: {
      ...APARELHO, etapaPintura: "Após o jateamento", volumeAgua: "3", areaCelula: "12,5", requisito: "20",
      amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }],
    } });
    expect(ok).toEqual([]);
  });

  it("o resultado marcado à mão não pode contrariar a conta do laudo", () => {
    const res = { ...APARELHO, etapaPintura: "Após o jateamento", volumeAgua: "3", areaCelula: "12,5", requisito: "10", amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }] };
    expect(pendenciasSais({ marcas: ["T112A1"], resultadoInspecao: "APROVADO", resultados: res }).join(" ")).toMatch(/não bate/);
    expect(pendenciasSais({ marcas: ["T112A1"], resultadoInspecao: "REPROVADO", resultados: res })).toEqual([]);
  });

  it("amostra começada pela metade é pendência (condutividade sem a outra, ou sem hora)", () => {
    const p = pendenciasSais({ marcas: ["T112A1"], resultados: {
      etapaPintura: "Após o jateamento", volumeAgua: "3", areaCelula: "12,5", requisito: "20",
      amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }, { condAgua: "1" }],
    } });
    expect(p.join(" ")).toMatch(/amostra 2/i);
  });

  it("leitura de aparelho: ponto e vírgula são decimais (\"0.125\" não vira 125) e lixo não vira número", () => {
    expect(numeroMedida("0.125")).toBe(0.125);
    expect(numeroMedida("12,5")).toBe(12.5);
    expect(numeroMedida(" 7 ")).toBe(7);
    expect(numeroMedida("1e3")).toBeNull();
    expect(numeroMedida("12 a 14")).toBeNull();
    expect(deltaCondutividade({ condAgua: "0.125", condAmostra: "1.125" })).toBeCloseTo(1, 9);
  });

  it("arredonda como o ROUND da planilha, sem o ruído do ponto flutuante", () => {
    expect(arredondar((12.1 + 12.4) / 2, 1)).toBe(12.3); // 12,249999… em JavaScript
    expect(arredondar(2.5, 0)).toBe(3);
    expect(arredondar(-2.5, 0)).toBe(-3);
    // densidades digitadas 12,1 e 12,4 → média 12,3 (e não 12,2)
    expect(mediaDensidade({ amostras: [{ densidade: "12,1" }, { densidade: "12,4" }] })).toBe(12.3);
  });

  it("vazio vale o padrão do Bresle (como no PDF); zero, negativo e ilegível são pendência", () => {
    const base = { ...APARELHO, etapaPintura: "Após o jateamento", requisito: "20", amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }] };
    expect(pendenciasSais({ marcas: ["T1"], resultados: { ...base, volumeAgua: "", areaCelula: "" } })).toEqual([]);
    expect(pendenciasSais({ marcas: ["T1"], resultados: { ...base, volumeAgua: "0" } }).join(" ")).toMatch(/Volume .* maior que zero/);
    expect(pendenciasSais({ marcas: ["T1"], resultados: { ...base, areaCelula: "abc" } }).join(" ")).toMatch(/Área da célula ilegível/);
    expect(pendenciasSais({ marcas: ["T1"], resultados: { ...base, requisito: "vinte" } }).join(" ")).toMatch(/Requisito .* ilegível/);
  });

  it("amostra com condutividade menor que a da água pura é leitura trocada — pendência", () => {
    const p = pendenciasSais({ marcas: ["T1"], resultados: { ...APARELHO, etapaPintura: "x", requisito: "20", amostras: [{ condAgua: "11", condAmostra: "1", hora: "09:10" }] } });
    expect(p.join(" ")).toMatch(/Amostra 1: a condutividade da amostra é menor/);
  });

  it("sem modelo e tag do aparelho não vai para assinatura (o condutivímetro não está no mapa de calibração)", () => {
    const p = pendenciasSais({ marcas: ["T1"], resultados: { etapaPintura: "x", requisito: "20", apModelo: "Horiba", amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }] } });
    expect(p.join(" ")).toMatch(/Aparelho sem modelo ou tag/);
  });

  it("densidade digitada longe da calculada vira AVISO (não trava): costuma ser célula ou volume trocado", () => {
    expect(divergenciasDensidade({ amostras: [{ condAgua: "1", condAmostra: "11", densidade: "20" }] }).join(" ")).toMatch(/Amostra 1: .*digitada \(20\).*calculada \(12 mg\/m²/);
    expect(divergenciasDensidade({ amostras: [{ condAgua: "1", condAmostra: "11", densidade: "12,5" }] })).toEqual([]);
    expect(divergenciasDensidade({ amostras: [{ condAgua: "1", condAmostra: "11" }] })).toEqual([]); // calculada: nada a comparar
  });

  it("o cabeçalho efetivo traz os padrões da casa quando o campo está vazio", () => {
    const c = camposCabecalhoSais({ resultados: {}, marcas: ["T112A1", "T112A2"] });
    expect(c.volumeAgua).toBe("3");
    expect(c.areaCelula).toBe("12,5");
    expect(c.peca).toBe("T112A1, T112A2");
    expect(c.norma).toMatch(/8502-6/);
  });
});

describe("poeira (ISO 8502-3)", () => {
  it("cinco testes (A a E) e as seis classes da norma, de 0 a 5", () => {
    expect(TESTES_POEIRA).toEqual(["A", "B", "C", "D", "E"]);
    expect(CLASSES_POEIRA.map((c) => c.classe)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(CLASSES_POEIRA[2].quantidade).toMatch(/pequena quantidade/);
    expect(CLASSES_POEIRA[2].tamanho).toMatch(/50.100/);
  });

  it("média da quantidade arredondada a inteiro, só dos testes preenchidos (fórmula da planilha)", () => {
    expect(mediaQuantidade({ testes: [{ quantidade: "1" }, { quantidade: "2" }, { quantidade: "2" }, {}, {}] })).toBe(2);
    expect(mediaQuantidade({ testes: [] })).toBeNull();
  });

  it("classificação das partículas = a maior classe de tamanho encontrada (o pior caso)", () => {
    expect(classificacaoParticulas({ testes: [{ tamanho: "1" }, { tamanho: "3" }, { tamanho: "2" }] })).toBe(3);
    expect(classificacaoParticulas({ testes: [{}] })).toBeNull();
    // o inspetor pode registrar outra — o que ele escreveu vale
    expect(classificacaoParticulas({ classificacao: "2", testes: [{ tamanho: "3" }] })).toBe(2);
  });

  it("não vai para assinatura sem peça, etapa, fita, um teste completo e o laudo (a ampliação já nasce com 10×)", () => {
    const p = pendenciasPoeira({ marcas: [], resultados: {} });
    expect(p.join(" ")).toMatch(/peça/i);
    expect(p.join(" ")).toMatch(/laudo/i);
    expect(p.join(" ")).toMatch(/teste/i);
    const ok = pendenciasPoeira({ marcas: ["T112A1"], resultadoInspecao: "APROVADO", resultados: {
      etapaPintura: "Após o jateamento", fitaAdesiva: "Fita 25 mm", ampliacao: "10×",
      testes: [{ local: "Alma", quantidade: "1", tamanho: "1" }],
    } });
    expect(ok).toEqual([]);
    // o laudo é o Resultado da inspeção: REC (exame complementar) não é laudo de poeira
    expect(pendenciasPoeira({ marcas: ["T112A1"], resultadoInspecao: "REC", resultados: { etapaPintura: "x", fitaAdesiva: "y", testes: [{ local: "a", quantidade: "1", tamanho: "1" }] } }).join(" ")).toMatch(/laudo/i);
  });

  it("classe é um dígito de 0 a 5 — a mesma regra da gravação (\"3.0\" contaria na tela e sumiria ao salvar)", () => {
    expect(mediaQuantidade({ testes: [{ quantidade: "3.0" }, { quantidade: "1" }] })).toBe(1);
    expect(classificacaoParticulas({ testes: [{ tamanho: "classe 4" }, { tamanho: "2" }] })).toBe(2);
  });

  it("o local é complemento: teste com quantidade e tamanho está completo (como a média da planilha)", () => {
    const p = pendenciasPoeira({ marcas: ["T1"], resultadoInspecao: "APROVADO", resultados: { etapaPintura: "x", fitaAdesiva: "y", testes: [{ quantidade: "1", tamanho: "2" }] } });
    expect(p).toEqual([]);
  });

  it("classificação marcada abaixo da maior encontrada é sinalizada (o PDF imprime a maior ao lado)", () => {
    expect(maiorTamanhoAcima({ classificacao: "4", testes: [{ tamanho: "5" }, { tamanho: "2" }] })).toBe(5);
    expect(maiorTamanhoAcima({ classificacao: "5", testes: [{ tamanho: "5" }] })).toBeNull();
    expect(maiorTamanhoAcima({ testes: [{ tamanho: "5" }] })).toBeNull(); // sem registro, a sugerida já é a maior
  });

  it("o cabeçalho efetivo já sugere a ampliação de 10× da norma e a peça do relatório", () => {
    const c = camposCabecalhoPoeira({ resultados: {}, marcas: ["T112A1"] });
    expect(c.ampliacao).toMatch(/10/);
    expect(c.peca).toBe("T112A1");
    expect(c.norma).toMatch(/8502-3/);
  });
});
