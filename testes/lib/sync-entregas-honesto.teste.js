// ⚠⚠ "NÃO CONSEGUI PERGUNTAR" NÃO É "NÃO CHEGOU" (achado do Codex, 17/09/2026).
//
// `verificarRecebimentoPedido` engole a exceção e devolve `{ etapa: "ERRO", error }`. Sem tratar
// isso, `syncEntregas` lia o pedido como PENDENTE, somava em `processados` e a rodada terminava
// dizendo `erros: 0` e `timeboxed: false` — uma varredura cega se anunciando completa. No botão
// "Sincronizar" isso vira um "Nada mudou" verde depois de o Omie ter recusado todas as consultas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ omie: vi.fn(), podeBaixar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/recebimento-fonte", () => ({ omiePodeBaixar: mocks.podeBaixar }));
vi.mock("@/lib/omie-call", async (real) => ({ ...(await real()), omieCall: mocks.omie }));

import { syncEntregas } from "@/lib/omie-recebimento";
import { ORCAMENTO_ESGOTADO } from "@/lib/omie-call";

const PEDIDO = (n) => ({
  id: `p${n}`, codigoPedido: String(n), numeroPedido: n, faturamentoDireto: false,
  fornecedorNome: "SOUFER", prazoEntregaPrevisto: null, rmItens: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.podeBaixar.mockResolvedValue(false);
  mockPrisma.pedidoOmie.findMany.mockResolvedValue([PEDIDO(1), PEDIDO(2)]);
  mockPrisma.pedidoOmie.update.mockResolvedValue({});
});

describe("syncEntregas — uma rodada cega não pode parecer completa", () => {
  it("⚠⚠ consulta que falhou conta como ERRO, não como pedido pendente", async () => {
    mocks.omie.mockRejectedValue(new Error("Omie fora do ar"));
    const r = await syncEntregas(mockPrisma, { apenasPendentes: true, pularNF: true });
    expect(r.erros).toBe(2);
    expect(r.sincronizados).toBe(0);
    // ⚠ E o pedido aparece nos detalhes COM o erro, não carimbado de "PENDENTE".
    expect(r.detalhes.every((d) => d.error)).toBe(true);
  });

  // ⚠ Acabar o orçamento no meio é TIMEBOX, não defeito de integração: marcar como erro encheria
  // o relatório de falhas numa rodada que só ficou sem tempo — e a tela diria "Omie com problema"
  // onde a verdade é "o resto entra na próxima".
  it("⚠ orçamento esgotado vira timebox, não erro", async () => {
    mocks.omie.mockRejectedValue(new Error(`${ORCAMENTO_ESGOTADO} (ConsultarPedCompra)`));
    const r = await syncEntregas(mockPrisma, { apenasPendentes: true, pularNF: true });
    expect(r.timeboxed).toBe(true);
    expect(r.erros).toBe(0);
    expect(r.processados).toBe(0); // parou no primeiro, não fingiu ter verificado
  });

  it("pedido que o Omie respondeu sem recebimento continua sendo PENDENTE de verdade", async () => {
    mocks.omie.mockResolvedValue({ cabecalho_consulta: { cEtapa: "15" }, produtos_consulta: [] });
    const r = await syncEntregas(mockPrisma, { apenasPendentes: true, pularNF: true });
    expect(r.erros).toBe(0);
    expect(r.detalhes.map((d) => d.status)).toEqual(["PENDENTE", "PENDENTE"]);
  });
});
