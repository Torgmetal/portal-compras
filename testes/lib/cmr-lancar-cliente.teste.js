// O navegador diante de uma resposta perdida: diz a verdade e não convida a duplicar.
// Pedido 2054 (05/10/2026): a Vercel devolveu a página de erro ("An error occurred…") e a tela mostrou
// "Unexpected token 'A'… is not valid JSON" — que não diz que os 43 R JÁ estavam gravados.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enviarLoteCmr, novoLote } from "@/lib/cmr-lancar-cliente";

const resp = (status, corpo) => ({ ok: status < 400, status, text: async () => corpo });
beforeEach(() => { global.fetch = vi.fn(); });

describe("enviarLoteCmr", () => {
  it("manda a chave do lote junto", async () => {
    fetch.mockResolvedValue(resp(200, JSON.stringify({ success: true, indices: ["261832"] })));
    await enviarLoteCmr({ ano: 2026, lancamentos: [{ descricao: "A" }], loteId: "L1" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ ano: 2026, loteId: "L1", espelhar: false });
  });

  it("⚠ página de erro da Vercel no lugar do JSON: resposta INCERTA, com mensagem que não manda desistir nem duplicar", async () => {
    fetch.mockResolvedValue(resp(504, "An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT"));
    const e = await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x);
    expect(e.incerta).toBe(true);
    expect(e.message).toMatch(/pode ter sido gravado/i);
    expect(e.message).toMatch(/não duplica/i);
    expect(e.message).not.toMatch(/Unexpected token/);
  });

  it("rede caiu: também é incerta", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x)).incerta).toBe(true);
  });

  it("409: conflito, com a mensagem do servidor", async () => {
    fetch.mockResolvedValue(resp(409, JSON.stringify({ error: "Este lote já foi gravado com outro conteúdo." })));
    const e = await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x);
    expect(e.conflito).toBe(true);
    expect(e.message).toMatch(/outro conteúdo/);
  });

  it("servidor diz que o resultado é incerto: incerta", async () => {
    fetch.mockResolvedValue(resp(503, JSON.stringify({ error: "Não consegui conferir", incerta: true })));
    expect((await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x)).incerta).toBe(true);
  });

  it("409 traz os R do lote que já existe", async () => {
    fetch.mockResolvedValue(resp(409, JSON.stringify({ error: "outro conteúdo", indices: ["261832", "261874"] })));
    expect((await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x)).indices).toEqual(["261832", "261874"]);
  });

  it("erro com JSON (ex.: 503 da planilha) é erro certo — nada gravado", async () => {
    fetch.mockResolvedValue(resp(503, JSON.stringify({ error: "Não consegui conferir a numeração na planilha" })));
    const e = await enviarLoteCmr({ ano: 2026, lancamentos: [], loteId: "L1" }).catch((x) => x);
    expect(e.incerta).toBeFalsy();
    expect(e.message).toMatch(/planilha/);
  });
});

it("novoLote gera chaves diferentes", () => expect(novoLote()).not.toBe(novoLote()));
