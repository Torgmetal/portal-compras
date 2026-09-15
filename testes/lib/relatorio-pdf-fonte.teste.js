import { describe, it, expect } from "vitest";
import { refDeInspecao, fonteDeInspecao } from "@/lib/relatorio-pdf-fonte";

// ⚠⚠ O HOST É IGNORADO DE PROPÓSITO. Dois documentos de produção guardavam a MESMA rota com hosts
// diferentes — um com `workspace.torg.com.br` e outro com `http://localhost:3000`, gravado por
// quem fechou a inspeção rodando em dev (que escreve no banco de produção). Olhando só o caminho,
// os dois funcionam sem migrar dado nenhum.

describe("refDeInspecao", () => {
  it("reconhece a URL de produção, com a revisão", () => {
    expect(refDeInspecao("https://workspace.torg.com.br/api/qualidade/inspecoes/cmtnd3f7e000ajx04r9he2lm6/pdf?revisao=0"))
      .toEqual({ relatorioId: "cmtnd3f7e000ajx04r9he2lm6", revisao: 0 });
  });

  it("reconhece a URL com localhost — o host não entra na conta", () => {
    expect(refDeInspecao("http://localhost:3000/api/qualidade/inspecoes/cmtnd3f7e000ajx04r9he2lm6/pdf?revisao=2"))
      .toEqual({ relatorioId: "cmtnd3f7e000ajx04r9he2lm6", revisao: 2 });
  });

  it("reconhece o caminho relativo, que é o que passa a ser gravado", () => {
    expect(refDeInspecao("/api/qualidade/inspecoes/abc123/pdf?revisao=1"))
      .toEqual({ relatorioId: "abc123", revisao: 1 });
  });

  it("sem ?revisao devolve null na revisão — é a folha vigente", () => {
    expect(refDeInspecao("https://workspace.torg.com.br/api/qualidade/inspecoes/abc123/pdf"))
      .toEqual({ relatorioId: "abc123", revisao: null });
  });

  it("aceita barra final e outros parâmetros junto", () => {
    expect(refDeInspecao("/api/qualidade/inspecoes/abc123/pdf?x=1&revisao=3&y=2"))
      .toEqual({ relatorioId: "abc123", revisao: 3 });
  });

  // ⚠ Não pode reconhecer o que NÃO é inspeção: um blob ou um link do SharePoint tem de seguir
  // pelo caminho de sempre, senão o conserto de um caso quebra os outros 6.400 documentos.
  it("não reconhece blob, SharePoint, vazio nem outra rota", () => {
    for (const u of [
      "https://hu9j8bbfqhq48k16.public.blob.vercel-storage.com/DM_051_26_T70-Nb35amyzhW.pdf",
      "https://torgmetal637.sharepoint.com/sites/TorgMetal/SERVIDOR/x.pdf",
      "/api/qualidade/documentos/abc123/download",
      "/api/qualidade/inspecoes/abc123/fotos",
      "", null, undefined,
    ]) {
      expect(refDeInspecao(u)).toBeNull();
    }
  });
});

// ─── O QUE O PARECER DE SEGURANÇA DO CODEX (15/09/2026) APONTOU ──────────────
//
// A primeira versão procurava o trecho em QUALQUER lugar da string. Isso é "confusão de fonte":
// quem pode gravar `arquivoUrl` (ADMIN/QUALIDADE, pela tela de documentos) conseguia fazer um
// documento anunciar um anexo e entregar um relatório interno. O caminho mais desconfortável não
// é o portal interno — é `lib/databook-arquivo.js`, que alimenta o PORTAL DO CLIENTE: ali o
// documento é filtrado pela obra do token, mas o relatório para onde ele aponta não era.

describe("refDeInspecao — o que NÃO pode ser confundido com relatório", () => {
  it("caminho escondido no fragmento de uma URL de Blob não vale", () => {
    expect(refDeInspecao(
      "https://hu9j8bbfqhq48k16.public.blob.vercel-storage.com/anexo.pdf#/api/qualidade/inspecoes/abc123/pdf",
    )).toBeNull();
  });

  it("caminho escondido na query não vale", () => {
    expect(refDeInspecao(
      "https://x.public.blob.vercel-storage.com/a.pdf?x=/api/qualidade/inspecoes/abc123/pdf",
    )).toBeNull();
  });

  it("sufixo depois de /pdf não vale — a âncora é no fim do caminho", () => {
    for (const u of [
      "/api/qualidade/inspecoes/abc123/pdf-outra-coisa",
      "/api/qualidade/inspecoes/abc123/pdfx",
      "/api/qualidade/inspecoes/abc123/pdf/fotos",
    ]) expect(refDeInspecao(u)).toBeNull();
  });

  it("prefixo antes do caminho não vale", () => {
    expect(refDeInspecao("/proxy/api/qualidade/inspecoes/abc123/pdf")).toBeNull();
  });

  // ⚠ Revisão não-inteira valia como "folha vigente": entregava um documento DIFERENTE do pedido,
  // calado. Recusar faz o erro aparecer; servir a folha errada, não.
  it("revisão que não é número inteiro RECUSA, em vez de servir a folha vigente", () => {
    for (const u of [
      "/api/qualidade/inspecoes/abc123/pdf?revisao=abc",
      "/api/qualidade/inspecoes/abc123/pdf?revisao=1.5",
      "/api/qualidade/inspecoes/abc123/pdf?revisao=-1",
      "/api/qualidade/inspecoes/abc123/pdf?revisao=",
    ]) expect(refDeInspecao(u)).toBeNull();
  });

  it("barra final continua valendo", () => {
    expect(refDeInspecao("/api/qualidade/inspecoes/abc123/pdf/")).toEqual({ relatorioId: "abc123", revisao: null });
  });
});

describe("fonteDeInspecao — as três amarrações juntas", () => {
  const doc = {
    origem: "inspecao_campo",
    opNumero: "106",
    arquivoUrl: "https://workspace.torg.com.br/api/qualidade/inspecoes/rel1/pdf?revisao=0",
  };

  it("documento de inspeção legítimo passa, carregando a obra a conferir", () => {
    expect(fonteDeInspecao(doc)).toEqual({ relatorioId: "rel1", revisao: 0, exigirOp: "106" });
  });

  // ⚠ A defesa que sobrevive a uma URL forjada de propósito: um anexo comum não tem esta origem.
  it("origem diferente de inspecao_campo não serve relatório", () => {
    for (const origem of ["anexo_databook", "importacao_planilha", "servidor", undefined]) {
      expect(fonteDeInspecao({ ...doc, origem })).toBeNull();
    }
  });

  // ⚠ Recusa em vez de liberar: um `select` futuro que esqueça `opNumero` dá erro visível de
  // arquivo, nunca um anexo servido sem conferir a obra.
  it("documento sem opNumero é recusado, não liberado sem conferência", () => {
    expect(fonteDeInspecao({ ...doc, opNumero: null })).toBeNull();
    expect(fonteDeInspecao({ ...doc, opNumero: undefined })).toBeNull();
  });

  it("documento nenhum, ou sem URL, não quebra", () => {
    expect(fonteDeInspecao(null)).toBeNull();
    expect(fonteDeInspecao({ origem: "inspecao_campo", opNumero: "106", arquivoUrl: null })).toBeNull();
  });
});
