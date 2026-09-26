// Certificado que chega DEPOIS de a seção ser montada entra sozinho no data book em montagem.
//
// Geraldo (OP-102, 25/09/2026): "importamos os certificados faltantes, mas ainda falta puxar". O
// "puxar certificados" da §04 rodou 5× com "0 novos" porque os 11 R ainda não tinham chegado ao
// portal (CMR parado). Quando chegaram, ninguém clicou de novo: a §02 citava 11 R cujos PDFs não
// estavam no livro. Vitor: "sim pode vincular" — o portal passa a fazer o clique que faltou.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

import { certificadosQueEntram, vincularCertificadosNovos } from "@/lib/databook-certificados-novos";

const dia = (s) => new Date(`${s}T12:00:00.000Z`);
const secao04 = { numero: "04", estado: "ANEXADO", documentos: [{ documentoId: "d-antigo", createdAt: dia("2026-09-21") }] };
const livroVazio = () => ({ ids: new Set(["d-antigo"]), rs: new Set(["261100"]), removidos: { ids: new Set(), rs: new Set() } });
const chapa = (id, r, criado, extra = {}) => ({ id, importRef: r, nome: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 12,50MM", createdAt: dia(criado), ...extra });

describe("quais certificados entram sozinhos", () => {
  it("o que chegou DEPOIS da última montagem da seção entra", () => {
    const r = certificadosQueEntram({ secao: secao04, candidatos: [chapa("d1", "261646", "2026-09-25")], livro: livroVazio() });
    expect(r.map((c) => c.id)).toEqual(["d1"]);
  });

  it("o que já existia quando a seção foi montada fica de fora — pode ter sido tirado antes de 15/09, quando tirar não deixava rastro", () => {
    const r = certificadosQueEntram({ secao: secao04, candidatos: [chapa("d1", "261120", "2026-09-12")], livro: livroVazio() });
    expect(r).toEqual([]);
  });

  it("nunca devolve o que alguém tirou do livro — pelo documento ou pelo R", () => {
    const livro = livroVazio();
    livro.removidos.ids.add("d1");
    livro.removidos.rs.add("261647");
    const r = certificadosQueEntram({
      secao: secao04,
      candidatos: [chapa("d1", "261646", "2026-09-25"), chapa("d2", "261647", "2026-09-25")],
      livro,
    });
    expect(r).toEqual([]);
  });

  it("não duplica um R que o livro já tem — o anexo manual chamado \"R 261646\" é o mesmo certificado", () => {
    const livro = livroVazio();
    livro.rs.add("261646");
    const r = certificadosQueEntram({ secao: secao04, candidatos: [chapa("d1", "261646", "2026-09-25")], livro });
    expect(r).toEqual([]);
  });

  it("documento que já está em outra seção do livro fica onde está (foi movido de propósito)", () => {
    const livro = livroVazio();
    livro.ids.add("d1");
    const r = certificadosQueEntram({ secao: secao04, candidatos: [chapa("d1", "261646", "2026-09-25")], livro });
    expect(r).toEqual([]);
  });

  it("seção que a Qualidade ainda não montou não é tocada — a primeira montagem é de quem monta", () => {
    const novo = [chapa("d1", "261646", "2026-09-25")];
    expect(certificadosQueEntram({ secao: { ...secao04, estado: "PENDENTE", documentos: [] }, candidatos: novo, livro: livroVazio() })).toEqual([]);
    expect(certificadosQueEntram({ secao: { ...secao04, estado: "NA" }, candidatos: novo, livro: livroVazio() })).toEqual([]);
    // "anexado" sem nenhum documento não diz quando foi montada
    expect(certificadosQueEntram({ secao: { ...secao04, documentos: [] }, candidatos: novo, livro: livroVazio() })).toEqual([]);
  });

  it("o R declarado na Conferência de Rastreabilidade chega quando é DECLARADO, não quando entrou no CMR", () => {
    const declarado = chapa("d1", "261019", "2026-06-10", { declaradoEm: dia("2026-09-25") });
    const r = certificadosQueEntram({ secao: secao04, candidatos: [declarado], livro: livroVazio() });
    expect(r.map((c) => c.id)).toEqual(["d1"]);
  });

  it("o mesmo R não entra duas vezes na mesma rodada", () => {
    const r = certificadosQueEntram({
      secao: secao04,
      candidatos: [chapa("d1", "261646", "2026-09-25"), chapa("d2", "261646", "2026-09-25")],
      livro: livroVazio(),
    });
    expect(r.map((c) => c.id)).toEqual(["d1"]);
  });
});

// ─── a rodada: lê os livros, decide por seção e grava com o livro travado ────────────────────────
const LIVRO_102 = {
  id: "book102", opNumero: "102", status: "EM_MONTAGEM", emitidoEm: null,
  secoes: [
    { id: "s02", numero: "02", estado: "ANEXADO", documentos: [{ documentoId: "d-desenho", createdAt: dia("2026-09-21") }] },
    { id: "s04", numero: "04", estado: "ANEXADO", documentos: [{ documentoId: "d-antigo", createdAt: dia("2026-09-21") }] },
    { id: "s15", numero: "15", estado: "PENDENTE", documentos: [] },
  ],
};
// um livro fechado que escapasse do filtro do banco não pode ser tocado
const LIVRO_ACEITO = { id: "book070", opNumero: "070", status: "ACEITO", emitidoEm: dia("2026-08-20"), secoes: [LIVRO_102.secoes[1]] };

const DOCS_DA_OP = [
  chapa("d-novo", "261646", "2026-09-25"),
  chapa("d-velho", "261120", "2026-09-12"),
  { id: "d-tinta", importRef: "261393", nome: "TINTA W-POLI HPD 451 CINZA", createdAt: dia("2026-09-25") },
];

function banco() {
  mockPrisma.dataBookQualidade.findMany.mockResolvedValue([LIVRO_102, LIVRO_ACEITO]);
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) => {
    if (where?.id?.in) return [{ id: "d-antigo", importRef: "261100", nome: "PERFIL W150X18" }, { id: "d-desenho", importRef: null, nome: "T102A1 - conjunto" }]
      .filter((d) => where.id.in.includes(d.id));
    if (where?.origem) return []; // fichas do CMR
    if (where?.opNumero === "102") return DOCS_DA_OP;
    return [];
  });
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([{ status: "EM_MONTAGEM", emitidoEm: null }]);
  mockPrisma.dataBookSecaoDoc.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
  mockPrisma.auditLog.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
}

