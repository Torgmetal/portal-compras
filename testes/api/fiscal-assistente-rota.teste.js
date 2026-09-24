import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠⚠ A ORDEM DAS QUATRO OPERAÇÕES É O CONTRATO DESTA ROTA, e ela não é visível lendo o código de
// cima para baixo — só um teste prova que a reserva vem ANTES da chamada. Invertida, duas
// perguntas simultâneas furam o teto, que é exatamente o achado do Codex.

const requireAcesso = vi.fn();
vi.mock("@/lib/session", () => ({ requireAcesso: (...a) => requireAcesso(...a) }));

const reservar = vi.fn(), conciliar = vi.fn(), devolver = vi.fn();
vi.mock("@/lib/fiscal/assistente/orcamento", () => ({
  reservar: (...a) => reservar(...a), conciliar: (...a) => conciliar(...a), devolver: (...a) => devolver(...a),
}));

const configurado = vi.fn(() => true);
vi.mock("@/lib/fiscal/assistente/provedor", () => ({ configurado: () => configurado(), MODELO: "m" }));

const responder = vi.fn(), abrirExecucao = vi.fn(), concluirExecucao = vi.fn(), falharExecucao = vi.fn(), lerConversa = vi.fn(), gravarAnexo = vi.fn();
vi.mock("@/lib/fiscal/assistente/orquestrador", () => ({ responder: (...a) => responder(...a) }));
vi.mock("@/lib/fiscal/assistente/conversas", () => ({
  abrirExecucao: (...a) => abrirExecucao(...a), concluirExecucao: (...a) => concluirExecucao(...a),
  falharExecucao: (...a) => falharExecucao(...a), lerConversa: (...a) => lerConversa(...a),
  gravarAnexo: (...a) => gravarAnexo(...a),
}));

const { POST } = await import("@/app/api/fiscal/assistente/mensagem/route");
const { nfe } = await import("@/testes/apoio/nfe-exemplo");

