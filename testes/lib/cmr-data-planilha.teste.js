// ⚠⚠ DIA E MÊS TROCADOS NA PLANILHA (05/10/2026). O portal escrevia a data como TEXTO "05/10/2026";
// o Excel lê texto de data no padrão americano (mês/dia) e guardava 10 de MAIO. Na sincronização
// seguinte "a planilha manda" e os 43 R do pedido 2054 voltaram ao portal com 10/05/2026 — e já
// tinha acontecido em 22/09. ISO (aaaa-mm-dd) o Excel lê do mesmo jeito em qualquer idioma.
import { describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ getAccessToken: async () => "tok" }));
import { celulasDaLinha } from "@/lib/cmr-sharepoint";

describe("data na planilha CMR", () => {
  it.each([
    [new Date(Date.UTC(2026, 9, 5, 12)), "2026-10-05"],
    ["05/10/2026", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    [46300, "2026-10-05"],
  ])("%s vai como %s, nunca dd/mm em texto", (entrada, esperado) => {
    expect(celulasDaLinha({ descricao: "X", dataRecebimento: entrada })[7]).toBe(esperado);
  });
  it("sem data: célula vazia", () => expect(celulasDaLinha({ descricao: "X" })[7]).toBe(""));
});
