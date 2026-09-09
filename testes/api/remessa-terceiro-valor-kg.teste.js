import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// ⚠⚠ Matheus (09/09/2026): "esta dando erro de preço, mas não achei campo para colocar valor".
// `criarPedidoRemessa` já aceitava `opts.valorKg` (comentário "Fiscal pode informar na tela"),
// mas nada nesta rota lia `body.valorKg` — nem o schema aceitava o campo. Estes testes travam a
// ponte inteira: o valor digitado na tela precisa chegar ao lib que gera a remessa no Omie.

const mocks = vi.hoisted(() => ({ role: vi.fn(), criarPedidoRemessa: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/omie-remessa-industrializacao", () => ({
  criarPedidoRemessa: mocks.criarPedidoRemessa,
  conferirRemessaOmie: vi.fn(),
  concluirRemessaOmie: vi.fn(),
  statusNfDaRemessa: vi.fn(),
}));
import { PATCH } from "@/app/api/fiscal/remessa-terceiro/[id]/route";

const ROMANEIO = {
  id: "r1", numero: 5, remessaStatus: null, remessaPedidoOmie: null,
  itens: [{ marca: "T97A1", qte: 2, pesoTotal: 40 }], materiais: [], // sem materiais — é o caso "peças"
  opRefNumero: "097", servico: null, fornecedorId: "f1", remessaCfop: null,
};
const params = { params: { id: "r1" } };
const req = (corpo) => new Request("http://localhost/api/fiscal/remessa-terceiro/r1",
  { method: "PATCH", body: JSON.stringify(corpo) });

// ⚠ A rota faz DOIS `findUnique` de RomaneioTerceiro com `select` diferente (checagem rápida,
// depois busca completa) — distinguir pelo `select`, não pela ORDEM da chamada. `clearAllMocks`
// não esvazia uma fila de `mockResolvedValueOnce` que sobrou de um teste anterior que retornou
// cedo (ex.: erro de schema, antes da segunda busca); usar `mockImplementation` evita esse
// vazamento de vez.
const romaneioMock = (romaneio) => ({ select }) =>
  Promise.resolve(select?.materiais !== undefined
    ? romaneio
    : { id: romaneio.id, numero: romaneio.numero, remessaStatus: romaneio.remessaStatus, remessaPedidoOmie: romaneio.remessaPedidoOmie });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Ana" });
  mockPrisma.romaneioTerceiro.findUnique.mockImplementation(romaneioMock(ROMANEIO));
  mockPrisma.fornecedor.findUnique.mockResolvedValue({ cnpj: "00000000000191", uf: "SP", nCodOmie: 123 });
  mocks.criarPedidoRemessa.mockResolvedValue({ codigoPedido: 999, numeroPedido: "RT-999" });
  mockPrisma.romaneioTerceiro.update.mockResolvedValue({ id: "r1", numero: 5, remessaStatus: "PEDIDO_CRIADO", remessaPedidoOmie: "999", remessaPedidoNumero: "RT-999" });
});

describe("gerar_pedido_omie — romaneio SEM materiais (só peças/marcas)", () => {
  it("manda o valorKg digitado na tela pro lib que gera a remessa", async () => {
    const r = await PATCH(req({ acao: "gerar_pedido_omie", valorKg: 12.5, frete: { tpFrete: "0" } }), params);
    expect(r.status).toBe(200);
    expect(mocks.criarPedidoRemessa.mock.calls[0][2]).toMatchObject({ valorKg: 12.5 });
  });

  it("sem valorKg no corpo, ainda assim tenta gerar — quem decide se falta valor é o lib (fallback de config)", async () => {
    const r = await PATCH(req({ acao: "gerar_pedido_omie", frete: { tpFrete: "0" } }), params);
    expect(r.status).toBe(200);
    expect(mocks.criarPedidoRemessa.mock.calls[0][2].valorKg).toBeUndefined();
  });

  it("valorKg zero ou negativo é rejeitado pelo schema antes de chegar no lib", async () => {
    const r = await PATCH(req({ acao: "gerar_pedido_omie", valorKg: 0, frete: { tpFrete: "0" } }), params);
    expect(r.status).toBe(400);
    expect(mocks.criarPedidoRemessa).not.toHaveBeenCalled();
  });

  it("o erro do lib (\"defina o valor por kg\") volta pra tela como 400, não 500", async () => {
    mocks.criarPedidoRemessa.mockResolvedValue({ erro: "Defina o valor por kg antes de gerar — a NF não pode sair com valor zero." });
    const r = await PATCH(req({ acao: "gerar_pedido_omie", frete: { tpFrete: "0" } }), params);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("valor por kg");
  });
});

describe("gerar_pedido_omie — romaneio COM materiais", () => {
  it("valorKg não é usado quando há materiais resolvidos (cada um já tem seu valorUnit)", async () => {
    mockPrisma.romaneioTerceiro.findUnique.mockImplementation(
      romaneioMock({ ...ROMANEIO, materiais: [{ perfil: "L1x1/8", codigoOmie: "P1", qtd: 10 }] }));
    const r = await PATCH(req({
      acao: "gerar_pedido_omie", valorKg: 999, // se isto vazar pro material, é bug
      materiais: [{ idx: 0, codigoOmie: "P1", qtd: 10, valorUnit: 5.5 }],
      frete: { tpFrete: "0" },
    }), params);
    expect(r.status).toBe(200);
    expect(mocks.criarPedidoRemessa.mock.calls[0][2].valorKg).toBeUndefined();
  });
});
