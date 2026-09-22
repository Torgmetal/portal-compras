import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Lais" }) }));
import { PATCH } from "@/app/api/campo/relatorios/[id]/route";

// A MICRAGEM SECA MÍNIMA É DO RELATÓRIO, NÃO DA OBRA.
//
// Vitor (22/09/2026): "preciso que deixe o campo de micragem seca aberto para ajustar, pois temos
// espessuras diferentes para cada relatórios às vezes e hoje um deles está dando como reprovado".
// O valor nasce do PLP (a soma das demãos, uma por obra) e era só leitura no portal de campo: quem
// mede no galpão via a leitura acender vermelha contra um mínimo que não era o daquela peça.

let rel;
const patch = (condicoes) =>
  PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ condicoes }) }), { params: { id: "r" } });

beforeEach(() => {
  vi.clearAllMocks();
  rel = { id: "r", tipo: "PINTURA", marcas: ["P1"], linhas: [], equipamentos: [], resultados: { espessuraMinima: "220" } };
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("o celular ajusta a espessura mínima deste relatório", async () => {
  const r = await patch({ espessuraMinima: "80" });
  expect(r.status).toBe(200);
  expect(rel.resultados.espessuraMinima).toBe("80");
});

it("apagar o campo deixa o relatório sem mínimo — não volta para o do PLP escondido", async () => {
  await patch({ espessuraMinima: "" });
  expect(rel.resultados.espessuraMinima).toBe(null);
});

it("o que o celular não manda continua como estava", async () => {
  await patch({ poeira: "Ausente" });
  expect(rel.resultados).toMatchObject({ espessuraMinima: "220", poeira: "Ausente" });
});
