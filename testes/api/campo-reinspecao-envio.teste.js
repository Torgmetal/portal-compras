// Verificação das travas (02/10/2026): a REINSPEÇÃO pelo celular mantinha o envio de assinatura do R00. O R01
// voltava ao computador como "já enviado" — o envio seguinte reusava o antigo e não passava pela trava (que só
// vale no primeiro envio), e um R00 todo assinado fazia o R01 entrar no data book como assinado por quem nunca o
// viu. Agora é como o "Abrir revisão" do computador: a rodada fechada guarda quem assinou e o R01 nasce sem envio.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Geraldo", tipo: "ADMIN", modulos: ["QUALIDADE"] }) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ anexarRevisaoNoDataBook: vi.fn().mockResolvedValue({}), vincularNoDataBook: vi.fn().mockResolvedValue({}) }));
import { PATCH } from "@/app/api/campo/relatorios/[id]/route";

let rel;
beforeEach(() => {
  vi.clearAllMocks();
  rel = { id: "r", codigo: "RIP-112-001", tipo: "PINTURA", opNumero: "112", revisao: 0, resultadoInspecao: "REPROVADO", envioAssinaturaId: "env-r00",
    status: "EMITIDO", emitidoEm: new Date("2026-10-01T12:00:00Z"), marcas: ["T1"], linhas: [], resultados: {}, equipamentos: [] };
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([
    { nome: "Geraldo Tank", setor: "Inspetor", email: "q@torg.com.br", assinadoEm: new Date("2026-10-01T13:00:00Z") },
    { nome: "Davi Pinho", setor: "Cliente", email: "davi@cliente.com", assinadoEm: new Date("2026-10-01T15:00:00Z") },
  ]);
  mockPrisma.envioAssinatura.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("a reinspeção abre o R01 SEM envio — e a rodada fechada guarda quem assinou o R00", async () => {
  const r = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ reinspecionar: true }) }), { params: { id: "r" } });
  expect(r.status).toBe(200);
  expect(rel).toMatchObject({ revisao: 1, envioAssinaturaId: null, status: "RASCUNHO", emitidoEm: null });
  const fechada = rel.revisoes.at(-1);
  expect(fechada).toMatchObject({ revisao: 0, envioAssinaturaId: "env-r00" });
  expect(fechada.assinaturas.map((a) => a.nome)).toEqual(["Geraldo Tank", "Davi Pinho"]);
  // os links do R00 passam a dizer "em revisão" em vez de aceitar assinatura
  expect(mockPrisma.envioAssinatura.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "env-r00" }, data: { status: "REVISAO_PEDIDA" } }));
});

it("relatório que nunca foi enviado reinspeciona como sempre", async () => {
  rel.envioAssinaturaId = null;
  const r = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ reinspecionar: true }) }), { params: { id: "r" } });
  expect(r.status).toBe(200);
  expect(rel.revisao).toBe(1);
  expect(mockPrisma.envioAssinatura.update).not.toHaveBeenCalled();
});
