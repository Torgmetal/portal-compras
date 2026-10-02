// Os campos do relatório de LÍQUIDO PENETRANTE como o modelo (FORM. SGQ - 012) os nomeia — achados da
// verificação dos modelos (02/10/2026): "O.S (Order)" num documento de O.P, a data de inspeção saindo
// "2026-10-01", a luz negra cortada em "1200 µ...", a linha COMPONENTE / DESENHO / REVISÃO repetindo o
// desenho e a revisão da linha de cima, o DESENHO TORG que a tela não tinha onde preencher, e o mesmo
// número saindo como "TEMPO INTERP.: 45 min" e "Revelador aplicado 45 min após a secagem" na mesma folha.
import { describe, expect, it } from "vitest";
import { extractText } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";
import { conferirEnsaio } from "@/lib/lp-campos";
import { corDoLaudo } from "@/lib/relatorio-lp-pdf";
import { GREEN, ORANGE, RED } from "@/lib/relatorio-form-pdf";

const texto = async (bytes) => (await extractText(new Uint8Array(bytes), { mergePages: true })).text.replace(/\s+/g, " ");
const lp = (resultados = {}, extra = {}) => ({
  tipo: "LP", codigo: "RLP-089-002", opNumero: "089", revisao: 0, emitidoEm: new Date("2026-10-05T15:00:00Z"),
  marcas: ["T89A1"], linhas: [{ marca: "T89A1", laudo: "A" }], equipamentos: [], resultados, ...extra,
});
const gerar = (rel) => gerarPDFdoRelatorio({ rel, cliente: "CLIENTE", obra: "OBRA", refCliente: "REF" }).then(texto);

describe("LP — os rótulos e os valores do modelo", () => {
  it("é O.P (Order), não O.S", async () => {
    const t = await gerar(lp());
    expect(t).toContain("O.P (Order): OP-089");
    expect(t).not.toContain("O.S (Order)");
  });

  it("a data de inspeção sai dd/mm/aaaa, sem voltar um dia pelo fuso", async () => {
    const t = await gerar(lp({ dataInspecao: "2026-10-01" }));
    expect(t).toContain("01/10/2026");
    expect(t).not.toContain("2026-10-01");
    expect(t).not.toContain("30/09/2026");
  });

  it("a luz negra sai inteira", async () => {
    const t = await gerar(lp({ tipoPenetrante: "I", iluminacao: "5", uv: "1200" }));
    // o pdf.js devolve o "µ" do WinAnsi como a letra grega (U+03BC): vale qualquer um dos dois
    expect(t).toMatch(/ILUMINAÇÃO \(Lighting\): 5 lux \/ 1200 [µμ]W\/cm²/);
    expect(t).not.toMatch(/[µμ]\.\.\./);
  });

  it("o componente inspecionado continua no documento, sem repetir desenho e revisão", async () => {
    const t = await gerar(lp({ componente: "Placas de base das colunas", desenho: "T89A1", revisaoDesenho: "R3" }));
    expect(t).toContain("Placas de base das colunas");
    expect(t).not.toContain("DESENHO (Drawing)");
    expect(t).not.toContain("REVISÃO (Rev.)");
    expect(t.match(/\bR3\b/g)).toHaveLength(1);
  });

  it("o DESENHO TORG informado vale sobre a relação de peças", async () => {
    const t = await gerar(lp({ desenho: "DES-T89-001" }, { marcas: ["T89A7"], linhas: [] }));
    expect(t).toContain("DESENHO TORG (TORG Drawing): DES-T89-001");
    expect(t).not.toContain("T89A7");
  });

  it("sem desenho informado, a relação de peças continua saindo no lugar", async () => {
    const t = await gerar(lp({}, { marcas: ["T89A7", "T89A8"], linhas: [] }));
    expect(t).toContain("T89A7, T89A8");
  });
});

describe("LP — o tempo de interpretação é chamado pelo nome com que foi pedido", () => {
  it("a conferência não diz 'revelador aplicado X min após a secagem' de um número digitado como interpretação", () => {
    const { problemas } = conferirEnsaio({ tipo: "II", revelador: "45" });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("Tempo de interpretação de 45 min");
    expect(problemas[0]).toContain("PO-15, item 11");
    expect(problemas[0]).not.toContain("Revelador aplicado");
  });

  it("no PDF, o mesmo número sai com o mesmo nome no parâmetro e no aviso", async () => {
    const t = await gerar(lp({ tempoRevelador: "45" }));
    expect(t).toContain("TEMPO INTERP. (Interp.): 45 min");
    expect(t).toContain("Tempo de interpretação de 45 min");
    expect(t).not.toContain("Revelador aplicado");
  });
});

describe("LP — a cor do laudo é a da lista de laudos (lib/evs-campos)", () => {
  it("A verde, R vermelho, REC laranja — REC não é reprovado", () => {
    expect(corDoLaudo("A")).toBe(GREEN);
    expect(corDoLaudo("r")).toBe(RED);
    expect(corDoLaudo("REC")).toBe(ORANGE);
    expect(corDoLaudo("")).toBeNull();
  });
});
