// Só relatório ASSINADO entra no data book. Vitor (25/09/2026), no data book da OP-112: "ainda está
// puxando relatórios em rascunho e falamos de puxar apenas os que estiverem assinados".
//
// O relatório entrava no livro na CRIAÇÃO (e de novo ao ser enviado), antes de qualquer assinatura.
// Medido em 25/09: 5 rascunhos e 4 relatórios com assinatura incompleta dentro de livros abertos.
// A regra já valia para o PIT/PLP desde 26/08 ("anexar ao Data Book depois de todos terem aprovado").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

import {
  vincularNoDataBook, anexarRevisaoNoDataBook, revisaoEntraNoLivro, bloqueioRelatorioNaoAssinado, aoConcluirAssinaturas,
} from "@/lib/relatorio-inspecao";

const ontem = new Date("2026-09-24T12:00:00Z");
const RIP = {
  id: "rel1", codigo: "RIP-112-001", tipo: "PINTURA", opNumero: "112", status: "RASCUNHO",
  envioAssinaturaId: null, documentoId: "doc-rip1", revisoes: [], titulo: null,
};

function banco({ livro = { id: "b112", status: "EM_MONTAGEM", emitidoEm: null, revisao: 0 }, assinaturas = [], docsRevisao = [], restam = 0 } = {}) {
  mockPrisma.dataBookQualidade.findFirst.mockResolvedValue(livro);
  mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s14", titulo: "Tratamento de superfície e pintura", estado: "ANEXADO" });
  mockPrisma.documentoQualidade.update.mockResolvedValue({ id: "doc-rip1" });
  mockPrisma.documentoQualidade.findFirst.mockResolvedValue(null);
  mockPrisma.documentoQualidade.create.mockResolvedValue({ id: "doc-novo" });
  mockPrisma.documentoQualidade.findMany.mockResolvedValue(docsRevisao);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue(assinaturas);
  mockPrisma.dataBookSecaoDoc.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
  mockPrisma.dataBookSecaoDoc.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.dataBookSecaoDoc.count.mockResolvedValue(restam);
  mockPrisma.dataBookSecao.update.mockResolvedValue({});
}
const vinculados = () => mockPrisma.dataBookSecaoDoc.createMany.mock.calls.flatMap(([x]) => x.data.map((d) => d.documentoId));
const tirados = () => mockPrisma.dataBookSecaoDoc.deleteMany.mock.calls.flatMap(([x]) => x.where.documentoId.in);

beforeEach(() => { vi.clearAllMocks(); });

describe("o relatório só entra no data book assinado por todos", () => {
  it("rascunho não entra — e sai, se o vínculo antigo da criação o tinha posto lá", async () => {
    banco();
    const r = await vincularNoDataBook(RIP, null);
    expect(vinculados()).toEqual([]);
    expect(tirados()).toEqual(["doc-rip1"]);
    expect(mockPrisma.dataBookSecaoDoc.deleteMany.mock.calls[0][0].where.secao).toEqual({ dataBookId: "b112" });
    expect(r).toMatchObject({ vinculado: false, aguardaAssinatura: true, secao: "14" });
  });

  it("seção que fica vazia volta a pendente", async () => {
    banco({ restam: 0 });
    await vincularNoDataBook(RIP, null);
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s14" }, data: { estado: "PENDENTE" } });
  });

  it("enviado com assinatura incompleta ainda não entra", async () => {
    banco({ assinaturas: [{ assinadoEm: ontem }, { assinadoEm: null }] });
    const r = await vincularNoDataBook({ ...RIP, status: "EMITIDO", envioAssinaturaId: "e1" }, "/api/qualidade/inspecoes/rel1/pdf");
    expect(vinculados()).toEqual([]);
    expect(r.aguardaAssinatura).toBe(true);
  });

  it("assinado por todos entra — com a rodada REPROVADA (o retrabalho) e sem a versão intermediária não assinada", async () => {
    banco({
      assinaturas: [{ assinadoEm: ontem }, { assinadoEm: ontem }],
      docsRevisao: [{ id: "d-r00", numeroDocumento: "RIP-112-001 R00" }, { id: "d-r01", numeroDocumento: "RIP-112-001 R01" }],
    });
    const rel = {
      ...RIP, status: "EMITIDO", envioAssinaturaId: "e2", revisao: 2,
      revisoes: [
        { revisao: 0, resultadoInspecao: "REPROVADO", assinaturas: [] },
        { revisao: 1, resultadoInspecao: "APROVADO", assinaturas: [{ assinadoEm: ontem.toISOString() }, { assinadoEm: null }] },
      ],
    };
    const r = await vincularNoDataBook(rel, "/api/qualidade/inspecoes/rel1/pdf");
    expect(vinculados()).toEqual(["doc-rip1", "d-r00"]);
    expect(tirados()).toEqual(["d-r01"]);
    expect(r).toMatchObject({ vinculado: true, secao: "14" });
  });

  it("livro fechado não recebe nem perde nada — só muda por revisão", async () => {
    banco({ livro: { id: "b070", status: "ACEITO", emitidoEm: ontem, revisao: 1 }, assinaturas: [{ assinadoEm: ontem }] });
    const r = await vincularNoDataBook({ ...RIP, envioAssinaturaId: "e3" }, null);
    expect(mockPrisma.dataBookSecaoDoc.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.dataBookSecaoDoc.deleteMany).not.toHaveBeenCalled();
    expect(r.vinculado).toBe(false);
  });
});

