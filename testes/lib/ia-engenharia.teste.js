// Regras puras do portão de IA da Engenharia (F1 do app Torg Engenharia, spec 2026-10-14).
import { describe, expect, it } from "vitest";
import {
  MODELOS_PERMITIDOS, custoUsd, usdParaBrl, gerarCodigoPareamento, hashToken, normalizarCodigo,
  pedidoDoProjetista, LeitorUsage, inicioDoMesSP, agruparPorEtapa,
} from "@/lib/ia-engenharia";

describe("custo", () => {
  it("Opus 5.5: entrada 4, saída 20, cache lido 0,20, cache gravado 5 (US$/milhão)", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 200_000 };
    expect(custoUsd("claude-opus-5-5", u)).toBeCloseTo(4 + 2 + 0.4 + 1, 6);
  });
  it("Sonnet 5.5 custa metade na entrada e na saída", () => {
    expect(custoUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(12, 6);
  });
  it("só os dois modelos do piloto; outro modelo não tem preço (o portão recusa antes)", () => {
    expect(MODELOS_PERMITIDOS).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(() => custoUsd("claude-haiku-5-5", { input_tokens: 1 })).toThrow(/sem preço/);
  });
  it("cache de 1 hora grava a 2× a entrada (Opus 8, Sonnet 4); a de 5 min segue 1,25×", () => {
    const u = { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_5m_input_tokens: 400_000, ephemeral_1h_input_tokens: 600_000 } };
    expect(custoUsd("claude-opus-5-5", u)).toBeCloseTo(0.4 * 5 + 0.6 * 8, 6);
    expect(custoUsd("claude-sonnet-5-5", u)).toBeCloseTo(0.4 * 2.5 + 0.6 * 4, 6);
  });
  it("sem o detalhamento, todo cache gravado é cobrado como 5 min (comportamento antigo)", () => {
    expect(custoUsd("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(5, 6);
  });
  it("detalhamento que não soma o total: o resto vai a 5 min, nunca fica sem cobrança", () => {
    const u = { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 600_000 } };
    expect(custoUsd("claude-opus-5-5", u)).toBeCloseTo(0.6 * 8 + 0.4 * 5, 6);
  });
  it("total ausente mas detalhamento > 0: cobra pela soma do detalhamento", () => {
    expect(custoUsd("claude-opus-5-5", { cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 } })).toBeCloseTo(13, 6);
  });
  it("R$ pela cotação configurada, com 2 casas", () => {
    expect(usdParaBrl(10, 5.4321)).toBe(54.32);
  });
});

