// Os PDFs do pull-off (RPO) e do recebimento de tintas (RRT) — o que o modelo do SGQ tem, e o mesmo teste
// de limites dos outros relatórios: nada sai do papel, nada é cortado, assinatura em toda folha.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDocumentProxy } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

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

beforeAll(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterAll(() => vi.unstubAllGlobals());

const base = { opNumero: "112", revisao: 0, createdAt: new Date("2026-09-28T12:00:00Z"), inspetor: "Geraldo Tank", marcas: ["T112A1"] };
const pullOff = (extra = {}, rel = {}) => ({
  ...base, tipo: "PULL_OFF", codigo: "RPO-112-001", resultadoInspecao: "REPROVADO", ...rel,
  resultados: {
    documentoReferencia: "PO-05 - Preparação de Superfície e Pintura", ordemCompra: "PC 4500123", normas: "ASTM D4541",
    adesivo: "Araldite 24h", validadeAdesivo: "2027-01-31", aparelho: "Elcometer 510", apModelo: "510-T", pistao: "20 mm",
    ura: "62", ta: "24.5", ts: "27", po: "16.4", dataFixacao: "2026-10-01", dataArrancamento: "2026-10-02",
    esquema: ["120", "150", "60"],
    dollies: [{ adesao: "8.5", rompimento: "B 100%", falha: "Coesão" }, { adesao: "9", rompimento: "B/C 50%", falha: "Adesão" }, { adesao: "3,2", rompimento: "A/B 100%", falha: "Adesão" }],
    ...extra,
  },
});
const recebimento = (extra = {}) => ({
  ...base, tipo: "RECEBIMENTO_TINTA", codigo: "RRT-112-001", resultadoInspecao: "APROVADO",
  resultados: {
    contrato: "CT-2026/045", localEquipamento: "Almoxarifado Torg Metal", dataInspecao: "2026-10-01",
    material: "Wegpoxi Wet Surface 89", norma: "Petrobras N-2680", fabricante: "WEG Tintas", certificado: "CQ-777",
    lotes: [{ lote: "8912-1", quantidade: "10 latas", fabricacao: "2026-03-15", validade: "2027-03-15" }, { lote: "8913-1", quantidade: "10 latas", fabricacao: "2026-03-16", validade: "2026-09-30" }],
    tamanhoLote: "20 latas", tamanhoAmostra: "2 latas",
    checklist: { 1: "A", 2: "A", 3: "A", 4: "R", 5: "A", 6: "A", 7: "A", 8: "A", 9: "A" },
    ...extra,
  },
});

describe("PDF do pull-off", () => {
  it("traz o que o modelo tem: informações, condições, esquema, dollies, média, laudo e RNC, a legenda", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff(), cliente: "Cliente Exemplo S.A.", obra: "Caldeira" }));
    for (const t of [
      "RELATÓRIO DE ENSAIO DE TRAÇÃO", "PULL-OFF", "ASTM D-4541", "RPO-112-001", "Cliente Exemplo S.A.", "PC 4500123",
      "Araldite 24h", "31/01/2027", "Elcometer 510", "510-T", "20 mm", "T112A1",
      "URA %", "TA °C", "TS °C", "PO °C", "24,5", "16,4", "01/10/2026", "02/10/2026",
      "ESQUEMA DE PINTURA", "1ª Demão", "3ª Demão", "Espessura Total", "330",
      "RESULTADOS", "Análise do Rompimento", "Falha: Adesão/Coesão", "8,5", "B/C 50%", "3,2", "Coesão",
      "PADRÕES PARA ANÁLISE DO ROMPIMENTO", "Substrato", "Dolly", "Inspetor CQ", "Técnico CQ",
    ]) expect(todo, t).toContain(t);
    expect(todo).toMatch(/Média 6,90\b/); // (8,5 + 9 + 3,2) / 3 = 6,90 — duas casas, como a planilha mostra
    expect(todo).toContain("DATA DO ENSAIO: 02/10/2026"); // a data do ensaio é a do arrancamento
  });

  it("o nº da RNC sai sozinho quando há RNC vinculada; o digitado vale mais", async () => {
    const auto = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({}, { rnc: { numero: 15, ano: 2026 } }) }));
    expect(auto.todo).toContain("RNC-015/26");
    const digitado = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({ rncNumero: "RNC-099/26" }, { rnc: { numero: 15, ano: 2026 } }) }));
    expect(digitado.todo).toContain("RNC-099/26");
    expect(digitado.todo).not.toContain("RNC-015/26");
  });
});

