// O prazo do `omieCall` — a correção do achado ALTO do Codex (17/09/2026).
//
// ⚠⚠ ANTES DISTO, "DEADLINE" ERA CONSELHO. Quem chamava em laço conferia o relógio ENTRE um
// pedido e outro, mas uma chamada iniciada com 1s de orçamento ainda podia gastar 45s de timeout
// × 5 tentativas com esperas no meio. O caminho manual dizia "deadline 60s" e podia levar minutos
// — que é exatamente como a Vercel mata a rota e o navegador recebe HTML no lugar de JSON.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { omieCall, ORCAMENTO_ESGOTADO } from "@/lib/omie-call";

const URL = "https://app.omie.com.br/api/v1/x/";

beforeEach(() => {
  process.env.OMIE_APP_KEY = "k";
  process.env.OMIE_APP_SECRET = "s";
});
afterEach(() => vi.restoreAllMocks());

/** Um fetch de mentira que devolve o corpo pedido e guarda o sinal recebido. */
function fakeFetch(corpos) {
  const sinais = [];
  const fn = vi.fn(async (_url, init) => {
    sinais.push(init.signal);
    const corpo = corpos.shift();
    if (corpo instanceof Error) throw corpo;
    return { status: 200, text: async () => JSON.stringify(corpo) };
  });
  vi.stubGlobal("fetch", fn);
  return { fn, sinais };
}

describe("omieCall com prazo absoluto (`ateMs`)", () => {
  it("sem `ateMs`, nada muda — o timeout continua sendo o de sempre", async () => {
    const { sinais } = fakeFetch([{ ok: 1 }]);
    await omieCall(URL, "X", {});
    // 45s é o default; `AbortSignal.timeout` não expõe o valor, então o que se afirma é que
    // existe sinal e a chamada passou.
    expect(sinais[0]).toBeTruthy();
  });

  it("⚠⚠ com o prazo JÁ VENCIDO, nem chega a bater no Omie", async () => {
    const { fn } = fakeFetch([{ ok: 1 }]);
    await expect(omieCall(URL, "ConsultarPedCompra", {}, { ateMs: Date.now() - 1 }))
      .rejects.toThrow(ORCAMENTO_ESGOTADO);
    expect(fn).not.toHaveBeenCalled();
  });

  it("o erro diz QUAL chamada ficou sem orçamento", async () => {
    fakeFetch([{ ok: 1 }]);
    await expect(omieCall(URL, "PesquisarPedCompra", {}, { ateMs: Date.now() - 1 }))
      .rejects.toThrow(/PesquisarPedCompra/);
  });

  it("dentro do prazo, responde normalmente", async () => {
    fakeFetch([{ pedidos_pesquisa: [] }]);
    const d = await omieCall(URL, "X", {}, { ateMs: Date.now() + 30_000 });
    expect(d).toEqual({ pedidos_pesquisa: [] });
  });

  // ⚠⚠ ESTE É O CASO QUE ESTOURAVA A ROTA. O Omie responde "aguarde 30 segundos"; com 2s de
  // orçamento, dormir 32s para tentar de novo é gastar o tempo de quem vem atrás sem chance
  // nenhuma de sucesso — e ainda gravar depois de a trava já ter sido solta.
  it("⚠⚠ não dorme para retentar quando a espera não cabe no que sobrou", async () => {
    fakeFetch([{ faultstring: "Consumo redundante. Aguarde 30 segundos" }]);
    const t0 = Date.now();
    await expect(omieCall(URL, "X", {}, { ateMs: Date.now() + 2_000 }))
      .rejects.toThrow(ORCAMENTO_ESGOTADO);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it("a mensagem da desistência carrega a última falha do Omie, não só o relógio", async () => {
    fakeFetch([{ faultstring: "Consumo redundante. Aguarde 30 segundos" }]);
    await expect(omieCall(URL, "X", {}, { ateMs: Date.now() + 2_000 }))
      .rejects.toThrow(/Aguarde 30 segundos/);
  });

  // ⚠ Erro de NEGÓCIO continua saindo como erro de negócio: o prazo não pode mascarar "pedido não
  // cadastrado" de quem está depurando.
  it("erro não-transitório continua lançando o texto do Omie", async () => {
    fakeFetch([{ faultstring: "Pedido não cadastrado" }]);
    await expect(omieCall(URL, "X", {}, { ateMs: Date.now() + 30_000 }))
      .rejects.toThrow("Pedido não cadastrado");
  });

  it("com folga, a espera curta do backoff acontece e a 2ª tentativa passa", async () => {
    fakeFetch([{ faultstring: "Broken response from Application Server" }, { ok: 2 }]);
    const d = await omieCall(URL, "X", {}, { ateMs: Date.now() + 30_000 });
    expect(d).toEqual({ ok: 2 });
  });
});
