// Certificados do penetrante, removedor e revelador no data book (Vitor, 14/10/2026): "o ideal seria puxar a
// informação de cada relatório emitido e já puxar os certificados escaneados sozinho". Os lotes vêm dos relatórios
// de LP ASSINADOS da obra; o certificado, do CMR pelo lote; a seção é a §06, junto do arame.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { sincronizarConsumiveisLp, TITULO_06, TITULO_06_COM_LP, tituloDaSecao06 } from "@/lib/databook-consumiveis-lp";

const LIVRO = { id: "b102", opNumero: "102", status: "EM_MONTAGEM", emitidoEm: null };
const lp = (codigo, extra = {}) => ({ codigo, envioAssinaturaId: `e-${codigo}`, resultados: { penetranteLote: "LT-26-1131", removedorLote: "N.A.", reveladorLote: "LT-25-0819" }, ...extra });
const CMR = [
  { id: "d929", importRef: "261929", nome: "METAL-CHEK VP 30 (5L) LP VISIVEL", numeroCorrida: "LT-26-1131" },
  { id: "d928", importRef: "261928", nome: "METAL-CHEK D 70 REVELADOR", numeroCorrida: "lt-25-0819" },
  { id: "d266", importRef: "261266", nome: "REVELADOR DE TRINCAS METALCHECK D-70", numeroCorrida: "LT-26-1228" },
  { id: "dchapa", importRef: "261646", nome: "CHAPA ACO", numeroCorrida: "LT-26-1131" },
];

function banco({ livros = [LIVRO], lps = [lp("RLP-102-001")], assinado = true, na06 = [], removidos = [], titulo = TITULO_06 } = {}) {
  mockPrisma.dataBookQualidade.findMany.mockResolvedValue(livros);
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue(lps);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue(assinado ? [{ assinadoEm: new Date() }] : [{ assinadoEm: null }]);
  mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s06", titulo, estado: "ANEXADO", documentos: na06.map((documentoId) => ({ documentoId })) });
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) =>
    where.id?.in ? CMR.filter((d) => where.id.in.includes(d.id)).concat(where.id.in.includes("darame") ? [{ id: "darame", nome: "ARAME TUBULAR K-71", numeroCorrida: "X" }] : []) : CMR);
  mockPrisma.auditLog.findMany.mockResolvedValue(removidos.map((documentoId) => ({ diff: { documentoId } })));
  mockPrisma.dataBookSecaoDoc.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.dataBookSecaoDoc.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.dataBookSecao.update.mockResolvedValue({});
}
const vinculados = () => mockPrisma.dataBookSecaoDoc.createMany.mock.calls.flatMap(([x]) => x.data.map((d) => d.documentoId));
beforeEach(() => vi.clearAllMocks());

describe("certificados de LP na §06", () => {
  it("pelos lotes dos LP assinados: penetrante e revelador entram; N.A. e lote de outro material não", async () => {
    banco();
    await sincronizarConsumiveisLp();
    expect(vinculados().sort()).toEqual(["d928", "d929"]);
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s06" }, data: { titulo: TITULO_06_COM_LP } });
  });

  it("LP sem todas as assinaturas não puxa nada", async () => {
    banco({ assinado: false });
    await sincronizarConsumiveisLp();
    expect(vinculados()).toEqual([]);
  });

  it("certificado de LP que deixou de valer sai — o do arame, nunca", async () => {
    banco({ lps: [], na06: ["d266", "darame"], titulo: TITULO_06_COM_LP });
    await sincronizarConsumiveisLp();
    expect(mockPrisma.dataBookSecaoDoc.deleteMany).toHaveBeenCalledWith({ where: { secaoId: "s06", documentoId: { in: ["d266"] } } });
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s06" }, data: { titulo: TITULO_06 } });
  });

  it("o que alguém tirou à mão não volta", async () => {
    banco({ removidos: ["d929"] });
    await sincronizarConsumiveisLp();
    expect(vinculados()).toEqual(["d928"]);
  });

  it("livro emitido não é tocado", async () => {
    banco({ livros: [{ ...LIVRO, status: "ACEITO", emitidoEm: new Date() }] });
    await sincronizarConsumiveisLp();
    expect(mockPrisma.dataBookSecao.findFirst).not.toHaveBeenCalled();
  });

  it("o nome da §06", () => {
    expect(tituloDaSecao06([{ nome: "ARAME K-71" }])).toBe(TITULO_06);
    expect(tituloDaSecao06([{ nome: "ARAME K-71" }, { nome: "METAL-CHEK VP 30" }])).toBe(TITULO_06_COM_LP);
  });
});
