import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Geraldo" }) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn().mockResolvedValue({}), proximoNumero: vi.fn().mockResolvedValue(3) }));
vi.mock("@/lib/importar-procedimentos", () => ({ procedimentoDoTipo: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/relatorio-dimensional", () => ({ procedimentoTolerancia: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/databook-pastas", () => ({
  resolverPastasDaSecao: vi.fn().mockResolvedValue({ driveId: "d", fontes: [{ label: "Conjunto", path: "/OP-105/2.5.2.3 Conjunto" }, { label: "Montagem", path: "/OP-105/2.5.4 Montagem" }], erros: [] }),
  listarPasta: vi.fn(),
}));
import { POST as criar } from "@/app/api/qualidade/inspecoes/dimensional/route";
import { POST as escolher } from "@/app/api/qualidade/inspecoes/[id]/projetos/route";

// Geraldo (21/09/2026), OP-105: "não estamos conseguindo salvar os projetos de pré-montagem no
// relatório". Na pré-montagem não se escolhe PEÇA, se escolhe PROJETO — e Vitor (22/08/2026) pediu
// "puxar alguns projetos diferentes, podendo ser conjuntos ou diagrama de montagem". A tela deixa
// marcar vários (`umaSo` exclui a pré-montagem), o relatório guarda até 12 desenhos… e o servidor
// recusava o segundo com "Relatório de conjunto é um por conjunto — use o escopo de peças avulsas",
// um escopo que a tela da pré-montagem nem mostra. Os 5 RPM existentes têm exatamente 1 projeto:
// nunca foi possível mais de um.

const req = (body) => new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const P = (n) => ({ nome: n, caminho: `/OP-105/2.5.2.3 Conjunto/A/A2/${n}.pdf` });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op105", escopoQualidade: null });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
  mockPrisma.planoPintura.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.relatorioInspecao.create.mockImplementation(async ({ data }) => ({ id: "r", codigo: "RPM-105-003", ...data }));
});

describe("abrir relatório de pré-montagem", () => {
  it("aceita VÁRIOS projetos — conjunto e diagrama de montagem juntos", async () => {
    const projetos = [P("105A1"), P("105A2"), { nome: "T105 - Tolerâcias", caminho: "/OP-105/2.5.4 Montagem/T105 - Tolerâcias.pdf" }];
    const r = await criar(req({ opNumero: "105", tipo: "PRE_MONTAGEM", escopo: "CONJUNTO", marcas: projetos.map((p) => p.nome), projetos }));
    expect(r.status).toBe(200);
    const { relatorio } = await r.json();
    expect(relatorio.desenhos.map((d) => d.nome)).toEqual(["105A1", "105A2", "T105 - Tolerâcias"]);
    expect(relatorio.desenhos.every((d) => d.escolhido && d.caminho)).toBe(true);
  });

  it("sem projeto nenhum, explica que a pré-montagem nasce do projeto", async () => {
    const r = await criar(req({ opNumero: "105", tipo: "PRE_MONTAGEM", marcas: ["105A1"], projetos: [] }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/projeto/i);
    expect(mockPrisma.relatorioInspecao.create).not.toHaveBeenCalled();
  });

  // ⚠ a regra do dimensional continua: um conjunto por relatório (é o que o modelo do Vitor prevê).
  it("o dimensional de conjunto segue sendo um por relatório", async () => {
    const r = await criar(req({ opNumero: "105", tipo: "DIMENSIONAL", escopo: "CONJUNTO", marcas: ["105A1", "105A2"] }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/um por conjunto/);
  });
});

describe("escolher na pasta da obra, no relatório já aberto", () => {
  const relBase = { id: "r", opNumero: "105", envioAssinaturaId: null, desenhos: [{ marca: "105A1", nome: "105A1.pdf", caminho: "/OP-105/2.5.2.3 Conjunto/A/A2/105A1.pdf", escolhido: true }] };
  const escolherEm = (tipo, caminho) => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ ...relBase, tipo });
    mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => ({ id: "r", ...data }));
    return escolher(req({ caminho }), { params: Promise.resolve({ id: "r" }) });
  };

  it("na pré-montagem, SOMA ao que já está no relatório (sem repetir)", async () => {
    const r = await escolherEm("PRE_MONTAGEM", "/OP-105/2.5.4 Montagem/T105 - Tolerâcias.pdf");
    expect(r.status).toBe(200);
    const gravado = mockPrisma.relatorioInspecao.update.mock.calls[0][0].data.desenhos;
    expect(gravado.map((d) => d.marca)).toEqual(["105A1", "T105 - Tolerâcias"]);
    // o mesmo arquivo de novo não duplica
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ ...relBase, tipo: "PRE_MONTAGEM", desenhos: gravado });
    const r2 = await escolher(req({ caminho: "/OP-105/2.5.4 Montagem/T105 - Tolerâcias.pdf" }), { params: Promise.resolve({ id: "r" }) });
    expect(r2.status).toBe(200);
    expect(mockPrisma.relatorioInspecao.update.mock.calls[1][0].data.desenhos).toHaveLength(2);
  });

  it("no dimensional, TROCA — o relatório é de um conjunto só", async () => {
    const r = await escolherEm("DIMENSIONAL", "/OP-105/2.5.2.3 Conjunto/A/A2/105A2.pdf");
    expect(r.status).toBe(200);
    expect(mockPrisma.relatorioInspecao.update.mock.calls[0][0].data.desenhos.map((d) => d.marca)).toEqual(["105A2"]);
  });
});