describe("qual rodada encerrada acompanha o relatório assinado", () => {
  it("a reprovada (e a de exame complementar) — o retrabalho tem de aparecer (Vitor, 21/08/2026)", () => {
    expect(revisaoEntraNoLivro({ resultadoInspecao: "REPROVADO", assinaturas: [] })).toBe(true);
    expect(revisaoEntraNoLivro({ resultadoInspecao: "REC", assinaturas: [] })).toBe(true);
  });
  it("a que foi assinada por todos; a corrigida no meio do caminho, não", () => {
    expect(revisaoEntraNoLivro({ resultadoInspecao: "APROVADO", assinaturas: [{ assinadoEm: "x" }, { assinadoEm: "y" }] })).toBe(true);
    expect(revisaoEntraNoLivro({ resultadoInspecao: "APROVADO", assinaturas: [{ assinadoEm: "x" }, { assinadoEm: null }] })).toBe(false);
    expect(revisaoEntraNoLivro({ resultadoInspecao: "APROVADO", assinaturas: [] })).toBe(false);
  });
});

describe("a rodada encerrada é registrada na hora, mas só entra junto com o relatório assinado", () => {
  it("abrir revisão ou reinspecionar cria o documento da rodada sem pô-lo no livro", async () => {
    banco();
    await anexarRevisaoNoDataBook(RIP, { revisao: 0, resultadoInspecao: "REPROVADO", emEm: ontem.toISOString() });
    expect(mockPrisma.documentoQualidade.create).toHaveBeenCalled();
    expect(mockPrisma.dataBookSecaoDoc.createMany).not.toHaveBeenCalled();
  });
});

describe("a última assinatura põe o relatório no livro", () => {
  it("relatório de inspeção: vincula com o PDF pelo caminho relativo", async () => {
    banco({ assinaturas: [{ assinadoEm: ontem }, { assinadoEm: ontem }] });
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ ...RIP, status: "EMITIDO", envioAssinaturaId: "e4" });
    await aoConcluirAssinaturas({ tipo: "RELATORIO_INSPECAO", snapshot: { relatorioId: "rel1" } });
    expect(vinculados()).toEqual(["doc-rip1"]);
    expect(mockPrisma.documentoQualidade.update.mock.calls[0][0].data.arquivoUrl).toBe("/api/qualidade/inspecoes/rel1/pdf");
  });

  it("outro documento (PIT, PLP…) segue o caminho dele", async () => {
    banco();
    await aoConcluirAssinaturas({ tipo: "PIT", snapshot: {} });
    expect(mockPrisma.relatorioInspecao.findUnique).not.toHaveBeenCalled();
  });
});

describe("anexar à mão também respeita a regra", () => {
  it("documento de relatório não assinado é recusado, com o motivo", async () => {
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ id: "doc-rip1", categoria: "RELATORIO", origem: "inspecao_campo", numeroDocumento: "RIP-112-001" });
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ ...RIP });
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
    expect(await bloqueioRelatorioNaoAssinado(mockPrisma, "doc-rip1")).toMatch(/assin/i);
  });

  it("relatório assinado por todos e documento que não é relatório passam", async () => {
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ id: "doc-rip1", categoria: "RELATORIO", origem: "inspecao_campo", numeroDocumento: "RIP-112-001" });
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ ...RIP, envioAssinaturaId: "e5" });
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([{ assinadoEm: ontem }]);
    expect(await bloqueioRelatorioNaoAssinado(mockPrisma, "doc-rip1")).toBeNull();
    mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ id: "c1", categoria: "MATERIAL", origem: "cmr", numeroDocumento: "261646" });
    expect(await bloqueioRelatorioNaoAssinado(mockPrisma, "c1")).toBeNull();
  });
});
