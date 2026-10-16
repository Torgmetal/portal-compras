// Documentos do app Torg Engenharia: validação do caminho, raízes por fonte e teto de 30 MB. SharePoint e Prisma simulados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ listFolderChildren: vi.fn(), downloadFileByPath: vi.fn(), downloadFileById: vi.fn() }));
vi.mock("@/lib/sharepoint-lpc", () => ({ resolveServidorDriveId: vi.fn(async () => "drv-servidor") }));
vi.mock("@/lib/le-servidor", () => ({ pastaDaOp: vi.fn() }));
import { listFolderChildren, downloadFileByPath, downloadFileById } from "@/lib/sharepoint";
import { pastaDaOp } from "@/lib/le-servidor";
import { caminhoRelativoSeguro, listarDocumentos, baixarDocumento } from "@/lib/app-documentos";

beforeEach(() => { vi.clearAllMocks(); process.env.SHAREPOINT_DRIVE_ID = "drv-normas"; });

describe("caminhoRelativoSeguro", () => {
  it("recusa o que escapa da raiz", () => {
    for (const c of ["../RH", "a/../b", "/Engenharia", "a\\b", "NBR%2e%2e", "C:x", "./a"]) expect(() => caminhoRelativoSeguro(c)).toThrow("caminho inválido");
  });
  it("aceita vazio e normaliza barras repetidas", () => {
    expect(caminhoRelativoSeguro("")).toBe("");
    expect(caminhoRelativoSeguro(undefined)).toBe("");
    expect(caminhoRelativoSeguro("NBR 8800//2008.pdf")).toBe("NBR 8800/2008.pdf");
  });
});

describe("listarDocumentos", () => {
  it("normas lista dentro da raiz NORMAS do drive principal", async () => {
    listFolderChildren.mockResolvedValue([{ id: "i1", name: "AISC 360.pdf", size: 10, file: {} }, { id: "i2", name: "Sub", folder: {} }]);
    const r = await listarDocumentos({ fonte: "normas", caminho: "AISC" });
    expect(listFolderChildren).toHaveBeenCalledWith("drv-normas", "/Engenharia/03. Padrão Torg/NORMAS/AISC");
    expect(r.itens).toEqual([
      { nome: "AISC 360.pdf", tipo: "arquivo", tamanho: 10, caminho: "AISC/AISC 360.pdf", id: "i1" },
      { nome: "Sub", tipo: "pasta", tamanho: 0, caminho: "AISC/Sub", id: "i2" },
    ]);
  });
  it("obra usa a pasta da OP no drive SERVIDOR; sem pasta lança 404", async () => {
    pastaDaOp.mockResolvedValueOnce({ pasta: "OP-105 - X", base: "/Ordem de Servico/01. OP" });
    listFolderChildren.mockResolvedValue([]);
    await listarDocumentos({ fonte: "obra", opNumero: "105", caminho: "" });
    expect(listFolderChildren).toHaveBeenCalledWith("drv-servidor", "/Ordem de Servico/01. OP/OP-105 - X");
    pastaDaOp.mockResolvedValueOnce(null);
    await expect(listarDocumentos({ fonte: "obra", opNumero: "999" })).rejects.toMatchObject({ message: "pasta da OP 999 não encontrada", status: 404 });
  });
  it("procedimentos: só SISTEMA ativo, nome 'PO-06 — título', ignora caminho", async () => {
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ id: "d1", nome: "PO-06 Soldagem - R2", numeroDocumento: "PO-06", arquivoTamanho: 5 }]);
    const r = await listarDocumentos({ fonte: "procedimentos", caminho: "../x" });
    expect(mockPrisma.documentoQualidade.findMany.mock.calls[0][0].where).toMatchObject({ categoria: "SISTEMA", ativo: true });
    expect(r.itens).toEqual([{ id: "d1", nome: "PO-06 — Soldagem - R2", tipo: "arquivo", tamanho: 5, caminho: "" }]);
    expect(listFolderChildren).not.toHaveBeenCalled();
  });
});

describe("baixarDocumento", () => {
  it("normas: confere o tamanho no pai e baixa pelo caminho", async () => {
    listFolderChildren.mockResolvedValue([{ name: "a.pdf", size: 100, file: {} }]);
    downloadFileByPath.mockResolvedValue(Buffer.from("x"));
    const r = await baixarDocumento({ fonte: "normas", caminho: "AISC/a.pdf" });
    expect(listFolderChildren).toHaveBeenCalledWith("drv-normas", "/Engenharia/03. Padrão Torg/NORMAS/AISC");
    expect(downloadFileByPath).toHaveBeenCalledWith({ driveId: "drv-normas", fullPath: "/Engenharia/03. Padrão Torg/NORMAS/AISC/a.pdf" });
    expect(r).toMatchObject({ nome: "a.pdf", contentType: "application/pdf" });
  });
  it("413 acima de 30 MB sem baixar", async () => {
    listFolderChildren.mockResolvedValue([{ name: "g.pdf", size: 31 * 1024 * 1024, file: {} }]);
    await expect(baixarDocumento({ fonte: "normas", caminho: "g.pdf" })).rejects.toMatchObject({ status: 413 });
    expect(downloadFileByPath).not.toHaveBeenCalled();
  });
  it("404 arquivo ausente, 400 pasta e 400 caminho vazio/perigoso", async () => {
    listFolderChildren.mockResolvedValue([{ name: "Sub", folder: {} }]);
    await expect(baixarDocumento({ fonte: "normas", caminho: "nao.pdf" })).rejects.toMatchObject({ status: 404 });
    await expect(baixarDocumento({ fonte: "normas", caminho: "Sub" })).rejects.toMatchObject({ status: 400 });
    await expect(baixarDocumento({ fonte: "normas", caminho: "" })).rejects.toMatchObject({ status: 400 });
    await expect(baixarDocumento({ fonte: "normas", caminho: "../x" })).rejects.toMatchObject({ status: 400 });
  });
  it("procedimentos só por id; id desconhecido é 404", async () => {
    mockPrisma.documentoQualidade.findFirst.mockResolvedValueOnce(null);
    await expect(baixarDocumento({ fonte: "procedimentos", id: "zz" })).rejects.toMatchObject({ status: 404 });
    await expect(baixarDocumento({ fonte: "procedimentos", caminho: "x.pdf" })).rejects.toMatchObject({ status: 404 });
    mockPrisma.documentoQualidade.findFirst.mockResolvedValueOnce({ id: "d1", sharepointItemId: "sp1", arquivoNome: "PO-06.pdf", arquivoTamanho: 9 });
    downloadFileById.mockResolvedValue({ buffer: Buffer.from("pdf"), contentType: "application/octet-stream" });
    const r = await baixarDocumento({ fonte: "procedimentos", id: "d1" });
    expect(downloadFileById).toHaveBeenCalledWith("drv-servidor", "sp1");
    expect(r).toMatchObject({ nome: "PO-06.pdf", contentType: "application/pdf" });
  });
});
