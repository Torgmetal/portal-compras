// As duas rotas de gravação dos relatórios cortavam em tamanhos diferentes (verificação de 02/10/2026):
// o computador guardava 12 instrumentos, só os com id, EPS até 30 e soldador até 40; o celular, 20
// instrumentos e 60 caracteres. Salvar no computador depois do celular cortava em silêncio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH as patchPC } from "@/app/api/qualidade/inspecoes/[id]/route";

let rel;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo", tipo: "ADMIN", modulos: ["QUALIDADE"] });
  mocks.salvar.mockImplementation(async (r, dados) => (rel = { ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  rel = { id: "r", codigo: "EVS-112-001", opNumero: "112", tipo: "VISUAL_SOLDA", revisao: 0, linhas: [], marcas: ["T112A1"], equipamentos: [], resultados: {}, envioAssinaturaId: null };
});
const pc = (body) => patchPC(new Request("http://localhost/api/qualidade/inspecoes/r", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "r" }) });

describe("o computador grava com os mesmos tetos do celular", () => {
  it("20 instrumentos, inclusive o lançado no celular sem id", async () => {
    const equipamentos = Array.from({ length: 20 }, (_, i) => ({ id: i === 7 ? null : `e${i}`, nome: `Instrumento ${i + 1}`, certificado: `C-${i}` }));
    expect((await pc({ equipamentos })).status).toBe(200);
    expect(rel.equipamentos).toHaveLength(20);
    expect(rel.equipamentos[7]).toMatchObject({ id: null, nome: "Instrumento 8" });
  });

  it("EPS e soldador até 60 caracteres, como o celular", async () => {
    const eps = "EPS 001/2025 - Processo FCAW com proteção gasosa (mistura)";
    const soldador = "S-02 EBERTON ALVES DOS SANTOS PEREIRA DA SILVA JUNIOR";
    expect((await pc({ linhas: [{ marca: "T112A1", eps, soldador, laudo: "A" }] })).status).toBe(200);
    expect(rel.linhas[0]).toMatchObject({ eps, soldador });
  });
});
