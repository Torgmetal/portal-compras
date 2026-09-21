import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
import { PUT } from "@/app/api/comercial/op/[id]/contatos/route";

// Editar a LISTA de contatos do cliente na própria OP (nome, função, e-mail, telefones).
// Os acessos (papéis) continuam no PATCH; aqui a lista inteira, como a tela mostra.
const req = (body) => new Request("http://localhost/api/comercial/op/op1/contatos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = { params: { id: "op1" } };
const atuais = [
  { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", papeis: ["FATURAMENTO"] },
  { nome: "Charlie Azevedo", email: "charlie.azevedo@tmsa.ind.br", apenasConsulta: true },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Vitor" });
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "122", clienteContatos: atuais });
  mockPrisma.oP.update.mockImplementation(async ({ data }) => ({ id: "op1", ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("PUT /api/comercial/op/[id]/contatos", () => {
  it("acrescenta um contato, corrige um e-mail e PRESERVA papéis e restrições de quem ficou", async () => {
    const r = await PUT(req({ contatos: [
      { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", funcao: "Gerente de projeto" },
      { nome: "Charlie Azevedo", email: "charlie.azevedo@tmsa.com.br", emailAnterior: "charlie.azevedo@tmsa.ind.br" },
      { nome: "Elaine Hendler", email: "Elaine.Hendler@tmsa.ind.br", telefone: "(51) 3333-0000" },
    ] }), params);
    expect(r.status).toBe(200);
    const { contatos } = await r.json();
    expect(contatos).toEqual([
      { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", papeis: ["FATURAMENTO"], funcao: "Gerente de projeto" },
      { nome: "Charlie Azevedo", email: "charlie.azevedo@tmsa.com.br", apenasConsulta: true },
      { nome: "Elaine Hendler", email: "elaine.hendler@tmsa.ind.br", telefone: "(51) 3333-0000" },
    ]);
    expect(mockPrisma.oP.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "op1" }, data: { clienteContatos: contatos } }));
    const aud = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(aud).toMatchObject({ action: "EDITAR_CONTATOS_CLIENTE", entity: "OP", entityId: "op1" });
    expect(aud.diff.antes).toHaveLength(2);
    expect(aud.diff.depois).toHaveLength(3);
  });

  it("quem não está na lista enviada sai (é assim que se remove)", async () => {
    const r = await PUT(req({ contatos: [{ nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br" }] }), params);
    expect(r.status).toBe(200);
    expect((await r.json()).contatos.map((c) => c.email)).toEqual(["rogerio.porsch@tmsa.ind.br"]);
  });

  it("e-mail inválido é 400 com a mensagem do campo, e nada grava", async () => {
    const r = await PUT(req({ contatos: [{ nome: "X", email: "sem-arroba" }] }), params);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/e-mail/i);
    expect(mockPrisma.oP.update).not.toHaveBeenCalled();
  });

  it("exige Comercial/Planejamento/Admin", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    const r = await PUT(req({ contatos: [] }), params);
    expect(r.status).toBe(403);
  });
});
