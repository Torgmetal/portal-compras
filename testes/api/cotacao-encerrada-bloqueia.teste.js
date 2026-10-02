import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// Cotação ENCERRADA (a RM virou Pedido gerado sem esta resposta — lib/cotacao-encerramento.js) não
// aceita mais nada pelo link: nem proposta, nem declínio, nem anexo. Matheus (02/10/2026).

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/omie-pedido-compra", () => ({ resolverFornecedorPorCnpj: vi.fn() }));
vi.mock("@/lib/email", () => ({ notificarEvento: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST as submeter } from "@/app/api/cotacao/submeter/[token]/route";
import { POST as declinar } from "@/app/api/cotacao/declinar/[token]/route";

const req = (url, body = {}) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.cotacao.findUnique.mockResolvedValue({ id: "cot1", token: "tk", status: "ENCERRADA", fornecedorNome: "GERDAU", itens: [{ id: "ci1" }] });
});

describe("cotação encerrada pelo pedido gerado", () => {
  it("não aceita proposta — 409 dizendo que foi encerrada", async () => {
    const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", {
      itens: [{ cotacaoItemId: "ci1", precoUnit: 6.41, qtdCotada: 10, icmsPct: 12, ipiPct: 0, semEstoque: false }],
      tipoFrete: "CIF", cnpj: "45.987.062/0001-77", numeroProposta: "1", prazoEntrega: "3 dias úteis", condicaoPagamento: "28",
    }), { params: { token: "tk" } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/encerrada/i);
    expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
  });

  it("não aceita declínio — e não grava nada", async () => {
    const r = await declinar(req("http://localhost/api/cotacao/declinar/tk"), { params: { token: "tk" } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/encerrada/i);
    expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
  });
});
