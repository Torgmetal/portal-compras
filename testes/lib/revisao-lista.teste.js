import { describe, it, expect } from "vitest";
import { montarAbaRevisao, alertaDeDivergencia, divergencia } from "@/app/engenharia/listas/revisao-lista";

// ⚠⚠ ESTE TESTE EXISTE PORQUE A ABA JÁ MENTIU. A LE R01 da OP-102, importada em 13/08/2026, foi
// arquivada no servidor dizendo "18 incluídas" — e nenhuma das 18 entrou no banco. O `diff` do
// import é calculado ANTES da gravação: é previsão, não recibo. O arquivo circulou como se fosse
// documento, e a diferença só apareceu quatro semanas depois, na tela de etiquetas.
//
// O que precisa ficar provado aqui: previsão e gravação aparecem com nomes diferentes, e quando os
// dois discordam existe um aviso dizendo isso em português.

const linha = (aba, rotulo) => aba.find((l) => l[0] === rotulo);

const resposta = (extra = {}) => ({
  opNumero: "102", obra: "REVAMP", totalNoArquivo: 77,
  criados: 18, atualizados: 59, ignorados: 0,
  diff: { nIncluidas: 18, nRemovidas: 12, nAlteradas: 33, incluidas: [], removidas: [], alteradas: [] },
  ...extra,
});

describe("montarAbaRevisao", () => {
  it("separa o que foi PREVISTO do que foi GRAVADO", () => {
    const aba = montarAbaRevisao({ sigla: "LE", j: resposta(), revLabel: "R01" });
    expect(linha(aba, "Previsto (antes de gravar)")[1]).toContain("18 a incluir");
    expect(linha(aba, "Gravado (o que foi ao banco)")[1]).toContain("18 criadas");
    expect(linha(aba, "Gravado (o que foi ao banco)")[1]).toContain("de 77 no arquivo");
  });

  it("quando previsão e gravação batem, não existe linha de atenção", () => {
    const aba = montarAbaRevisao({ sigla: "LE", j: resposta(), revLabel: "R01" });
    expect(linha(aba, "⚠ ATENÇÃO")).toBeUndefined();
  });

  // ⚠⚠ O CASO REAL DA OP-102: previu 18, gravou 0.
  it("previu 18 e gravou 0 → a aba grita, e diz quantas ficaram de fora", () => {
    const aba = montarAbaRevisao({ sigla: "LE", j: resposta({ criados: 0 }), revLabel: "R01" });
    const aviso = linha(aba, "⚠ ATENÇÃO")[1];
    expect(aviso).toContain("deveria gravar 18");
    expect(aviso).toContain("gravou 0");
    expect(aviso).toContain("18 NÃO entrou");
  });

  it("diz em qual modo o import rodou — apagou a lista anterior ou não", () => {
    expect(linha(montarAbaRevisao({ sigla: "LE", j: resposta(), revLabel: "R01" }), "Modo")[1])
      .toContain("Complementar");
    expect(linha(montarAbaRevisao({ sigla: "LE", j: resposta({ criados: 77 }), revLabel: "R01", sobrescrever: true }), "Modo")[1])
      .toContain("SOBRESCREVER");
  });

  // ⚠⚠ ALARME FALSO É PIOR QUE SILÊNCIO. Com sobrescrever a rota apaga as 71 e recria as 77: o
  // certo é "77 criadas". Comparar isso com a previsão (18, calculada contra as linhas que a
  // própria rota ia apagar) acusaria defeito num import perfeito — e ensinaria a ignorar a tarja.
  it("com sobrescrever, gravar a lista inteira NÃO é divergência", () => {
    const aba = montarAbaRevisao({
      sigla: "LE", revLabel: "R01", sobrescrever: true,
      j: resposta({ criados: 77, atualizados: 0 }),
    });
    expect(linha(aba, "⚠ ATENÇÃO")).toBeUndefined();
  });

  it("com sobrescrever, faltar marca do arquivo continua sendo divergência", () => {
    const aba = montarAbaRevisao({
      sigla: "LE", revLabel: "R01", sobrescrever: true,
      j: resposta({ criados: 59, atualizados: 0, ignorados: 18 }),
    });
    const aviso = linha(aba, "⚠ ATENÇÃO")[1];
    expect(aviso).toContain("a lista inteira do arquivo (77 marca(s))");
    expect(aviso).toContain("18 NÃO entrou");
  });

  it("a coluna por marca deixa claro que é previsão, não o que entrou", () => {
    const aba = montarAbaRevisao({ sigla: "LE", j: resposta(), revLabel: "R01" });
    expect(aba.find((l) => l[0] === "Marca")[1]).toBe("Situação (previsão)");
  });

  it("continua listando marca a marca o que a revisão mudou", () => {
    const j = resposta({
      diff: {
        nIncluidas: 1, nRemovidas: 1, nAlteradas: 1,
        incluidas: [{ marca: "T102A1", peso: 13.26 }],
        removidas: [{ marca: "T102B43", peso: 5 }],
        alteradas: [{ marca: "T102A17", de: 91.12, para: 89.44 }],
      },
      criados: 1,
    });
    const aba = montarAbaRevisao({ sigla: "LE", j, revLabel: "R01" });
    expect(aba.find((l) => l[0] === "T102A1")).toEqual(["T102A1", "INCLUÍDA", "", 13.26]);
    expect(aba.find((l) => l[0] === "T102A17")).toEqual(["T102A17", "ALTERADA", 91.12, 89.44]);
    expect(aba.find((l) => l[0] === "T102B43")).toEqual(["T102B43", "REMOVIDA", 5, ""]);
  });

  it("serve para a LPC também, com o nome certo", () => {
    const aba = montarAbaRevisao({ sigla: "LPC", j: resposta(), revLabel: "R02" });
    expect(linha(aba, "Tipo")[1]).toContain("LPC");
    expect(linha(aba, "Revisão")[1]).toBe("R02");
  });

  it("resposta sem diff nenhum não quebra a geração do arquivo", () => {
    const aba = montarAbaRevisao({ sigla: "LE", j: { opNumero: "102" }, revLabel: null });
    expect(linha(aba, "Previsto (antes de gravar)")[1]).toContain("0 a incluir");
  });
});

