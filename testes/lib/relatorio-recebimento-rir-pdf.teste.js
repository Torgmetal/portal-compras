// O PDF dos recebimentos por certificado (RRP e RRA), no modelo da Torg. Vitor (07/10/2026): o RIR do
// cliente é "apenas um modelo para saber as informações necessárias" — NF e item, certificado/lote, pedido,
// descrição, quantidade, inspeção visual/dimensional/documentos (A, R, N.A.), RNC, observações, comentários
// da fiscalização e as três assinaturas.
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

const item = (n, extra = {}) => ({
  docId: `d${n}`, r: `2617${String(n).padStart(2, "0")}`, descricao: `ARAME DE SOLDA MIG ER70S-6 1,2 MM LOTE ${n}`,
  fornecedor: "KSOLDA", nf: "81288", itemNf: String(n), certificado: `9900553${n}`, lote: `C-${n}`, pc: "1903",
  quantidade: "2.160 kg", validade: "", visual: "A", dimensional: "NA", documentos: "A", rnc: "", ...extra,
});
const rel = (tipo, itens, extra = {}) => ({
  tipo, codigo: tipo === "RECEBIMENTO_ARAME" ? "RRA-102-001" : "RRP-102-001", opNumero: "102", revisao: 0,
  createdAt: new Date("2026-10-07T12:00:00Z"), inspetor: "Alexandre Stival", resultadoInspecao: "APROVADO",
  observacoes: "Material conferido contra a NF e o certificado.",
  resultados: { contrato: "4600123456", localAplicacao: "Fabricação Torg Metal, Conchal", dataInspecao: "2026-10-07", itens },
  ...extra,
});

describe("recebimento de arame de solda (RRA)", () => {
  it("traz o título, a identificação e cada item com as três inspeções", async () => {
    const bytes = await gerarPDFdoRelatorio({ rel: rel("RECEBIMENTO_ARAME", [item(1), item(2, { visual: "R", rnc: "RNC-031/26" })], { resultadoInspecao: "REPROVADO" }), cliente: "QWS", obra: "Revamp" });
    const { todo } = await lerPDF(bytes);
    expect(todo).toMatch(/RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE ARAME DE SOLDA/);
    expect(todo).toMatch(/RRA-102-001/);
    expect(todo).toMatch(/4600123456/);
    expect(todo).toMatch(/07\/10\/2026/);
    expect(todo).toMatch(/Fabricação Torg Metal, Conchal/);
    expect(todo).toMatch(/KSOLDA/);
    for (const t of ["81288", "99005531", "C-1", "1903", "2.160 kg", "261701", "N.A.", "RNC-031/26"]) expect(todo, t).toContain(t);
    expect(todo).toMatch(/ARAME DE SOLDA MIG ER70S-6/);
    expect(todo).toMatch(/COMENTÁRIOS DA FISCALIZAÇÃO/);
    expect(todo).toMatch(/N\.A\. = não aplicável/i);
    expect(todo).toMatch(/Material conferido contra a NF/);
  });

  it("40 certificados: nenhum se perde e nada sai do papel", async () => {
    const itens = Array.from({ length: 40 }, (_, i) => item(i + 1));
    const { itens: textos, todo, paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel("RECEBIMENTO_ARAME", itens), cliente: "QWS" }));
    expect(paginas.length).toBeGreaterThan(1);
    for (let n = 1; n <= 40; n++) expect(todo, `item ${n}`).toContain(`2617${String(n).padStart(2, "0")}`);
    for (const t of textos) {
      expect(t.y, `${t.str} (folha ${t.pagina})`).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(t.altura);
    }
  });

  it("validade vencida na data do recebimento sai marcada", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel("RECEBIMENTO_ARAME", [item(1, { validade: "2026-09-30" })], { resultadoInspecao: "REPROVADO" }) }));
    expect(todo).toMatch(/30\/09\/2026 \(vencida\)/);
  });
});

describe("recebimento de penetrante e revelador (RRP)", () => {
  it("tem o título próprio e sai mesmo sem item", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel("RECEBIMENTO_PENETRANTE", [], { resultadoInspecao: null }), cliente: "QWS" }));
    expect(todo).toMatch(/RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE PENETRANTE E REVELADOR/);
    expect(todo).toMatch(/RRP-102-001/);
  });
});

describe("recebimento de tintas criado pelos certificados (RRT)", () => {
  it("lista os certificados escolhidos, com a posição de cada um", async () => {
    const rrt = {
      tipo: "RECEBIMENTO_TINTA", codigo: "RRT-102-002", opNumero: "102", revisao: 0, createdAt: new Date("2026-10-07T12:00:00Z"), resultadoInspecao: null,
      resultados: {
        material: "TINTA INDUSTHANE RHB 650", fabricante: "INDUSCOLOR", lotes: [{ lote: "85596" }, { lote: "85597" }, { lote: "85598" }],
        certificados: [
          { r: "260021", descricao: "DILUENTE PARA INDUSTHANE ACR 34.019", certificado: "3285", lote: "85598", nf: "17819" },
          { r: "260019", descricao: "TINTA INDUSTHANE RHB 650 CINZA", certificado: "3283", lote: "85596", nf: "17819" },
          { r: "260020", descricao: "ENDURECEDOR PARA INDUSTHANE 35.010", certificado: "3284", lote: "85597", nf: "17819" },
        ],
      },
    };
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: rrt, cliente: "QWS" }));
    expect(todo).toMatch(/CERTIFICADOS DO CMR/);
    for (const t of ["260021", "260019", "260020", "3285", "3283", "3284"]) expect(todo, t).toContain(t);
    expect(todo).toMatch(/DILUENTE PARA INDUSTHANE/);
  });

  it("relatório antigo, sem certificados escolhidos, sai como sempre saiu", async () => {
    const antigo = { tipo: "RECEBIMENTO_TINTA", codigo: "RRT-102-001", opNumero: "102", revisao: 0, createdAt: new Date("2026-10-01T12:00:00Z"), resultados: { material: "Tinta", lotes: [{ lote: "L1" }] } };
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: antigo }));
    expect(todo).not.toMatch(/CERTIFICADOS DO CMR/);
  });
});
