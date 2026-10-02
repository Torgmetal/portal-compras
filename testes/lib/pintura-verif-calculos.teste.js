// A CONTA E A ESCRITA DO RELATÓRIO DE PINTURA — as regras puras que a tela e o PDF usam juntos.
//
// Verificação dos modelos (02/10/2026): leitura em branco entrava como ZERO na média (rugosidade 62 e 71
// davam "26.6 µm"), o laudo do PDF podia contradizer o resultado da inspeção, o grau ST3/SA1/SA2 não
// marcava nada, a condição do jato herdada pela demão saía como medição, as datas saíam em ISO e a
// 1ª demão acendia vermelho no celular contra a micragem do SISTEMA inteiro.
import { describe, expect, it } from "vitest";
import {
  mediaRugosidade, mediaEspessura, leiturasValidas, numeroComVirgula, numeroNoDocumento, datasNoDocumento,
  comUnidade, laudoDoRelatorio, demaoFinal, GRAUS_LIMPEZA, grauNaNorma, leiturasAmbientais,
} from "@/lib/pintura-campos";

describe("achado 1 — leitura em branco não é zero", () => {
  it("a média de rugosidade ignora o vazio como as rotas gravam (null) e como a tela guarda ('')", () => {
    expect(mediaRugosidade([62, 71, null, null, null])).toBe(66.5);
    expect(mediaRugosidade(["62", "71", "", "", ""])).toBe(66.5);
    expect(mediaRugosidade(["62", "   ", undefined])).toBe(62);
    expect(mediaRugosidade([null, ""])).toBe(null);
  });

  it("a média de espessura também — 3 leituras de 5 dão a média das 3", () => {
    expect(mediaEspessura([262, 275, 281, null, null])).toBe(272.7);
  });

  it("zero digitado É leitura (só o vazio fica de fora)", () => {
    expect(mediaEspessura([0, 10])).toBe(5);
    expect(leiturasValidas([0, null, "", 10])).toBe(2);
  });

  it("aceita a vírgula de quem digita no padrão brasileiro", () => {
    expect(mediaRugosidade(["62,5", "70,5"])).toBe(66.5);
  });

  it("conta quantas leituras entraram na média", () => {
    expect(leiturasValidas([62, 71, null, "", " "])).toBe(2);
    expect(leiturasValidas(undefined)).toBe(0);
  });
});

describe("achado 2 — o laudo é o RESULTADO DA INSPEÇÃO", () => {
  it("o resultado manda, mesmo com o laudo antigo do formulário dizendo outra coisa", () => {
    expect(laudoDoRelatorio({ resultadoInspecao: "REPROVADO", resultados: { laudo: "Aprovado" } })).toBe("REPROVADO");
    expect(laudoDoRelatorio({ resultadoInspecao: "REC", resultados: { laudo: "Aprovado" } })).toBe("REC");
  });

  it("relatório antigo, sem resultado marcado, ainda mostra o laudo que foi gravado", () => {
    expect(laudoDoRelatorio({ resultadoInspecao: null, resultados: { laudo: "Aprovado" } })).toBe("APROVADO");
  });

  it("sem nenhum dos dois, não inventa laudo", () => {
    expect(laudoDoRelatorio({ resultados: {} })).toBe("");
    expect(laudoDoRelatorio(null)).toBe("");
  });
});

describe("achado 4 — os graus do modelo são selecionáveis", () => {
  it("WJ1, WJ2 e WJ3 (hidrojateamento) entram na lista, sem tirar nenhum dos que existiam", () => {
    const ids = GRAUS_LIMPEZA.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(["WJ1", "WJ2", "WJ3", "ST2", "ST3", "SA1", "SA2", "SA2.5", "SA3"]));
  });

  it("o grau sai como a norma escreve", () => {
    expect(grauNaNorma("ST3")).toBe("St 3");
    expect(grauNaNorma("SA2")).toBe("Sa 2");
    expect(grauNaNorma("WJ2")).toBe("WJ2");
  });
});

describe("achado 7 — o documento sabe QUAL leitura da demão é herdada", () => {
  const res = { prepUmidade: "62", prepTAmb: "24", prepTSup: "27", prepOrvalho: "16.4", demaos: { 2: { produto: "P", umidade: "71" } } };

  it("diz campo a campo o que veio do jateamento", () => {
    const l = leiturasAmbientais(res, "2");
    expect(l.umidade).toBe("71");
    expect(l.herdados).toEqual(["tAmb", "tSup", "orvalho"]);
  });

  it("o jateamento e a demão com leitura própria não herdam nada", () => {
    expect(leiturasAmbientais(res, "jato").herdados).toEqual([]);
    const proprio = { ...res, demaos: { 1: { umidade: "58", tAmb: "26", tSup: "29", orvalho: "17" } } };
    expect(leiturasAmbientais(proprio, "1").herdados).toEqual([]);
  });
});

describe("achado 9 — escrita do documento", () => {
  it("data aaaa-mm-dd vira dd/mm/aaaa sem passar por fuso — e dentro das listas de validade", () => {
    expect(datasNoDocumento("2026-09-29")).toBe("29/09/2026");
    expect(datasNoDocumento("2027-03-15 · 2027-05-02")).toBe("15/03/2027 · 02/05/2027");
    // ⚠ meia-noite UTC em São Paulo ainda é o dia anterior: o dia 01 não pode virar 30
    expect(datasNoDocumento("2026-10-01")).toBe("01/10/2026");
    expect(datasNoDocumento("15/03/2027")).toBe("15/03/2027");
    expect(datasNoDocumento(null)).toBe("");
  });

  it("número com vírgula; texto que não é número sai como veio", () => {
    expect(numeroComVirgula(66.5)).toBe("66,5");
    expect(numeroComVirgula(198)).toBe("198,0");
    expect(numeroComVirgula(null)).toBe("");
    expect(numeroNoDocumento("16.4")).toBe("16,4");
    expect(numeroNoDocumento(92)).toBe("92");
    expect(numeroNoDocumento("WEGTHANE HPA 2.0")).toBe("WEGTHANE HPA 2.0");
    expect(numeroNoDocumento("N/A")).toBe("N/A");
  });

  it("a micragem ganha a unidade só quando não a tem", () => {
    expect(comUnidade("240", "µm")).toBe("240 µm");
    expect(comUnidade("250 µm", "µm")).toBe("250 µm");
    expect(comUnidade("250 μm", "µm")).toBe("250 μm");
    expect(comUnidade("", "µm")).toBe("");
  });
});

describe("achado 10 — a micragem do sistema é conferida na demão que FECHA a película", () => {
  // ⚠ o medidor lê a película TOTAL sobre o aço: a leitura da 2ª demão já inclui a 1ª
  it("é a última demão prevista no relatório, mesmo antes de ser medida", () => {
    const res = { demaos: { 1: { produto: "A" }, 2: { produto: "B" }, 3: { produto: "C" } }, espessuras: { 1: [92] } };
    expect(demaoFinal(res)).toBe("3");
  });

  it("ou a última medida, quando o relatório não diz quantas demãos tem", () => {
    expect(demaoFinal({ demaos: {}, espessuras: { 1: [92], 2: [190, null] } })).toBe("2");
    expect(demaoFinal({ espessuras: { 1: [null, ""] } })).toBe(null);
  });
});