describe("alertaDeDivergencia", () => {
  it("silencia quando tudo bateu", () => {
    expect(alertaDeDivergencia({ previu: 18, criou: 18, ignorou: 0 })).toBe("");
  });

  it("avisa quando o import gravou MAIS do que devia", () => {
    expect(alertaDeDivergencia({ previu: 2, criou: 5, ignorou: 0 })).toContain("mais do que o esperado");
  });

  it("no modo sobrescrever o esperado é o arquivo inteiro, não a previsão", () => {
    expect(alertaDeDivergencia({ previu: 18, criou: 77, ignorou: 0, sobrescrever: true, totalNoArquivo: 77 })).toBe("");
    expect(alertaDeDivergencia({ previu: 18, criou: 18, ignorou: 0, sobrescrever: true, totalNoArquivo: 77 }))
      .toContain("59 NÃO entrou");
  });

  it("conta as linhas ignoradas", () => {
    expect(alertaDeDivergencia({ previu: 3, criou: 3, ignorou: 4 })).toContain("4 linha(s) do arquivo foram ignoradas");
  });

  // As marcas que a outra lista já tinha são a explicação mais comum de "previu e não gravou".
  it("nomeia as marcas que já existiam pela outra lista", () => {
    const a = alertaDeDivergencia({ previu: 2, criou: 0, ignorou: 2, jaNaOutraLista: ["T102A1", "T102A2"] });
    expect(a).toContain("T102A1, T102A2");
  });

  it("corta a lista longa em vez de despejar centenas de marcas no arquivo", () => {
    const muitas = Array.from({ length: 50 }, (_, i) => `M${i}`);
    const a = alertaDeDivergencia({ previu: 50, criou: 0, ignorou: 0, jaNaOutraLista: muitas });
    expect(a).toContain("…");
    expect(a).not.toContain("M25");
  });

  // ⚠ Sem "sobrescrever" o import NÃO apaga — cobrar a remoção marcaria o normal como defeito.
  it("não cobra remoção: a lista de removidas é aviso, não promessa", () => {
    expect(alertaDeDivergencia({ previu: 0, criou: 0, ignorou: 0 })).toBe("");
  });
});

describe("divergencia — o mesmo aviso, direto da resposta do import", () => {
  it("lê os números da resposta sem quem chama ter que desmontá-la", () => {
    expect(divergencia(resposta({ criados: 0 }))).toContain("18 NÃO entrou");
  });

  it("carrega o modo junto — a tela sabe se marcou sobrescrever", () => {
    expect(divergencia(resposta({ criados: 77, atualizados: 0 }), true)).toBe("");
  });

  it("resposta nula não quebra a tela", () => {
    expect(divergencia(null)).toBe("");
    expect(divergencia(undefined)).toBe("");
  });
});
