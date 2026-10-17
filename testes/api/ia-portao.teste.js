// O portão de IA da Engenharia: tudo que é conferido ANTES de gastar um token, e o registro do consumo depois.
// Prisma e a Anthropic são simulados — nenhum teste toca o banco nem a API.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST } from "@/app/api/engenharia-ia/v1/messages/route";
import { POST as CONTAR } from "@/app/api/engenharia-ia/v1/messages/count_tokens/route";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc-do-john";
const corpo = (extra = {}) => ({ model: "claude-opus-5-5", max_tokens: 1000, stream: true, messages: [{ role: "user", content: "liste os conjuntos" }], ...extra });
const pedir = (body = corpo(), headers = { authorization: `Bearer ${TOKEN}` }, rota = POST) =>
  rota(new Request("http://localhost/api/engenharia-ia/v1/messages", { method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...headers }, body: JSON.stringify(body) }));

const SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":1000000,"output_tokens":1}}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":100000}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];
function respostaSse() {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { SSE.forEach((p) => c.enqueue(enc.encode(p))); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

let fetchMock;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY_ENGENHARIA = "sk-ant-chave-da-empresa";
  process.env.IA_COTACAO_USD_BRL = "5";
  fetchMock = vi.fn(async () => respostaSse());
  vi.stubGlobal("fetch", fetchMock);
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO", nome: "PC-JOHN" } : null));
  mockPrisma.iaAparelho.update.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
  mockPrisma.iaLimite.findUnique.mockResolvedValue({ userId: "u1", tetoMensalBrl: 500 });
  mockPrisma.iaUso.aggregate.mockResolvedValue({ _sum: { custoBrl: 100 } });
  mockPrisma.iaUso.count.mockResolvedValue(0);
  mockPrisma.iaUso.create.mockResolvedValue({});
});

const erroDe = async (r) => (await r.json()).error;