describe("PDF do pull-off — a verificação de 02/10/2026", () => {
  it("a espessura total sai inteira, como a planilha mostra (120,6 → 121)", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({ esquema: ["60.3", "60.3", ""] }) }));
    expect(todo).toMatch(/Espessura Total \([µμ]m\) 121\b/); // o pdf.js devolve o µ como mu grego
  });

  it("a norma sai UMA vez — em NORMAS, nas informações, como no modelo", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff() }));
    expect(todo).not.toMatch(/NORMA:/);
    expect(todo.match(/NORMAS:/g)).toHaveLength(1);
  });

  it("dolly sem ruptura sai '> 20' e a média sai com '>' (é um mínimo)", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({ dollies: [{ adesao: "20", falha: "Sem ruptura" }, { adesao: "8", rompimento: "B 100%", falha: "Coesão" }] }) }));
    expect(todo).toMatch(/> 20\b/);
    expect(todo).toContain("Sem ruptura");
    expect(todo).toMatch(/Média > 14,00/);
  });

  it("aprovado não herda o nº da RNC da reprovação anterior; o digitado sai sempre", async () => {
    const aprovado = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({}, { resultadoInspecao: "APROVADO", rnc: { numero: 15, ano: 2026 } }) }));
    expect(aprovado.todo).not.toContain("RNC-015/26");
    const digitado = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({ rncNumero: "RNC-020/26" }, { resultadoInspecao: "APROVADO" }) }));
    expect(digitado.todo).toContain("RNC-020/26");
  });

  it("nº da RNC longo e documento de referência de 500 caracteres saem INTEIROS (antes: '…' e linha 13 perdida)", async () => {
    const rnc = "RNC-015/26 e RNC-016/26 (ver PA-003 / 5W2H) e RNC-017/26 (retrabalho)";
    const doc = Array.from({ length: 22 }, (_, i) => `ET-MMMW-${String(i + 1).padStart(4, "0")}`).join(" ").slice(0, 500);
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: pullOff({ rncNumero: rnc, documentoReferencia: doc }) }));
    for (const w of rnc.split(" ")) expect(todo).toContain(w);
    for (const w of doc.split(" ")) expect(todo).toContain(w);
  });
});