describe("rodada automática", () => {
  beforeEach(() => { vi.clearAllMocks(); banco(); });

  it("vincula na §04 só o certificado novo, e registra quem fez: o automático", async () => {
    const r = await vincularCertificadosNovos(mockPrisma);
    expect(mockPrisma.dataBookSecaoDoc.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.dataBookSecaoDoc.createMany.mock.calls[0][0]).toEqual({ data: [{ secaoId: "s04", documentoId: "d-novo" }], skipDuplicates: true });
    const [{ data: auditoria }] = mockPrisma.auditLog.createMany.mock.calls[0];
    expect(auditoria).toEqual([expect.objectContaining({
      userId: null, action: "VINCULAR_CERTIFICADOS_AUTO_DATABOOK", entity: "DataBookSecao", entityId: "s04",
      diff: expect.objectContaining({ opNumero: "102", secao: "04", rs: ["261646"], documentoIds: ["d-novo"] }),
    })]);
    expect(r).toMatchObject({ vinculados: 1, livros: [{ id: "book102", opNumero: "102", secoes: [{ numero: "04", rs: ["261646"] }] }] });
  });

  it("não lê nem toca livro fechado", async () => {
    await vincularCertificadosNovos(mockPrisma);
    const ops = mockPrisma.documentoQualidade.findMany.mock.calls.map(([x]) => x.where?.opNumero).filter(Boolean);
    expect(ops).not.toContain("070");
  });

  it("⚠ livro emitido entre a leitura e a gravação não recebe nada — a conferência é feita com o livro TRAVADO", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ status: "EMITIDO", emitidoEm: dia("2026-09-25") }]);
    const r = await vincularCertificadosNovos(mockPrisma);
    expect(mockPrisma.dataBookSecaoDoc.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
    expect(r.vinculados).toBe(0);
    const trava = mockPrisma.$queryRaw.mock.calls[0][0].join("");
    expect(trava).toMatch(/FOR UPDATE/);
  });

  it("simulação diz o que entraria e não grava nada", async () => {
    const r = await vincularCertificadosNovos(mockPrisma, { gravar: false });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.dataBookSecaoDoc.createMany).not.toHaveBeenCalled();
    expect(r).toMatchObject({ vinculados: 0, livros: [{ opNumero: "102", secoes: [{ numero: "04", rs: ["261646"] }] }] });
  });
});
