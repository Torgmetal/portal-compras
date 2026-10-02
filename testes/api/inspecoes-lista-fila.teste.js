// Verificação das travas (02/10/2026): a lista de Inspeções trazia só os 100 relatórios MAIS RECENTES — e é nela
// que fica o único botão de enviar para assinatura. Do 101º em diante, um relatório ainda em andamento, aprovado
// sem envio ou com assinatura pendente sumia da tela e não tinha por onde seguir. Agora o que ainda dá trabalho
// vem sempre; os 100 recentes continuam vindo como histórico.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", tipo: "ADMIN", modulos: ["QUALIDADE"] }) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ criarRelatorio: vi.fn(), vincularNoDataBook: vi.fn() }));
import { GET as lista } from "@/app/api/qualidade/inspecoes/route";

const dia = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000);
const recentes = Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, codigo: `RID-1-${i}`, resultadoInspecao: "APROVADO", envioAssinaturaId: `env-ok-${i}`, createdAt: dia(200 + i) }));
const antigoPendente = { id: "velho", codigo: "RIP-089-001", resultadoInspecao: null, envioAssinaturaId: null, createdAt: dia(1) };
const antigoAssinando = { id: "velho2", codigo: "RIP-089-002", resultadoInspecao: "APROVADO", envioAssinaturaId: "env-aberto", createdAt: dia(2) };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.fotoInspecao.groupBy.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  mockPrisma.envioAssinatura.findMany.mockResolvedValue([{ id: "env-aberto" }]);
  mockPrisma.relatorioInspecao.findMany.mockImplementation(async ({ where = {}, take }) => {
    if (where.OR) return [antigoPendente, antigoAssinando, recentes[0]]; // a fila (o que ainda dá trabalho)
    return recentes.slice(0, take ?? 100);
  });
});

it("relatório antigo em andamento ou com assinatura aberta vem mesmo fora dos 100 mais recentes — sem repetir", async () => {
  const j = await (await lista(new Request("http://x/api/qualidade/inspecoes"))).json();
  const ids = j.relatorios.map((r) => r.id);
  expect(ids).toContain("velho");
  expect(ids).toContain("velho2");
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(102);
  expect(ids.at(-1)).toBe("velho"); // do mais novo para o mais antigo
});
