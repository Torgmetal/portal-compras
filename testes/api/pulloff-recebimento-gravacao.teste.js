// Preencher só vale se GRAVA: as duas rotas têm lista fechada. Cada campo dos modelos de pull-off e de
// recebimento de tintas passa pelas duas, inclusive as listas (dollies, esquema, lotes) e o checklist.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH as patchPC } from "@/app/api/qualidade/inspecoes/[id]/route";
import { PATCH as patchCampo } from "@/app/api/campo/relatorios/[id]/route";
import { CAMPOS_CABECALHO_PULLOFF } from "@/lib/pulloff-campos";
import { CAMPOS_CABECALHO_RECEBIMENTO } from "@/lib/recebimento-tinta-campos";

const valorDe = (c) => (c.data ? "2026-10-01" : `v-${c.k}`);
const valores = (campos) => Object.fromEntries(campos.map((c) => [c.k, valorDe(c)]));
const DOLLIES = [{ adesao: "8,5", rompimento: "B 100%", falha: "Coesão" }, { adesao: "9", rompimento: "B/C", falha: "Adesão" }];
const LOTES = [{ lote: "8912-1", quantidade: "10 latas", fabricacao: "2026-03-15", validade: "2027-03-15" }];
const CHECK = { 1: "A", 2: "R", 3: "a", 9: "x" };

let rel;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo", tipo: "ADMIN", modulos: ["QUALIDADE"] });
  mocks.salvar.mockImplementation(async (r, dados) => (rel = { ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
});
const pc = (body) => patchPC(new Request("http://localhost/api/qualidade/inspecoes/r", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "r" }) });
const campo = (condicoes) => patchCampo(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ condicoes }) }), { params: { id: "r" } });

describe.each([
  ["PULL_OFF", "RPO-112-001", CAMPOS_CABECALHO_PULLOFF, { dollies: DOLLIES, esquema: ["120", "150", "60"] }],
  ["RECEBIMENTO_TINTA", "RRT-112-001", CAMPOS_CABECALHO_RECEBIMENTO, { lotes: LOTES, checklist: CHECK }],
])("relatório de %s", (tipo, codigo, campos, estrutura) => {
  beforeEach(() => { rel = { id: "r", codigo, opNumero: "112", tipo, revisao: 0, linhas: [], marcas: ["T112A1"], equipamentos: [], resultados: {}, envioAssinaturaId: null }; });
  const conferir = () => {
    const perdidos = campos.filter((c) => rel.resultados[c.k] !== valorDe(c)).map((c) => c.k);
    expect(perdidos).toEqual([]);
    if (estrutura.dollies) {
      expect(rel.resultados.dollies[1]).toMatchObject({ adesao: "9", rompimento: "B/C", falha: "Adesão" });
      expect(rel.resultados.dollies).toHaveLength(5);
      expect(rel.resultados.esquema).toEqual(["120", "150", "60"]);
    }
    if (estrutura.lotes) {
      expect(rel.resultados.lotes[0]).toMatchObject(LOTES[0]);
      expect(rel.resultados.lotes).toHaveLength(3);
      // só A ou R entra no checklist; o resto vira em branco
      expect(rel.resultados.checklist).toMatchObject({ 1: "A", 2: "R", 3: "A", 9: null });
    }
    expect(JSON.stringify(rel.resultados)).not.toContain("[object Object]");
  };
  it("o computador grava todo campo do modelo e as listas inteiras", async () => {
    expect((await pc({ resultados: { ...valores(campos), ...estrutura } })).status).toBe(200);
    conferir();
  });
  it("o celular grava todo campo do modelo e as listas inteiras", async () => {
    expect((await campo({ ...valores(campos), ...estrutura })).status).toBe(200);
    conferir();
  });
  it("data que não é data não entra (viraria \"Invalid Date\" no documento)", async () => {
    const k = campos.find((c) => c.data).k;
    await pc({ resultados: { [k]: "ontem" } });
    expect(rel.resultados[k]).toBeNull();
  });

  it("data impossível (30/02) também não entra — o Date do JS a viraria em 02/03 calado", async () => {
    const k = campos.find((c) => c.data).k;
    await pc({ resultados: { [k]: "2026-02-30", lotes: [{ lote: "L1", validade: "2026-02-30", fabricacao: "2026-02-28" }] } });
    expect(rel.resultados[k]).toBeNull();
    if (tipo === "RECEBIMENTO_TINTA") expect(rel.resultados.lotes[0]).toMatchObject({ lote: "L1", validade: null, fabricacao: "2026-02-28" });
  });
});

// ⚠ só as LISTAS: os campos de texto de todos os modelos passam pelo laço genérico da rota do celular (como já
// era para todo tipo — o cabeçalho do US também), e chegam nulos; isso não suja o documento
it("o celular grava só as listas do modelo do relatório — não amostras, testes, lotes e os nove itens dos outros três", async () => {
  rel = { id: "r", codigo: "RPO-112-001", opNumero: "112", tipo: "PULL_OFF", revisao: 0, linhas: [], marcas: ["T112A1"], equipamentos: [], resultados: {}, envioAssinaturaId: null };
  // é o que a tela do celular manda (lib/campo-condicoes devolve todas as chaves da família)
  await campo({ adesivo: "Araldite", dollies: [{ adesao: "8" }], esquema: ["120"], amostras: [], testes: [], lotes: [], checklist: {}, material: "", requisito: "" });
  expect(rel.resultados).toMatchObject({ adesivo: "Araldite" });
  for (const k of ["amostras", "testes", "lotes", "checklist"]) expect(rel.resultados, k).not.toHaveProperty(k);
  expect(rel.resultados.dollies[0]).toMatchObject({ adesao: "8" });
});