describe("pareamento e token", () => {
  it("código curto TRG-XXXX sem caracteres ambíguos (0/O, 1/I/L)", () => {
    for (let i = 0; i < 200; i++) expect(gerarCodigoPareamento()).toMatch(/^TRG-[2-9A-HJ-KM-NP-Z]{4}$/);
  });
  it("o projetista pode digitar em minúscula, sem o TRG ou com espaço", () => {
    expect(normalizarCodigo(" trg-4f7k ")).toBe("TRG-4F7K");
    expect(normalizarCodigo("4f7k")).toBe("TRG-4F7K");
    expect(normalizarCodigo("TRG 4F7K")).toBe("TRG-4F7K");
    expect(normalizarCodigo("x")).toBeNull();
  });
  it("hash do token: SHA-256 em hex, determinístico — o token em si nunca vai ao banco", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("pedido do projetista", () => {
  it("é o último texto que ELE escreveu — resultado de ferramenta não conta", () => {
    const messages = [
      { role: "user", content: "liste os conjuntos da fase 2" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "listar_conjuntos", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[...]" }] },
    ];
    expect(pedidoDoProjetista(messages)).toBe("liste os conjuntos da fase 2");
  });
  it("blocos de texto juntos, cortado em 2.000 caracteres", () => {
    const messages = [{ role: "user", content: [{ type: "text", text: "a".repeat(1500) }, { type: "text", text: "b".repeat(1500) }] }];
    expect(pedidoDoProjetista(messages)).toHaveLength(2000);
  });
  it("sem texto do projetista: null", () => {
    expect(pedidoDoProjetista([])).toBeNull();
  });
});

describe("consumo lido do stream (SSE da Anthropic)", () => {
  it("message_start traz a entrada, message_delta a saída — mesmo com o evento partido entre pedaços", () => {
    const sse = [
      'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":1200,"cache_read_input_tokens":30000,"cache_creation_input_tokens":0,"output_tokens":1}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Olá"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":850}}\n\n',
    ].join("");
    const l = new LeitorUsage();
    for (let i = 0; i < sse.length; i += 37) l.alimentar(sse.slice(i, i + 37)); // pedaços que cortam no meio
    expect(l.usage()).toEqual({ input_tokens: 1200, output_tokens: 850, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0 });
  });
  it("guarda o detalhamento cache_creation do stream (message_start)", () => {
    const sse = 'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_creation_input_tokens":100,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":100}}}}\n\n'
      + 'data: {"type":"message_delta","usage":{"output_tokens":7}}\n\n';
    const l = new LeitorUsage(); l.alimentar(sse);
    expect(l.usage()).toMatchObject({ output_tokens: 7, cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 } });
  });
  it("delta com null/0 em entrada e cache não apaga o que o start trouxe", () => {
    const l = new LeitorUsage();
    l.alimentar('data: {"type":"message_start","message":{"usage":{"input_tokens":50,"cache_read_input_tokens":70,"cache_creation_input_tokens":30}}}\n\n'
      + 'data: {"type":"message_delta","usage":{"input_tokens":null,"cache_read_input_tokens":null,"cache_creation_input_tokens":0,"output_tokens":9}}\n\n');
    expect(l.usage()).toMatchObject({ input_tokens: 50, cache_read_input_tokens: 70, cache_creation_input_tokens: 30, output_tokens: 9 });
  });
  it("delta só com output_tokens mantém o resto", () => {
    const l = new LeitorUsage();
    l.alimentar('data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n');
    expect(l.usage()).toMatchObject({ input_tokens: 5, output_tokens: 3 });
  });
  it("cache_creation cumulativo no delta: maior por subchave", () => {
    const l = new LeitorUsage();
    l.alimentar('data: {"type":"message_start","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":10,"ephemeral_1h_input_tokens":20}}}}\n\n'
      + 'data: {"type":"message_delta","usage":{"cache_creation":{"ephemeral_5m_input_tokens":null,"ephemeral_1h_input_tokens":25}}}\n\n');
    expect(l.usage().cache_creation).toEqual({ ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 25 });
  });
  it("e no JSON inteiro", () => {
    const l = new LeitorUsage();
    l.alimentar(JSON.stringify({ usage: { cache_creation_input_tokens: 9, cache_creation: { ephemeral_5m_input_tokens: 4, ephemeral_1h_input_tokens: 5 } } }));
    expect(l.usage().cache_creation).toEqual({ ephemeral_5m_input_tokens: 4, ephemeral_1h_input_tokens: 5 });
  });
  it("resposta sem stream: lê o usage do JSON inteiro", () => {
    const l = new LeitorUsage();
    l.alimentar(JSON.stringify({ type: "message", usage: { input_tokens: 10, output_tokens: 5 } }));
    expect(l.usage()).toMatchObject({ input_tokens: 10, output_tokens: 5 });
  });
});

describe("mês do teto", () => {
  it("começa à meia-noite do dia 1 em São Paulo (03:00 UTC)", () => {
    expect(inicioDoMesSP(new Date("2026-10-16T15:00:00Z")).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    // 1º de novembro às 01:00 em SP ainda é 31/10 04:00 UTC → já é novembro em SP
    expect(inicioDoMesSP(new Date("2026-11-01T04:00:00Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("custo por etapa", () => {
  const L = (etapa, userId, conversa, n, brl, w, r) => ({ etapa, userId, conversa, _count: { _all: n }, _sum: { custoBrl: brl, cacheWriteTokens: w, cacheReadTokens: r } });
  it("soma por etapa e por usuário, conta conversas distintas e põe 'sem etapa' por último", () => {
    const r = agruparPorEtapa([
      L(null, "u1", null, 4, 1, 0, 0), L("livre", "u1", "c-aaaaaaaa", 1, 2, 10, 20),
      L("2", "u1", "c-aaaaaaaa", 3, 3.333, 100, 200), L("2", "u2", "c-bbbbbbbb", 2, 1.111, 50, 0), L("2", "u1", "c-cccccccc", 1, 1, 0, 5),
    ], (id) => `nome-${id}`);
    expect(r.map((e) => e.etapa)).toEqual(["2", "livre", "sem etapa"]);
    expect(r[0]).toMatchObject({ chamadas: 6, conversas: 3, custoBrl: 5.44, cacheGravado: 150, cacheLido: 205 });
    expect(r[0].usuarios[0]).toMatchObject({ usuario: "nome-u1", chamadas: 4, conversas: 2, custoBrl: 4.33 });
    expect(r[2]).toMatchObject({ conversas: 0, chamadas: 4 });
  });
});
