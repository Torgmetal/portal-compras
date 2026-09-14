// Linha "Recebimento da matéria-prima": item atendido pelo ESTOQUE conta como recebido (não passa pelo CMR).
// OP-094 (14/09/2026): 94 kg de vergalhão do estoque seguravam a linha em 84 % para sempre.
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { situacaoSuprimentos } from "@/lib/cronograma-suprimentos";

const rm = { numero: "T94-001-R00", createdAt: new Date("2026-08-14"), faturamentoDireto: false };
const item = (extra) => ({ descricao: "CHAPA ACO CARBONO A-36 ESP 6,30MM", qtd: 1, unidade: "kg", peso: 100, status: "PEDIDO_GERADO", atendidoEstoqueEm: null, rm, pedidoOmie: { numeroPedido: "1", createdAt: new Date("2026-08-20") }, recebimentos: [], ...extra });

beforeEach(() => { vi.clearAllMocks(); });

it("aço do estoque entra no recebido por inteiro; o pedido sem CMR continua faltando", async () => {
  mockPrisma.rMItem.findMany.mockResolvedValue([
    item({ recebimentos: [{ qtdRecebida: 100, dataRecebimento: new Date("2026-08-25") }] }), // recebido pelo CMR
    item({ descricao: "BARRA REDONDA VERGALHAO 25,40MM", status: "ATENDIDO_ESTOQUE", atendidoEstoqueEm: new Date("2026-08-18"), pedidoOmie: null }), // do estoque
    item({ descricao: "CHAPA ACO CARBONO A-36 ESP 9,50MM" }), // pedido, nada chegou
  ]);
  const s = await situacaoSuprimentos(mockPrisma, "op94");
  expect(s.porFamilia.ACO).toMatchObject({ escopo: 300, cotado: 300, recebido: 200 });
});
