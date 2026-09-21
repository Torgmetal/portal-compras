import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireAdminDoPortal: mocks.admin }));
import { GET, PUT } from "@/app/api/admin/usuarios/[id]/obras/route";
import { obrasDoLogin, aplicarLiberacao } from "@/lib/cliente-obras";

// Vitor (21/09/2026): "preciso deixar uma forma de conseguir liberar as OPs que eu quero que ele
// veja". O portal do cliente lista a obra quando o e-mail do login aparece nela — e o contato da
// OP é o vínculo que a Torg controla. "Liberar" uma obra = pôr a pessoa nos contatos daquela OP;
// "revogar" = tirar. Assim a mesma lista vale para o portal, para os papéis (faturamento) e para
// os envios.

const cliente = { id: "u9", name: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", tipo: "CLIENTE" };
const ops = [
  { id: "op122", numero: "122", cliente: "TMSA", obra: "Vale", status: "EM_EXECUCAO", clienteEmail: null, clienteContatos: [{ nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", papeis: ["FATURAMENTO"] }, { nome: "Charlie", email: "charlie.azevedo@tmsa.ind.br" }] },
  { id: "op105", numero: "105", cliente: "TMSA", obra: "Bianchini", status: "ABERTA", clienteEmail: "rogerio.porsch@tmsa.ind.br", clienteContatos: [] },
  { id: "op067", numero: "067", cliente: "DANPOWER", obra: "ENC 326", status: "ABERTA", clienteEmail: null, clienteContatos: [{ nome: "Alexandre", email: "alexandre.filippis@danpower.com.br" }] },
];
const params = { params: { id: "u9" } };
const req = (body) => new Request("http://localhost/api/admin/usuarios/u9/obras", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "adm", name: "Vitor" });
  mockPrisma.user.findUnique.mockResolvedValue(cliente);
  mockPrisma.oP.findMany.mockResolvedValue(ops);
  mockPrisma.oP.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("obrasDoLogin — a regra pura", () => {
  it("marca liberada quando o e-mail é contato OU o e-mail principal da OP, e diz por onde", () => {
    const lista = obrasDoLogin(ops, cliente.email);
    expect(lista.map((o) => [o.numero, o.liberada, o.origem])).toEqual([
      ["122", true, "contato"], ["105", true, "email"], ["067", false, null],
    ]);
  });
});

describe("GET", () => {
  it("devolve as obras com a marca de liberada", async () => {
    const r = await GET(new Request("http://localhost"), params);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.usuario).toMatchObject({ email: cliente.email });
    expect(j.obras.filter((o) => o.liberada).map((o) => o.numero)).toEqual(["122", "105"]);
  });
  it("só para login de CLIENTE", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...cliente, tipo: "USUARIO" });
    const r = await GET(new Request("http://localhost"), params);
    expect(r.status).toBe(400);
  });
});

describe("PUT — liberar e revogar", () => {
  it("liberar acrescenta o contato; revogar tira; quem já está não é duplicado nem perde papéis", async () => {
    // pede: 122 (já está, com FATURAMENTO), 067 (novo); tira: 105 (era pelo e-mail principal — não há contato para tirar)
    const r = await PUT(req({ opIds: ["op122", "op067"] }), params);
    expect(r.status).toBe(200);
    const updates = mockPrisma.oP.update.mock.calls.map((c) => c[0]);
    // 122 não muda (já é contato, com o papel preservado); 067 ganha o contato; 105 fica como está
    expect(updates.map((u) => u.where.id)).toEqual(["op067"]);
    expect(updates[0].data.clienteContatos).toEqual([
      { nome: "Alexandre", email: "alexandre.filippis@danpower.com.br" },
      { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br" },
    ]);
    const j = await r.json();
    expect(j.obras.filter((o) => o.liberada).map((o) => o.numero).sort()).toEqual(["067", "105", "122"]);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "LIBERAR_OBRAS_CLIENTE", entity: "User", entityId: "u9", diff: { liberadas: ["067"], revogadas: [] } });
  });

  it("revogar remove o contato daquela OP e mantém os outros contatos", async () => {
    const r = await PUT(req({ opIds: [] }), params);
    expect(r.status).toBe(200);
    const updates = mockPrisma.oP.update.mock.calls.map((c) => c[0]);
    expect(updates.map((u) => u.where.id)).toEqual(["op122"]);
    expect(updates[0].data.clienteContatos).toEqual([{ nome: "Charlie", email: "charlie.azevedo@tmsa.ind.br" }]);
    const j = await r.json();
    // 105 continua liberada: o e-mail principal da OP não é contato, e não se mexe nele por aqui
    expect(j.obras.find((o) => o.numero === "105")).toMatchObject({ liberada: true, origem: "email" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.diff).toMatchObject({ liberadas: [], revogadas: ["122"] });
  });

  it("id de OP desconhecido é recusado, e nada grava", async () => {
    const r = await PUT(req({ opIds: ["nao-existe"] }), params);
    expect(r.status).toBe(400);
    expect(mockPrisma.oP.update).not.toHaveBeenCalled();
  });
});

describe("aplicarLiberacao — a regra pura", () => {
  it("é idempotente: aplicar a mesma lista duas vezes não muda nada na segunda", () => {
    const primeira = aplicarLiberacao(ops, cliente, ["op122", "op067"]);
    const depois = ops.map((o) => primeira.mudancas.find((m) => m.id === o.id)?.clienteContatos ? { ...o, clienteContatos: primeira.mudancas.find((m) => m.id === o.id).clienteContatos } : o);
    expect(aplicarLiberacao(depois, cliente, ["op122", "op067"]).mudancas).toEqual([]);
  });
});
