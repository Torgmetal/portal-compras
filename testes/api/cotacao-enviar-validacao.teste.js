import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/cotacao-estoque", () => ({ calcularAbatimentoEstoque: vi.fn() }));
vi.mock("@/lib/faturamento-direto", () => ({ mapearFDPorRM: vi.fn(), itemEhFD: vi.fn() }));

import { POST as enviar } from "@/app/api/cotacao/enviar/route";

// "Não estamos conseguindo enviar a cotação" (Vitor, 21/09/2026). Um dos dois caminhos: cadastro
// importado do Omie com DOIS e-mails no mesmo campo — o servidor recusava, certo, mas com o despejo
// JSON do Zod na tarja vermelha. Quem está no modal precisa ler QUAL fornecedor e o que corrigir.

const req = (body) =>
  new Request("http://localhost/api/cotacao/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", email: "compras@torg.com.br" });
});

describe("validação do corpo — a mensagem nomeia o fornecedor", () => {
  it("dois e-mails no mesmo campo: 400 com o nome e o valor, sem JSON do Zod", async () => {
    const r = await enviar(req({
      rmIds: ["rm1"],
      itensIds: ["it1"],
      fornecedores: [
        { fornecedorId: "f3", nome: "COMERCIAL ARARENSE LTDA", email: "fabiano@comercialararense.com.br" },
        { fornecedorId: "f2", nome: "ARCELORMITTAL BRASIL S.A.", email: "equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br" },
      ],
    }));
    expect(r.status).toBe(400);
    const { error } = await r.json();
    expect(error).toContain('E-mail inválido no fornecedor "ARCELORMITTAL BRASIL S.A."');
    expect(error).toContain("equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br");
    expect(error).not.toMatch(/"code"|"path"|\[\s*\{/);
    expect(mockPrisma.rM.findMany).not.toHaveBeenCalled();
  });

  it("outro campo errado continua explicado, com o caminho", async () => {
    const r = await enviar(req({ rmIds: ["rm1"], itensIds: [], fornecedores: [{ nome: "X", email: "x@y.com" }] }));
    expect(r.status).toBe(400);
    const { error } = await r.json();
    expect(error).toMatch(/^Dados inválidos em itensIds: /);
  });

  it("corpo que não é JSON não vira 500", async () => {
    const r = await enviar(new Request("http://localhost/api/cotacao/enviar", { method: "POST", body: "isto não é json" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/^Dados inválidos/);
  });
});
