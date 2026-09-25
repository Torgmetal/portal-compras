// Chapa de 10 mm é a de 3/8" (9,5) e a de 12 mm é a de 1/2" (12,5). Vitor (25/09/2026), no caso da
// OP-118 levantado pelo Gabriel (Engenharia): "mais um caso daquele de chapa com espessura diferente
// (…) nesse, não consigo nem procurar o R pra colocar igual o da 9.50mm". O modelo do Tekla escreve a
// espessura métrica; a chapa comprada é a da polegada. Mesmo mecanismo do 4,75 = 5,00 (OP-094, 08/09):
// PAR NOMEADO, com quem decidiu — não tolerância maior.
import { describe, it, expect } from "vitest";
import { casarPerfilComOmie } from "@/lib/casar-omie";

const casa = (perfil, descricao) => casarPerfilComOmie(perfil, [{ codigo: null, descricao }])?.descricao ?? null;
const CHAPA = (esp) => `CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA ${esp}MM`;

describe("chapa de espessura métrica × chapa comprada em polegada", () => {
  it("CH10.00 casa com a chapa de 9,50 (OP-118, T118B-P294 → R 261547)", () => {
    expect(casa("CH10.00X120", CHAPA("9,50"))).toBe(CHAPA("9,50"));
  });

  it("CH12.00 casa com a chapa de 12,50 (OP-118, T118B-P17 → R 261548)", () => {
    expect(casa("CH12.00X118", CHAPA("12,50"))).toBe(CHAPA("12,50"));
  });

  it("nos dois sentidos, e com a chapa escrita sem a palavra ESPESSURA", () => {
    expect(casa("CH9.50X118", CHAPA("10,00"))).not.toBeNull();
    expect(casa("CH10.00X120", "CHAPA LQ A36 9,5x1500x3000")).not.toBeNull();
  });

  it("é par nomeado, não tolerância maior: 10 não vira 9,0 nem 10,5", () => {
    expect(casa("CH10.00X120", CHAPA("9,00"))).toBeNull();
    expect(casa("CH10.00X120", CHAPA("10,50"))).toBeNull();
  });

  it("SÓ CHAPA: a barra chata de 10 continua diferente da de 9,5", () => {
    expect(casa("BC10X50", "BARRA CHATA ACO CARBONO 9,5 X 50MM")).toBeNull();
  });

  it("o par de 08/09 continua valendo: 5,00 = 4,75", () => {
    expect(casa("CH5.00X90", CHAPA("4,75"))).not.toBeNull();
  });
});