// ⚠ Pedido de verdade (Request), não um objeto com `json()`: a rota agora olha o content-type para
// decidir entre JSON e multipart, e um dublê sem cabeçalho não exercitaria esse caminho.
const pedir = (corpo) => POST(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }));
const pedirComXml = (campos, xml, nome = "nota.xml") => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  f.append("xml", new Blob([xml], { type: "text/xml" }), nome);
  return POST(new Request("http://x/", { method: "POST", body: f }));
};
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

  // ⚠⚠⚠ ACHADO DO CODEX (24/09/2026): reenvio e 404 RETINHAM a reserva. Numa rede instável, o
  // navegador reenvia várias vezes — a pessoa seria barrada pelo próprio mecanismo que existe para
  // não cobrá-la duas vezes, e o teto do portal se esgotaria sem uma única consulta à IA.
  it("reenvio da mesma chave DEVOLVE a reserva, porque não chamou o modelo", async () => {
    abrirExecucao.mockResolvedValue({ repetida: true, conversa: { id: "c1" }, resposta: { id: "m1" } });
    lerConversa.mockResolvedValue({ mensagens: [] });
    await pedir(CORPO);
    expect(devolver).toHaveBeenCalledWith("u1", { dia: "2026-09-23", micros: 250000 });
    expect(responder).not.toHaveBeenCalled();
  });

  it("conversa inexistente (404) DEVOLVE a reserva", async () => {
    abrirExecucao.mockResolvedValue({ erro: "Conversa não encontrada." });
    const r = await pedir(CORPO);
    expect(r.status).toBe(404);
    expect(devolver).toHaveBeenCalledWith("u1", { dia: "2026-09-23", micros: 250000 });
  });

  // ⚠⚠ E A EXECUÇÃO NORMAL NÃO DEVOLVE — ela CONCILIA com o custo real. Devolver aqui faria toda
  // pergunta sair de graça do teto.
  it("execução normal NÃO devolve: concilia com o custo real", async () => {
    await lerFluxo(await pedir(CORPO));
    expect(devolver).not.toHaveBeenCalled();
    expect(conciliar).toHaveBeenCalled();
  });

  // ⚠⚠ FALHA DO MODELO TAMBÉM NÃO DEVOLVE: a chamada pode ter sido cobrada antes de falhar, e o
  // custo real é desconhecido. É a regra "reserva interrompida não volta sozinha".
  it("falha do modelo NÃO devolve a reserva — o custo real é desconhecido", async () => {
    responder.mockRejectedValue(new Error("timeout"));
    await lerFluxo(await pedir(CORPO));
    expect(devolver).not.toHaveBeenCalled();
  });

  // ⚠⚠⚠ PREPARAÇÃO LENTA ENCURTA O TEMPO DO MODELO — não empurra o fim da rota para depois dos 60 s.
  // Antes, os 42 s começavam só dentro do orquestrador: 20 s de banco lento + 42 s de modelo = 62 s.
  it("o prazo do modelo é contado desde a ENTRADA da rota, e não desde o fim da preparação", async () => {
    abrirExecucao.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 300)); // banco lento na abertura da execução
      return { conversa: { id: "c1" }, resposta: { id: "m1" } };
    });
    const entrada = Date.now();
    await lerFluxo(await pedir(CORPO));
    const { ateMs } = responder.mock.calls[0][0];
    // Contado da entrada: no máximo 50 s depois dela, MESMO com os 300 ms de preparação no meio.
    expect(ateMs - entrada).toBeLessThanOrEqual(50_000 + 50);
    expect(ateMs - entrada).toBeGreaterThanOrEqual(50_000 - 50);
  });

  // ─── o XML anexado ───
  it("XML inválido é recusado com 400 ANTES de reservar orçamento", async () => {
    const r = await pedirComXml({ pergunta: "qual CFOP?", chave: "chave-de-teste-1" }, "<pedido/>");
    expect(r.status).toBe(400);
    expect(reservar).not.toHaveBeenCalled();
  });

  it("XML com DTD é recusado antes do orçamento", async () => {
    const r = await pedirComXml({ pergunta: "x?", chave: "chave-de-teste-1" }, `<!DOCTYPE r [<!ENTITY x "y">]>${nfe()}`);
    expect(r.status).toBe(400);
    expect(reservar).not.toHaveBeenCalled();
  });

  it("XML válido chega ao orquestrador como DOCUMENTO LIDO — nunca como texto cru", async () => {
    gravarAnexo.mockResolvedValue({ gravado: true, anexoId: "a1" });
    await lerFluxo(await pedirComXml({ pergunta: "qual o CFOP de retorno?", chave: "chave-de-teste-1" }, nfe()));
    const { anexo } = responder.mock.calls[0][0];
    expect(anexo.doc.numero).toBe("973");
    expect(anexo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(anexo)).not.toContain("<infNFe");
  });

  it("o XML é guardado (privado) antes da chamada, com hash e nome saneado", async () => {
    gravarAnexo.mockResolvedValue({ gravado: true, anexoId: "a1" });
    await lerFluxo(await pedirComXml({ pergunta: "x?", chave: "chave-de-teste-1" }, nfe(), "../../nota.xml"));
    const g = gravarAnexo.mock.calls[0][0];
    expect(g.userId).toBe("u1");
    expect(g.nome).toBe(".._.._nota.xml");
    expect(g.conteudo).toContain("<infNFe");
  });

  // ⚠⚠⚠ MESMA CHAVE, OUTRO ARQUIVO (parecer de segurança do Codex): reaproveitar em silêncio
  // entregaria a análise de OUTRA nota.
  it("a identidade da tentativa inclui o arquivo — outro XML muda o hash", async () => {
    await lerFluxo(await pedirComXml({ pergunta: "x?", chave: "chave-de-teste-1" }, nfe()));
    await lerFluxo(await pedirComXml({ pergunta: "x?", chave: "chave-de-teste-1" }, nfe({ natOp: "VENDA" })));
    const [h1, h2] = abrirExecucao.mock.calls.map((c) => c[0].tentativaHash);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(h2);
  });

  it("conflito de tentativa vira 409 e DEVOLVE a reserva", async () => {
    abrirExecucao.mockResolvedValue({ conflito: true });
    const r = await pedirComXml({ pergunta: "x?", chave: "chave-de-teste-1" }, nfe());
    expect(r.status).toBe(409);
    expect(devolver).toHaveBeenCalled();
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
