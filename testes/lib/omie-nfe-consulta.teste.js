import { describe, it, expect, vi, afterEach } from "vitest";
import { consultarNFePorPedido } from "@/lib/omie-nfe";

// ─── ConsultarNF: AUSÊNCIA, ERRO E DOCUMENTO SÃO TRÊS COISAS ─────────────────
//
// ⚠⚠ O OMIE RESPONDE **HTTP 500** QUANDO O PEDIDO NÃO TEM NOTA. Medido contra a API em
// 23/09/2026: `{"faultstring":"ERROR: NF não cadastrada para o pedido [999999999] !] !"}` com
// status 500. É o caso NORMAL de "ainda não faturado". Quem cortar em `resp.ok` transforma a
// obra inteira em falha de consulta — e quem não olhar o corpo transforma falha em "não tem NF".
// Os dois erros já aconteceram neste arquivo, um de cada vez.

const resposta = (status, corpo) => ({ ok: status < 400, status, text: async () => JSON.stringify(corpo) });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
process.env.OMIE_APP_KEY ||= "k";
process.env.OMIE_APP_SECRET ||= "s";

describe("o que separa ausência de erro", () => {
  it("500 com “NF não cadastrada” é AUSÊNCIA, não erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(500, { faultstring: "ERROR: NF não cadastrada para o pedido [1] !] !" })));
    expect(await consultarNFePorPedido(1)).toEqual({ nf: null });
  });

  it("500 sem explicação nenhuma é ERRO, não ausência", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(500, {})));
    const r = await consultarNFePorPedido(1);
    expect(r.error).toContain("500");
    expect(r.nf).toBeUndefined();
  });

  it("corpo que não é JSON é ERRO — nunca “não tem NF”", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, text: async () => "<html>gateway</html>" })));
    expect((await consultarNFePorPedido(1)).error).toContain("não é JSON");
  });

  it("bloqueio por consulta repetida é erro com instrução", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(500, { faultstring: "REDUNDANT CALL" })));
    expect((await consultarNFePorPedido(1)).error).toContain("Aguarde");
  });

  it("200 sem identificação da nota é ausência", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, { ide: {}, compl: {} })));
    expect(await consultarNFePorPedido(1)).toEqual({ nf: null });
  });
});

describe("o documento, quando existe", () => {
  const nfe = {
    ide: { nNF: "0000973", serie: "001", dEmi: "14/09/2026", natOp: "VENDA" },
    compl: { cChaveNFe: "35260953694442000141550010000009731484823558", nIdNF: 7, cStat: "100" },
    det: [{ produto: { cfop: "6101" } }, { produto: { cfop: "6125" } }],
  };

  it("traz número sem zeros, chave, situação e os CFOPs dos itens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, nfe)));
    const { nf } = await consultarNFePorPedido(1);
    expect(nf).toMatchObject({ numero: "973", serie: "1", situacao: "AUTORIZADA", natureza: "VENDA" });
    // ⚠ Uma nota tem vários itens com CFOPs diferentes: o critério é "CONTÉM item com este CFOP".
    expect(nf.cfops).toEqual(["6101", "6125"]);
  });

  it("nota cancelada é marcada como tal — quem decide o peso disso é a conferência", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, { ...nfe, compl: { ...nfe.compl, cStat: "101" } })));
    expect((await consultarNFePorPedido(1)).nf.situacao).toBe("CANCELADA");
  });

  // ⚠⚠ LISTA VAZIA E "NÃO CONSEGUI LER" SÃO COISAS DIFERENTES: `null` reduz a cobertura da
  // conferência, `[]` seria uma nota que legitimamente não casa etapa nenhuma.
  it("sem CFOP legível nos itens devolve null, não lista vazia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, { ...nfe, det: [{ produto: {} }] })));
    expect((await consultarNFePorPedido(1)).nf.cfops).toBeNull();
  });
});
