// Busca de produto da RM: o código INATIVO no Omie não volta. Vitor (24/09/2026): os duplicados do
// cadastro são limpos inativando no Omie, "tomando cuidado para não inativar o que estamos usando".
// O último recurso da busca (ConsultarProduto pelo código exato) acha qualquer produto, inclusive o
// inativo — e quem cola o código de uma RM antiga cairia justamente no código aposentado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u1" }) }));

import { GET } from "@/app/api/omie/buscar-produto/route";

// o Omie responde: posição de estoque vazia (o código não tem saldo) e o cadastro do produto
function omie(cadastro) {
  return vi.fn(async (_url, init) => {
    const { call } = JSON.parse(init.body);
    const corpo = call === "ListarPosEstoque" ? { produtos: [], nTotPaginas: 1 } : cadastro;
    return { json: async () => corpo };
  });
}
const buscar = async (q) => (await GET(new Request(`http://x/api/omie/buscar-produto?q=${q}`))).json();
const CHAPA = { codigo: "101000036", descricao: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 2.65MM", unidade: "KG" };

describe("busca de produto pelo código exato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OMIE_APP_KEY = "k"; process.env.OMIE_APP_SECRET = "s";
    mockPrisma.estoqueItem.findMany.mockResolvedValue([]); // a busca local já não o devolve
  });
  afterEach(() => vi.unstubAllGlobals());

  it("produto INATIVO no Omie não volta para a RM", async () => {
    vi.stubGlobal("fetch", omie({ ...CHAPA, inativo: "S" }));
    expect(await buscar("101000036")).toEqual({ itens: [], origem: "vazio" });
  });

  it("produto ativo continua voltando, mesmo sem saldo", async () => {
    vi.stubGlobal("fetch", omie({ ...CHAPA, codigo: "101000001", descricao: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 2,65MM", inativo: "N" }));
    const r = await buscar("101000001");
    expect(r.origem).toBe("omie-consultaproduto");
    expect(r.itens).toEqual([{ codigo: "101000001", descricao: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 2,65MM", unidade: "KG", saldo: 0 }]);
  });

  it("cadastro sem o campo inativo (resposta antiga) conta como ativo", async () => {
    vi.stubGlobal("fetch", omie({ ...CHAPA }));
    expect((await buscar("101000036")).itens).toHaveLength(1);
  });
});
