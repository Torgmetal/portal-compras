// O LOTE DO CMR: grava tudo ou nada, e um reenvio nunca cria R de novo.
//
// Matheus (05/10/2026): o Almoxarifado marcou os 43 itens do pedido 2054 e clicou "Gravar 43". Os 43
// R foram gravados, mas a função estourou os 60 s nos avisos e a tela mostrou "Unexpected token 'A'…
// is not valid JSON" — com o botão "Gravar 43" ainda ali, pronto para criar mais 43 R duplicados.
// Desenho aprovado pelo Codex (consulta database, 05/10/2026): resultado exato por lote, hash do
// conteúdo, numeração em fila por ano e auditoria dentro da mesma transação.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cmr", () => ({
  CMR_CAT: "MATERIAL",
  prefixoAno: () => "26",
  proximoIndiceR: vi.fn(async () => "261832"),
  mapearLancamento: (l, r, u) => ({ nome: l.descricao, importRef: r, createdById: u }),
}));
import { proximoIndiceR } from "@/lib/cmr";
import { gravarLoteCmr, loteJaGravado, hashDoLote, LoteConflito } from "@/lib/cmr-lote";

const LOTE = "3f1c2a9e-1111-4222-8333-444455556666";
const L = [{ descricao: "ARRUELA 5/8" }, { descricao: "PORCA 1/2" }, { descricao: "PARAFUSO 5/8" }];
const SELECT = { id: true, importRef: true, nome: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cmrLote.findUnique.mockResolvedValue(null);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  // ⚠ o banco NÃO promete devolver na ordem de entrada — por isso o retorno vem embaralhado
  mockPrisma.documentoQualidade.createManyAndReturn.mockImplementation(async ({ data }) =>
    [...data].reverse().map((d, i) => ({ id: `doc${d.importRef}`, ...d, _i: i })));
  mockPrisma.cmrLote.create.mockImplementation(async ({ data }) => data);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

const gravar = (extra = {}) => gravarLoteCmr(mockPrisma, {
  loteId: LOTE, hash: hashDoLote(L), userId: "almox", ano: 2026, lancamentos: L, ocupados: [], select: SELECT, ...extra,
});

describe("gravarLoteCmr", () => {
  it("grava os R em sequência, na ordem dos lançamentos, mesmo com o banco devolvendo fora de ordem", async () => {
    const r = await gravar();
    expect(r.replay).toBe(false);
    expect(r.indices).toEqual(["261832", "261833", "261834"]);
    expect(r.docs.map((d) => d.nome)).toEqual(["ARRUELA 5/8", "PORCA 1/2", "PARAFUSO 5/8"]);
    expect(mockPrisma.documentoQualidade.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mockPrisma.documentoQualidade.create).not.toHaveBeenCalled();
  });

  it("pula o R que a planilha já usa no meio da sequência", async () => {
    const r = await gravar({ ocupados: ["261833"] });
    expect(r.indices).toEqual(["261832", "261834", "261835"]);
  });

  it("guarda o resultado EXATO do lote (R e ids) e a auditoria na mesma transação", async () => {
    await gravar();
    expect(mockPrisma.cmrLote.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: LOTE, userId: "almox", ano: 2026, hash: hashDoLote(L),
      indices: ["261832", "261833", "261834"], docIds: ["doc261832", "doc261833", "doc261834"],
    }) });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "CMR_LANCAR", entityId: LOTE, diff: expect.objectContaining({ loteId: LOTE, indices: ["261832", "261833", "261834"] }),
    }) });
  });

  it("⚠ falha na auditoria derruba o lote inteiro — nada de .catch engolindo", async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("audit fora"));
    await expect(gravar()).rejects.toThrow("audit fora");
  });

  it("tranca o lote e depois o ano, e calcula o R pelo cliente da transação", async () => {
    await gravar();
    const sqls = mockPrisma.$queryRaw.mock.calls.map((c) => c[0].join("?"));
    expect(sqls[0]).toMatch(/pg_advisory_xact_lock/);
    expect(mockPrisma.$queryRaw.mock.calls[0].slice(1)).toContain(`cmr-lote:${LOTE}`);
    expect(mockPrisma.$queryRaw.mock.calls[1].slice(1)).toContain("cmr-r:2026");
    expect(proximoIndiceR).toHaveBeenCalledWith(2026, [], mockPrisma);
  });

  it("reenvio do MESMO lote devolve o que já foi gravado e não cria nada", async () => {
    mockPrisma.cmrLote.findUnique.mockResolvedValue({ id: LOTE, userId: "almox", hash: hashDoLote(L), indices: ["261832", "261833", "261834"], docIds: ["a", "b", "c"] });
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ id: "c", importRef: "261834" }, { id: "a", importRef: "261832" }, { id: "b", importRef: "261833" }]);
    const r = await gravar();
    expect(r.replay).toBe(true);
    expect(r.docs.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(mockPrisma.documentoQualidade.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockPrisma.documentoQualidade.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["a", "b", "c"] } } }));
  });

  it("mesma chave com conteúdo diferente é conflito, nunca sucesso", async () => {
    mockPrisma.cmrLote.findUnique.mockResolvedValue({ id: LOTE, userId: "almox", hash: "outro", indices: [], docIds: [] });
    await expect(gravar()).rejects.toBeInstanceOf(LoteConflito);
    expect(mockPrisma.documentoQualidade.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("mesma chave de outra pessoa é conflito", async () => {
    mockPrisma.cmrLote.findUnique.mockResolvedValue({ id: LOTE, userId: "outro", hash: hashDoLote(L), indices: [], docIds: [] });
    await expect(gravar()).rejects.toBeInstanceOf(LoteConflito);
  });
});

describe("loteJaGravado — o reenvio responde antes de ir ao SharePoint", () => {
  it("sem lote: null", async () => expect(await loteJaGravado(mockPrisma, { loteId: LOTE, hash: "h", userId: "u" })).toBeNull());
});

describe("hashDoLote", () => {
  it("não depende da ordem das chaves nem de campo vazio", () => {
    expect(hashDoLote([{ descricao: "A", nf: "1" }])).toBe(hashDoLote([{ nf: "1", descricao: "A", obs: "" }]));
  });
  it("muda quando o conteúdo muda", () => {
    expect(hashDoLote([{ descricao: "A", nf: "1" }])).not.toBe(hashDoLote([{ descricao: "A", nf: "2" }]));
  });
});
