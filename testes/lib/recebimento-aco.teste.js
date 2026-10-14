// Recebimento de AÇO (Vitor, 14/10/2026): "o modelo de relatório dos materiais de uso, que seria o Aço —
// a mesma linha dos demais no layout, porém com informações compatíveis com recebimento de material".
// É o RIR do arame/penetrante com uma inspeção a mais (IDENTIFICAÇÃO: a corrida marcada na peça bate com
// o certificado) e a NORMA/GRAU no lugar da validade. De estoque, pelo R; entra na §04.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/consumivel-solda", () => ({ consumiveisDaOP: vi.fn().mockResolvedValue([]) }));
const certsDaOp = vi.fn();
vi.mock("@/lib/databook-certificados-novos", () => ({ certificadosDaOp: (...a) => certsDaOp(...a) }));

import { inspecoesRir, ehRir, itensRir, limparItensRir, pendenciasRir, resultadoExigidoRir } from "@/lib/recebimento-rir-campos";
import { certificadoDaClasse, ehDeEstoque, ehRecebimento, MAX_CERTIFICADOS } from "@/lib/recebimento-certificados";
import { TIPO, codigoRelatorio, tituloDocumento } from "@/lib/qualidade-campo";
import { sincronizarRecebimentosDeEstoque, secaoDoRecebimento } from "@/lib/recebimento-estoque";

const ACO = "RECEBIMENTO_ACO";
const item = (extra = {}) => ({ descricao: "CHAPA ACO 9,50 A36", r: "261646", norma: "ASTM A36", certificado: "C1", lote: "COR1", visual: "A", dimensional: "A", identificacao: "A", documentos: "A", ...extra });

describe("o tipo", () => {
  it("é recebimento, de estoque, RIR, sigla RRM, na §04", () => {
    expect(ehRecebimento(ACO) && ehDeEstoque(ACO) && ehRir(ACO)).toBe(true);
    expect(TIPO[ACO]).toMatchObject({ sigla: "RRM", secao: "04" });
    expect(codigoRelatorio(ACO, "EST", 3)).toBe("RRM-EST-003");
    expect(tituloDocumento(ACO)).toMatch(/RECEBIMENTO DE (AÇO|MATÉRIA-PRIMA)/);
    expect(MAX_CERTIFICADOS[ACO]).toBe(40);
    expect(secaoDoRecebimento(ACO)).toBe("04");
    expect(secaoDoRecebimento("RECEBIMENTO_ARAME")).toBe("12");
  });
  it("certificados da classe: aço estrutural, não parafuso nem tinta", () => {
    expect(certificadoDaClasse(ACO, "CHAPA ACO 9,50")).toBe(true);
    expect(certificadoDaClasse(ACO, "PERFIL W 200X26,6")).toBe(true);
    expect(certificadoDaClasse(ACO, "PARAFUSO SEXT 3/4 A325")).toBe(false);
    expect(certificadoDaClasse(ACO, "TINTA INDUSTHANE")).toBe(false);
  });
});

describe("as inspeções", () => {
  it("aço tem quatro (com identificação); arame e penetrante seguem com três", () => {
    expect(inspecoesRir(ACO).map((c) => c.k)).toEqual(["visual", "dimensional", "identificacao", "documentos"]);
    expect(inspecoesRir("RECEBIMENTO_ARAME").map((c) => c.k)).toEqual(["visual", "dimensional", "documentos"]);
  });
  it("a identificação e a norma são gravadas", () => {
    const [i] = limparItensRir([item({ identificacao: "r", norma: "ASTM A572 Gr.50" })]);
    expect(i).toMatchObject({ identificacao: "R", norma: "ASTM A572 Gr.50" });
    expect(itensRir({ itens: [i] })[0].identificacao).toBe("R");
  });
  it("sem a identificação marcada o aço não está completo; com ela reprovada, exige reprovar", () => {
    const rel = (i) => ({ tipo: ACO, resultadoInspecao: "APROVADO", resultados: { itens: [i] } });
    expect(resultadoExigidoRir(rel(item({ identificacao: "" })))).toBe("");
    expect(pendenciasRir(rel(item({ identificacao: "" }))).join(" ")).toMatch(/identifica/i);
    expect(resultadoExigidoRir(rel(item({ identificacao: "R" })))).toBe("REPROVADO");
    expect(resultadoExigidoRir(rel(item()))).toBe("APROVADO");
  });
  it("o arame não cobra identificação", () => {
    const rel = { tipo: "RECEBIMENTO_ARAME", resultadoInspecao: "APROVADO", resultados: { itens: [item({ identificacao: "" })] } };
    expect(resultadoExigidoRir(rel)).toBe("APROVADO");
  });
});

describe("vai à §04 das obras que usaram o R", () => {
  beforeEach(() => vi.clearAllMocks());
  it("pelo R dos certificados de aço da obra (inclusive o declarado vindo de outra obra)", async () => {
    mockPrisma.relatorioInspecao.findMany.mockResolvedValue([{ id: "m1", codigo: "RRM-EST-001", tipo: ACO, opNumero: "EST", envioAssinaturaId: "e", documentoId: "doc-m1", resultados: { itens: [{ r: "261646" }] } }]);
    mockPrisma.dataBookQualidade.findMany.mockResolvedValue([
      { id: "b102", opNumero: "102", opId: "op102", status: "EM_MONTAGEM", emitidoEm: null },
      { id: "b105", opNumero: "105", opId: "op105", status: "EM_MONTAGEM", emitidoEm: null },
    ]);
    mockPrisma.dataBookSecao.findMany.mockImplementation(async ({ where }) =>
      where.dataBookId.in.flatMap((id) => where.numero.in.map((n) => ({ id: `s${n}-${id}`, dataBookId: id, numero: n, titulo: `T${n}`, estado: "ANEXADO" }))));
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([{ assinadoEm: new Date() }]);
    mockPrisma.documentoQualidade.update.mockResolvedValue({});
    mockPrisma.dataBookSecaoDoc.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.dataBookSecaoDoc.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.dataBookSecaoDoc.count.mockResolvedValue(1);
    certsDaOp.mockImplementation(async (_db, op) => (op === "102" ? [{ nome: "CHAPA ACO 9,50", importRef: "261646" }] : [{ nome: "CHAPA", importRef: "999" }]));
    await sincronizarRecebimentosDeEstoque();
    const vinc = mockPrisma.dataBookSecaoDoc.createMany.mock.calls.flatMap(([x]) => x.data);
    expect(vinc).toEqual([{ secaoId: "s04-b102", documentoId: "doc-m1" }]);
  });
});
