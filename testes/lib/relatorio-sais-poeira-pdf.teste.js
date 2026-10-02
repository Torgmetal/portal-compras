// Os PDFs dos relatórios de SAIS e de POEIRA saem com tudo o que o modelo tem — e o despacho por tipo
// leva cada um ao seu gerador (o genérico é rede de segurança, não destino).
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

const texto = async (bytes) => (await extractText(new Uint8Array(bytes), { mergePages: true })).text.replace(/\s+/g, " ");
const base = { opNumero: "112", revisao: 0, emitidoEm: new Date("2026-10-02T12:00:00Z"), marcas: ["T112A1", "T112A2"], observacoes: "Superfície jateada Sa 2½.", inspetor: "Geraldo Tank" };

describe("PDF do relatório de sais", () => {
  const rel = {
    ...base, tipo: "SAIS", codigo: "RCS-112-001",
    resultados: {
      documentoReferencia: "PO-05 / PIT-112", ordemCompra: "PC 4500123", etapaPintura: "Após o jateamento",
      volumeAgua: "3", areaCelula: "12,5", requisito: "20",
      aparelho: "Condutivímetro", apModelo: "Horiba EC-33", apTag: "CD-01", termometro: "Termômetro infravermelho digital", tmModelo: "IR", tmTag: "TM-01",
      amostras: [
        { condAgua: "1", condAmostra: "11", hora: "09:10" },
        { condAgua: "1", condAmostra: "13", hora: "09:20", densidade: "14,0" },
      ],
    },
  };

  it("traz título, identificação, informações, as amostras, a média, o laudo e as assinaturas do modelo", async () => {
    const bytes = await gerarPDFdoRelatorio({ rel, cliente: "Cliente Exemplo S.A.", obra: "Caldeira Exemplo", refCliente: "TPR-701" });
    const t = await texto(bytes);
    for (const esperado of [
      "RELATÓRIO DE CONTAMINAÇÃO DA SUPERFÍCIE POR SAIS", "ISO 8502-6", "RCS-112-001", "Cliente Exemplo S.A.",
      "PO-05 / PIT-112", "PC 4500123", "OP-112", "Caldeira Exemplo", "TPR-701",
      "T112A1, T112A2", "Após o jateamento", "Horiba EC-33", "CD-01", "TM-01",
      "Amostra 1", "Amostra 5", "Diferença de condutividade", "09:10", "APROVADO",
      "Inspetor CQ", "Técnico CQ", "Cliente", "Superfície jateada",
    ]) expect(t, esperado).toContain(esperado);
    // amostra 1: Δ 10 → 12 mg/m² calculado (com asterisco); amostra 2: 14 digitado; média 13
    expect(t).toMatch(/12,0\*/);
    expect(t).toMatch(/MÉDIA \(mg\/m²\): 13,0\b/);
    expect(t).toMatch(/densidade calculada pela ISO 8502-9/);
  });

  it("uma folha só sem fotos; da terceira foto em diante, folha de fotos", async () => {
    const umaFolha = await PDFDocument.load(await gerarPDFdoRelatorio({ rel }));
    expect(umaFolha.getPageCount()).toBe(1);
    const fotos = Array.from({ length: 3 }, (_, i) => ({ url: null, legenda: `Foto ${i + 1}` }));
    const comFotos = await PDFDocument.load(await gerarPDFdoRelatorio({ rel, fotos }));
    expect(comFotos.getPageCount()).toBe(2);
  });

  it("sem requisito, o laudo sai com as duas caixas em branco (o portal não inventa laudo)", async () => {
    const t = await texto(await gerarPDFdoRelatorio({ rel: { ...rel, resultados: { ...rel.resultados, requisito: "" } } }));
    expect(t).toContain("LAUDO");
    expect(t).not.toMatch(/X APROVADO|X REPROVADO/);
  });

  it("relatório recém-criado (tudo vazio) gera sem erro, com os padrões do Bresle", async () => {
    const t = await texto(await gerarPDFdoRelatorio({ rel: { ...base, tipo: "SAIS", codigo: "RCS-112-002", resultados: {} } }));
    expect(t).toContain("RCS-112-002");
    expect(t).toMatch(/VOLUME DE ÁGUA INJETADO \(ml\): 3\b/);
    expect(t).toMatch(/ÁREA DA CÉLULA \(cm²\): 12,5/);
  });
});

describe("PDF do relatório de poeira", () => {
  const rel = {
    ...base, tipo: "POEIRA", codigo: "RTP-112-001", resultadoInspecao: "APROVADO",
    resultados: {
      documentoReferencia: "PO-05", ordemCompra: "PC 4500123", etapaPintura: "Antes da 1ª demão", fitaAdesiva: "Fita 25 mm",
      testes: [
        { local: "Alma", quantidade: "1", tamanho: "2", obs: "ok" },
        { local: "Mesa superior", quantidade: "2", tamanho: "3" },
        { local: "Mesa inferior", quantidade: "2", tamanho: "1" },
      ],
    },
  };

  it("traz título, identificação, os testes A a E, média, classificação, laudo e a tabela da ISO 8502-3", async () => {
    const t = await texto(await gerarPDFdoRelatorio({ rel, cliente: "Cliente Exemplo S.A.", obra: "Caldeira Exemplo" }));
    for (const esperado of [
      "RELATÓRIO DE TESTE DE POEIRA", "ISO 8502-3", "RTP-112-001", "Cliente Exemplo S.A.", "DOCUMENTOS DE REFERÊNCIA",
      "PC 4500123", "Antes da 1ª demão", "Fita 25 mm", "Lupa 10×",
      "Teste A - Alma", "Teste B - Mesa superior", "Tamanho das Partículas (Classe 0-5)", "Teste E", "APROVADO",
      "Nenhuma poeira visível", "Partículas maiores que 2,5 mm", "Inspetor CQ", "Técnico CQ",
    ]) expect(t, esperado).toContain(esperado);
    expect(t).toMatch(/AVALIAÇÃO DA QUANTIDADE \(MÉDIA\): Classe 2/); // (1+2+2)/3 = 1,67 → 2
    expect(t).toMatch(/CLASSIFICAÇÃO DAS PARTÍCULAS: Classe 3/);    // a maior encontrada
  });

  it("relatório recém-criado (tudo vazio) gera sem erro", async () => {
    const t = await texto(await gerarPDFdoRelatorio({ rel: { ...base, tipo: "POEIRA", codigo: "RTP-112-002", resultados: {} } }));
    expect(t).toContain("RTP-112-002");
    expect(t).toContain("Teste A");
  });
});
