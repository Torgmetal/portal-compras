// Recebimento de arame e de penetrante SEM OP (Vitor, 14/10/2026): "o Arame será usado para várias
// obras" — e o penetrante também. O relatório nasce de estoque (RRA-EST-001) e entra, assinado, no
// data book de cada obra que USOU o que ele recebeu: o arame pelo R (o mesmo cálculo do carimbo do
// desenho), o penetrante pelo LOTE gravado no relatório de LP da obra.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
const consumiveis = vi.fn();
vi.mock("@/lib/consumivel-solda", () => ({ consumiveisDaOP: (...a) => consumiveis(...a) }));
vi.mock("@/lib/databook-certificados-novos", () => ({ certificadosDaOp: vi.fn().mockResolvedValue([]) }));

import {
  OP_ESTOQUE, ehDeEstoque, chavesDoRecebimento, chavesDoLp, sincronizarRecebimentosDeEstoque,
} from "@/lib/recebimento-estoque";
import { codigoRelatorio } from "@/lib/qualidade-campo";

const RRA = (extra = {}) => ({
  id: "rra1", codigo: "RRA-EST-001", tipo: "RECEBIMENTO_ARAME", opNumero: OP_ESTOQUE, titulo: null,
  envioAssinaturaId: "e1", documentoId: "doc-rra1", emitidoEm: null,
  resultados: { itens: [{ r: "R261700", lote: "L1" }, { r: "R261800", lote: "L2" }] }, ...extra,
});
const RRP = (extra = {}) => ({
  id: "rrp1", codigo: "RRP-EST-001", tipo: "RECEBIMENTO_PENETRANTE", opNumero: OP_ESTOQUE, titulo: null,
  envioAssinaturaId: "e2", documentoId: "doc-rrp1", emitidoEm: null,
  resultados: { itens: [{ r: "R1", lote: "lt-25-0819" }] }, ...extra,
});
const LIVROS = [
  { id: "b102", opNumero: "102", opId: "op102", status: "EM_MONTAGEM", emitidoEm: null, revisao: 0 },
  { id: "b105", opNumero: "105", opId: "op105", status: "EM_MONTAGEM", emitidoEm: null, revisao: 0 },
  { id: "b067", opNumero: "067", opId: "op067", status: "ACEITO", emitidoEm: new Date(), revisao: 1 },
];

function banco({ rels, assinado = true, lps = [], usados = {} }) {
  mockPrisma.dataBookQualidade.findMany.mockResolvedValue(LIVROS);
  mockPrisma.relatorioInspecao.findMany.mockImplementation(async ({ where }) =>
    where.tipo === "LP" ? lps.filter((l) => l.opNumero === where.opNumero) : rels);
  mockPrisma.dataBookSecao.findMany.mockImplementation(async ({ where }) =>
    where.dataBookId.in.map((id) => ({ id: `s12-${id}`, dataBookId: id, numero: "12", titulo: "Relatório de Ensaios (END)", estado: "ANEXADO" })));
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue(assinado ? [{ assinadoEm: new Date() }] : [{ assinadoEm: null }]);
  mockPrisma.documentoQualidade.update.mockResolvedValue({});
  mockPrisma.documentoQualidade.create.mockResolvedValue({ id: "doc-novo" });
  mockPrisma.relatorioInspecao.update.mockResolvedValue({});
  mockPrisma.dataBookSecaoDoc.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.dataBookSecaoDoc.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.dataBookSecaoDoc.count.mockResolvedValue(1);
  consumiveis.mockImplementation(async (opId) => (usados[opId] || []).map((r) => ({ rastreio: r })));
}
const vinculos = () => mockPrisma.dataBookSecaoDoc.createMany.mock.calls.flatMap(([x]) => x.data);
const tiradosDe = () => mockPrisma.dataBookSecaoDoc.deleteMany.mock.calls.map(([x]) => x.where);

beforeEach(() => { vi.clearAllMocks(); });

