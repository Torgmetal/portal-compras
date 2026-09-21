// Casamento marca × conjunto do IFC — OP-085 (14/09/2026): o modelo é de antes da LPC R01, que
// renumerou os guarda-corpos; pela tag, 19 marcas levavam a peça vizinha.
import { describe, expect, it } from "vitest";
import { casarMarcas } from "@/lib/carga/geometria-ifc";
import { ehGC } from "@/lib/carga/classificar";

const ifc = [
  { id: 1, tag: "IPPE1100P6", nome: "CORRIMAO 3121MM" }, // na lista, 3121 é o P5
  { id: 2, tag: "IPPE1100P7", nome: "CORRIMAO 2081MM" }, // na lista, 2081 é o P6
  { id: 3, tag: "IPPE1100P8", nome: "CORRIMAO 840MM" },  // na lista, 840 é o P7
  { id: 4, tag: "IPPE1101P4", nome: "CORRIMAO 3175MM" }, // igual nos dois
  { id: 5, tag: "T97A1", nome: "VIGA" }, { id: 6, tag: "T97A2", nome: "VIGA" },
  { id: 7, tag: "T97B9", nome: "ESCADA MARINHEIRO" },
];

describe("casarMarcas", () => {
  it("tag com o mesmo nome: é ela; tag com outro nome: vale o conjunto com o nome da lista", () => {
    const { instancia, porNome } = casarMarcas(ifc, [
      { marca: "IPPE1101P4", desc: "CORRIMAO 3175MM" },
      { marca: "IPPE1100P7", desc: "CORRIMAO 840MM" },
      { marca: "IPPE1100P5", desc: "CORRIMAO 3121MM" }, // tag nem existe no IFC
    ]);
    expect(instancia.get("IPPE1101P4")).toBe(4);
    expect(instancia.get("IPPE1100P7")).toBe(3);
    expect(instancia.get("IPPE1100P5")).toBe(1);
    expect(porNome).toEqual(["IPPE1100P7", "IPPE1100P5"]);
  });
  it("nome genérico não casa: 'VIGA' sem tag fica de fora (medida pelo peso), nome único casa", () => {
    const { instancia, porNome } = casarMarcas(ifc, [{ marca: "T97A5", desc: "VIGA" }, { marca: "T97B10", desc: "ESCADA MARINHEIRO" }]);
    expect(instancia.has("T97A5")).toBe(false);
    expect(instancia.get("T97B10")).toBe(7);
    expect(porNome).toEqual(["T97B10"]);
  });
  it("sem descrição (chamada antiga, só a marca) continua casando pela tag", () => {
    const { instancia, porNome } = casarMarcas(ifc, ["IPPE1100P7", "T97A1"]);
    expect(instancia.get("IPPE1100P7")).toBe(2);
    expect(instancia.get("T97A1")).toBe(5);
    expect(porNome).toEqual([]);
  });
  it("tag existe com outro nome e nada casa pelo nome: fica a tag mesmo", () => {
    const { instancia, porNome } = casarMarcas(ifc, [{ marca: "IPPE1100P6", desc: "CORRIMAO 9999MM" }]);
    expect(instancia.get("IPPE1100P6")).toBe(1);
    expect(porNome).toEqual([]);
  });
});

it("corrimão é guarda-corpo para o simulador (DANPOWER chama o painel de CORRIMAO)", () => {
  expect(ehGC({ desc: "CORRIMAO 2030MM" })).toBe(true);
  expect(ehGC({ desc: "ACESSOS -CORRIMAO DIREITO" })).toBe(true);
  expect(ehGC({ desc: "VIGA" })).toBe(false);
});
