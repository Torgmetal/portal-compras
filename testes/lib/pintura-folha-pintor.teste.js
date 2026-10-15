// A folha do pintor, sozinha, na aba Qualidade da OP (Vitor, 15/10/2026): "o ideal seria trazer as informações
// para o pintor, as demais páginas podem ser geradas apenas na produção". Sem a folha 2 por perto, os números
// saem CALCULADOS (não fórmula apontando para outra aba) — a mesma conta: úmida = seca × (100 + %dil) ÷ SV.
import { describe, it, expect } from "vitest";
import { linhasDoPintor } from "@/lib/pintura-folha-pintor";

const d = {
  demaos: [
    { ordem: 1, camada: "Fundo", produto: "W-POXI ZSP 315", cor: "Cinza", secagem: "8 h" },
    { ordem: 2, camada: "Acabamento", produto: "INDUSTHANE RHB DF", cor: "Preto N1", secagem: null },
  ],
  camadas: [
    { ordem: 1, seca: 80, sv: 64, diluicaoPct: 10 },
    { ordem: 2, seca: 50, sv: null, diluicaoPct: 5 },
  ],
};

describe("folha do pintor com os valores calculados", () => {
  it("diluente, espessura úmida e secagem por demão", () => {
    const [a] = linhasDoPintor(d);
    expect(a).toMatchObject({ titulo: "Demão 1 — Fundo", produto: "W-POXI ZSP 315", cor: "Cinza", diluente: "10%", umida: "138 µm", secagem: "8 h" });
  });
  it("o que falta diz de onde vem — sem inventar número", () => {
    const [, b] = linhasDoPintor(d);
    expect(b.umida).toMatch(/falta.*sólidos/i);
    expect(b.secagem).toMatch(/falta.*PLP/i);
    expect(b.diluente).toBe("5%");
  });
  it("demão sem produto no PLP avisa", () => {
    expect(linhasDoPintor({ demaos: [{ ordem: 1 }], camadas: [{}] })[0].produto).toMatch(/PLP/);
  });
});
