import { describe, it, expect } from "vitest";
import { refDeInspecao } from "@/lib/relatorio-pdf-fonte";

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
