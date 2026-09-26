import { describe, it, expect, vi } from "vitest";
import { pedirJson, Esquema } from "@/lib/ia-json";

// O "responda SOMENTE com JSON" no prompt virou formato estruturado da API: o pedido leva o schema
// em `output_config.format`, e a resposta é lida sem caçar `{` no texto.

const resposta = (texto, stop_reason = "end_turn") => ({ content: [{ type: "text", text: texto }], stop_reason });
const clienteQueResponde = (r) => {
  const create = vi.fn().mockResolvedValue(r);
  return { create, messages: { create } };
};
const FORMATO = Esquema.objeto({ nome: Esquema.texto });

describe("pedirJson", () => {
  it("manda o schema em output_config.format e devolve o objeto", async () => {
    const c = clienteQueResponde(resposta('{"nome":"Torg"}'));
    const r = await pedirJson(c, { model: "m", max_tokens: 10, messages: [], formato: FORMATO });
    const pedido = c.create.mock.calls[0][0];
    expect(pedido.output_config).toEqual({ format: { type: "json_schema", schema: FORMATO } });
    expect(pedido).not.toHaveProperty("formato");
    expect(r.dados).toEqual({ nome: "Torg" });
  });

  it("não apaga o que o pedido já trazia em output_config", async () => {
    const c = clienteQueResponde(resposta('{"nome":"Torg"}'));
    await pedirJson(c, { model: "m", max_tokens: 10, messages: [], output_config: { effort: "low" }, formato: FORMATO });
    expect(c.create.mock.calls[0][0].output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: FORMATO } });
  });

  it("cortada por max_tokens: sem dados, mas com o texto cru para quem quiser aproveitar o que fechou", async () => {
    const c = clienteQueResponde(resposta('{"nome":"To', "max_tokens"));
    const r = await pedirJson(c, { model: "m", max_tokens: 10, messages: [], formato: FORMATO });
    expect(r).toMatchObject({ dados: null, texto: '{"nome":"To', parada: "max_tokens" });
  });

  it("recusa não segue o schema: sem dados", async () => {
    const c = clienteQueResponde(resposta("Não posso ajudar com isso.", "refusal"));
    const r = await pedirJson(c, { model: "m", max_tokens: 10, messages: [], formato: FORMATO });
    expect(r.dados).toBeNull();
    expect(r.parada).toBe("refusal");
  });
});

describe("Esquema.objeto", () => {
  it("fecha o objeto: todo campo obrigatório e nenhum campo extra", () => {
    expect(Esquema.objeto({ a: Esquema.texto, b: Esquema.numeroOuNulo })).toEqual({
      type: "object",
      properties: { a: { type: "string" }, b: { type: ["number", "null"] } },
      required: ["a", "b"],
      additionalProperties: false,
    });
  });
});
