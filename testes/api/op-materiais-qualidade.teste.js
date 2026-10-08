// Matheus (08/10/2026): o Geraldo (qualidade@) via a aba Compras da OP e tomava "Erro ao carregar
// materiais — Forbidden". A Qualidade passa a ler os materiais com a mesma visão do Almoxarifado:
// o que foi comprado, sem os valores de estoque.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (roles) => {
    if (!roles.includes("QUALIDADE")) throw new Error("Forbidden");
    return { id: "q", tipo: "USUARIO", modulos: ["QUALIDADE", "PCP"] };
  }),
}));
import { GET } from "@/app/api/op/[id]/materiais/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({
    id: "op1", numero: "94", cliente: "X",
    rms: [{ id: "rm1", numero: "RM-1", itens: [{
      id: "i1", descricao: "CH 12,5", unidade: "KG", qtd: 10, peso: 0, material: "A36", status: "ATENDIDO_ESTOQUE",
      atendidoEstoqueQtd: 10, atendidoEstoquePreco: 9.5, atendidoEstoqueTotal: 95, recebimentos: [], pedidoOmie: null,
    }] }],
  });
});

it("a Qualidade carrega os materiais da OP, sem os valores de estoque", async () => {
  const res = await GET(new Request("http://localhost/api/op/op1/materiais"), { params: Promise.resolve({ id: "op1" }) });
  const j = await res.json();
  expect(res.status).toBe(200);
  expect(j.success).toBe(true);
  expect(j.data.itens[0]).toMatchObject({ descricao: "CH 12,5", estoquePreco: null, estoqueTotal: null });
});
