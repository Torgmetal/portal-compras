import { describe, it, expect, vi } from "vitest";
import { desenhosDaMarca, ehCarimbado, ehObsoleto, formatoDaPasta } from "@/lib/desenhos-fabricacao";

// ⚠⚠ O modal de desenhos pedia `…/2.5.2 Fabricação:/search(q='{marca}')` e recebe HTTP 500 desde
// 22–23/09/2026. Ele degradava QUIETO — as liberações de GRD já gravadas continuavam vindo do
// banco, então marca com GRD parecia normal e só a lista de PDFs ficava vazia.

const f = (name, relativo, pasta, extra = {}) => ({ id: name, name, size: 2048, relativo, pasta, ...extra });

describe("desenhosDaMarca", () => {
  it("pega o PDF da marca e traz o formato da pasta-mãe", () => {
    const r = desenhosDaMarca([f("T105A1.pdf", "2.5.2.3 Conjunto/A/A1", "A1")], "T105A1");
    expect(r).toEqual([{ itemId: "T105A1.pdf", nome: "T105A1.pdf", formato: "A1", sizeKb: 2 }]);
  });

  it("⚠⚠ obsoleto é barrado pelo CAMINHO INTEIRO, não só pela pasta-mãe", () => {
    // Com a busca só dava para olhar o pai do arquivo; desenho obsoleto enterrado um nível a mais
    // continuava aparecendo com botão de imprimir do lado.
    const arquivos = [
      f("T105A1.pdf", "2.5.2.2 Croqui/A/OBSOLETOS", "OBSOLETOS"),
      f("T105A1.pdf", "2.5.2.2 Croqui/A/OBSOLETOS/2025", "2025"),
      f("T105A1.pdf", "2.5.2.2 Croqui/A", "A"),
    ];
    expect(desenhosDaMarca(arquivos, "T105A1")).toHaveLength(1);
    expect(desenhosDaMarca(arquivos, "T105A1")[0].formato).toBeNull();
  });

  it("⚠⚠ o carimbado não entra: ele é o RESULTADO de uma impressão, não um desenho para imprimir", () => {
    const arquivos = [
      f("105A-P34 - RASTREADO 26-08 17-38.pdf", "2.5.2.2 Croqui/A", "A"),
      f("LOTE 12 - 105A-P34.pdf", "2.5.2.2 Croqui/A", "A"),
      f("105A-P34.pdf", "2.5.2.2 Croqui/A", "A"),
    ];
    expect(desenhosDaMarca(arquivos, "105A-P34").map((x) => x.nome)).toEqual(["105A-P34.pdf"]);
  });

  it("croqui sem pasta A1..A4 vira 'A4 (croqui)'; sai ordenado por nome", () => {
    const r = desenhosDaMarca([
      f("T105A1 - CROQUI.pdf", "2.5.2.2 Croqui/A", "A"),
      f("T105A1.pdf", "2.5.2.3 Conjunto/A/A2", "A2"),
    ], "T105A1");
    expect(r.map((x) => [x.nome, x.formato])).toEqual([
      ["T105A1 - CROQUI.pdf", "A4 (croqui)"],
      ["T105A1.pdf", "A2"],
    ]);
  });

  it("arquivo que não é PDF fica de fora", () => {
    expect(desenhosDaMarca([f("T105A1.dwg", "2.5.2.3 Conjunto/A/A1", "A1")], "T105A1")).toEqual([]);
  });

  it("marca de outra peça não entra", () => {
    expect(desenhosDaMarca([f("T105B7.pdf", "2.5.2.3 Conjunto/B/A1", "A1")], "T105A1")).toEqual([]);
  });
});

describe("as regras soltas", () => {
  it("ehCarimbado", () => {
    expect(ehCarimbado("x - RASTREADO 26-08.pdf")).toBe(true);
    expect(ehCarimbado("LOTE 3 - x.pdf")).toBe(true);
    expect(ehCarimbado("PILOTE 3.pdf")).toBe(false); // "LOTE" só no começo
  });

  it("ehObsoleto olha qualquer trecho do caminho", () => {
    expect(ehObsoleto("A/OBSOLETOS/2025")).toBe(true);
    expect(ehObsoleto("A/Obsoletas")).toBe(true);
    expect(ehObsoleto("A/A1")).toBe(false);
    expect(ehObsoleto(null)).toBe(false);
  });

  it("formatoDaPasta só aceita A1..A4 como formato", () => {
    expect(formatoDaPasta("A3", "x.pdf")).toBe("A3");
    expect(formatoDaPasta("a1", "x.pdf")).toBe("A1");
    expect(formatoDaPasta("A5", "x.pdf")).toBeNull();
    expect(formatoDaPasta("CH 12.5", "x - CROQUI.pdf")).toBe("A4 (croqui)");
  });
});

describe("arquivosDaFabricacao — cache", () => {
  it("⚠ chamadas simultâneas da mesma OP dividem UMA varredura, e a falha não vira retrato", async () => {
    // A cota do Graph é compartilhada com todos os crons: três marcas abertas juntas não podem
    // virar três varreduras. E cachear um erro deixaria o modal quebrado por cinco minutos.
    vi.resetModules();
    let n = 0;
    vi.doMock("@/lib/sharepoint-arvore", () => ({
      varrerPasta: vi.fn(async () => {
        n++;
        if (n === 1) throw new Error("SharePoint caiu");
        return { arquivos: [{ id: "1", name: "T1.pdf", size: 0, pasta: "A1", relativo: "A1" }], pastas: 1 };
      }),
    }));
    const mod = await import("@/lib/desenhos-fabricacao");

    await expect(mod.arquivosDaFabricacao("/OP-1")).rejects.toThrow("SharePoint caiu");

    const [a, b] = await Promise.all([mod.arquivosDaFabricacao("/OP-1"), mod.arquivosDaFabricacao("/OP-1")]);
    expect(a).toBe(b);          // a segunda pegou a promessa da primeira
    expect(n).toBe(2);          // a falha soltou o cache; o sucesso foi varrido uma vez só
    vi.doUnmock("@/lib/sharepoint-arvore");
    vi.resetModules();
  });
});
