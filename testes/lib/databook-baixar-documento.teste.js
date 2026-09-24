// `baixarDocumento` — a escada de verdade, com as dependências mockadas.
//
// ⚠⚠ ELA É O ÚNICO CAMINHO DE DOWNLOAD DE ANEXO DA QUALIDADE: o livro, os volumes, o olho da tela
// interna e o PORTAL DO CLIENTE (token, sem login) passam todos por aqui. Até 15/09/2026 ela fazia
// `fetch` em QUALQUER URL que não fosse do SharePoint — achado ALTA do Codex —, e os testes da
// rota mockavam justamente esta função, então ninguém olhava para dentro.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sharepoint", () => ({
  downloadRhItem: vi.fn(), downloadFileById: vi.fn(), downloadSharedFile: vi.fn(), procurarArquivoPorNome: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { documentoQualidade: { update: vi.fn(async () => ({})) } } }));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn(async () => "drive-servidor") }));
vi.mock("@/lib/relatorio-pdf-fonte", () => ({ pdfDoRelatorio: vi.fn(), fonteDeInspecao: vi.fn(() => null), fonteDeCopiaArquivada: vi.fn(async () => null) }));
vi.mock("@/lib/pit-pdf-fonte", () => ({ pdfDoPit: vi.fn(), fonteDePit: vi.fn(() => null) }));

import { downloadRhItem, downloadFileById, downloadSharedFile, procurarArquivoPorNome } from "@/lib/sharepoint";
import { prisma } from "@/lib/prisma";
import { fonteDeInspecao, pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { fonteDePit, pdfDoPit } from "@/lib/pit-pdf-fonte";
import { baixarDocumento } from "@/lib/databook-arquivo";

const SP = "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Almoxarifado/R%20261085.pdf";
const doc = (extra = {}) => ({ arquivoUrl: SP, sharepointUrl: null, sharepointItemId: "012SCVJYJBHN", origem: "importacao_planilha", opNumero: "103", ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  fonteDeInspecao.mockReturnValue(null);
  fonteDePit.mockReturnValue(null);
  globalThis.fetch = vi.fn();
  downloadRhItem.mockResolvedValue({ buffer: Buffer.from("PADRAO") });
  downloadFileById.mockResolvedValue({ buffer: Buffer.from("SERVIDOR") });
  downloadSharedFile.mockResolvedValue({ buffer: Buffer.from("CAMINHO") });
  procurarArquivoPorNome.mockResolvedValue([]);
});

describe("baixarDocumento — 4º degrau: o arquivo mudou de pasta (OP-106, R 261162/261163)", () => {
  const MOVIDO = "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Almoxarifado/01.%20Rastreabilidade/Certificados%20TMSA/R%20261163.pdf";
  const tudoMorto = () => {
    downloadFileById.mockRejectedValue(new Error("HTTP 404"));
    downloadRhItem.mockRejectedValue(new Error("HTTP 404"));
    downloadSharedFile.mockRejectedValue(new Error("SharePoint /shares HTTP 404"));
  };

  it("id e caminho mortos, UM arquivo com o nome na pasta-raiz: baixa e grava o endereço novo", async () => {
    tudoMorto();
    procurarArquivoPorNome.mockResolvedValue([{ id: "NOVO-ID", name: "R 261163.pdf", webUrl: "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Almoxarifado/01.%20Rastreabilidade/Certificados%202026/R%20261163.pdf", parentPath: null }]);
    downloadFileById.mockImplementation(async (_d, id) => { if (id === "NOVO-ID") return { buffer: Buffer.from("ACHADO") }; throw new Error("HTTP 404"); });
    const out = await baixarDocumento(doc({ id: "doc-1", arquivoUrl: MOVIDO }), "drive-servidor");
    expect(out.toString()).toBe("ACHADO");
    expect(procurarArquivoPorNome).toHaveBeenCalledWith("drive-servidor", "/Almoxarifado/01. Rastreabilidade", "R 261163.pdf");
    expect(prisma.documentoQualidade.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "doc-1" }, data: expect.objectContaining({ sharepointItemId: "NOVO-ID" }) }));
  });

  it("dois arquivos com o mesmo nome: não adivinha — propaga o erro de sempre", async () => {
    tudoMorto();
    procurarArquivoPorNome.mockResolvedValue([{ id: "A", name: "R 261163.pdf" }, { id: "B", name: "R 261163.pdf" }]);
    await expect(baixarDocumento(doc({ id: "doc-1", arquivoUrl: MOVIDO }), "drive-servidor")).rejects.toThrow("HTTP 404");
    expect(prisma.documentoQualidade.update).not.toHaveBeenCalled();
  });

  it("nada com o nome: propaga o erro; e a busca só roda depois de id e caminho falharem", async () => {
    tudoMorto();
    await expect(baixarDocumento(doc({ id: "doc-1", arquivoUrl: MOVIDO }), "drive-servidor")).rejects.toThrow("HTTP 404");
    expect(procurarArquivoPorNome).toHaveBeenCalledTimes(1);
    downloadSharedFile.mockResolvedValue({ buffer: Buffer.from("CAMINHO") });
    procurarArquivoPorNome.mockClear();
    expect((await baixarDocumento(doc({ id: "doc-1", arquivoUrl: MOVIDO }), "drive-servidor")).toString()).toBe("CAMINHO");
    expect(procurarArquivoPorNome).not.toHaveBeenCalled();
  });
});

