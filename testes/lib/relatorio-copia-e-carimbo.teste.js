// Vitor (24/09/2026): "Relatório de EVS e LP da OP-102 está puxando os relatórios sem assinatura".
//
// Dois defeitos somados:
// 1. O data book tinha as CÓPIAS da pasta da obra (arquivadas na aprovação, 21/09 — antes de o
//    Alexandre assinar), e não o relatório do portal. A cópia agora é reconhecida e sai o relatório
//    de agora, com as assinaturas.
// 2. Os convites do Alexandre foram desviados para o e-mail do Vitor; a imagem era procurada pelo
//    e-mail do CONVITE e o quadro do Alexandre saía sem carimbo. O carimbo agora é o do titular.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({
  downloadRhItem: vi.fn(async () => ({ buffer: Buffer.from("rh") })),
  downloadFileById: vi.fn(async () => ({ buffer: Buffer.from("copia-da-pasta") })),
  downloadSharedFile: vi.fn(async () => ({ buffer: Buffer.from("caminho") })),
  procurarArquivoPorNome: vi.fn(async () => null),
}));
vi.mock("@/lib/relatorio-pdf-fonte", async (importOriginal) => ({
  ...(await importOriginal()),
  pdfDoRelatorio: vi.fn(async (id) => ({ bytes: Buffer.from(`relatorio:${id}`), nome: "x.pdf" })),
}));

import { copiaArquivadaDe, fonteDeCopiaArquivada, pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { baixarDocumento } from "@/lib/databook-arquivo";
import { downloadFileById } from "@/lib/sharepoint";
import { completarImagens, imagemDoCadastro, titularesDesviados } from "@/lib/assinatura-cadastro";

// o documento que a §12 da OP-102 tinha: o arquivo que o portal arquivou na pasta da obra
const PASTA = "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Ordem%20de%20Servico/01.%20OP/OP-102%20-%20QWS%20-%20Revamp/8.%20Qualidade/3.%20Relat%C3%B3rios%20de%20Inspe%C3%A7%C3%A3o";
const COPIA_EVS = {
  origem: "servidor", opNumero: "102", sharepointItemId: "sp-evs",
  nome: "EVS-102-001 - Inspeção visual de solda",
  arquivoUrl: `${PASTA}/3.3%20EVS%20-%20Ensaio%20Visual%20de%20Solda/EVS-102-001%20-%20Inspe%C3%A7%C3%A3o%20visual%20de%20solda.pdf`,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("a cópia da pasta da obra é o próprio relatório", () => {
  it("reconhece a cópia pelo nome que o arquivamento grava e pela pasta 8. Qualidade", () => {
    expect(copiaArquivadaDe(COPIA_EVS)).toEqual({ codigo: "EVS-102-001", revisao: 0, rotulo: "Inspeção visual de solda" });
    expect(copiaArquivadaDe({ ...COPIA_EVS, nome: "RLP-102-003 R01 - Líquido penetrante" }))
      .toEqual({ codigo: "RLP-102-003", revisao: 1, rotulo: "Líquido penetrante" });
  });

  it("não confunde com o que não é cópia arquivada", () => {
    for (const doc of [
      { ...COPIA_EVS, origem: "inspecao_campo" },          // já é o relatório do portal
      { ...COPIA_EVS, origem: "anexo_databook" },          // upload avulso
      { ...COPIA_EVS, opNumero: null },                     // sem obra, não há como conferir
      { ...COPIA_EVS, nome: "DM_001_26_T102" },             // relatório antigo do SGQ
      { ...COPIA_EVS, nome: "EVS-102-001 - Relatório do cliente" }, // tipo que o portal não grava
      { ...COPIA_EVS, arquivoUrl: "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/Outra/EVS-102-001%20-%20Inspe%C3%A7%C3%A3o%20visual%20de%20solda.pdf" },
      { ...COPIA_EVS, arquivoUrl: "nao-e-url" },
    ]) expect(copiaArquivadaDe(doc)).toBeNull();
  });

  it("acha o relatório pelo código DENTRO da obra do documento, e confere tipo e revisão", async () => {
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ id: "r-evs", tipo: "VISUAL_SOLDA", revisao: 0 });
    expect(await fonteDeCopiaArquivada(COPIA_EVS)).toEqual({ relatorioId: "r-evs", revisao: null, exigirOp: "102" });
    expect(mockPrisma.relatorioInspecao.findFirst.mock.calls[0][0].where).toEqual({ codigo: "EVS-102-001", opNumero: "102" });

    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ id: "r-evs", tipo: "VISUAL_SOLDA", revisao: 1 });
    expect(await fonteDeCopiaArquivada(COPIA_EVS)).toBeNull(); // cópia da R00 de um relatório que já é R01: fica o arquivo
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ id: "r-lp", tipo: "LP", revisao: 0 });
    expect(await fonteDeCopiaArquivada(COPIA_EVS)).toBeNull(); // o nome diz EVS, o relatório é LP
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue(null);
    expect(await fonteDeCopiaArquivada(COPIA_EVS)).toBeNull();
  });

  it("o data book monta o relatório do portal no lugar de baixar a cópia", async () => {
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ id: "r-evs", tipo: "VISUAL_SOLDA", revisao: 0 });
    const bytes = await baixarDocumento(COPIA_EVS, "drive-servidor");
    expect(String(bytes)).toBe("relatorio:r-evs");
    expect(pdfDoRelatorio).toHaveBeenCalledWith("r-evs", { exigirOp: "102" });
    expect(downloadFileById).not.toHaveBeenCalled();
  });

  it("documento do servidor que não é cópia segue baixando o arquivo", async () => {
    const bytes = await baixarDocumento({ ...COPIA_EVS, nome: "DM_001_26_T102" }, "drive-servidor");
    expect(String(bytes)).toBe("copia-da-pasta");
    expect(pdfDoRelatorio).not.toHaveBeenCalled();
  });
});

