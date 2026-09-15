import { it, expect, vi, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { comporRastreio, chaveRastreio } from "@/lib/rastreio-lpc";

// A OP-113 como o carimbo do desenho a vê: uma posição já cortada (fato), uma de perfil amarrado à
// mão e uma de material comprado para a obra (NA_OP). Conjunto não tem perfil → sem R.
const res = {
  porMarca: new Map([["T113A-P1", { perfil: "W200X15", situacao: "R_DEFINIDO", usadas: [{ rastreio: "261372", corrida: "27155488", certificado: "8191414098" }] }]]),
  porMarcaPerfil: new Map([["T113A-P1|W200X15", { perfil: "W200X15", situacao: "R_DEFINIDO", usadas: [{ rastreio: "261372", corrida: "27155488", certificado: "8191414098" }] }]]),
  marcasAmbiguas: new Set(),
};
const amarradas = new Map([["CH12.50X140", { r: "260618", por: "Vitor" }]]);
const obra = new Map([["U75X40X2.25", { r: "261200", motivo: "material da obra" }]]);
const cmrPorR = new Map([["260618", { corrida: "28157033", certificado: "8188844432" }], ["261200", { corrida: "28159056", certificado: null }]]);
const pecas = [
  { marca: "T113A1", perfil: null },
  { marca: "T113A-P1", perfil: "W200X15" },
  { marca: "T113A-P2", perfil: "CH12.50X140" },
  { marca: "T113A-P3", perfil: "U75X40X2.25" },
  { marca: "T113A-P4", perfil: "L2''X1/8''" },
];

describe("comporRastreio — os três caminhos do carimbo", () => {
  const m = comporRastreio(pecas, { res, amarradas, obra, cmrPorR });
  it("corte é fato e vem com a corrida do próprio CMR", () => {
    expect(m.get(chaveRastreio("T113A-P1", "W200X15"))).toEqual({ r: "261372", corrida: "27155488", certificado: "8191414098", origem: "corte" });
  });
  it("amarração à mão vale para o perfil, com a corrida completada pelo R", () => {
    expect(m.get(chaveRastreio("T113A-P2", "CH12.50X140"))).toEqual({ r: "260618", corrida: "28157033", certificado: "8188844432", origem: "amarracao" });
  });
  it("material da própria obra (NA_OP) é o terceiro caminho", () => {
    expect(m.get(chaveRastreio("T113A-P3", "U75X40X2.25"))).toMatchObject({ r: "261200", corrida: "28159056", origem: "obra" });
  });
  it("sem material definido não inventa R; conjunto (sem perfil) não entra", () => {
    expect(m.has(chaveRastreio("T113A-P4", "L2''X1/8''"))).toBe(false);
    expect(m.has(chaveRastreio("T113A1", ""))).toBe(false);
  });
  it("corrida 'N/A' do CMR sai vazia, nunca como texto para o cliente", () => {
    const m3 = comporRastreio([{ marca: "T113A-P9", perfil: "CH8.00X246" }], { res: { porMarca: new Map([["T113A-P9", { perfil: "CH8.00X246", usadas: [{ rastreio: "250462", corrida: "N/A" }] }]]), porMarcaPerfil: new Map(), marcasAmbiguas: new Set() } });
    expect(m3.get(chaveRastreio("T113A-P9", "CH8.00X246"))).toMatchObject({ r: "250462", corrida: null });
  });
  it("corte ganha da amarração quando os dois existem", () => {
    const m2 = comporRastreio([{ marca: "T113A-P1", perfil: "W200X15" }], { res, amarradas: new Map([["W200X15", { r: "999999" }]]), obra, cmrPorR });
    expect(m2.get(chaveRastreio("T113A-P1", "W200X15")).r).toBe("261372");
  });
});
