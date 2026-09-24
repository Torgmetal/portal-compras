import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

const { abrirExecucao } = await import("@/lib/fiscal/assistente/conversas");

// ⚠⚠⚠ A PRIMEIRA PERGUNTA NÃO ERA IDEMPOTENTE (achado do Codex, 24/09/2026). A conversa nascia
// ANTES da busca pela chave, e a busca só olhava dentro dela — então reenviar a mesma chave sem
// `conversaId` criava OUTRA conversa e OUTRA chamada paga. Justamente quando o reenvio é mais
// provável: a conexão caiu na primeira mensagem e o navegador nunca recebeu o `conversaId`.

const ordem = [];
beforeEach(() => {
  vi.clearAllMocks();
  ordem.length = 0;
  mockPrisma.$executeRaw.mockImplementation(async () => { ordem.push("trava"); return 1; });
  mockPrisma.fiscalMensagem.findFirst.mockImplementation(async (a) => {
    ordem.push(a?.where?.chave ? "busca-chave" : "busca-seq");
    return null;
  });
  mockPrisma.fiscalConversa.create.mockImplementation(async () => { ordem.push("cria-conversa"); return { id: "c1" }; });
  mockPrisma.fiscalMensagem.create.mockImplementation(async (a) => ({ id: `m-${a.data.papel}`, ...a.data }));
});

const ARGS = { conversaId: null, userId: "u1", userNome: "Ana", pergunta: "qual o IPI?", chave: "chave-1" };

describe("a primeira pergunta é idempotente", () => {
  it("trava por (usuário, chave) ANTES de procurar e ANTES de criar a conversa", async () => {
    await abrirExecucao(ARGS);
    expect(ordem.slice(0, 3)).toEqual(["trava", "busca-chave", "cria-conversa"]);
  });

  // ⚠⚠ A BUSCA É NAS CONVERSAS DO USUÁRIO, NÃO DENTRO DE UMA CONVERSA SÓ. Sem `conversaId`, a busca
  // antiga olhava dentro da conversa que ela mesma acabara de criar — e nunca achava nada.
  it("procura a chave em TODAS as conversas deste usuário", async () => {
    await abrirExecucao(ARGS);
    const busca = mockPrisma.fiscalMensagem.findFirst.mock.calls.find((c) => c[0]?.where?.chave);
    expect(busca[0].where).toEqual({ chave: "chave-1", conversa: { userId: "u1" } });
  });

  it("reenvio da mesma chave sem conversaId devolve a execução existente e NÃO cria conversa", async () => {
    mockPrisma.fiscalMensagem.findFirst.mockImplementation(async (a) =>
      (a?.where?.chave ? { id: "m-antiga", chave: "chave-1", conversa: { id: "c-antiga" } } : null));
    const r = await abrirExecucao(ARGS);
    expect(r.repetida).toBe(true);
    expect(r.conversa.id).toBe("c-antiga");
    expect(mockPrisma.fiscalConversa.create).not.toHaveBeenCalled();
    expect(mockPrisma.fiscalMensagem.create).not.toHaveBeenCalled();
  });

  // ⚠ A trava é o que resolve a concorrência: sem ela, dois POSTs leriam "não existe" os dois.
  it("a trava inclui o usuário E a chave — chave igual de outra pessoa não bloqueia", async () => {
    await abrirExecucao(ARGS);
    const sql = mockPrisma.$executeRaw.mock.calls[0];
    expect(sql.slice(1)).toContain("fiscal-ia:u1:chave-1");
  });

  it("conversa de outro usuário continua sendo 404, não criação", async () => {
    mockPrisma.fiscalConversa.findFirst.mockResolvedValue(null);
    const r = await abrirExecucao({ ...ARGS, conversaId: "c-de-outro" });
    expect(r.erro).toMatch(/não encontrada/);
    expect(mockPrisma.fiscalConversa.create).not.toHaveBeenCalled();
  });
});