describe("baixarDocumento — a defesa contra SSRF fica junto do fetch", () => {
  // ⚠⚠ O ACHADO. Ter itemId NÃO autoriza buscar outra URL: antes, a condição era "não é do
  // SharePoint → busca", e o servidor ia a 169.254.169.254 antes mesmo de tentar o item.
  it("URL arbitrária COM itemId não é buscada — vai pelo item", async () => {
    for (const arquivoUrl of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/admin",
      "https://exfiltra.example.com/x.pdf",
      "https://sharepoint.com.malicioso.br/x.pdf",
    ]) {
      vi.clearAllMocks();
      downloadRhItem.mockResolvedValue({ buffer: Buffer.from("PADRAO") });
      const b = await baixarDocumento(doc({ arquivoUrl }));
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(b.toString()).toBe("PADRAO");
    }
  });

  it("URL arbitrária SEM itemId nem caminho: erro, e nenhuma busca", async () => {
    await expect(baixarDocumento(doc({ arquivoUrl: "http://169.254.169.254/", sharepointItemId: null })))
      .rejects.toThrow(/sem arquivo/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(downloadSharedFile).not.toHaveBeenCalled();
  });

  it("Blob continua sendo buscado por URL — é o único que pode", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("BLOB") });
    const b = await baixarDocumento(doc({ arquivoUrl: "https://x.public.blob.vercel-storage.com/a.pdf", sharepointItemId: null }));
    expect(b.toString()).toBe("BLOB");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("Blob que responde erro HTTP não vira buffer vazio", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(baixarDocumento(doc({ arquivoUrl: "https://x.public.blob.vercel-storage.com/a.pdf", sharepointItemId: null })))
      .rejects.toThrow(/404/);
  });
});