describe("PDF do recebimento de tintas", () => {
  it("traz o que o modelo tem: OP, contrato, local, material, lotes, datas, amostragem e os nove itens", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: recebimento(), cliente: "Cliente Exemplo S.A.", obra: "Caldeira" }));
    for (const t of [
      "RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE TINTAS", "RRT-112-001", "OP-112", "CT-2026/045", "Almoxarifado Torg Metal",
      "Wegpoxi Wet Surface 89", "Petrobras N-2680", "WEG Tintas", "CQ-777", "8912-1", "10 latas", "15/03/2026", "15/03/2027",
      "20 latas", "2 latas", "Deficiência ou Excesso de Enchimento", "Marcação Deficiente", "APROVADO", "REPROVADO",
      "Inspetor C.Q.", "Técnico C.Q.", "Fiscalização",
    ]) expect(todo, t).toContain(t);
    expect(todo).toContain("30/09/2026 (vencida)"); // validade antes da data do recebimento
    expect(todo).not.toContain("novusconsultoria");
  });

  it("sem data do recebimento, a validade é conferida contra a data IMPRESSA (emissão) — não contra hoje", async () => {
    const rel = { ...recebimento({ dataInspecao: "", lotes: [{ lote: "L1", validade: "2026-09-20" }] }), emitidoEm: new Date("2026-09-11T15:00:00Z") };
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel }));
    expect(todo).toContain("DATA DO RECEBIMENTO: 11/09/2026");
    expect(todo).toContain("20/09/2026");
    expect(todo).not.toContain("(vencida)");
    expect(todo).not.toContain("validade vencida");
    // e o inverso: vencida ANTES da data impressa aparece, mesmo sem a data do recebimento digitada
    const antes = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...rel, resultados: { ...rel.resultados, lotes: [{ lote: "L1", validade: "2026-09-05" }] } } }));
    expect(antes.todo).toContain("05/09/2026 (vencida)");
  });

  it("o resultado da inspeção sai impresso — reprovar por lote vencido ou outro motivo aparece no documento", async () => {
    const reprovado = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...recebimento(), resultadoInspecao: "REPROVADO" } }));
    expect(reprovado.todo).toMatch(/RESULTADO DA INSPEÇÃO: APROVADO X REPROVADO/);
    const aprovado = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...recebimento({ checklist: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, "A"])) }), resultadoInspecao: "APROVADO" } }));
    expect(aprovado.todo).toMatch(/RESULTADO DA INSPEÇÃO: X APROVADO REPROVADO/);
  });

  it("na folha de fotos, FABRICANTE é o da tinta, como na folha 1 — não a Torg", async () => {
    const fotos = Array.from({ length: 9 }, (_, i) => ({ url: null, observacao: `Foto ${i + 1}` }));
    const { paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: recebimento(), fotos, cliente: "Cliente Exemplo S.A." }));
    expect(paginas.length).toBeGreaterThan(1);
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).not.toMatch(/FABRICANTE:\s*TORG METAL/);
      expect(t, `folha ${i + 1}`).toMatch(/FABRICANTE:\s*WEG Tintas/);
    });
  });
});

describe.each([["pull-off", pullOff], ["recebimento", recebimento]])("%s — nada falta, nada sai do papel", (_, montar) => {
  const marcas = Array.from({ length: 40 }, (_, i) => `T112A${i + 1}`);
  const palavras = (n) => Array.from({ length: n }, (_, i) => `palavra${String(i + 1).padStart(3, "0")}`).join(" ");
  const instrumentos = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: `Instrumento ${i + 1}`, certificado: `CERT-${i + 1}` }));
  const assinaturas = [{ setor: "inspetor", nome: "Geraldo Tank", assinadoEm: new Date("2026-10-02T13:00:00Z"), imagemUrl: "https://exemplo.invalid/a.png" }];

  it("12 instrumentos, assinatura desenhada, 3 fotos, observação de 600 palavras: tudo dentro, assinatura em toda folha, FOLHA certa", async () => {
    const rel = { ...montar(), marcas, observacoes: palavras(600), equipamentos: instrumentos };
    const fotos = [{ url: null, marca: "T112A1", observacao: "Dolly 1 arrancado" }, { url: null, observacao: "Lata A" }, { url: null, observacao: "Terceira" }];
    const { itens, paginas, todo } = await lerPDF(await gerarPDFdoRelatorio({ rel, fotos, assinaturas }));
    for (const it of itens) {
      expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
      expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
    }
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).toContain("Geraldo Tank"); // o nome de quem assinou EM CADA folha (pdf.js não devolve o que sai do papel)
      expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`);
    });
    for (let i = 1; i <= 600; i++) expect(todo).toContain(`palavra${String(i).padStart(3, "0")}`);
    for (const e of instrumentos) expect(todo).toContain(`nº ${e.certificado}`);
    expect(todo).toContain("Lata A"); // a legenda que o inspetor escreveu, na foto do corpo ou na folha de fotos
  });
});