describe("quais recebimentos são de estoque", () => {
  it("arame e penetrante; tinta continua por obra", () => {
    expect(ehDeEstoque("RECEBIMENTO_ARAME")).toBe(true);
    expect(ehDeEstoque("RECEBIMENTO_PENETRANTE")).toBe(true);
    expect(ehDeEstoque("RECEBIMENTO_TINTA")).toBe(false);
  });
  it("o código diz EST, não 000", () => {
    expect(codigoRelatorio("RECEBIMENTO_ARAME", OP_ESTOQUE, 1)).toBe("RRA-EST-001");
  });
});

describe("a chave que liga o recebimento à obra", () => {
  it("arame pelo R, penetrante pelo lote — normalizados", () => {
    expect([...chavesDoRecebimento(RRA())]).toEqual(["R261700", "R261800"]);
    expect([...chavesDoRecebimento(RRP())]).toEqual(["LT-25-0819"]);
  });
  it("do LP saem os três lotes, sem N.A. nem vazio", () => {
    const lp = { resultados: { penetranteLote: "LT-26-1131", removedorLote: "N.A.", reveladorLote: " lt-25-0819 " } };
    expect([...chavesDoLp(lp)].sort()).toEqual(["LT-25-0819", "LT-26-1131"]);
  });
});

describe("sincronizar com os data books", () => {
  it("arame assinado entra na §12 de cada obra que soldou com um dos R — e não na que não soldou", async () => {
    banco({ rels: [RRA()], usados: { op102: ["R261700"], op105: ["R999"] } });
    await sincronizarRecebimentosDeEstoque();
    expect(vinculos()).toEqual([{ secaoId: "s12-b102", documentoId: "doc-rra1" }]);
    expect(tiradosDe()).toContainEqual({ documentoId: { in: ["doc-rra1"] }, secao: { dataBookId: "b105" } });
  });

  it("uma obra recebe TODOS os RRA que usou", async () => {
    const outro = RRA({ id: "rra2", codigo: "RRA-EST-002", documentoId: "doc-rra2", resultados: { itens: [{ r: "R261900" }] } });
    banco({ rels: [RRA(), outro], usados: { op102: ["R261700", "R261900"] } });
    await sincronizarRecebimentosDeEstoque();
    expect(vinculos().filter((v) => v.secaoId === "s12-b102").map((v) => v.documentoId)).toEqual(["doc-rra1", "doc-rra2"]);
  });

  it("penetrante entra pela obra cujo LP usou o lote", async () => {
    banco({ rels: [RRP()], lps: [{ opNumero: "105", resultados: { reveladorLote: "LT-25-0819" } }] });
    await sincronizarRecebimentosDeEstoque();
    expect(vinculos()).toEqual([{ secaoId: "s12-b105", documentoId: "doc-rrp1" }]);
  });

  it("não assinado por todos não entra — e sai de onde estava", async () => {
    banco({ rels: [RRA()], assinado: false, usados: { op102: ["R261700"] } });
    await sincronizarRecebimentosDeEstoque();
    expect(vinculos()).toEqual([]);
    expect(tiradosDe()).toContainEqual({ documentoId: { in: ["doc-rra1"] }, secao: { dataBookId: { in: ["b102", "b105"] } } });
  });

  it("livro emitido não recebe nem perde nada", async () => {
    banco({ rels: [RRA()], usados: { op067: ["R261700"] } });
    await sincronizarRecebimentosDeEstoque();
    expect(consumiveis).not.toHaveBeenCalledWith("op067");
    expect(JSON.stringify(tiradosDe())).not.toMatch(/b067/);
  });

  // ⚠⚠ 15/10/2026, data book da OP-102: RRA/RRP/RRM entraram no livro mas sem PDF ("Arquivo inválido" e "documento
  // sem arquivo"). O documento nascia com opNumero null, e `fonteDeInspecao` RECUSA sem obra para conferir.
  it("o documento do recebimento leva opNumero EST — e a fonte do PDF aceita", async () => {
    const { fonteDeInspecao } = await import("@/lib/relatorio-pdf-fonte");
    banco({ rels: [RRA()], usados: { op102: ["R261700"] } });
    await sincronizarRecebimentosDeEstoque();
    const dados = mockPrisma.documentoQualidade.update.mock.calls[0][0].data;
    expect(dados.opNumero).toBe("EST");
    expect(fonteDeInspecao(dados)).toMatchObject({ relatorioId: "rra1", exigirOp: "EST" });
  });
});
