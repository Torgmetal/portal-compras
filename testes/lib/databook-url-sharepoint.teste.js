// `ehUrlSharePoint` — a função REAL, não um espelho dela no mock.
//
// ⚠⚠ POR QUE UM ARQUIVO SÓ PARA ISTO: ela é a guarda que decide se uma URL do banco pode ser
// entregue ao `/shares` do Graph. No teste da ROTA ela é mockada, e o meu mock saiu mais frouxo
// que a implementação (não olhava credenciais na URL) — o teste passou a mentir na primeira
// tentativa. Guarda de segurança se testa na original; o parecer do Codex (15/09/2026) pediu
// exatamente isso: "validador real: host enganoso, query, credenciais, HTTP e outro tenant".
import { describe, it, expect } from "vitest";
import { ehUrlSharePoint } from "@/lib/databook-arquivo";

describe("ehUrlSharePoint", () => {
  it("aceita o tenant da empresa em https", () => {
    for (const u of [
      "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Almoxarifado/R%20261085.pdf",
      "https://torgmetal637.sharepoint.com/sites/TorgMetal/_layouts/15/Doc.aspx?sourcedoc=%7BX%7D",
      "https://TORGMETAL637.SHAREPOINT.COM/x.pdf",
    ]) expect(ehUrlSharePoint(u)).toBe(true);
  });

  // ⚠⚠ A REGEX ANTIGA (`/sharepoint\.com/`) DIZIA SIM PARA TODOS ESTES. É por isso que a checagem
  // passou a ser pelo hostname analisado, e não por substring em qualquer lugar do texto.
  it("recusa o host que apenas CONTÉM o nome", () => {
    for (const u of [
      "https://sharepoint.com.exemplo-malicioso.br/x.pdf",
      "https://evil-sharepoint.com/x.pdf",
      "https://malicioso.br/?q=torgmetal637.sharepoint.com",
      "https://malicioso.br/sharepoint.com/x.pdf",
      "https://malicioso.br/x.pdf#torgmetal637.sharepoint.com",
    ]) expect(ehUrlSharePoint(u)).toBe(false);
  });

  // ⚠ Porta explícita passava pela checagem de hostname e apontaria para um serviço que não é o
  // SharePoint (confirmado pelo Codex na 2ª rodada).
  it("recusa porta explícita", () => {
    for (const u of [
      "https://torgmetal637.sharepoint.com:8443/x.pdf",
      "https://torgmetal637.sharepoint.com:1234/sites/TorgMetal/x.pdf",
    ]) expect(ehUrlSharePoint(u)).toBe(false);
  });

  it("aceita o dogfood (.sharepoint-df.com), que é o outro sufixo real", () => {
    expect(ehUrlSharePoint("https://torgmetal637.sharepoint-df.com/x.pdf")).toBe(true);
  });

  it("recusa http, credenciais embutidas e endereços internos", () => {
    for (const u of [
      "http://torgmetal637.sharepoint.com/x.pdf",
      "https://user:senha@torgmetal637.sharepoint.com/x.pdf",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/api/qualidade/inspecoes/abc/pdf",
      "file:///etc/passwd",
    ]) expect(ehUrlSharePoint(u)).toBe(false);
  });

  it("recusa o que não é URL", () => {
    for (const u of ["", null, undefined, "   ", "/sites/TorgMetal/x.pdf", 42, {}]) {
      expect(ehUrlSharePoint(u)).toBe(false);
    }
  });
});
