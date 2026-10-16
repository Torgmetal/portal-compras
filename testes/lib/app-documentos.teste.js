// Documentos do app Torg Engenharia: validação do caminho, raízes por fonte e teto de 30 MB. SharePoint e Prisma simulados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ getAccessToken: vi.fn(async () => "tk") }));
vi.mock("@/lib/sharepoint-lpc", () => ({ resolveServidorDriveId: vi.fn(async () => "drv-servidor") }));
vi.mock("@/lib/le-servidor", () => ({ pastaDaOp: vi.fn() }));
import { pastaDaOp } from "@/lib/le-servidor";
import { caminhoRelativoSeguro, listarDocumentos, baixarDocumento } from "@/lib/app-documentos";

const NORMAS = "https://graph.microsoft.com/v1.0/drives/drv-normas/root:/Engenharia/03.%20Padr%C3%A3o%20Torg/NORMAS";
let fetchMock;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHAREPOINT_DRIVE_ID = "drv-normas";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
const urls = () => fetchMock.mock.calls.map((c) => c[0]);

describe("caminhoRelativoSeguro", () => {
  it("recusa o que escapa da raiz", () => {
    for (const c of ["../RH", "a/../b", "/Engenharia", "a\\b", "NBR%2e%2e", "%2e%2e", "C:x", "./a", "a\0b"]) expect(() => caminhoRelativoSeguro(c)).toThrow("caminho inválido");
  });
  it("aceita vazio e normaliza barras repetidas", () => {
    expect(caminhoRelativoSeguro("")).toBe("");
    expect(caminhoRelativoSeguro(undefined)).toBe("");
    expect(caminhoRelativoSeguro("NBR 8800//2008.pdf")).toBe("NBR 8800/2008.pdf");
  });
});

