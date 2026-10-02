// As observações eram cortadas em 1000 caracteres pela rota do CELULAR — e a do computador não tinha limite.
// Como o celular devolve as observações em toda gravação, um texto longo escrito no computador perdia o fim
// na primeira medida lançada no pátio, sem aviso (verificação dos modelos, 02/10/2026). O mesmo teto agora
// nas duas rotas, folgado o bastante para nenhum relatório real.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH as patchPC } from "@/app/api/qualidade/inspecoes/[id]/route";
import { PATCH as patchCampo } from "@/app/api/campo/relatorios/[id]/route";
import { LIMITE_OBSERVACOES } from "@/lib/campo-condicoes";

let rel;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo", tipo: "ADMIN", modulos: ["QUALIDADE"] });
  mocks.salvar.mockImplementation(async (r, dados) => (rel = { ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  rel = { id: "r", codigo: "RLP-112-001", opNumero: "112", tipo: "LP", revisao: 0, linhas: [], marcas: ["T1"], equipamentos: [], resultados: {}, envioAssinaturaId: null };
});
const pc = (body) => patchPC(new Request("http://localhost/api/qualidade/inspecoes/r", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "r" }) });
const campo = (body) => patchCampo(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: { id: "r" } });

it("1500 caracteres escritos no computador sobrevivem a uma gravação pelo celular", async () => {
  const texto = "Observação de campo. ".repeat(75).trim(); // ~1.570
  expect((await pc({ observacoes: texto })).status).toBe(200);
  expect(rel.observacoes).toBe(texto);
  expect((await campo({ observacoes: rel.observacoes })).status).toBe(200);
  expect(rel.observacoes).toBe(texto);
});

it("as duas rotas têm o MESMO teto", async () => {
  const enorme = "x".repeat(LIMITE_OBSERVACOES + 50);
  await pc({ observacoes: enorme });
  expect(rel.observacoes).toHaveLength(LIMITE_OBSERVACOES);
  await campo({ observacoes: enorme });
  expect(rel.observacoes).toHaveLength(LIMITE_OBSERVACOES);
  expect(LIMITE_OBSERVACOES).toBeGreaterThanOrEqual(10000);
});
