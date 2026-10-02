// Achados da verificação dos modelos A (02/10/2026) no relatório DIMENSIONAL — que é também o da
// PRÉ-MONTAGEM (mesmo gerador). Cada caso gera o PDF e o lê de volta.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";

// assinatura com imagem cadastrada: o bloco sobe para 118 pt (a imagem em si não precisa baixar)
beforeAll(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

async function lerPDF(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const itens = [], paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const { height } = pg.getViewport({ scale: 1 });
    const { items } = await pg.getTextContent();
    for (const it of items) if (it.str.trim()) itens.push({ pagina: p, str: it.str, y: it.transform[5], altura: height });
    paginas.push(items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  return { itens, paginas, todo: paginas.join(" ") };
}

const cota = (letra, extra = {}) => ({ marca: "T84A1", letra, descricao: `Cota ${letra}`, projetoMm: 100, tolerancia: "± 2", ...extra });
const gerar = (relExtra = {}, opts = {}) => gerarDimensionalPDF({
  rel: { tipo: "DIMENSIONAL", codigo: "RID-084-009", opNumero: "084", inspetor: "Geraldo Tank", marcas: ["T84A1"], desenhos: [], resultados: {}, linhas: [cota("A")], ...relExtra },
  fotos: [], cliente: "Cliente Exemplo S.A.", obra: "Galpão", refCliente: "TPR-1", ...opts,
});

/** As caixinhas de marcar preenchidas (7×7 com cor), com a cor. */
function espiarCaixas() {
  const cheias = [];
  const orig = PDFPage.prototype.drawRectangle;
  vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (o) {
    if (o?.width === 7 && o?.height === 7 && o?.color) cheias.push(o.color);
    return orig.call(this, o);
  });
  return cheias;
}
const VERDE = { red: 0.02, green: 0.47, blue: 0.34 };
const LARANJA = { red: 244 / 255, green: 128 / 255, blue: 31 / 255 };

describe("dimensional — o resultado é o da inspeção", () => {
  it("reinspeção aprovada no celular: RESULTADO marca Aprovado, não o 'Reprovado' velho do formulário", async () => {
    const cheias = espiarCaixas();
    await gerar({ revisao: 1, resultadoInspecao: "APROVADO", resultados: { resultado: "Reprovado" } });
    expect(cheias).toHaveLength(1);
    expect(cheias[0]).toMatchObject(VERDE);
  });

  it("sem A/R na inspeção (vazio ou REC), vale o que o formulário marcou — inclusive Retrabalhar", async () => {
    const cheias = espiarCaixas();
    await gerar({ resultadoInspecao: "REC", resultados: { resultado: "Retrabalhar" } });
    expect(cheias).toHaveLength(1);
    expect(cheias[0]).toMatchObject(LARANJA);
  });
});

describe("dimensional — nada some do documento", () => {
  it("a letra da cota sai na tabela mesmo com a descrição editada", async () => {
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    await gerar({ linhas: [cota("E", { descricao: "Distância entre furos da alma" })] });
    const textos = spy.mock.calls.map(([t]) => String(t));
    expect(textos).toContain("E");
    expect(textos.join(" ")).toContain("Distância entre furos da alma");
  });

  it("o PROCEDIMENTO do modelo sai inteiro no cabeçalho", async () => {
    const { todo } = await lerPDF(await gerar({ resultados: { procedimento: "PO-04 - Tolerâncias de Fabricação Rev. 02" } }));
    expect(todo).toContain("PROCEDIMENTO");
    expect(todo).toContain("PO-04 - Tolerâncias de Fabricação Rev. 02");
  });

  it("várias marcas sem desenho: identificação, nº do desenho e quantidade de todas, sem reticência", async () => {
    const marcas = Array.from({ length: 8 }, (_, i) => `T84A${i + 1}`);
    const tiposPeca = Object.fromEntries(marcas.map((m, i) => [m, i % 2 ? "VIGA" : "COLUNA"]));
    const qtdPeca = Object.fromEntries(marcas.map((m) => [m, 2]));
    const { todo } = await lerPDF(await gerar({ marcas, linhas: [cota("A", { marca: "" })], resultados: { tiposPeca, qtdPeca } }));
    for (const m of marcas) expect(todo).toMatch(new RegExp(`\\b${m}\\b`));
    expect(todo).toMatch(/QUANT\.: 16\b/);
    expect(todo).toMatch(/COLUNA, VIGA/);
    expect(todo).not.toContain("...");
  });

  it("comentário longo e a observação de cada cota saem inteiros", async () => {
    const obs = Array.from({ length: 300 }, (_, i) => `palavra${String(i + 1).padStart(3, "0")}`).join(" ");
    const { todo } = await lerPDF(await gerar({ observacoes: obs, linhas: [cota("A", { obs: "medido com a peça apoiada" }), cota("B")] }));
    for (let i = 1; i <= 300; i++) expect(todo).toContain(`palavra${String(i).padStart(3, "0")}`);
    expect(todo).toContain("Cota A: medido com a peça apoiada");
  });

  it("FOLHA x DE y conta as folhas de foto, e a folha de fotos usa os papéis do formulário", async () => {
    const fotos = Array.from({ length: 7 }, (_, i) => ({ url: null, observacao: `Foto ${i + 1}` }));
    const { paginas } = await lerPDF(await gerar({}, { fotos }));
    expect(paginas).toHaveLength(3);
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toMatch(new RegExp(`${i + 1} DE 3`)));
    expect(paginas[1]).toContain("Inspetor Torg Metal");
  });

  it("nada sai do papel: 12 instrumentos, assinatura desenhada e comentário longo", async () => {
    const equipamentos = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: `Trena ${i + 1}`, certificado: `C-${i}` }));
    const assinaturas = [{ setor: "inspetor", nome: "Geraldo Tank", assinadoEm: new Date("2026-10-02T13:00:00Z"), imagemUrl: "https://x.invalid/a.png" }];
    const obs = Array.from({ length: 120 }, (_, i) => `palavra${i}`).join(" ");
    const { itens } = await lerPDF(await gerar({ equipamentos, observacoes: obs }, { assinaturas }));
    // o rodapé (código · folha / aviso de rascunho) mora de propósito a 10 pt do pé; o resto, dentro da moldura
    for (const it of itens.filter((x) => !/folha \d+ de \d+|RASCUNHO|Registro eletrônico/.test(x.str))) {
      expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(26);
    }
    for (const e of equipamentos) expect(itens.map((x) => x.str).join(" ")).toContain(`nº ${e.certificado}`);
  });

  it("número no padrão brasileiro e o título da coluna inteiro", async () => {
    const { todo } = await lerPDF(await gerar({ linhas: [cota("A", { projetoMm: 450.5, encontradoMm: 451.25 })] }));
    expect(todo).toContain("450,5");
    expect(todo).toContain("451,25");
    expect(todo).toMatch(/Dimensão\s+Encontrada/);
  });
});
