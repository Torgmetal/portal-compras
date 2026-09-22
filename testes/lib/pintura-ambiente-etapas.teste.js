import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { ETAPAS_AMBIENTE, leiturasAmbientais, ambientePorEtapa } from "@/lib/pintura-campos";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";

// CONDIÇÃO AMBIENTAL É POR ETAPA — jato, fundo e demais demãos.
//
// Vitor (22/09/2026): "nas informações de temperatura e umidade que seriam as condições ambientais,
// precisas que tenha o campo para informarmos tanto no jato, quanto no fundo quanto nas demais
// demãos". O portal tinha UM bloco (prepUmidade/prepTAmb/prepTSup/prepOrvalho) e o PDF repetia esse
// mesmo trio em todas as colunas: o RIP-102-002 declarava as mesmas 41% / 24 °C / 23 °C no
// jateamento do dia 17 de manhã, no fundo do dia 17 à tarde e na 2ª demão do dia 18.

const JATO = { prepUmidade: "41", prepTAmb: "24", prepTSup: "23", prepOrvalho: "9.9", tempo: "Bom" };

describe("as leituras de cada etapa", () => {
  it("tem as quatro etapas do PO-05: jato, fundo e as duas demãos seguintes", () => {
    expect(ETAPAS_AMBIENTE.map((e) => e.id)).toEqual(["jato", "1", "2", "3"]);
    expect(ETAPAS_AMBIENTE[1].rot).toMatch(/fundo/i);
  });

  it("a demão com leitura própria NÃO herda a do jateamento", () => {
    const res = { ...JATO, demaos: { "1": { produto: "W-POXI", umidade: "55", tAmb: "31", tSup: "34", orvalho: "20" } } };
    const l = leiturasAmbientais(res, "1");
    expect(l).toMatchObject({ umidade: "55", tAmb: "31", tSup: "34", orvalho: "20" });
    expect(l.herdado).toBe(false);
  });

  it("a demão sem leitura própria herda a do jateamento — e diz que herdou", () => {
    const res = { ...JATO, demaos: { "2": { produto: "W-POLI" } } };
    const l = leiturasAmbientais(res, "2");
    expect(l).toMatchObject({ umidade: "41", tAmb: "24" });
    expect(l.herdado).toBe(true);
  });

  it("demão que ninguém aplicou não herda nada — coluna vazia não é registro de ensaio", () => {
    const l = leiturasAmbientais({ ...JATO, demaos: {} }, "3");
    expect(l.umidade).toBe(null);
    expect(l.herdado).toBe(false);
  });

  it("julga cada etapa com a regra do item 5.4, uma a uma", () => {
    const res = {
      ...JATO,
      demaos: {
        "1": { produto: "W-POXI" },
        "2": { produto: "W-POLI", umidade: "92", tAmb: "24", tSup: "23", orvalho: "9.9" },
      },
    };
    const etapas = ambientePorEtapa(res);
    expect(etapas.map((e) => e.id)).toEqual(["jato", "1", "2"]);
    expect(etapas[0].avaliacao.permitido).toBe(true);
    expect(etapas[1].avaliacao.permitido).toBe(true);
    expect(etapas[2].avaliacao.permitido).toBe(false);
    expect(etapas[2].avaliacao.impedimentos.join(" ")).toMatch(/umidade/i);
  });
});

it("o PDF leva a leitura de cada etapa e aponta a etapa que estava fora do PO-05", async () => {
  const resultados = {
    ...JATO,
    laudo: "Aprovado",
    demaos: {
      "1": { produto: "W-POXI", umidade: "55", tAmb: "31", tSup: "34", orvalho: "20" },
      "2": { produto: "W-POLI", umidade: "92", tAmb: "24", tSup: "23", orvalho: "9.9" },
    },
  };
  const pdf = await gerarPinturaPDF({ rel: { codigo: "RIP-102-002", opNumero: "102", revisao: 0, resultados } });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  const limpo = text.replace(/\s+/g, " ");
  for (const v of ["55", "31", "34", "20", "92"]) expect(limpo).toContain(v);
  // ⚠ o aviso nomeia a ETAPA: julgar só o jateamento deixava passar exatamente este caso
  expect(limpo).toMatch(/Fora do PO-05 \(5\.4\) na 2ª demão/i);
  expect(limpo).toMatch(/[Uu]midade relativa acima de 85%/);
  expect(limpo).toContain("UMIDADE NO JATO");
});
