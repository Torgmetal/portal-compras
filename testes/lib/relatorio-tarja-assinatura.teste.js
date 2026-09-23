import { describe, expect, it } from "vitest";
import { faltamAssinar, rotuloAssinante, tarjaDoEnvio } from "@/lib/qualidade-campo";

const GERALDO = { nome: "Geraldo Tank", email: "qualidade@torg.com.br", assinadoEm: "2026-09-17T16:17:12Z" };
const DAVI = { nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br", assinadoEm: null };
const ALEXANDRE = { nome: "Alexandre Stival", email: "alexandre_stival@yahoo.com.br", assinadoEm: null };

describe("tarja do relatório enviado para assinatura", () => {
  it("RIP-089-002: diz quem assinou E quem falta — 'assinado por' sozinho parece documento assinado", () => {
    expect(tarjaDoEnvio([DAVI, GERALDO], 0))
      .toBe("assinado por Geraldo Tank · falta Davi Pinho · R00 — alterações ficam registradas");
  });

  it("todos assinaram: o texto de sempre", () => {
    expect(tarjaDoEnvio([GERALDO, { ...DAVI, assinadoEm: "2026-09-19T10:00:00Z" }], 1))
      .toBe("assinado por Geraldo Tank, Davi Pinho · R01 — alterações ficam registradas");
  });

  it("ninguém assinou ainda", () => {
    expect(tarjaDoEnvio([DAVI, ALEXANDRE], 2))
      .toBe("enviado para assinatura · falta Davi Pinho, Alexandre Stival · R02 — alterações ficam registradas");
  });

  it("quem falta sai com o e-mail do convite", () => {
    expect(faltamAssinar([GERALDO, ALEXANDRE]).map(rotuloAssinante))
      .toEqual(["Alexandre Stival (alexandre_stival@yahoo.com.br)"]);
  });
});
