import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠⚠ A ORDEM DAS QUATRO OPERAÇÕES É O CONTRATO DESTA ROTA, e ela não é visível lendo o código de
// cima para baixo — só um teste prova que a reserva vem ANTES da chamada. Invertida, duas
// perguntas simultâneas furam o teto, que é exatamente o achado do Codex.

const requireAcesso = vi.fn();
vi.mock("@/lib/session", () => ({ requireAcesso: (...a) => requireAcesso(...a) }));

const reservar = vi.fn(), conciliar = vi.fn();
vi.mock("@/lib/fiscal/assistente/orcamento", () => ({
  reservar: (...a) => reservar(...a), conciliar: (...a) => conciliar(...a),
}));

const configurado = vi.fn(() => true);
vi.mock("@/lib/fiscal/assistente/provedor", () => ({ configurado: () => configurado(), MODELO: "m" }));

const responder = vi.fn(), abrirExecucao = vi.fn(), concluirExecucao = vi.fn(), falharExecucao = vi.fn(), lerConversa = vi.fn();
vi.mock("@/lib/fiscal/assistente/orquestrador", () => ({ responder: (...a) => responder(...a) }));
vi.mock("@/lib/fiscal/assistente/conversas", () => ({
  abrirExecucao: (...a) => abrirExecucao(...a), concluirExecucao: (...a) => concluirExecucao(...a),
  falharExecucao: (...a) => falharExecucao(...a), lerConversa: (...a) => lerConversa(...a),
}));

const { POST } = await import("@/app/api/fiscal/assistente/mensagem/route");

const pedir = (corpo) => POST({ json: async () => corpo });
const CORPO = { pergunta: "qual o IPI do 8437.90.00?", chave: "chave-de-teste-1" };

const lerFluxo = async (resp) => {
  const r = resp.body.getReader(); const d = new TextDecoder(); let t = "";
  for (;;) { const { done, value } = await r.read(); if (done) break; t += d.decode(value, { stream: true }); }
  return t;
};

beforeEach(() => {
  vi.clearAllMocks();
  configurado.mockReturnValue(true);
  requireAcesso.mockResolvedValue({ id: "u1", email: "a@torg.com.br", name: "Ana" });
  reservar.mockResolvedValue({ ok: true, dia: "2026-09-23", reservado: 250000 });
  abrirExecucao.mockResolvedValue({ conversa: { id: "c1" }, resposta: { id: "m1" } });
  lerConversa.mockResolvedValue({ mensagens: [] });
  responder.mockResolvedValue({
    conteudo: "A TIPI tributa a 5%.", blocos: [], evidencias: [], ferramentas: [], referencias: {},
    avisos: [], uso: { entrada: 100, saida: 20 }, modelo: "m", custoMicros: 3000,
  });
});

describe("POST /api/fiscal/assistente/mensagem", () => {
  it("exige os módulos FISCAL ou FINANCEIRO", async () => {
    await pedir(CORPO);
    expect(requireAcesso).toHaveBeenCalledWith({ modulos: ["FISCAL", "FINANCEIRO"] });
  });

  it("sem sessão devolve 401 e sem módulo devolve 403", async () => {
    requireAcesso.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await pedir(CORPO)).status).toBe(401);
    requireAcesso.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await pedir(CORPO)).status).toBe(403);
  });

  // ⚠⚠ SEM CHAVE O ASSISTENTE DIZ QUE ESTÁ DESLIGADO, não estoura 401 da Anthropic na cara do
  // usuário. É o caso do ambiente local, e vai ser o de qualquer ambiente novo.
  it("sem chave de API devolve 503 e não chama nada", async () => {
    configurado.mockReturnValue(false);
    expect((await pedir(CORPO)).status).toBe(503);
    expect(reservar).not.toHaveBeenCalled();
    expect(responder).not.toHaveBeenCalled();
  });

  it("recusa pergunta vazia com 400", async () => {
    expect((await pedir({ pergunta: "", chave: "chave-de-teste-1" })).status).toBe(400);
  });

  // ⚠⚠⚠ O TESTE CENTRAL: a reserva acontece ANTES da chamada ao modelo.
  it("reserva o orçamento antes de consultar o modelo", async () => {
    const ordem = [];
    reservar.mockImplementation(async () => { ordem.push("reserva"); return { ok: true, dia: "d", reservado: 1 }; });
    responder.mockImplementation(async () => { ordem.push("modelo"); return { conteudo: "x", blocos: [], evidencias: [], ferramentas: [], referencias: {}, avisos: [], uso: { entrada: 1, saida: 1 }, modelo: "m", custoMicros: 1 }; });
    await lerFluxo(await pedir(CORPO));
    expect(ordem).toEqual(["reserva", "modelo"]);
  });

  it("teto estourado devolve 429 e NÃO consulta o modelo", async () => {
    reservar.mockResolvedValue({ ok: false, motivo: "Teto atingido." });
    const r = await pedir(CORPO);
    expect(r.status).toBe(429);
    expect(responder).not.toHaveBeenCalled();
  });

  it("grava e concilia ANTES de emitir o evento final", async () => {
    const ordem = [];
    concluirExecucao.mockImplementation(async () => { ordem.push("gravou"); });
    conciliar.mockImplementation(async () => { ordem.push("conciliou"); });
    const texto = await lerFluxo(await pedir(CORPO));
    ordem.push("emitiu");
    expect(ordem).toEqual(["gravou", "conciliou", "emitiu"]);
    expect(texto).toContain("event: pronta");
  });

  // ⚠⚠ REENVIO DA MESMA CHAVE NÃO COBRA DE NOVO — cada tentativa aqui é dinheiro.
  it("chave repetida devolve a execução existente sem chamar o modelo", async () => {
    abrirExecucao.mockResolvedValue({ repetida: true, conversa: { id: "c1" }, resposta: { id: "m1" } });
    lerConversa.mockResolvedValue({ mensagens: [{ id: "m1", papel: "ASSISTENTE", conteudo: "já respondida" }] });
    const r = await pedir(CORPO);
    const j = await r.json();
    expect(j.repetida).toBe(true);
    expect(responder).not.toHaveBeenCalled();
  });

  it("falha do modelo marca a execução e avisa, sem derrubar a rota", async () => {
    responder.mockRejectedValue(new Error("Anthropic fora do ar"));
    const texto = await lerFluxo(await pedir(CORPO));
    expect(falharExecucao).toHaveBeenCalledWith("m1", "Anthropic fora do ar");
    expect(texto).toContain("event: erro");
    // ⚠ A mensagem ao usuário não vaza o erro cru do provedor.
    expect(texto).not.toContain("Anthropic fora do ar");
  });
});
