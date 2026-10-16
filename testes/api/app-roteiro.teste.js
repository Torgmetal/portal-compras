// Roteiro da obra pelo token do aparelho: 409 com pendentes, AuditLog e aceite só na CONCLUIDA. Prisma simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { GET, POST } from "@/app/api/engenharia-ia/app/roteiro/route";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc";
const H = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const post = (body, headers = H) => POST(new Request("http://localhost/api/engenharia-ia/app/roteiro", { method: "POST", headers, body: JSON.stringify(body) }));
const get = (q = "?op=89") => GET(new Request("http://localhost/api/engenharia-ia/app/roteiro" + q, { headers: H }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO" } : null));
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  mockPrisma.oP.findMany.mockResolvedValue([{ id: "op89", numero: "089" }]);
  mockPrisma.roteiroEtapa.findMany.mockResolvedValue([]);
  mockPrisma.roteiroEtapa.create.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
  mockPrisma.roteiroEtapa.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("acesso", () => {
  it("401 sem token", async () => { expect((await post({}, {})).status).toBe(401); });
  it("400 em corpo inválido", async () => { expect((await post({ opNumero: "89", etapa: 9, para: "CONCLUIDA" })).status).toBe(400); });
  it("404 com OP desconhecida", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([]);
    expect((await post({ opNumero: "89", etapa: 1, para: "EM_ANDAMENTO" })).status).toBe(404);
  });
});

describe("GET", () => {
  it("devolve as 6 etapas com os registros; '89' acha a OP '089'", async () => {
    mockPrisma.roteiroEtapa.findMany.mockResolvedValue([{ id: "r1", etapa: 1, fase: null, status: "CONCLUIDA" }]);
    const j = await (await get()).json();
    expect(j.ok).toBe(true); expect(j.op).toEqual({ id: "op89", numero: "089" });
    expect(j.etapas).toHaveLength(6); expect(j.etapas[0].registros).toHaveLength(1);
  });
});

describe("POST", () => {
  it("cria a etapa 1 e grava AuditLog com antes/depois e aparelhoId", async () => {
    const r = await post({ opNumero: "89", etapa: 1, para: "EM_ANDAMENTO" });
    expect(r.status).toBe(200);
    expect(mockPrisma.roteiroEtapa.create.mock.calls[0][0].data).toMatchObject({ opId: "op89", etapa: 1, fase: null, status: "EM_ANDAMENTO" });
    expect(mockPrisma.roteiroEtapa.create.mock.calls[0][0].data.aceitoPorId).toBeUndefined();
    const a = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(a).toMatchObject({ action: "ROTEIRO_ENGENHARIA", userId: "u1", entityId: "r1" });
    expect(a.diff.antes.status).toBe("PENDENTE"); expect(a.diff.depois.status).toBe("EM_ANDAMENTO"); expect(a.diff.aparelhoId).toBe("ap1");
  });
  it("409 quando a regra recusa (etapa 2 sem a 1)", async () => {
    const r = await post({ opNumero: "89", etapa: 2, para: "EM_ANDAMENTO" });
    expect(r.status).toBe(409);
    expect((await r.json()).ok).toBe(false);
    expect(mockPrisma.roteiroEtapa.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
  it("409 com pendentes ao concluir com divergência aberta", async () => {
    mockPrisma.roteiroEtapa.findMany.mockResolvedValue([{ id: "r1", etapa: 1, fase: null, status: "AGUARDANDO_ACEITE", divergencias: [] }]);
    const d = { id: "d1", descricao: "furo", fonte: "ifc", evidencia: null, situacao: "aberta" };
    const r = await post({ opNumero: "89", etapa: 1, para: "CONCLUIDA", divergencias: [d] });
    expect(r.status).toBe(409);
    expect((await r.json()).pendentes).toEqual([d]);
  });
  it("concluir grava aceitoPorId/aceitoEm; atualiza a linha existente", async () => {
    mockPrisma.roteiroEtapa.findMany.mockResolvedValue([{ id: "r1", etapa: 1, fase: null, status: "AGUARDANDO_ACEITE", divergencias: [] }]);
    const r = await post({ opNumero: "89", etapa: 1, para: "CONCLUIDA" });
    expect(r.status).toBe(200);
    const dados = mockPrisma.roteiroEtapa.update.mock.calls[0][0].data;
    expect(dados.aceitoPorId).toBe("u1"); expect(dados.aceitoEm).toBeInstanceOf(Date);
    expect(mockPrisma.roteiroEtapa.create).not.toHaveBeenCalled();
  });
  it("sem divergências no pedido vale a lista já gravada", async () => {
    const d = { id: "d1", descricao: "x", fonte: "ifc", evidencia: null, situacao: "nao_verificada" };
    mockPrisma.roteiroEtapa.findMany.mockResolvedValue([{ id: "r1", etapa: 1, fase: null, status: "AGUARDANDO_ACEITE", divergencias: [d] }]);
    expect((await post({ opNumero: "89", etapa: 1, para: "CONCLUIDA" })).status).toBe(409);
  });
  it("P2002 da corrida vira 409", async () => {
    mockPrisma.roteiroEtapa.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await post({ opNumero: "89", etapa: 1, para: "EM_ANDAMENTO" })).status).toBe(409);
  });
});