describe("listarDocumentos", () => {
  it("normas lista dentro da raiz NORMAS do drive principal", async () => {
    fetchMock.mockResolvedValue(json({ value: [{ id: "i1", name: "AISC 360.pdf", size: 10, file: {} }, { id: "i2", name: "Sub", folder: {} }] }));
    const r = await listarDocumentos({ fonte: "normas", caminho: "AISC" });
    expect(urls()[0]).toContain(`${NORMAS}/AISC:/children`);
    expect(r.itens).toEqual([
      { nome: "AISC 360.pdf", tipo: "arquivo", tamanho: 10, caminho: "AISC/AISC 360.pdf", id: "i1" },
      { nome: "Sub", tipo: "pasta", tamanho: 0, caminho: "AISC/Sub", id: "i2" },
    ]);
  });
  it("segue a paginação (nextLink) em vez de parar nos 200 primeiros", async () => {
    fetchMock.mockResolvedValueOnce(json({ value: [{ id: "a", name: "a.pdf", file: {} }], "@odata.nextLink": "https://graph/pag2" }))
      .mockResolvedValueOnce(json({ value: [{ id: "b", name: "b.pdf", file: {} }] }));
    const r = await listarDocumentos({ fonte: "normas" });
    expect(urls()[1]).toBe("https://graph/pag2");
    expect(r.itens.map((i) => i.nome)).toEqual(["a.pdf", "b.pdf"]);
  });
  it("obra usa a pasta da OP no drive SERVIDOR; sem pasta lança 404", async () => {
    pastaDaOp.mockResolvedValueOnce({ pasta: "OP-105 - X", base: "/Ordem de Servico/01. OP" });
    fetchMock.mockResolvedValue(json({ value: [] }));
    await listarDocumentos({ fonte: "obra", opNumero: "105", caminho: "" });
    expect(urls()[0]).toContain("drives/drv-servidor/root:/Ordem%20de%20Servico/01.%20OP/OP-105%20-%20X:/children");
    pastaDaOp.mockResolvedValueOnce(null);
    await expect(listarDocumentos({ fonte: "obra", opNumero: "999" })).rejects.toMatchObject({ message: "pasta da OP 999 não encontrada", status: 404 });
  });
  it("procedimentos: só SISTEMA ativo, nome 'PO-06 — título', ignora caminho", async () => {
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ id: "d1", nome: "PO-06 Soldagem - R2", numeroDocumento: "PO-06", arquivoTamanho: 5 }]);
    const r = await listarDocumentos({ fonte: "procedimentos", caminho: "../x" });
    expect(mockPrisma.documentoQualidade.findMany.mock.calls[0][0].where).toMatchObject({ categoria: "SISTEMA", ativo: true });
    expect(r.itens).toEqual([{ id: "d1", nome: "PO-06 — Soldagem - R2", tipo: "arquivo", tamanho: 5, caminho: "" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("baixarDocumento", () => {
  const corpo = () => new Response("abc");
  it("normas: lê o tamanho do PRÓPRIO item e devolve o stream, codificando # e espaços", async () => {
    fetchMock.mockResolvedValueOnce(json({ name: "a #1.pdf", size: 3, file: {} })).mockResolvedValueOnce(corpo());
    const r = await baixarDocumento({ fonte: "normas", caminho: "AISC/a #1.pdf" });
    expect(urls()[0]).toContain(`${NORMAS}/AISC/a%20%231.pdf:?$select=`);
    expect(urls()[1]).toBe(`${NORMAS}/AISC/a%20%231.pdf:/content`);
    expect(r).toMatchObject({ nome: "a #1.pdf", tamanho: 3, contentType: "application/pdf" });
    expect(await new Response(r.stream).text()).toBe("abc");
  });
  it("413 acima de 30 MB sem abrir o conteúdo", async () => {
    fetchMock.mockResolvedValueOnce(json({ name: "g.pdf", size: 31 * 1024 * 1024, file: {} }));
    await expect(baixarDocumento({ fonte: "normas", caminho: "g.pdf" })).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("404 arquivo ausente, 400 pasta e 400 caminho vazio/perigoso", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(baixarDocumento({ fonte: "normas", caminho: "nao.pdf" })).rejects.toMatchObject({ status: 404 });
    fetchMock.mockResolvedValueOnce(json({ name: "Sub", folder: {} }));
    await expect(baixarDocumento({ fonte: "normas", caminho: "Sub" })).rejects.toMatchObject({ status: 400 });
    await expect(baixarDocumento({ fonte: "normas", caminho: "" })).rejects.toMatchObject({ status: 400 });
    await expect(baixarDocumento({ fonte: "normas", caminho: "../x" })).rejects.toMatchObject({ status: 400 });
  });
  it("procedimentos só por id (SISTEMA, ativo); id desconhecido é 404", async () => {
    mockPrisma.documentoQualidade.findFirst.mockResolvedValueOnce(null);
    await expect(baixarDocumento({ fonte: "procedimentos", id: "zz" })).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.documentoQualidade.findFirst.mock.calls[0][0].where).toMatchObject({ id: "zz", categoria: "SISTEMA", ativo: true });
    await expect(baixarDocumento({ fonte: "procedimentos", caminho: "x.pdf" })).rejects.toMatchObject({ status: 404 });
    mockPrisma.documentoQualidade.findFirst.mockResolvedValueOnce({ id: "d1", sharepointItemId: "sp1", arquivoNome: "PO-06.pdf" });
    fetchMock.mockResolvedValueOnce(json({ name: "x.pdf", size: 3, file: {} })).mockResolvedValueOnce(corpo());
    const r = await baixarDocumento({ fonte: "procedimentos", id: "d1" });
    expect(urls()[0]).toContain("drives/drv-servidor/items/sp1?$select=");
    expect(urls()[1]).toBe("https://graph.microsoft.com/v1.0/drives/drv-servidor/items/sp1/content");
    expect(r).toMatchObject({ nome: "PO-06.pdf", tamanho: 3, contentType: "application/pdf" });
  });
});
