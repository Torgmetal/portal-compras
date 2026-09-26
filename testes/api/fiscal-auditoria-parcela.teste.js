import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireAcesso: vi.fn(async () => ({ id: "u1", email: "t@torg" })) }));
vi.mock("@/lib/fiscal/registro-classificacao", () => ({ verbetesAprovados: vi.fn(async () => []) }));
vi.mock("@/lib/fiscal/pedido-omie", async (orig) => ({ ...(await orig()), lerPedidoOmie: () => ({
  itens: [
    { item: 1, ncm: "84313900", cfop: "6101", quantidade: 100, valorUnitario: 10, valor: 1000, ipi: { aliquota: 0, base: 1000, valor: 0 }, icms: { aliquota: 12, base: 1000, valor: 120 } },
    { item: 2, ncm: "73089010", cfop: "6101", quantidade: 10, valorUnitario: 50, valor: 500, ipi: null, icms: null },
  ] }) }));

const { POST } = await import("@/app/api/fiscal/inteligencia/auditoria/route");
const req = (body) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oPMedicao.findUnique.mockResolvedValue({ id: "m1", numeroPedidoOmie: "77", payload: {}, valorBruto: 1500,
    op: { numero: "105", cliente: "TMSA", clienteUF: "RS", receitas: [{ id: "r1", descricao: "Fab", cfop: "6101", valor: 1, icmsPct: 12, ipiPct: 0, pisPct: 1.65, cofinsPct: 7.6 }] } });
  mockPrisma.fiscalTipiVersao.findFirst.mockResolvedValue({ id: "v1", arquivo: { sha256: "x" }, observadoEm: new Date() });
  mockPrisma.fiscalTipiLinha.findMany.mockResolvedValue([{ codigo: "84313900", ex: null, aliquotaTipo: "PERCENTUAL", aliquotaValor: 5 }]);
  mockPrisma.fiscalRegraIbsCbs.findMany.mockResolvedValue([{ pCbs: 0.9, pIbsUf: 0.1, ultimaNf: "943" }]);
});

describe("auditoria de medição por parcela", () => {
  it("⚠ quantidade acima do pedido é 400, não corrigida", async () => {
    const r = await POST(req({ medicaoId: "m1", parcela: [{ item: 1, quantidade: 101 }] }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/acima/);
  });

  it("parcela válida: só os itens marcados, base proporcional, e o total por tributo", async () => {
    const d = await (await POST(req({ medicaoId: "m1", parcela: [{ item: 1, quantidade: 25 }] }))).json();
    expect(d.success).toBe(true);
    expect(d.esperados.map((e) => e.item)).toEqual([1]);
    const ipi = d.esperados[0].linhas.find((l) => l.tributo === "IPI");
    expect(ipi).toMatchObject({ cadastrado: 0, regra: 5, divergente: true, valor: 12.5 });
    expect(d.totaisParcela.find((t) => t.tributo === "CBS").valor).toBe(2.25);
  });

  it("sem parcela: a medição inteira, como antes", async () => {
    const d = await (await POST(req({ medicaoId: "m1" }))).json();
    expect(d.esperados).toHaveLength(2);
  });
});
