// ⚠⚠ A COTA SAÍA NO DESENHO ERRADO (Vitor, 23/09/2026, RID-084-002 da OP-84: "parece que os
// desenhos estão ficando zuado").
//
// O relatório de peças avulsas agrupadas tem UM DESENHO POR MARCA (T84A1…T84A5). A cota marcada na
// tela nascia sem `marca`; o PDF agrupa as linhas pela marca e mandava a órfã para o ÚLTIMO desenho.
// As cotas A (703) e B (410), marcadas no chumbador T84A1 — o desenho que a tela abre por padrão —,
// saíam na folha da coluna T84A5, desenhadas com as coordenadas da vista do chumbador: as linhas de
// chamada escapavam do quadro e da folha, e a folha do T84A1 dizia "Nenhuma cota marcada".
import { describe, it, expect, vi } from "vitest";
import { PDFPage } from "pdf-lib";
vi.mock("@/lib/relatorio-form-pdf", () => ({ imagemAssinada: vi.fn() }));
vi.mock("@/lib/vista-desenho", () => ({ recortarVista: vi.fn() }));
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";
import { desenhoDaLinha, agruparPorDesenho, trocarCotasDoDesenho } from "@/lib/cota-marcacao";

const MARCAS = ["T84A1", "T84A2", "T84A3", "T84A4", "T84A5"];
const desenhos = MARCAS.map((m) => ({ marca: m, nome: `${m}.pdf`, caminho: `/x/${m}.pdf` }));
// as duas cotas do RID-084-002, como estão gravadas: `marca` vazia
const cotaA = { marca: "", letra: "A", descricao: "Cota A", projetoMm: 703, tolerancia: "± 3", ax: 57.2, ay: 23.3, bx: 58.1, by: 222.6 };
const cotaB = { marca: "", letra: "B", descricao: "Cota B", projetoMm: 410, tolerancia: "± 3", ax: 57.7, ay: 223.3, bx: 180, by: 223.3 };

/** Gera o PDF e devolve os textos de cada folha, na ordem das folhas. */
async function textosPorFolha(linhas, lista = desenhos) {
  const spy = vi.spyOn(PDFPage.prototype, "drawText");
  try {
    await gerarDimensionalPDF({
      rel: { tipo: "DIMENSIONAL", codigo: "RID-084-002", opNumero: "084", escopo: "AVULSAS",
        marcas: lista.map((d) => d.marca), linhas, resultados: {}, desenhos: lista },
    });
    const folhas = new Map();
    spy.mock.calls.forEach(([t], i) => {
      const pg = spy.mock.contexts[i];
      if (!folhas.has(pg)) folhas.set(pg, []);
      folhas.get(pg).push(String(t));
    });
    return [...folhas.values()];
  } finally { spy.mockRestore(); }
}
const folhaDo = (folhas, marca) => folhas.find((ts) => ts.includes(marca));

describe("⚠⚠ no PDF, a cota sai na folha do desenho em que foi marcada", () => {
  it("cota sem marca vai para o PRIMEIRO desenho — o que a tela abre por padrão", async () => {
    const folhas = await textosPorFolha([cotaA, cotaB]);
    expect(folhaDo(folhas, "T84A1")).toEqual(expect.arrayContaining(["Cota A", "Cota B"]));
    // e a folha da coluna T84A5 não herda as cotas do chumbador
    expect(folhaDo(folhas, "T84A5")).not.toContain("Cota A");
  });

  it("cota com a marca do desenho vai para a folha dele", async () => {
    const folhas = await textosPorFolha([{ ...cotaA, marca: "T84A3" }]);
    expect(folhaDo(folhas, "T84A3")).toContain("Cota A");
    expect(folhaDo(folhas, "T84A1")).not.toContain("Cota A");
  });

  it("relatório de um desenho só continua como era", async () => {
    const um = [desenhos[0]];
    const folhas = await textosPorFolha([cotaA, cotaB], um);
    expect(folhaDo(folhas, "T84A1")).toEqual(expect.arrayContaining(["Cota A", "Cota B"]));
  });
});

describe("a regra de quem é a cota — a mesma na tela e no PDF", () => {
  it("a marca da linha manda; sem marca que case, é do primeiro desenho", () => {
    expect(desenhoDaLinha({ marca: "T84A4" }, desenhos)).toBe("T84A4");
    expect(desenhoDaLinha({ conjunto: "T84A2", marca: "T84A-P5" }, desenhos)).toBe("T84A2");
    expect(desenhoDaLinha({ marca: "" }, desenhos)).toBe("T84A1");
    expect(desenhoDaLinha({ marca: "OUTRA" }, desenhos)).toBe("T84A1");
    expect(desenhoDaLinha({ marca: "" }, [])).toBeNull();
  });

  it("agrupa na ordem dos desenhos, e sem desenho fica um grupo só", () => {
    const g = agruparPorDesenho([cotaA, { ...cotaB, marca: "T84A2" }], desenhos);
    expect(g.map((x) => x.desenho.marca)).toEqual(MARCAS);
    expect(g[0].linhas).toEqual([cotaA]);
    expect(g[1].linhas).toEqual([{ ...cotaB, marca: "T84A2" }]);
    expect(agruparPorDesenho([cotaA], [])).toEqual([{ desenho: null, linhas: [cotaA] }]);
  });

  // ⚠⚠ A TELA TROCA SÓ AS COTAS DO DESENHO EM VISTA. Antes ela recebia TODAS as cotas e devolvia a
  // lista inteira: marcar no T84A2 punha as cotas do T84A1 por cima do T84A2, e a nova saía sem
  // dizer de qual desenho era.
  it("editar as cotas de um desenho não mexe nas dos outros e carimba a marca", () => {
    const linhas = [{ ...cotaA, marca: "T84A1" }, { marca: "T84A1", descricao: "linha da lista" }];
    const nova = { letra: "A", descricao: "Cota A", projetoMm: 12038, ax: 1, ay: 2, bx: 1, by: 600 };
    const saida = trocarCotasDoDesenho(linhas, [nova], "T84A2", desenhos);
    expect(saida).toEqual([
      { ...cotaA, marca: "T84A1" },
      { ...nova, marca: "T84A2" },
      { marca: "T84A1", descricao: "linha da lista" },
    ]);
  });

  it("a cota antiga, sem marca, ganha a marca do primeiro desenho ao ser mexida nele", () => {
    const saida = trocarCotasDoDesenho([cotaA, cotaB], [cotaA, cotaB], "T84A1", desenhos);
    expect(saida.map((c) => c.marca)).toEqual(["T84A1", "T84A1"]);
  });

  it("apagar todas as cotas de um desenho não apaga as dos outros", () => {
    const linhas = [{ ...cotaA, marca: "T84A1" }, { ...cotaB, marca: "T84A2" }];
    expect(trocarCotasDoDesenho(linhas, [], "T84A2", desenhos)).toEqual([{ ...cotaA, marca: "T84A1" }]);
  });
});
