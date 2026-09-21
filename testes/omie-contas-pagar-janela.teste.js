import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
const omieCall = vi.fn();
vi.mock("@/lib/omie-call", () => ({ omieCall: (...a) => omieCall(...a) }));

const { sincronizarContasPagar } = await import("@/lib/omie-contas-pagar");

// ─── A ESPIRAL DO CRON FINANCEIRO (13/09/2026) ───────────────────────────────
//
// O `/api/cron/financeiro` devolvia 504 todo dia desde 30/08 e nunca chegava a gravar o heartbeat.
// A causa: o laço que pagina o Omie não tinha freio nenhum (o `orcamentoMs` só guardava a última
// etapa), e o marco `ultimoSync` só era escrito no fim. Morrendo antes, o marco não avançava — e a
// janela do dia seguinte ficava um dia maior. Em 14 dias virou impossível de terminar.
//
// O conserto tem duas metades, e a segunda é a que o Codex exigiu: parar no orçamento é fácil,
// parar SEM MENTIR sobre o que foi coberto é o que impede buraco no histórico.

const CONTA = { codigo_lancamento_omie: 1, valor_documento: "10,00", data_vencimento: "01/09/2026" };

/** Respostas do Omie: mapas vazios e `paginas` páginas de contas a pagar. */
function omieCom(paginas) {
  omieCall.mockReset();
  omieCall.mockImplementation(async (url) => {
    if (url.includes("clientes")) return { clientes_cadastro_resumido: [], total_de_paginas: 1 };
    if (url.includes("categorias")) return { categoria_cadastro: [], total_de_paginas: 1 };
    return { conta_pagar_cadastro: [CONTA], total_de_paginas: paginas };
  });
}

beforeEach(() => {
  for (const m of ["contaPagar", "omieSyncState"]) {
    for (const f of ["upsert", "count", "findMany", "deleteMany", "findUnique", "update"]) {
      mockPrisma[m][f].mockReset().mockResolvedValue(undefined);
    }
  }
  mockPrisma.contaPagar.count.mockResolvedValue(5000);
  mockPrisma.contaPagar.findMany.mockResolvedValue([]);
  mockPrisma.contaPagar.deleteMany.mockResolvedValue({ count: 0 });
});

describe("passada parcial não avança o marco", () => {
  // ⚠⚠ O ACHADO DO CODEX. Se a coleta para no meio e o marco avança assim mesmo, os registros que
  // ficaram para trás NAQUELA janela nunca mais são buscados — a próxima janela começa onde esta
  // disse ter parado. Buraco silencioso no financeiro é pior que cron atrasado.
  it("coleta interrompida pelo orçamento: nenhum `omieSyncState.upsert`", async () => {
    omieCom(9); // sempre há próxima página
    mockPrisma.omieSyncState.findUnique.mockResolvedValue({
      ultimoSync: new Date("2026-08-30T07:32:00Z"), ultimaAlteracao: null,
    });

    const r = await sincronizarContasPagar({ incremental: true, orcamentoMs: 0 });

    expect(r.parcial).toBe(true);
    expect(mockPrisma.omieSyncState.upsert).not.toHaveBeenCalled();
  });

  // ⚠⚠ A limpeza de órfãos olha `ids.length` (o que foi COLETADO). Coleta inteira + gravação pela
  // metade passava na trava dos 90% e o `deleteMany` apagava título legítimo ainda não gravado.
  it("full sync parcial não apaga órfão nenhum", async () => {
    omieCom(9);
    mockPrisma.omieSyncState.findUnique.mockResolvedValue(null);

    await sincronizarContasPagar({ incremental: false, orcamentoMs: 0 });

    expect(mockPrisma.contaPagar.deleteMany).not.toHaveBeenCalled();
  });
});

describe("passada completa avança até o FIM DA JANELA, não até agora", () => {
  // ⚠⚠ Dizer "sincronizado até agora" depois de varrer só três dias pularia o resto do atraso de
  // uma vez — o mesmo buraco por outro caminho. O marco é o que foi de fato coberto.
  it("com 14 dias de atraso, o marco anda 3 dias (o teto da janela), não 14", async () => {
    omieCom(1);
    const ultimoSync = new Date("2026-08-30T07:32:00Z");
    mockPrisma.omieSyncState.findUnique.mockResolvedValue({ ultimoSync, ultimaAlteracao: null });

    const r = await sincronizarContasPagar({ incremental: true, orcamentoMs: 60_000 });

    expect(r.parcial).toBe(false);
    const gravado = mockPrisma.omieSyncState.upsert.mock.calls[0][0].update.ultimoSync;
    // desde = ultimoSync - 1 dia; janela = desde + 3 dias → 01/09, MUITO antes de "agora"
    const desde = ultimoSync.getTime() - 86400000;
    expect(gravado.getTime()).toBe(desde + 3 * 86400000);
    expect(gravado.getTime()).toBeLessThan(Date.now());
  });

  it("sem atraso, a janela para em `agora` e o marco não vai para o futuro", async () => {
    omieCom(1);
    mockPrisma.omieSyncState.findUnique.mockResolvedValue({
      ultimoSync: new Date(Date.now() - 3600_000), ultimaAlteracao: null,
    });

    await sincronizarContasPagar({ incremental: true, orcamentoMs: 60_000 });

    const gravado = mockPrisma.omieSyncState.upsert.mock.calls[0][0].update.ultimoSync;
    expect(gravado.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
