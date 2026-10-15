// A folha do pintor, sozinha, na aba Qualidade da OP (Vitor, 15/10/2026), POR ESTRUTURA: "a tinta amarela recebe o
// primer e depois o acabamento amarelo, assim como a azul". E só sai com o PLP completo — senão diz o que falta.
import { describe, it, expect } from "vitest";
import { blocosDoPintor, bloqueioDaFolha } from "@/lib/pintura-folha-pintor";

const primer = { ordem: 1, camada: "Primer", produto: "Jotamastic 90", cor: "Cinza", umida: 313, diluicaoPct: 0, secagem: "4 h a 23 °C" };
const azul = { ordem: 3, camada: "Acabamento", produto: "Hardtop XP", cor: "Azul 2.5PB4/10", umida: 95, diluicaoPct: 5, secagem: "3,5 h" };
const amarelo = { ...azul, cor: "Amarelo 5Y 8/12" };
const d = {
  esquema: [
    { item: "Estruturas Metálicas", cor: "Azul 2.5PB4/10", demaos: [primer, azul], faltam: [] },
    { item: "Guarda Corpos", cor: "Amarelo 5Y 8/12", demaos: [primer, amarelo], faltam: [] },
  ],
  porCor: [{ cor: "Azul 2.5PB4/10", pecas: 40, m2: 300 }, { cor: "Amarelo 5Y 8/12", pecas: 12, m2: 45 }],
  problemasPlp: [],
};

describe("folha do pintor por estrutura", () => {
  it("cada estrutura com a sua sequência: primer e o acabamento da sua cor, numerados 1º e 2º", () => {
    const b = blocosDoPintor(d);
    expect(b.map((x) => x.titulo)).toEqual(["ESTRUTURAS METÁLICAS — Azul 2.5PB4/10", "GUARDA CORPOS — Amarelo 5Y 8/12"]);
    expect(b[1].demaos.map((m) => m.titulo)).toEqual(["1ª demão — Primer", "2ª demão — Acabamento"]);
    expect(b[1].demaos[1]).toMatchObject({ produto: "Hardtop XP", cor: "Amarelo 5Y 8/12", diluente: "5%", umida: "95 µm", secagem: "3,5 h" });
    expect(b[1].resumo).toMatch(/12 peça.*45/);
  });
  it("com problema no PLP a folha não sai e diz o porquê", () => {
    expect(bloqueioDaFolha({ ...d, problemasPlp: ["Demão 3: falta secagem."] })).toMatch(/PLP[\s\S]*Demão 3: falta secagem/);
    expect(bloqueioDaFolha(d)).toBeNull();
  });
});
