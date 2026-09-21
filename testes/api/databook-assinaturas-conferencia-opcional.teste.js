import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Geraldo" }) }));
vi.mock("@/lib/databook-assinaturas", () => ({ RT_NOME: "Guilherme", fmtOPdb: (n) => `OP-${n}`, baseUrlDe: () => "http://x", enviarEmailEtapa: vi.fn().mockResolvedValue(true) }));
import { POST } from "@/app/api/qualidade/data-books/[id]/assinaturas/route";

// OP-106 (15/09/2026): cliente pediu ajuste na conferência da R00, ajuste feito, e a assinatura não
// subia sem um segundo ok dele. Vitor: "vamos tirar essa necessidade (…) deixe como opção".
const corpo = { elaboradorEmail: "qualidade@torg.com.br", inspetorEmail: "insp@torg.com.br", rtEmail: "guilherme@torg.com.br", clienteEmail: "pinho.davi@tmsa.ind.br" };
const livro = { id: "db", opNumero: "106", obra: "TPR 706", status: "EMITIDO", emitidoEm: new Date(), avaliacaoEnviadaEm: new Date("2026-08-31"), avaliacaoOkEm: null, avaliacaoObs: "Inserir relatório de pintura", assinaturas: [] };
const req = (b) => new Request("http://localhost", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue(livro);
  mockPrisma.dataBookAssinatura.findUnique.mockResolvedValue({ id: "a1", ordem: 1, papel: "ELABORADOR", email: corpo.elaboradorEmail, nome: null, token: "t" });
  mockPrisma.dataBookAssinatura.findMany.mockResolvedValue([]);
});

it("conferência pendente sem confirmação: para e diz por quê (409, conferenciaPendente)", async () => {
  const res = await POST(req(corpo), { params: { id: "db" } });
  expect(res.status).toBe(409);
  const j = await res.json();
  expect(j.conferenciaPendente).toBe(true);
  expect(j.error).toMatch(/Inserir relatório de pintura/);
  expect(mockPrisma.dataBookAssinatura.create).not.toHaveBeenCalled();
});

it("com ignorarConferencia: true o fluxo inicia e o AuditLog registra que a conferência ficou pendente", async () => {
  const res = await POST(req({ ...corpo, ignorarConferencia: true }), { params: { id: "db" } });
  expect(res.status).toBe(200);
  expect(mockPrisma.dataBookAssinatura.create).toHaveBeenCalledTimes(4);
  const audit = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
  expect(audit.action).toBe("INICIAR_ASSINATURAS_DATABOOK");
  expect(audit.diff.conferenciaPendente).toBe(true);
  expect(audit.diff.avaliacaoObs).toBe("Inserir relatório de pintura");
});

it("sem conferência pedida, segue direto (nada mudou para quem nunca mandou rascunho)", async () => {
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({ ...livro, avaliacaoEnviadaEm: null, avaliacaoObs: null });
  const res = await POST(req(corpo), { params: { id: "db" } });
  expect(res.status).toBe(200);
  expect(mockPrisma.auditLog.create.mock.calls.at(-1)[0].data.diff.conferenciaPendente).toBeUndefined();
});
