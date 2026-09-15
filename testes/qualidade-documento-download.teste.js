// A ROTA do olho/baixar de um documento da Qualidade.
//
// ⚠⚠ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA NÃO REPETIR: existiam DUAS implementações do mesmo
// download — `lib/databook-arquivo.js`, que monta o livro, e esta rota — e só a primeira aprendeu
// que o `sharepointItemId` MORRE quando alguém move ou renomeia o arquivo. A rota tentava o item
// por id e desistia: 502 "Falha ao buscar arquivo" com o PDF intacto na pasta (Matheus,
// 15/09/2026, o R 261085 da OP-103; conferido no SharePoint: 309 KB, lá desde 24/08). Agora as
// duas passam pela mesma escada.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/databook-arquivo", () => ({
  baixarDocumento: vi.fn(),
  ehUrlSharePoint: (u) => /sharepoint\.com/i.test(String(u || "")),
}));
vi.mock("@/lib/relatorio-pdf-fonte", () => ({ pdfDoRelatorio: vi.fn(), fonteDeInspecao: vi.fn(() => null) }));

import { requireRole } from "@/lib/session";
import { baixarDocumento } from "@/lib/databook-arquivo";
import { fonteDeInspecao, pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { GET } from "@/app/api/qualidade/documentos/[id]/download/route";

const req = (qs = "") => new Request(`http://localhost/api/qualidade/documentos/d1/download${qs}`);
const chamar = (qs) => GET(req(qs), { params: { id: "d1" } });

const NO_SERVIDOR = {
  arquivoUrl: "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Almoxarifado/R%20261085.pdf",
  arquivoNome: "R 261085.pdf", arquivoTipo: null, sharepointItemId: "012SCVJYJBHN",
  sharepointUrl: null, origem: "importacao_planilha", opNumero: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: "u" });
  fonteDeInspecao.mockReturnValue(null);
  baixarDocumento.mockResolvedValue(Buffer.from("%PDF-1.4 conteudo"));
  mockPrisma.documentoQualidade.findUnique.mockResolvedValue(NO_SERVIDOR);
});

describe("download de documento da Qualidade", () => {
  it("distingue 401 de 403 antes de tocar no banco", async () => {
    for (const [erro, status] of [["Unauthorized", 401], ["Forbidden", 403]]) {
      requireRole.mockRejectedValueOnce(new Error(erro));
      expect((await chamar()).status).toBe(status);
    }
    expect(mockPrisma.documentoQualidade.findUnique).not.toHaveBeenCalled();
  });

  // ⚠⚠ O CASO DO MATHEUS. Antes: item por id no drive padrão, e ponto — 502 quando o id morre.
  it("documento do SharePoint vai pela mesma escada do data book", async () => {
    const res = await chamar("?inline=1");
    expect(res.status).toBe(200);
    expect(baixarDocumento).toHaveBeenCalledWith(NO_SERVIDOR);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toMatch(/%PDF/);
  });

  it("sem inline=1 o arquivo baixa, em vez de abrir", async () => {
    expect((await chamar()).headers.get("Content-Disposition")).toMatch(/^attachment/);
  });

  // ⚠ `sharepointUrl` é o ÚLTIMO RECURSO quando o itemId morre — faltava no select, e sem ele o
  // socorro pelo caminho nunca dispararia, por mais completa que fosse a escada.
  it("o select carrega o que a escada precisa: origem, opNumero e sharepointUrl", async () => {
    await chamar();
    const { select } = mockPrisma.documentoQualidade.findUnique.mock.calls[0][0];
    for (const campo of ["origem", "opNumero", "sharepointUrl", "sharepointItemId", "arquivoUrl"]) {
      expect(select[campo]).toBe(true);
    }
  });

  it("falha na escada inteira vira 502, sem vazar o erro interno", async () => {
    baixarDocumento.mockRejectedValue(new Error("Graph 404 em drives/b!x/items/012SCV"));
    const res = await chamar();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Falha ao buscar arquivo");
    expect(JSON.stringify(json)).not.toMatch(/drives|Graph/);
  });

  // ⚠⚠ A DEFESA DE SSRF. URL de terceiro nunca é buscada: sem itemId e sem ser do SharePoint da
  // empresa, é 400 — a rota não vira um proxy de saída para qualquer endereço que caiba no campo.
  it("URL de terceiro sem itemId é recusada, não buscada", async () => {
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({
      ...NO_SERVIDOR, arquivoUrl: "http://169.254.169.254/latest/meta-data/", sharepointItemId: null,
    });
    const res = await chamar();
    expect(res.status).toBe(400);
    expect(baixarDocumento).not.toHaveBeenCalled();
  });

  it("documento sem arquivo nenhum é 404", async () => {
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ ...NO_SERVIDOR, arquivoUrl: null, sharepointItemId: null });
    expect((await chamar()).status).toBe(404);
  });

  // ⚠ O relatório de inspeção não tem binário: é montado em memória, e continua tendo caminho
  // próprio — ver `fonteDeInspecao`.
  it("relatório de inspeção não passa pelo SharePoint", async () => {
    fonteDeInspecao.mockReturnValue({ relatorioId: "rel1", revisao: 0, exigirOp: "106" });
    pdfDoRelatorio.mockResolvedValue({ bytes: Buffer.from("%PDF inspecao"), nome: "RIP-106-002.pdf" });
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(pdfDoRelatorio).toHaveBeenCalledWith("rel1", { revisao: 0, exigirOp: "106" });
    expect(baixarDocumento).not.toHaveBeenCalled();
  });

  it("anexo de outra obra (409) chega ao usuário; erro inesperado vira texto genérico", async () => {
    fonteDeInspecao.mockReturnValue({ relatorioId: "rel1", revisao: null, exigirOp: "103" });
    pdfDoRelatorio.mockRejectedValueOnce(Object.assign(new Error("Este anexo aponta para um relatório de outra obra."), { status: 409 }));
    const a = await chamar();
    expect(a.status).toBe(409);
    expect((await a.json()).error).toMatch(/outra obra/);

    pdfDoRelatorio.mockRejectedValueOnce(new Error("relation \"RelatorioInspecao\" does not exist"));
    const b = await chamar();
    expect(b.status).toBe(502);
    expect((await b.json()).error).not.toMatch(/relation/);
  });
});
