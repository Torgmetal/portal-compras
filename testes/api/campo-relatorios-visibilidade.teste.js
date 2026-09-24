import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { relatorioInspecao: { findMany: mocks.findMany } } }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.requireRole }));

import { GET } from "@/app/api/campo/relatorios/route";

describe("relatórios visíveis no portal de campo", () => {
  beforeEach(() => {
    mocks.requireRole.mockReset().mockResolvedValue({ id: "lais" });
    mocks.findMany.mockReset().mockResolvedValue([{ id: "r1", codigo: "RUS-113-001", tipo: "ULTRASSOM",
      titulo: null, marcas: ["T113A1"], linhas: [], inspetor: "Laís", createdAt: new Date(), revisao: 0,
      resultadoInspecao: "APROVADO", envioAssinaturaId: "envio-1", status: "EMITIDO" }]);
  });

  it("lista também o relatório emitido e o marca para abrir em consulta", async () => {
    const res = await GET(new Request("http://localhost/api/campo/relatorios?opNumero=113"));
    const body = await res.json();
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ opNumero: "113" });
    expect(body.relatorios[0]).toMatchObject({ id: "r1", somenteLeitura: true, status: "EMITIDO" });
  });
});
