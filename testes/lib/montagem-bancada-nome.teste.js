import { describe, it, expect } from "vitest";
import { BANCADAS, MONTADOR_DA_BANCADA, nomeDaBancada } from "@/lib/montagem-capacidade";
import { MONTADOR_DA_BANCADA as _m } from "@/lib/montagem-capacidade";
import { SOLDADOR_DA_BANCADA } from "@/lib/solda-capacidade";

/* Os nomes entraram trocados em 08/09/2026 — a lista do Vitor foi aplicada na ordem em que veio,
   sem conferir contra o apontamento. O erro só apareceu quando ele perguntou quanto o Adenilson
   montou no dia: o Syneco dizia MONTAGEM 3 e o quadro dizia que a 3 era do Vando. */
describe("o mapa da montagem segue o medido, não a ordem da lista", () => {
  it("cada uma das cinco bancadas tem o dono que aponta nela", () => {
    expect(nomeDaBancada("MONTAGEM 1")).toBe("Edivando Oliveira");
    expect(nomeDaBancada("MONTAGEM 2")).toBe("Jurandir Donizeti");
    expect(nomeDaBancada("MONTAGEM 3")).toBe("Adenilson Alves");
    expect(nomeDaBancada("MONTAGEM 4")).toBe("Julio Cesar");
    expect(nomeDaBancada("MONTAGEM 5")).toBe("Rodrigo Aparecido");
  });

  it("o Adenilson está na 3 — foi este o erro que motivou a correção", () => {
    expect(MONTADOR_DA_BANCADA["MONTAGEM 3"]).toMatch(/adenilson/i);
    expect(MONTADOR_DA_BANCADA["MONTAGEM 2"]).not.toMatch(/adenilson/i);
  });

  it("nenhuma bancada fica com o número na tela", () => {
    for (const b of BANCADAS) expect(nomeDaBancada(b)).not.toBe(b);
    expect(BANCADAS).toHaveLength(5);
  });

  it("um montador por bancada", () => {
    const nomes = Object.values(MONTADOR_DA_BANCADA);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("bancada fora da lista devolve a chave; vazio vira 'sem bancada'", () => {
    expect(nomeDaBancada("MONTAGEM 10")).toBe("MONTAGEM 10");
    expect(nomeDaBancada(null)).toBe("sem bancada");
    expect(nomeDaBancada(" montagem 4 ")).toBe("Julio Cesar");
  });
});

describe("montagem e solda não se confundem", () => {
  /* "Vando" é ambíguo na fábrica: EDVANDO DE OLIVEIRA PIRES monta na MONTAGEM 1 e VANDO MAXIMO
     RODRIGUES DE JESUS solda na SOLDA 4. São duas pessoas, e o nome curto casa com as duas. */
  it("o Vando da montagem é o Edivando; o da solda é o Vando Máximo", () => {
    expect(_m["MONTAGEM 1"]).toBe("Edivando Oliveira");
    expect(SOLDADOR_DA_BANCADA["SOLDA 4"]).toBe("Vando Máximo");
    expect(_m["MONTAGEM 1"]).not.toBe(SOLDADOR_DA_BANCADA["SOLDA 4"]);
  });

  it("ninguém aparece como dono de bancada nos dois setores ao mesmo tempo", () => {
    const m = new Set(Object.values(_m));
    for (const s of Object.values(SOLDADOR_DA_BANCADA)) expect(m.has(s)).toBe(false);
  });
});
