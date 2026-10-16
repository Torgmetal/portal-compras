// Rotas de documentos do app: autenticação por token do aparelho, validação e mapeamento de status.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ listFolderChildren: vi.fn(), downloadFileByPath: vi.fn(), downloadFileById: vi.fn() }));
vi.mock("@/lib/sharepoint-lpc", () => ({ resolveServidorDriveId: vi.fn(async () => "drv-servidor") }));
vi.mock("@/lib/le-servidor", () => ({ pastaDaOp: vi.fn() }));
import { listFolderChildren, downloadFileByPath } from "@/lib/sharepoint";
import { pastaDaOp } from "@/lib/le-servidor";
import { GET as LISTAR } from "@/app/api/engenharia-ia/app/documentos/route";
import { GET as ARQUIVO } from "@/app/api/engenharia-ia/app/documentos/arquivo/route";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc";
const pedir = (rota, qs, headers = { authorization: `Bearer ${TOKEN}` }) => rota(new Request(`http://localhost/api/engenharia-ia/app/documentos?${qs}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHAREPOINT_DRIVE_ID = "drv-normas";
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO" } : null));
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
});

describe("GET /documentos", () => {
  it("401 sem token", async () => {
    expect((await pedir(LISTAR, "fonte=normas", {})).status).toBe(401);
    expect((await pedir(ARQUIVO, "fonte=normas&caminho=a.pdf", {})).status).toBe(401);
  });
  it("400 com caminho fora da raiz ou fonte inválida ou obra sem op", async () => {
    expect((await pedir(LISTAR, "fonte=normas&caminho=../x")).status).toBe(400);
    expect((await pedir(LISTAR, "fonte=outra")).status).toBe(400);
    expect((await pedir(LISTAR, "fonte=obra")).status).toBe(400);
    expect(listFolderChildren).not.toHaveBeenCalled();
  });
  it("404 quando a OP não tem pasta", async () => {
    pastaDaOp.mockResolvedValue(null);
    const r = await pedir(LISTAR, "fonte=obra&op=999");
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("pasta da OP 999 não encontrada");
  });
  it("200 lista normas", async () => {
    listFolderChildren.mockResolvedValue([{ id: "i", name: "a.pdf", size: 3, file: {} }]);
    const r = await pedir(LISTAR, "fonte=normas");
    expect(r.status).toBe(200);
    expect((await r.json()).itens[0].nome).toBe("a.pdf");
  });
  it("falha do SharePoint vira 500 genérico", async () => {
    listFolderChildren.mockRejectedValue(new Error("HTTP 500 segredo"));
    const r = await pedir(LISTAR, "fonte=normas");
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("falha interna");
  });
});

describe("GET /documentos/arquivo", () => {
  it("200 normas com bytes e cabeçalhos", async () => {
    listFolderChildren.mockResolvedValue([{ name: "Norma é.pdf", size: 3, file: {} }]);
    downloadFileByPath.mockResolvedValue(Buffer.from("abc"));
    const r = await pedir(ARQUIVO, "fonte=normas&caminho=Norma%20%C3%A9.pdf");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''Norma%20%C3%A9.pdf");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("abc");
  });
  it("413 acima de 30 MB; 400 sem caminho; 404 procedimento desconhecido", async () => {
    listFolderChildren.mockResolvedValue([{ name: "g.pdf", size: 31 * 1024 * 1024, file: {} }]);
    expect((await pedir(ARQUIVO, "fonte=normas&caminho=g.pdf")).status).toBe(413);
    expect((await pedir(ARQUIVO, "fonte=normas")).status).toBe(400);
    mockPrisma.documentoQualidade.findFirst.mockResolvedValue(null);
    expect((await pedir(ARQUIVO, "fonte=procedimentos&id=zz")).status).toBe(404);
  });
});
