import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { portalCliente: { findUnique: mocks.findUnique }, oP: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/sharepoint", () => ({ getAccessToken: mocks.token }));
vi.mock("@/lib/portal-cliente", () => ({ secoesDoPortal: () => ["MODELO_NAVEGAVEL"], tipoDoDocEng: () => "MODELO_3D", portalExpirado: () => false }));
import { GET } from "../../app/api/portal/[token]/modelo-3d/route";
const doc = { id: "atual", nome: "atual.ifc", comparacaoIfc: { publicar: true, anterior: { id: "anterior", nome: "anterior.ifc", tamanho: 10 } } };
const request = (query = "") => GET(new Request(`https://local/api/modelo-3d${query}`), { params: { token: "cliente" } });
beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue({ numero: "089" }); mocks.findUnique.mockResolvedValue({ status: "PUBLICADO", docsPorArea: { ENGENHARIA: [structuredClone(doc)] } }); mocks.token.mockResolvedValue("fake"); });
describe("acesso público à revisão anterior", () => {
  it("bloqueia download direto quando a opção está desligada", async () => {
    mocks.findUnique.mockResolvedValue({ status: "PUBLICADO", docsPorArea: { ENGENHARIA: [{ ...doc, comparacaoIfc: { ...doc.comparacaoIfc, publicar: false } }] } });
    const r = await request("?rel=atual&revisao=anterior"); expect(r.status).toBe(404); expect(mocks.token).not.toHaveBeenCalled();
    const list = await (await request()).json(); expect(list.modelos[0].comparacao).toBeUndefined();
  });
  it("não aceita o id do anterior como modelo publicado independente", async () => {
    expect((await request("?rel=anterior")).status).toBe(404);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("bloqueia a comparação quando o portal não está publicado", async () => {
    mocks.findUnique.mockResolvedValue({ status: "RASCUNHO" }); expect((await request("?rel=atual&revisao=anterior")).status).toBe(404);
  });
  it("exige nova publicação se o arquivo foi substituído", async () => {
    mocks.findUnique.mockResolvedValue({ status: "PUBLICADO", docsPorArea: { ENGENHARIA: [{ ...doc, comparacaoIfc: { publicar: true, anterior: { ...doc.comparacaoIfc.anterior, etag: "versao-1" } } }] } });
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ eTag: "versao-2" }));
    try { expect((await request("?rel=atual&revisao=anterior")).status).toBe(409); expect(mock).toHaveBeenCalledTimes(1); } finally { mock.mockRestore(); }
  });
  it("serve o anterior autorizado e impede cache persistente", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("IFC"));
    try { const r = await request("?rel=atual&revisao=anterior"); expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("private, no-store"); expect(mock.mock.calls[0][0]).toContain("/items/anterior/content"); } finally { mock.mockRestore(); }
  });
});
