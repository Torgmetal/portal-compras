import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠⚠⚠ O `timeout` DO SDK É POR TENTATIVA, E ELE RETENTA SOZINHO (achado do Codex, 24/09/2026). O
// `@anthropic-ai/sdk` 0.30.1 tem `maxRetries: 2` por padrão: um prazo de 45 s virava até 135 s,
// a Vercel matava a rota nos 60 s e a resposta morria no meio — DEPOIS de a chamada ser paga.
// O transporte é simulado: o que importa provar é o que a gente MANDA para o SDK.

const criar = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create: (...a) => criar(...a) }; } },
}));

process.env.ANTHROPIC_API_KEY = "chave-de-teste";
const { rodada } = await import("@/lib/fiscal/assistente/provedor");

const RESPOSTA = { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", model: "m", usage: { input_tokens: 10, output_tokens: 2 } };
const PEDIDO = { sistema: "s", mensagens: [{ role: "user", content: "oi" }], ferramentas: [] };

beforeEach(() => { criar.mockReset(); criar.mockResolvedValue(RESPOSTA); });

describe("o prazo absoluto governa a chamada ao modelo", () => {
  it("desliga a retentativa automática do SDK", async () => {
    await rodada({ ...PEDIDO, ateMs: Date.now() + 30_000 });
    expect(criar.mock.calls[0][1].maxRetries).toBe(0);
  });

  it("amarra um AbortSignal ao prazo — o corte não depende só do timeout do SDK", async () => {
    await rodada({ ...PEDIDO, ateMs: Date.now() + 30_000 });
    expect(criar.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("o timeout é o que SOBRA até o prazo, nunca mais que isso", async () => {
    await rodada({ ...PEDIDO, ateMs: Date.now() + 5_000 });
    expect(criar.mock.calls[0][1].timeout).toBeLessThanOrEqual(5_000);
  });

  it("sem tempo sobrando, recusa ANTES de chamar — não gasta uma chamada que não vai terminar", async () => {
    await expect(rodada({ ...PEDIDO, ateMs: Date.now() + 500 })).rejects.toThrow(/Sem tempo/);
    expect(criar).not.toHaveBeenCalled();
  });

  // ⚠⚠ O TESTE QUE FALTAVA: uma chamada lenta é CORTADA no prazo, em vez de ser repetida.
  it("uma chamada que não termina é cortada pelo sinal e não é repetida", async () => {
    criar.mockImplementation((_corpo, opcoes) => new Promise((_, rejeitar) => {
      opcoes.signal.addEventListener("abort", () => rejeitar(new Error("abortada pelo prazo")));
    }));
    const inicio = Date.now();
    await expect(rodada({ ...PEDIDO, ateMs: Date.now() + 1_300 })).rejects.toThrow(/abortada/);
    expect(Date.now() - inicio).toBeLessThan(2_500);
    expect(criar).toHaveBeenCalledTimes(1);
  });
});
