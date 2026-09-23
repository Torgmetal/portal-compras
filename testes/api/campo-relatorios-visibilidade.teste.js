import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), envios: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { relatorioInspecao: { findMany: mocks.findMany }, envioAssinatura: { findMany: mocks.envios } } }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.requireRole }));

import { GET } from "@/app/api/campo/relatorios/route";

describe("relatórios visíveis no portal de campo", () => {
  beforeEach(() => {
    mocks.requireRole.mockReset().mockResolvedValue({ id: "lais" });
    mocks.findMany.mockReset().mockResolvedValue([{ id: "r1", codigo: "RUS-113-001", tipo: "ULTRASSOM",
      titulo: null, marcas: ["T113A1"], linhas: [], inspetor: "Laís", createdAt: new Date(), revisao: 0,
      resultadoInspecao: "APROVADO", envioAssinaturaId: "envio-1", status: "EMITIDO" }]);
  });

  // ⚠ reescrito em 23/09/2026: "emitido = só consulta" era a regra até 22/09. Desde então o enviado
  // para assinatura continua editável (Vitor: "não precisa gerar revisão, pode apenas alterar as
  // informações"); só o CONCLUÍDO — todos assinaram — segue em consulta no celular.
  it("lista o relatório concluído (todos assinaram) e o marca para abrir em consulta", async () => {
    mocks.envios.mockResolvedValue([{ id: "envio-1", status: "CONCLUIDO" }]);
    const res = await GET(new Request("http://localhost/api/campo/relatorios?opNumero=113"));
    const body = await res.json();
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ opNumero: "113" });
    expect(body.relatorios[0]).toMatchObject({ id: "r1", assinado: true, somenteLeitura: true, status: "EMITIDO" });
  });

  it("assinatura em andamento: abre para completar, sinalizado como em assinatura", async () => {
    mocks.envios.mockResolvedValue([{ id: "envio-1", status: "EM_ANDAMENTO" }]);
    const body = await (await GET(new Request("http://localhost/api/campo/relatorios?opNumero=102"))).json();
    expect(body.relatorios[0]).toMatchObject({ assinado: true, somenteLeitura: false });
  });

  it("sem envio não consulta a tabela de envios", async () => {
    mocks.findMany.mockResolvedValue([{ id: "r2", codigo: "RIP-102-001", tipo: "PINTURA", titulo: null, marcas: [],
      linhas: [], inspetor: null, createdAt: new Date(), revisao: 0, resultadoInspecao: null, envioAssinaturaId: null, status: "RASCUNHO" }]);
    mocks.envios.mockReset();
    const body = await (await GET(new Request("http://localhost/api/campo/relatorios?opNumero=102"))).json();
    expect(mocks.envios).not.toHaveBeenCalled();
    expect(body.relatorios[0]).toMatchObject({ assinado: false, somenteLeitura: false });
  });
});
