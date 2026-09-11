import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "gabriel", name: "Gabriel" }) }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn().mockResolvedValue({ id: "aviso" }) }));
vi.mock("@/lib/rastreio-peca", () => ({ rastreioDaOp: vi.fn() }));
import { requireRole } from "@/lib/session";
import { criarNotificacao } from "@/lib/notificacoes";
import { GET } from "@/app/api/planejamento/recebimento/route";
import { POST } from "@/app/api/pcp/separacao/route";
const pedido = (data) => new Request("http://localhost/api/pcp/separacao", { method: "POST", body: JSON.stringify(data) });
const body = { opId: "op", encaminharPCP: true, trocas: [{ perfil: "CH12.5", rUsado: "261234", escopo: "SEM_R" }] };
beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: "gabriel", name: "Gabriel" });
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "106" });
  mockPrisma.oP.findMany.mockResolvedValue([]);
  mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ importRef: "261234", nome: "CH 12,5", opNumero: "106" }]);
  mockPrisma.documentoQualidade.count.mockResolvedValue(1);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([{ perfil: "CH12.5" }]);
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
  mockPrisma.trocaRastreabilidade.upsert.mockImplementation(async ({ create }) => create);
});
it("consulta R com paginação, certificado e sem escrever no banco", async () => {
  const r = await GET(new Request("http://localhost/api/planejamento/recebimento?q=261234&pagina=2"));
  expect(r.status).toBe(200);
  const consulta = mockPrisma.documentoQualidade.findMany.mock.calls[0][0];
  expect(consulta.skip).toBe(50); expect(consulta.take).toBe(50);
  expect(consulta.select.arquivoUrl).toBe(true);
  expect(consulta.where.OR).toContainEqual({ importRef: { contains: "261234", mode: "insensitive" } });
  expect(mockPrisma.documentoQualidade.create).not.toHaveBeenCalled();
});
it("distingue sem sessão de perfil sem acesso", async () => {
  requireRole.mockRejectedValueOnce(new Error("Unauthorized"));
  expect((await GET(new Request("http://localhost/api/planejamento/recebimento"))).status).toBe(401);
  requireRole.mockRejectedValueOnce(new Error("Forbidden"));
  expect((await GET(new Request("http://localhost/api/planejamento/recebimento"))).status).toBe(403);
});
it("recusa filtro inválido", async () => {
  expect((await GET(new Request("http://localhost/api/planejamento/recebimento?pagina=-1"))).status).toBe(400);
  expect(mockPrisma.documentoQualidade.findMany).not.toHaveBeenCalled();
});
it("registra R, preserva escopo SEM_R e encaminha somente ao módulo PCP", async () => {
  expect((await POST(pedido(body))).status).toBe(200);
  expect(mockPrisma.trocaRastreabilidade.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ rUsado: "261234", escopo: "SEM_R", estoqueConferido: false }) }));
  expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  expect(criarNotificacao).toHaveBeenCalledWith(expect.objectContaining({ tipo: "RASTREABILIDADE_DEFINIDA", modulos: ["PCP"], mensagem: expect.stringContaining("261234") }));
});
it("R inexistente não grava nem notifica", async () => {
  mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
  expect((await POST(pedido(body))).status).toBe(400);
  expect(mockPrisma.trocaRastreabilidade.upsert).not.toHaveBeenCalled();
  expect(criarNotificacao).not.toHaveBeenCalled();
});
it("estoque exige conferência explícita antes de seguir ao PCP", async () => {
  mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ importRef: "261234", nome: "CH 12,5", opNumero: "84" }]);
  expect((await POST(pedido(body))).status).toBe(400);
  expect(mockPrisma.trocaRastreabilidade.upsert).not.toHaveBeenCalled();
  expect((await POST(pedido({ ...body, estoqueConferido: true })))).toHaveProperty("status", 200);
  expect(mockPrisma.trocaRastreabilidade.upsert.mock.calls[0][0].create.estoqueConferido).toBe(true);
});
it("perfil de outra OP não grava nem notifica", async () => {
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([{ perfil: "W150" }]);
  expect((await POST(pedido(body))).status).toBe(400);
  expect(criarNotificacao).not.toHaveBeenCalled();
});

it("falha ao registrar não avisa o PCP", async () => {
  mockPrisma.trocaRastreabilidade.upsert.mockRejectedValueOnce(new Error("Banco indisponível"));
  const r = await POST(pedido(body));
  expect(r.status).toBe(500);
  expect((await r.json()).error).toContain("Tente novamente");
  expect(criarNotificacao).not.toHaveBeenCalled();
});
