import { beforeEach, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// "Iniciar conferência" — abrir uma sessão pra uma OP.
//
// ⚠⚠ Achado do Codex (09/09/2026): findFirst + create sem exclusão mútua deixava duas aberturas
// simultâneas criarem DUAS sessões ABERTA pra mesma OP. Estes testes travam que isso não volta:
// a trava por OP serializa, e o índice único parcial (ver ensure-mes-tables.mjs) é o backstop.

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST } from "@/app/api/expedicao/conferencia/route";

const req = (corpo) => new Request("http://localhost/api/expedicao/conferencia",
  { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Zé" });
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "097" });
  mockPrisma.conferenciaPeca.findFirst.mockResolvedValue(null);
  mockPrisma.conferenciaPeca.create.mockResolvedValue({ id: "nova" });
});

it("abre uma sessão nova quando não há nenhuma ABERTA", async () => {
  const r = await POST(req({ opId: "op1" }));
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j).toMatchObject({ success: true, id: "nova" });
  expect(j.jaAberta).toBeUndefined();
  expect(mockPrisma.conferenciaPeca.create).toHaveBeenCalled();
});

it("trava a obra antes de checar e criar", async () => {
  await POST(req({ opId: "op1" }));
  expect(mockPrisma.$executeRaw).toHaveBeenCalled();
});

it("já existe sessão ABERTA: devolve ela, não cria outra", async () => {
  mockPrisma.conferenciaPeca.findFirst.mockResolvedValue({ id: "existente", iniciadaPorNome: "Ana" });
  const r = await POST(req({ opId: "op1" }));
  const j = await r.json();
  expect(j).toMatchObject({ success: true, id: "existente", jaAberta: true, por: "Ana" });
  expect(mockPrisma.conferenciaPeca.create).not.toHaveBeenCalled();
});

// ⚠ Backstop do índice único parcial: mesmo com a trava, se o create disparar a violação
// (ex.: índice ainda não existia numa base velha), a rota não estoura — devolve quem ganhou.
it("corrida detectada pelo índice único (P2002 no create): devolve a sessão que já existe", async () => {
  mockPrisma.conferenciaPeca.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
  mockPrisma.conferenciaPeca.findFirst
    .mockResolvedValueOnce(null)                                   // primeira checagem: livre
    .mockResolvedValueOnce({ id: "ganhou-a-corrida", iniciadaPorNome: "Ana" }); // depois do P2002
  const r = await POST(req({ opId: "op1" }));
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j).toMatchObject({ success: true, id: "ganhou-a-corrida", jaAberta: true });
});

it("OP inexistente é recusada com 404", async () => {
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  const r = await POST(req({ opId: "não existe" }));
  expect(r.status).toBe(404);
  expect(mockPrisma.conferenciaPeca.create).not.toHaveBeenCalled();
});

it("registra AuditLog só quando abre sessão de verdade, não no reencontro", async () => {
  await POST(req({ opId: "op1" }));
  expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "INICIAR_CONFERENCIA_PECA" });

  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Zé" });
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "097" });
  mockPrisma.conferenciaPeca.findFirst.mockResolvedValue({ id: "existente", iniciadaPorNome: "Ana" });
  await POST(req({ opId: "op1" }));
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
});

it("preserva as permissões de acesso", async () => {
  mocks.role.mockRejectedValue(new Error("Forbidden"));
  expect((await POST(req({ opId: "op1" }))).status).toBe(403);
  expect(mockPrisma.conferenciaPeca.create).not.toHaveBeenCalled();
});

// ⚠ Matheus (09/09/2026): "Todos que tiver acesso ao módulos Expedição pode fazer conferencia" —
// só EXPEDICAO + ADMIN, o mesmo que middleware.js já exige pra abrir a tela.
it("só pede EXPEDICAO ou ADMIN, não o módulo inteiro de produção", async () => {
  await POST(req({ opId: "op1" }));
  expect(mocks.role).toHaveBeenCalledWith(["ADMIN", "EXPEDICAO"]);
});
