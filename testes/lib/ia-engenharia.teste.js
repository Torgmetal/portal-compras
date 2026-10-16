// Regras puras do portão de IA da Engenharia (F1 do app Torg Engenharia, spec 2026-10-14).
import { describe, expect, it } from "vitest";
import {
  MODELOS_PERMITIDOS, custoUsd, usdParaBrl, gerarCodigoPareamento, hashToken, normalizarCodigo,
  pedidoDoProjetista, LeitorUsage, inicioDoMesSP,
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
