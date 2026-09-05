import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "@/lib/log";

// ⚠ O contrato que importa aqui é "nada que imprimia antes parou de imprimir".
// O nível padrão em produção é "info" justamente pra isso — ver lib/log.js.
describe("log", () => {
  let espioes;
  beforeEach(() => {
    espioes = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_NIVEL;
    process.env.NODE_ENV = "test";
  });

  it("prefixa com o nome do módulo", () => {
    process.env.LOG_NIVEL = "debug";
    log("omie-pedido").erro("quebrou", 42);
    expect(espioes.error).toHaveBeenCalledWith("[omie-pedido]", "quebrou", 42);
  });

  it("em produção, erro/aviso/info continuam saindo", () => {
    process.env.NODE_ENV = "production";
    const r = log("x");
    r.erro("a"); r.aviso("b"); r.info("c");
    expect(espioes.error).toHaveBeenCalledTimes(1);
    expect(espioes.warn).toHaveBeenCalledTimes(1);
    expect(espioes.info).toHaveBeenCalledTimes(1);
  });

  it("LOG_NIVEL=error corta aviso, info e debug", () => {
    process.env.LOG_NIVEL = "error";
    const r = log("x");
    r.erro("a"); r.aviso("b"); r.info("c"); r.debug("d");
    expect(espioes.error).toHaveBeenCalledTimes(1);
    expect(espioes.warn).not.toHaveBeenCalled();
    expect(espioes.info).not.toHaveBeenCalled();
    expect(espioes.debug).not.toHaveBeenCalled();
  });

  it("LOG_NIVEL=silent cala tudo", () => {
    process.env.LOG_NIVEL = "silent";
    const r = log("x");
    r.erro("a"); r.aviso("b");
    expect(espioes.error).not.toHaveBeenCalled();
    expect(espioes.warn).not.toHaveBeenCalled();
  });

  it("LOG_NIVEL inválido cai no padrão em vez de calar o log", () => {
    process.env.LOG_NIVEL = "ruidoso";
    process.env.NODE_ENV = "production";
    log("x").erro("a");
    expect(espioes.error).toHaveBeenCalledTimes(1);
  });
});
