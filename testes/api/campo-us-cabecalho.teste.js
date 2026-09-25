// O celular grava TODO o cabeçalho do ultrassom (Vitor, 25/09/2026: "todos os campos precisamos
// deixar para ser possível ajustar"). A rota tem lista fechada do que aceita: o que fica fora dela
// é descartado em silêncio — era o caso de material e espessura.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Alexandre" }) }));
import { PATCH } from "@/app/api/campo/relatorios/[id]/route";
import { CAMPOS_CABECALHO_US } from "@/lib/us-campos";

let rel;
const patch = (condicoes) =>
  PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ condicoes }) }), { params: { id: "r" } });

beforeEach(() => {
  vi.clearAllMocks();
  rel = { id: "r", tipo: "ULTRASSOM", marcas: ["T113A1"], linhas: [], equipamentos: [], resultados: {} };
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("todo campo do cabeçalho do US é gravado pelo celular", async () => {
  const condicoes = Object.fromEntries(CAMPOS_CABECALHO_US.map((c) => [c.k, `v-${c.k}`]));
  const r = await patch(condicoes);
  expect(r.status).toBe(200);
  const perdidos = CAMPOS_CABECALHO_US.map((c) => c.k).filter((k) => rel.resultados[k] !== `v-${k}`);
  expect(perdidos).toEqual([]);
});

it("o desenho não é cortado em 120 caracteres — uma lista de desenhos voltaria pela metade", async () => {
  const lista = Array.from({ length: 30 }, (_, i) => `T113A${i + 1} R0`).join(", ");
  expect(lista.length).toBeGreaterThan(120);
  await patch({ desenho: lista });
  expect(rel.resultados.desenho).toBe(lista);
});
