// Admin › Usuários: conta sem e-mail vinculada ao funcionário do RH — entra pelo CPF.
// Vitor (14/09/2026): "preciso criar um usuário para um funcionário, mas sem e-mail".
import { beforeEach, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireAdminDoPortal: vi.fn(async () => ({ id: "adm", name: "Vitor", email: "vitor@torg.com.br", tipo: "ADMIN" })) }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));
import { POST } from "@/app/api/admin/usuarios/route";

const post = (body) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));
const func = { id: "f1", nome: "João da Silva", cpf: "123.456.789-09", ativo: true, usuario: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.funcionario.findUnique.mockResolvedValue(func);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.create.mockImplementation(async ({ data }) => ({ id: "u1", name: data.name, email: data.email, tipo: data.tipo, modulos: (data.modulos?.create || []).map((m) => ({ modulo: m.modulo })), setor: null, podeAlterarVerba: false, funcionario: { id: func.id, nome: func.nome, cpf: func.cpf } }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("sem e-mail e sem funcionário: recusa e explica os dois caminhos", async () => {
  const r = await post({ name: "João da Silva", email: "", tipo: "USUARIO", modulos: ["EXPEDICAO"] });
  expect(r.status).toBe(400);
  expect((await r.json()).error).toMatch(/e-mail ou vincule um funcionário/);
});

it("sem e-mail mas vinculado ao RH: cria com o e-mail interno do CPF e diz que ele entra pelo CPF", async () => {
  const r = await post({ name: "João da Silva", email: "", funcionarioId: "f1", tipo: "USUARIO", modulos: ["EXPEDICAO"] });
  expect(r.status).toBe(201);
  const j = await r.json();
  expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({ email: "12345678909@funcionario.torg", funcionarioId: "f1" });
  expect(j.data.login).toMatchObject({ por: "cpf", login: "123.456.789-09", semEmail: true });
});

it("com e-mail e vínculo: guarda os dois, e o login mostra o CPF com o e-mail como alternativa", async () => {
  const r = await post({ name: "João da Silva", email: "joao@torg.com.br", funcionarioId: "f1", tipo: "USUARIO", modulos: ["EXPEDICAO"] });
  expect(r.status).toBe(201);
  const j = await r.json();
  expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({ email: "joao@torg.com.br", funcionarioId: "f1" });
  expect(j.data.login.por).toBe("cpf"); expect(j.data.login.semEmail).toBe(false);
});

it("funcionário já vinculado a outro usuário, ou sem CPF, não pode ser vinculado", async () => {
  mockPrisma.funcionario.findUnique.mockResolvedValueOnce({ ...func, usuario: { id: "outro", email: "outro@torg.com.br" } });
  expect((await post({ name: "João", funcionarioId: "f1", tipo: "USUARIO", modulos: ["EXPEDICAO"] })).status).toBe(400);
  mockPrisma.funcionario.findUnique.mockResolvedValueOnce({ ...func, cpf: null });
  const r = await post({ name: "João", funcionarioId: "f1", tipo: "USUARIO", modulos: ["EXPEDICAO"] });
  expect(r.status).toBe(400); expect((await r.json()).error).toMatch(/CPF/);
});
