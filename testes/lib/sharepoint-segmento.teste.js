// `downloadFileById` — o id vem do BANCO e vai para dentro de uma URL do Graph.
//
// ⚠⚠ ELE ERA INTERPOLADO CRU (achado ALTA do Codex, 15/09/2026). Um `sharepointItemId` valendo
// `../../outro-drive/items/outro-item` saía do drive escolhido pela aplicação MANTENDO o token do
// Graph na requisição. Não é SSRF — o host continua sendo o Graph —, é desvio para um recurso que
// a aplicação não escolheu, com credencial válida. Quem grava esse campo é importador.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ⚠ `getAccessToken` mora no PRÓPRIO `lib/sharepoint.js` — mockar um "@/lib/sharepoint-auth" que
// não existe não muda nada e o teste morre pedindo AZURE_TENANT_ID. Aqui as credenciais são falsas
// e o endpoint do token responde pelo mock de fetch, que é o mesmo que grava as chamadas.
let downloadFileById;
let chamadas;

beforeEach(async () => {
  process.env.AZURE_TENANT_ID = "tenant-de-teste";
  process.env.AZURE_CLIENT_ID = "client-de-teste";
  process.env.AZURE_CLIENT_SECRET = "segredo-de-teste";
  chamadas = [];
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("login.microsoftonline.com")) {
      return { ok: true, json: async () => ({ access_token: "token-falso", expires_in: 3600 }) };
    }
    chamadas.push(u);
    return { ok: true, arrayBuffer: async () => Buffer.from("X"), headers: { get: () => "application/pdf" } };
  });
  ({ downloadFileById } = await import("@/lib/sharepoint"));
});
afterEach(() => vi.restoreAllMocks());

const caminhoDe = (u) => new URL(u).pathname;

describe("downloadFileById trata o id como identificador opaco", () => {
  it("id normal do Graph atravessa inteiro — inclusive o `!`", async () => {
    await downloadFileById("b!drive-real", "012SCVJYJBHNWXIQ");
    expect(caminhoDe(chamadas[0])).toBe("/v1.0/drives/b!drive-real/items/012SCVJYJBHNWXIQ/content");
  });

  // ⚠⚠ A BARRA VIRA %2F E O GRAPH DEIXA DE ENXERGAR SEPARADOR: o alvo continua sendo o drive que a
  // aplicação escolheu, e o id inteiro (com as barras) é procurado como um id só — que não existe.
  it("id com travessia de caminho não troca de drive", async () => {
    await downloadFileById("b!drive-real", "../../drive-alvo/items/item-alvo");
    const p = caminhoDe(chamadas[0]);
    expect(p).toBe("/v1.0/drives/b!drive-real/items/..%2F..%2Fdrive-alvo%2Fitems%2Fitem-alvo/content");
    expect(p).not.toMatch(/drives\/drive-alvo/);
    expect(p.split("/items/").length).toBe(2);
  });

  it("driveId também é codificado — a travessia vale para os dois lados", async () => {
    await downloadFileById("../../outro", "item");
    expect(caminhoDe(chamadas[0])).toBe("/v1.0/drives/..%2F..%2Foutro/items/item/content");
  });

  it("query e fragmento no id não viram parâmetros da chamada", async () => {
    await downloadFileById("b!d", "item?$select=tudo#x");
    const u = new URL(chamadas[0]);
    expect(u.search).toBe("");
    expect(u.hash).toBe("");
  });

  it("id vazio, '.' ou '..' é recusado antes de qualquer requisição", async () => {
    for (const mau of ["", "   ", ".", "..", null, undefined]) {
      await expect(downloadFileById("b!d", mau)).rejects.toThrow(/itemId inválido/);
      await expect(downloadFileById(mau, "item")).rejects.toThrow(/driveId inválido/);
    }
    expect(chamadas).toHaveLength(0); // nenhuma chamada ao Graph — o token não conta
  });
});
