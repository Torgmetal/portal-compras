import { it, expect } from "vitest";
import { faseDaPeca, ordenarFases, rotuloFase } from "@/lib/fase-peca";
import { marcaEhAC } from "@/lib/marca-ac";

it("a frente da LPC manda na fase; sem letra, vale a marca", () => {
  expect(faseDaPeca({ opNumero: "T89C", marca: "T89A1" }, "089")).toBe("C");
  expect(faseDaPeca({ opNumero: "089", marca: "T89A1" }, "089")).toBe("A");
  expect(faseDaPeca({ opNumero: "097", marca: "T97B12" }, "097")).toBe("B");
  expect(faseDaPeca({ opNumero: "T92", marca: "T92A3" }, "092")).toBe("A");
  expect(faseDaPeca({ opNumero: "089", marca: "T89-AC1" }, "089")).toBe("?");
});

it("ordena A, B, C e deixa 'sem fase' por último, sem repetir", () => {
  expect(ordenarFases(["C", "?", "A", "C", "B", null])).toEqual(["A", "B", "C", "?"]);
  expect(rotuloFase("A")).toBe("Fase A");
  expect(rotuloFase("?")).toBe("Sem fase");
});

it("marca AC com hífen (LE da OP-089) é acessório", () => {
  expect(marcaEhAC("T89-AC1")).toBe(true);
  expect(marcaEhAC("T89AC12")).toBe(true);
  expect(marcaEhAC("T89A1")).toBe(false);
  expect(marcaEhAC("T89ACESSO")).toBe(false);
});