describe("antes de gastar um token", () => {
  it("sem token, ou token que não é de aparelho ATIVO: 401", async () => {
    expect((await pedir(corpo(), {})).status).toBe(401);
    expect((await pedir(corpo(), { authorization: "Bearer outro" })).status).toBe(401);
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", userId: "u1", status: "REVOGADO" });
    expect((await pedir()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("token também vale no x-api-key (ANTHROPIC_API_KEY apontando para o portão)", async () => {
    const r = await pedir(corpo(), { "x-api-key": TOKEN });
    expect(r.status).toBe(200);
  });

  it("usuário desativado ou sem o módulo ENGENHARIA: 403 — ADMIN passa sem o módulo", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", ativo: false, tipo: "USUARIO" });
    expect((await pedir()).status).toBe(403);
    mockPrisma.userModulo.findFirst.mockResolvedValueOnce(null);
    expect((await pedir()).status).toBe(403);
    // ADMIN nem chega a consultar o módulo
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", ativo: true, tipo: "ADMIN" });
    const antes = mockPrisma.userModulo.findFirst.mock.calls.length;
    expect((await pedir()).status).toBe(200);
    expect(mockPrisma.userModulo.findFirst.mock.calls.length).toBe(antes);
  });

  it("modelo fora do piloto (Opus 5.5 e Sonnet 5.5): 400 em português, registrado como recusa", async () => {
    const r = await pedir(corpo({ model: "claude-fable-5-1" }));
    expect(r.status).toBe(400);
    expect((await erroDe(r)).message).toMatch(/Opus 5.5 ou Sonnet 5.5/);
    expect(mockPrisma.iaUso.create.mock.calls[0][0].data).toMatchObject({ situacao: "recusado_modelo", userId: "u1", modelo: "claude-fable-5-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem teto definido: 403 dizendo para falar com o ADMIN", async () => {
    mockPrisma.iaLimite.findUnique.mockResolvedValueOnce(null);
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await erroDe(r)).message).toMatch(/teto/);
  });

  it("teto do mês atingido: 429 com quanto gastou e quanto é o teto", async () => {
    mockPrisma.iaUso.aggregate.mockResolvedValueOnce({ _sum: { custoBrl: 500.4 } });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await erroDe(r)).message).toMatch(/R\$\s?500,40 de R\$\s?500,00/);
    expect(mockPrisma.iaUso.aggregate.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("mais de 60 chamadas no último minuto pelo mesmo aparelho: 429 (anti-laço)", async () => {
    mockPrisma.iaUso.count.mockResolvedValueOnce(60);
    expect((await pedir()).status).toBe(429);
  });

  it("portão sem a chave da Engenharia configurada: 503, sem chamar a Anthropic", async () => {
    delete process.env.ANTHROPIC_API_KEY_ENGENHARIA;
    expect((await pedir()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("repasse e registro", () => {
  it("vai à Anthropic com a chave da EMPRESA — o token do aparelho nunca sai do portal", async () => {
    await (await pedir(corpo(), { authorization: `Bearer ${TOKEN}`, "anthropic-beta": "fast-mode-2026-02-01", cookie: "x=1" })).text();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-chave-da-empresa");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers["anthropic-beta"]).toBe("fast-mode-2026-02-01");
    expect(JSON.stringify(init.headers)).not.toMatch(new RegExp(TOKEN));
    expect(init.headers.cookie).toBeUndefined();
  });

  it("stream repassado inteiro; no fim grava tokens, custo em US$ e R$ e o pedido do projetista", async () => {
    const r = await pedir();
    expect(r.headers.get("content-type")).toMatch(/event-stream/);
    expect(await r.text()).toBe(SSE.join(""));
    const d = mockPrisma.iaUso.create.mock.calls.at(-1)[0].data;
    // 1M entrada × US$4 + 100k saída × US$20 = US$6 → R$30 na cotação 5
    expect(d).toMatchObject({ situacao: "ok", aparelhoId: "ap1", userId: "u1", modelo: "claude-opus-5-5", inputTokens: 1000000, outputTokens: 100000, custoBrl: 30, pedido: "liste os conjuntos" });
    expect(d.custoUsd).toBeCloseTo(6, 6);
  });

  it("grava etapa e conversa dos cabeçalhos x-torg-*, sem repassá-los à Anthropic", async () => {
    const r = await pedir(corpo(), { authorization: `Bearer ${TOKEN}`, "x-torg-etapa": "3", "x-torg-conversa": "abc12345-def" });
    await r.text();
    expect(mockPrisma.iaUso.create.mock.calls.at(-1)[0].data).toMatchObject({ etapa: "3", conversa: "abc12345-def" });
    const enviados = Object.keys(fetchMock.mock.calls[0][1].headers).map((h) => h.toLowerCase());
    expect(enviados.some((h) => h.startsWith("x-torg"))).toBe(false);
  });

  it("etapa livre vale; valores fora do padrão viram null", async () => {
    let r = await pedir(corpo(), { authorization: `Bearer ${TOKEN}`, "x-torg-etapa": "livre" }); await r.text();
    expect(mockPrisma.iaUso.create.mock.calls.at(-1)[0].data.etapa).toBe("livre");
    for (const [e, c] of [["7", "curto"], ["0", "tem espaço aqui!"], ["Livre", "x".repeat(65)], ["1; drop", "ab_cdefgh"]]) {
      r = await pedir(corpo(), { authorization: `Bearer ${TOKEN}`, "x-torg-etapa": e, "x-torg-conversa": c }); await r.text();
      expect(mockPrisma.iaUso.create.mock.calls.at(-1)[0].data).toMatchObject({ etapa: null, conversa: null });
    }
  });

  it("falhar ao gravar o consumo NÃO derruba a resposta já entregue", async () => {
    mockPrisma.iaUso.create.mockRejectedValue(new Error("banco fora"));
    const r = await pedir();
    expect(await r.text()).toBe(SSE.join(""));
  });

  it("erro da Anthropic passa adiante com o status dela, registrado como erro sem custo", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), { status: 529, headers: { "content-type": "application/json" } }));
    const r = await pedir(corpo({ stream: false }));
    expect(r.status).toBe(529);
    await r.text();
    expect(mockPrisma.iaUso.create.mock.calls.at(-1)[0].data).toMatchObject({ situacao: "erro", custoUsd: 0 });
  });
});

describe("count_tokens", () => {
  it("mesmas checagens de aparelho e modelo, sem saldo nem registro de custo", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ input_tokens: 42 }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await pedir(corpo({ stream: undefined }), undefined, CONTAR);
    expect(await r.json()).toEqual({ input_tokens: 42 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages/count_tokens");
    expect(mockPrisma.iaUso.aggregate).not.toHaveBeenCalled();
    expect(mockPrisma.iaUso.create).not.toHaveBeenCalled();
  });
});
