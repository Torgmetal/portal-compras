import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", tipo: "ADMIN", modulos: ["QUALIDADE"] }) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ criarRelatorio: vi.fn(), vincularNoDataBook: vi.fn() }));
vi.mock("@/lib/relatorio-dimensional", () => ({ garantirDesenhos: vi.fn() }));
import { GET as lista } from "@/app/api/qualidade/inspecoes/route";
import { GET as detalhe } from "@/app/api/qualidade/inspecoes/[id]/route";

// A tela diz "Com a vez: Geraldo · na fila: Davi" a partir da ORDEM de cada assinatura (29/09/2026).
// Rota que não a pede ao banco faz a tela cair, calada, no "Falta assinar: Geraldo · Davi" — que
// parece dizer que o cliente já tem o convite. O mock devolve só o que foi pedido, como o Prisma.
const LINHAS = [{ envioId: "env1", nome: "Geraldo Tank", setor: "Torg Metal", email: "qualidade@torg.com.br", assinadoEm: null, ip: null, token: "t2", ordem: 201 }];
const comoPrisma = async ({ select }) => LINHAS.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => select?.[k])));

beforeEach(() => {
  vi.clearAllMocks();
  const rel = { id: "r1", codigo: "RIP-089-002", tipo: "PINTURA", opNumero: "089", envioAssinaturaId: "env1" };
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue([rel]);
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel);
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.fotoInspecao.groupBy.mockResolvedValue([]);
  mockPrisma.oP.findFirst.mockResolvedValue(null);
  mockPrisma.assinaturaDocumento.findMany.mockImplementation(comoPrisma);
});

it("a lista de inspeções traz a posição de cada assinatura na fila", async () => {
  const j = await (await lista(new Request("http://x/api/qualidade/inspecoes"))).json();
  expect(j.relatorios[0].assinaturas[0].ordem).toBe(201);
});

it("o detalhe do relatório também", async () => {
  const j = await (await detalhe(new Request("http://x"), { params: Promise.resolve({ id: "r1" }) })).json();
  expect(j.assinaturas[0].ordem).toBe(201);
});