describe("baixarDocumento — a escada, degrau por degrau", () => {
  it("origem do servidor tenta o drive SERVIDOR primeiro", async () => {
    const b = await baixarDocumento(doc({ origem: "servidor" }));
    expect(b.toString()).toBe("SERVIDOR");
    expect(downloadFileById).toHaveBeenCalledWith("drive-servidor", "012SCVJYJBHN");
    expect(downloadRhItem).not.toHaveBeenCalled();
  });

  it("origem de planilha tenta o drive padrão primeiro", async () => {
    expect((await baixarDocumento(doc())).toString()).toBe("PADRAO");
    expect(downloadFileById).not.toHaveBeenCalled();
  });

  // ⚠ Há documento antigo com `origem` que não corresponde à biblioteca onde o arquivo está.
  it("primeiro drive falhando, tenta o outro", async () => {
    downloadRhItem.mockRejectedValue(new Error("404"));
    expect((await baixarDocumento(doc())).toString()).toBe("SERVIDOR");
  });

  // ⚠⚠ O CASO DO R 261085: os dois drives falham porque o ITEMID morreu, e o arquivo está lá.
  it("os dois drives falhando, salva pelo CAMINHO", async () => {
    downloadRhItem.mockRejectedValue(new Error("404"));
    downloadFileById.mockRejectedValue(new Error("404"));
    expect((await baixarDocumento(doc())).toString()).toBe("CAMINHO");
    expect(downloadSharedFile).toHaveBeenCalledWith(SP);
  });

  // ⚠ O caminho pode estar em `sharepointUrl` OU em `arquivoUrl` — o importado do CMR guarda no
  // segundo, e por isso o socorro não disparava para ele (lição de 28/08/2026).
  it("o caminho é procurado nos dois campos", async () => {
    downloadRhItem.mockRejectedValue(new Error("404"));
    downloadFileById.mockRejectedValue(new Error("404"));
    await baixarDocumento(doc({ arquivoUrl: null, sharepointUrl: SP }));
    expect(downloadSharedFile).toHaveBeenCalledWith(SP);
  });

  // ⚠ Antes isto desistia antes de tentar o caminho, mesmo com a pasta e o nome gravados ao lado.
  it("sem itemId, o caminho ainda salva", async () => {
    expect((await baixarDocumento(doc({ sharepointItemId: null }))).toString()).toBe("CAMINHO");
  });

  it("tudo falhando, propaga o erro da biblioteca esperada — não o do socorro", async () => {
    downloadRhItem.mockRejectedValue(new Error("erro do drive padrao"));
    downloadFileById.mockRejectedValue(new Error("erro do drive servidor"));
    downloadSharedFile.mockRejectedValue(new Error("erro do caminho"));
    await expect(baixarDocumento(doc())).rejects.toThrow("erro do drive padrao");
  });

  // ⚠ O relatório de inspeção não tem binário: é montado, não baixado.
  it("documento de inspeção não encosta no SharePoint", async () => {
    fonteDeInspecao.mockReturnValue({ relatorioId: "rel1", revisao: 0, exigirOp: "106" });
    pdfDoRelatorio.mockResolvedValue({ bytes: Buffer.from("%PDF"), nome: "r.pdf" });
    expect((await baixarDocumento(doc())).toString()).toBe("%PDF");
    expect(downloadRhItem).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("PIT virtual é montado em memória e não encosta no SharePoint", async () => {
    fonteDePit.mockReturnValue({ opNumero: "102" });
    pdfDoPit.mockResolvedValue({ bytes: Buffer.from("%PDF PIT"), nome: "PIT-T102.pdf" });
    expect((await baixarDocumento(doc())).toString()).toBe("%PDF PIT");
    expect(pdfDoPit).toHaveBeenCalledWith(prisma, { opNumero: "102" });
    expect(downloadRhItem).not.toHaveBeenCalled();
  });
});

// ⚠ O BLOB NÃO TEM LIXEIRA (24/09/2026). Os anexos do Data Book ganharam cópia no SharePoint
// (lib/backup-arquivos.js); se o arquivo some do Blob, o livro usa a cópia em vez de perder o anexo.
describe("baixarDocumento — anexo do Blob com cópia de backup", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/databook/cert.pdf";
  const anexo = (extra = {}) => ({ arquivoUrl: BLOB, sharepointUrl: null, sharepointItemId: null, origem: "anexo_databook", opNumero: "102", ...extra });

  it("Blob vivo: usa o Blob, nem olha a cópia", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode("DO BLOB").buffer });
    expect((await baixarDocumento(anexo({ sharepointItemId: "copia-1" }))).toString()).toBe("DO BLOB");
    expect(downloadRhItem).not.toHaveBeenCalled();
  });

  it("sumiu do Blob e há cópia: o livro sai com a cópia do backup", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    expect((await baixarDocumento(anexo({ sharepointItemId: "copia-1" }))).toString()).toBe("PADRAO");
    expect(downloadRhItem).toHaveBeenCalledWith("copia-1");
  });

  it("sumiu do Blob e não há cópia: o erro de sempre", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(baixarDocumento(anexo())).rejects.toThrow("HTTP 404");
    expect(downloadRhItem).not.toHaveBeenCalled();
  });
});
