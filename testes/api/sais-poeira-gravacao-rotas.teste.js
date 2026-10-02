// "Garanta que todos os campos de informações tenham como preencher" (Vitor, 02/10/2026) — e preencher
// só vale se GRAVA. As duas rotas têm lista fechada do que aceitam; aqui cada campo dos modelos de sais e
// de poeira passa pelas duas, inclusive as amostras e os testes (listas), e volta inteiro.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH as patchPC } from "@/app/api/qualidade/inspecoes/[id]/route";
import { PATCH as patchCampo } from "@/app/api/campo/relatorios/[id]/route";
import { CAMPOS_CABECALHO_SAIS } from "@/lib/sais-campos";
import { CAMPOS_CABECALHO_POEIRA } from "@/lib/poeira-campos";

const AMOSTRAS = [{ condAgua: "1,1", condAmostra: "12", densidade: "", hora: "09:10" }, { condAgua: "1", condAmostra: "9,5", densidade: "10,2", hora: "09:25" }];
const TESTES = [{ local: "Alma", quantidade: "1", tamanho: "2", obs: "ok" }, { local: "Mesa superior", quantidade: "2", tamanho: "3", obs: "" }];
// um valor reconhecível por campo; o de data tem de ser data de verdade (texto livre ali é descartado)
const valorDe = (c) => (c.data ? "2026-10-01" : `v-${c.k}`);
const valores = (campos) => Object.fromEntries(campos.map((c) => [c.k, valorDe(c)]));

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
  ["SAIS", "RCS-112-001", CAMPOS_CABECALHO_SAIS, { amostras: AMOSTRAS }],
  ["POEIRA", "RTP-112-001", CAMPOS_CABECALHO_POEIRA, { testes: TESTES, classificacao: "3" }],
])("relatório de %s", (tipo, codigo, campos, estrutura) => {
  beforeEach(() => { rel = { id: "r", codigo, opNumero: "112", tipo, revisao: 0, linhas: [], marcas: ["T112A1"], equipamentos: [], resultados: {}, envioAssinaturaId: null }; });

  it("o computador grava todo campo do modelo, e as listas inteiras", async () => {
    const r = await pc({ resultados: { ...valores(campos), ...estrutura } });
    expect(r.status).toBe(200);
    const perdidos = campos.filter((c) => rel.resultados[c.k] !== valorDe(c)).map((c) => c.k);
    expect(perdidos).toEqual([]);
    if (estrutura.amostras) expect(rel.resultados.amostras[1]).toMatchObject({ condAmostra: "9,5", densidade: "10,2", hora: "09:25" });
    if (estrutura.testes) expect(rel.resultados.testes[1]).toMatchObject({ local: "Mesa superior", quantidade: "2", tamanho: "3" });
    if (estrutura.classificacao) expect(rel.resultados.classificacao).toBe("3");
  });

  it("o celular grava todo campo do modelo, e as listas inteiras (nada vira \"[object Object]\")", async () => {
    const r = await campo({ ...valores(campos), ...estrutura });
    expect(r.status).toBe(200);
    const perdidos = campos.filter((c) => rel.resultados[c.k] !== valorDe(c)).map((c) => c.k);
    expect(perdidos).toEqual([]);
    if (estrutura.amostras) expect(rel.resultados.amostras[0]).toMatchObject({ condAgua: "1,1", condAmostra: "12", hora: "09:10" });
    if (estrutura.testes) expect(rel.resultados.testes[0]).toMatchObject({ local: "Alma", quantidade: "1", tamanho: "2", obs: "ok" });
    expect(JSON.stringify(rel.resultados)).not.toContain("[object Object]");
  });
});
