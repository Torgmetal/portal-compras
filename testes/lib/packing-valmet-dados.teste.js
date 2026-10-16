// O que o Packing List da Valmet busca na pasta da obra — com a pasta simulada (nenhum teste toca SharePoint nem banco).
// ⚠ A Lista de Equivalência vai sofrer revisão (Vitor, 16/10/2026): vale sempre a de MAIOR revisão, fora de OBSOLETOS.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: vi.fn(), downloadFileByPath: vi.fn() }));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn(async () => "drive") }));
vi.mock("@/lib/databook-pastas", () => ({ pastaDaOP: vi.fn(async () => "/OP/OP-094 - Valmet - Bracell") }));
vi.mock("@/lib/packing-valmet-fontes", async (orig) => ({ ...(await orig()), lerEquivalenciaValmet: vi.fn(async (buf) => new Map([["T94A1", { valmet: String(buf) }]])) }));
import { listChildrenByPath, downloadFileByPath } from "@/lib/sharepoint";
import { dadosValmet } from "@/lib/packing-valmet-dados";

const pasta = (name) => ({ name, folder: {} });
const arq = (name) => ({ name, file: {} });
const ARVORE = {
  "/OP/OP-094 - Valmet - Bracell": [pasta("1. Comercial"), pasta("2. Engenharia")],
  "/OP/OP-094 - Valmet - Bracell/1. Comercial": [pasta("1.3 Pedido de compras")],
  "/OP/OP-094 - Valmet - Bracell/1. Comercial/1.3 Pedido de compras": [pasta("OBSOLETOS"), arq("INSTRUÇÃO DE FATURAMENTO - J5A199 - CIF.pdf"), arq("OC 401541 RC 201785.eml"), arq("OC 401541 rev1.PDF")],
  "/OP/OP-094 - Valmet - Bracell/2. Engenharia": [pasta("2.5 Projetos")],
  "/OP/OP-094 - Valmet - Bracell/2. Engenharia/2.5 Projetos": [pasta("2.5.2 Fabricação")],
  "/OP/OP-094 - Valmet - Bracell/2. Engenharia/2.5 Projetos/2.5.2 Fabricação": [pasta("2.5.2.5 Listas de Controle Interno")],
  "/OP/OP-094 - Valmet - Bracell/2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.5 Listas de Controle Interno": [
    pasta("OBSOLETOS"), arq("T94-LE_R02.xlsx"), arq("T94-LISTA DE EQUIVALÊNCIA TORG_VALMET_R00.xlsx"), arq("T94-LISTA DE EQUIVALÊNCIA TORG_VALMET_R01.xlsx"),
  ],
};
const textoPdf = vi.fn(async (buf) => (String(buf).includes("rev1") ? "No Página351/401541 / 20\n1 ISL007000 1 x\nProjeto J5A199 LF" : "CLIENTE: BRACELL SP CELULOSE LTD CONTATO\nContato na Obra: Marcos Bueno, Leo Telefone: (42) 99126-6799"));

beforeEach(() => {
  vi.clearAllMocks();
  listChildrenByPath.mockImplementation(async (_d, p) => ARVORE[p] || []);
  downloadFileByPath.mockImplementation(async ({ fullPath }) => Buffer.from(fullPath.split("/").pop()));
  mockPrisma.cargaSimulada.findFirst.mockResolvedValue(null);
});

describe("dadosValmet", () => {
  it("lê a OC de maior revisão, a Instrução de Faturamento e a Lista de Equivalência R01 (não a R00)", async () => {
    const d = await dadosValmet({ op: { numero: "094" }, previoId: "p1", textoPdf });
    expect(d.oc).toMatchObject({ orderTxt: "351/401541", projeto: "J5A199" });
    expect(d.instrucao).toMatchObject({ contato: "Marcos Bueno", telefone: "(42) 99126-6799" });
    expect(d.revisaoEquivalencia).toBe(1);
    expect(d.equivalencia.get("T94A1").valmet).toMatch(/_R01\.xlsx$/);
    expect(d.avisos).toEqual([]);
  });

  it("sem a Lista de Equivalência: segue, com aviso dizendo onde procurou", async () => {
    ARVORE["/OP/OP-094 - Valmet - Bracell/2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.5 Listas de Controle Interno"] = [arq("T94-LE_R02.xlsx")];
    const d = await dadosValmet({ op: { numero: "094" }, previoId: "p1", textoPdf });
    expect(d.equivalencia.size).toBe(0);
    expect(d.avisos.join(" ")).toMatch(/Lista de Equival.*2\.5\.2\.5/);
  });

  it("SharePoint fora do ar não segura o romaneio: devolve vazio com aviso", async () => {
    listChildrenByPath.mockRejectedValue(new Error("Graph 503"));
    const d = await dadosValmet({ op: { numero: "094" }, previoId: "p1", textoPdf });
    expect(d.oc).toBeNull();
    expect(d.avisos.join(" ")).toMatch(/Graph 503/);
  });
});
