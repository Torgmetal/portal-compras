import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH } from "@/app/api/qualidade/inspecoes/[id]/route";
import { LIMITE_VALOR_DEMAO } from "@/lib/pintura-campos";

// ⚠ LOTE E VALIDADE SÃO LISTAS: uma demão gasta mais de uma lata, e o celular grava "L1 · L2 · L3"
// com até 300 caracteres. A tela do computador cortava cada valor da demão em 60 — cinco latas já
// passam disso. Quem abrisse no computador um relatório preenchido no campo e só salvasse (para
// completar o horário final, por exemplo) perdia os últimos lotes sem aviso (29/09/2026).
const LOTES = ["4366598-1-*-1:2", "4371104-1-*-1:2", "4395411-1-*-1:2", "4382085-1-*-1:2", "4369046-1-*-1:3"].join(" · ");

const params = { params: Promise.resolve({ id: "r1" }) };
const req = (body) => new Request("http://localhost/api/qualidade/inspecoes/r1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rel = { id: "r1", codigo: "RIP-089-002", opNumero: "089", tipo: "PINTURA", revisao: 2, linhas: [], resultados: {}, marcas: ["T89C1"], envioAssinaturaId: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo" });
  mocks.salvar.mockImplementation(async (r, dados) => ({ ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
});

const demaoGravada = () => mocks.salvar.mock.calls.at(-1)[1].resultados.demaos["1"];

it("a lista de cinco lotes de uma demão chega inteira ao banco", async () => {
  expect(LOTES.length).toBeGreaterThan(60);
  const r = await PATCH(req({ resultados: { demaos: { 1: { loteA: LOTES, hIni: "08:00", hFim: "11:30" } } } }), params);
  expect(r.status).toBe(200);
  expect(demaoGravada()).toMatchObject({ loteA: LOTES, hIni: "08:00", hFim: "11:30" });
});

it("o teto é o mesmo do celular — e ainda existe", async () => {
  expect(LIMITE_VALOR_DEMAO).toBe(300);
  await PATCH(req({ resultados: { demaos: { 1: { loteA: "x".repeat(1000) } } } }), params);
  expect(demaoGravada().loteA).toHaveLength(LIMITE_VALOR_DEMAO);
});
