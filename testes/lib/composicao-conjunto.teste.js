// A composição de cada conjunto na Montagem (lib/composicao-conjunto.js) — Matheus (15/10/2026):
// busca por croqui/material e o cartão que abre as peças que compõem o conjunto, cortadas inclusive.
import { describe, it, expect } from "vitest";
import { composicaoDosConjuntos } from "@/lib/composicao-conjunto";

const lk = (conj, marca, perfil, qte, descricao = null) => ({ conjunto: { marca: conj }, croqui: { marca, perfil, descricao, qte } });

describe("composicaoDosConjuntos", () => {
  it("diz o que falta cortar e devolve a composição inteira com material e quantidade", () => {
    const links = [lk("A1", "A1-P1", "PL 12.5", 4), lk("A1", "A1-P2", "U200X60X6.35", 1)];
    const fila = new Map([["A1-P1", { marca: "A1-P1", qte: 4, qteProduzida: 2 }], ["A1-P2", { marca: "A1-P2", qte: 1, qteProduzida: 1 }]]);
    const r = composicaoDosConjuntos(links, fila).get("A1");
    expect(r.prontoMontar).toBe(false);
    expect(r.faltamCroquis).toEqual([{ marca: "A1-P1", descricao: null, faltaQtd: 2, qtd: 4 }]);
    expect(r.croquis).toEqual([{ marca: "A1-P1", material: "PL 12.5", qtd: 4 }, { marca: "A1-P2", material: "U200X60X6.35", qtd: 1 }]);
  });

  it("⚠⚠ croqui fora da fila (terceiro/comprado) mantém o material — a busca precisa achar o conjunto (Codex)", () => {
    const links = [lk("A1", "A1-P1", "PL 12.5", 4), lk("A1", "A1-P9", null, 2, "TB 3/4\" - DIN2440")];
    const fila = new Map([["A1-P1", { marca: "A1-P1", qte: 4, qteProduzida: 4 }]]); // A1-P9 não está na fila
    const r = composicaoDosConjuntos(links, fila).get("A1");
    expect(r.croquis.find((c) => c.marca === "A1-P9")).toEqual({ marca: "A1-P9", material: "TB 3/4\" - DIN2440", qtd: 2 });
  });

  it("todo cortado: pronto para montar, e a composição continua lá para abrir", () => {
    const links = [lk("B1", "B1-P1", "CH 6", 2)];
    const r = composicaoDosConjuntos(links, new Map([["B1-P1", { marca: "B1-P1", qte: 2, corteConcluidoEm: new Date() }]])).get("B1");
    expect(r).toMatchObject({ prontoMontar: true, faltamCroquis: [], totalCroquis: 1, croquis: [{ marca: "B1-P1", material: "CH 6", qtd: 2 }] });
  });
});
