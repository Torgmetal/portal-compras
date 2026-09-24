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
  // ⚠⚠ ESPELHO FIEL DA IMPLEMENTAÇÃO, INCLUSIVE AS CREDENCIAIS NA URL. O primeiro espelho que
  // escrevi esqueceu `username`/`password` e o teste de SSRF passou a mentir: dizia recusado o
  // que a rota entregava. A função de verdade tem arquivo próprio
  // (`testes/lib/databook-url-sharepoint.teste.js`) — guarda de segurança não se testa por espelho.
  ehUrlSharePoint: (u) => {
    try {
      const x = new URL(String(u || ""));
      return x.protocol === "https:" && !x.username && !x.password
        && !x.port
        && [".sharepoint.com", ".sharepoint-df.com"].some((sufixo) => x.hostname.toLowerCase().endsWith(sufixo));
    } catch { return false; }
  },
}));
vi.mock("@/lib/relatorio-pdf-fonte", () => ({ pdfDoRelatorio: vi.fn(), fonteDeInspecao: vi.fn(() => null), fonteDeCopiaArquivada: vi.fn(async () => null) }));
vi.mock("@/lib/pit-pdf-fonte", () => ({ pdfDoPit: vi.fn(), fonteDePit: vi.fn(() => null) }));

import { requireRole } from "@/lib/session";
import { baixarDocumento } from "@/lib/databook-arquivo";
import { fonteDeInspecao, fonteDeCopiaArquivada, pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { fonteDePit, pdfDoPit } from "@/lib/pit-pdf-fonte";
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
  fonteDePit.mockReturnValue(null);
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

  // ⚠⚠ Vitor (24/09/2026): "Relatório de EVS e LP da OP-102 está puxando os relatórios sem
  // assinatura". A cópia do relatório na pasta da obra é arquivada na aprovação, antes das
  // assinaturas: o olho mostra o relatório do portal, como o livro.
  it("cópia arquivada de um relatório abre o relatório do portal, com as assinaturas de agora", async () => {
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ ...NO_SERVIDOR, origem: "servidor", opNumero: "102", nome: "EVS-102-001 - Inspeção visual de solda" });
    fonteDeCopiaArquivada.mockResolvedValueOnce({ relatorioId: "rel-evs", revisao: null, exigirOp: "102" });
    pdfDoRelatorio.mockResolvedValue({ bytes: Buffer.from("%PDF assinado"), nome: "EVS-102-001.pdf" });
    const res = await chamar("?inline=1");
    expect(res.status).toBe(200);
    expect(pdfDoRelatorio).toHaveBeenCalledWith("rel-evs", { revisao: null, exigirOp: "102" });
    expect(baixarDocumento).not.toHaveBeenCalled();
    // o nome do documento vai no select: é por ele que a cópia é reconhecida
    expect(mockPrisma.documentoQualidade.findUnique.mock.calls[0][0].select).toMatchObject({ nome: true, origem: true, opNumero: true });
  });

  it("PIT virtual abre como PDF sem passar pelo SharePoint", async () => {
    fonteDePit.mockReturnValue({ opNumero: "102" });
    pdfDoPit.mockResolvedValue({ bytes: Buffer.from("%PDF PIT"), nome: "PIT-T102.pdf" });
    const res = await chamar("?inline=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(pdfDoPit).toHaveBeenCalledWith(mockPrisma, { opNumero: "102" });
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

// ─── O QUE O PARECER DE SEGURANÇA DO CODEX (15/09/2026) APONTOU ──────────────

describe("o inline não pode virar execução dentro do portal", () => {
  // ⚠⚠ `arquivoTipo` é texto livre no banco, gravado por importador, e prevalece sobre o tipo
  // real. Com `?inline=1`, um `text/html` rodaria NA ORIGEM DO PORTAL, onde quem abriu tem sessão.
  it("tipo que executa BAIXA, mesmo com inline=1", async () => {
    for (const arquivoTipo of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/html; charset=utf-8"]) {
      mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ ...NO_SERVIDOR, arquivoTipo });
      const res = await chamar("?inline=1");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
    }
  });

  it("PDF e imagem continuam abrindo", async () => {
    for (const arquivoTipo of ["application/pdf", "image/png", "application/pdf; charset=binary"]) {
      mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ ...NO_SERVIDOR, arquivoTipo });
      expect((await chamar("?inline=1")).headers.get("Content-Disposition")).toMatch(/^inline/);
    }
  });

  it("nosniff vai em toda resposta — senão a lista de tipos cai pela porta dos fundos", async () => {
    expect((await chamar("?inline=1")).headers.get("X-Content-Type-Options")).toBe("nosniff");
    fonteDeInspecao.mockReturnValue({ relatorioId: "rel1", revisao: 0, exigirOp: "106" });
    pdfDoRelatorio.mockResolvedValue({ bytes: Buffer.from("%PDF"), nome: "r.pdf" });
    expect((await chamar("?inline=1")).headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("SSRF — ter itemId não autoriza buscar outra URL", () => {
  // ⚠⚠ O ACHADO ALTA, E EU TINHA AFIRMADO O CONTRÁRIO NO COMMIT. Meu teste de SSRF passava porque
  // usava `sharepointItemId: null`. COM itemId, a rota liberava a entrada e `baixarDocumento`
  // buscava a URL arbitrária ANTES de tentar o item. A guarda de verdade está lá dentro, junto do
  // `fetch` — aqui provamos o que a ROTA entrega à função.
  it("URL interna COM itemId chega à escada, e é ela quem tem de recusar o fetch", async () => {
    const doc = { ...NO_SERVIDOR, arquivoUrl: "http://169.254.169.254/latest/meta-data/" };
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue(doc);
    baixarDocumento.mockRejectedValue(new Error("documento sem arquivo (nem blob nem item do SharePoint)"));
    const res = await chamar();
    expect(res.status).toBe(502);
    expect(baixarDocumento).toHaveBeenCalledWith(doc);
  });

  // ⚠ Host enganoso: a substring `sharepoint.com` aparece, o hostname não termina nela.
  it("host que só IMITA o SharePoint, sem itemId, é recusado antes de qualquer busca", async () => {
    for (const arquivoUrl of [
      "https://sharepoint.com.exemplo-malicioso.br/x.pdf",
      "https://evil-sharepoint.com/x.pdf",
      "http://torgmetal637.sharepoint.com/x.pdf",
      "https://malicioso.br/?q=torgmetal637.sharepoint.com",
      "https://user:senha@torgmetal637.sharepoint.com/x.pdf",
    ]) {
      mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ ...NO_SERVIDOR, arquivoUrl, sharepointItemId: null });
      expect((await chamar()).status).toBe(400);
      expect(baixarDocumento).not.toHaveBeenCalled();
    }
  });
});