describe("o carimbo é do titular da assinatura, não de quem recebeu o link", () => {
  const assinou = new Date("2026-09-24T13:54:00Z");
  const DESVIO = { entityId: "a-alexandre", diff: { antes: { email: "stival2112@gmail.com" }, depois: { email: "vitor@torg.com.br" } } };
  const usuarios = (lista) => mockPrisma.user.findMany.mockImplementation(async ({ where }) => lista.filter((u) => where.email.in.includes(u.email)));

  it("convite desviado: sai a imagem do cadastro do titular", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([DESVIO]);
    usuarios([{ email: "stival2112@gmail.com", assinaturaUrl: "img-alexandre" }, { email: "qualidade@torg.com.br", assinaturaUrl: "img-geraldo" }]);
    const [alexandre, geraldo] = await completarImagens([
      { id: "a-alexandre", nome: "Alexandre Stival", email: "vitor@torg.com.br", assinadoEm: assinou, imagemUrl: null },
      { id: "a-geraldo", nome: "Geraldo Tank", email: "qualidade@torg.com.br", assinadoEm: assinou, imagemUrl: "img-do-dia" },
    ]);
    expect(alexandre.imagemUrl).toBe("img-alexandre");
    expect(geraldo.imagemUrl).toBe("img-do-dia"); // quem já tem imagem não é tocado
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ action: "REDIRECIONAR_CONVITE_ASSINATURA", entity: "AssinaturaDocumento" });
  });

  it("titular sem imagem NÃO recebe a de quem assinou pelo link", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([DESVIO]);
    usuarios([{ email: "vitor@torg.com.br", assinaturaUrl: "img-vitor" }]);
    const [alexandre] = await completarImagens([{ id: "a-alexandre", email: "vitor@torg.com.br", assinadoEm: assinou, imagemUrl: null }]);
    expect(alexandre.imagemUrl).toBeNull();
  });

  it("convite que não foi desviado segue pelo e-mail do convite, como sempre", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    usuarios([{ email: "qualidade@torg.com.br", assinaturaUrl: "img-geraldo" }]);
    const [geraldo] = await completarImagens([{ id: "a-geraldo", email: "qualidade@torg.com.br", assinadoEm: assinou, imagemUrl: null }]);
    expect(geraldo.imagemUrl).toBe("img-geraldo");
  });

  it("no ato de assinar, o convite desviado já grava o carimbo do titular", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([DESVIO]);
    usuarios([{ email: "stival2112@gmail.com", assinaturaUrl: "img-alexandre" }]);
    expect(await imagemDoCadastro({ id: "a-alexandre", email: "vitor@torg.com.br" })).toBe("img-alexandre");
  });

  it("desvio encadeado: o titular é o destino de antes do PRIMEIRO desvio", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([DESVIO, { entityId: "a-alexandre", diff: { antes: { email: "vitor@torg.com.br" }, depois: { email: "outro@torg.com.br" } } }]);
    expect((await titularesDesviados(["a-alexandre"])).get("a-alexandre")).toBe("stival2112@gmail.com");
  });
});
