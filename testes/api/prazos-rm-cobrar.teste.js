// A rota da cobrança. A regra está testada nas libs; aqui fica o que só a rota decide: quem pode,
// o que o corpo da requisição tem permissão de escolher, e o que ela devolve.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn(), agrupar: vi.fn(), enviar: vi.fn(), ultimas: vi.fn(), teste: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/cobranca-atraso", async (real) => ({ ...(await real()), agruparParaCobranca: mocks.agrupar }));
vi.mock("@/lib/cobranca-atraso-envio", async (real) => ({
  ...(await real()), enviarCobrancas: mocks.enviar, ultimasCobrancas: mocks.ultimas,
  enviarTeste: mocks.teste, // ⚠ TEMPORÁRIO — sai com o recurso de prévia
}));

import { GET, POST } from "@/app/api/compras/prazos-rm/cobrar/route";

const GRUPO = {
  chave: "cnpj:111", nome: "ALFA", email: "alfa@x.com", bloqueio: null,
  pedidos: [{ id: "p1", numeroPedido: 1, rmNumero: "RM1", diasAtraso: 5, parcial: false }],
};
const req = (corpo) => new Request("http://localhost/api/compras/prazos-rm/cobrar",
  { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_teste";
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  mocks.role.mockResolvedValue({ id: "u1", email: "matheus@torg.com.br" });
  mocks.agrupar.mockReturnValue([GRUPO]);
  mocks.ultimas.mockResolvedValue(new Map());
  mocks.enviar.mockResolvedValue([{ chave: "cnpj:111", nome: "ALFA", estado: "aceito" }]);
  mocks.teste.mockResolvedValue([{ chave: "cnpj:111", nome: "ALFA", estado: "aceito", teste: true }]);
  mockPrisma.pedidoOmie.findMany.mockResolvedValue([]);
});

describe("quem pode cobrar", () => {
  it("sem sessão → 401, nos dois verbos", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    expect((await GET()).status).toBe(401);
    expect((await POST(req({ chaves: ["cnpj:111"] }))).status).toBe(401);
  });

  it("de outra área → 403", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await GET()).status).toBe(403);
    expect((await POST(req({ chaves: ["cnpj:111"] }))).status).toBe(403);
  });

  it("⚠ quem não pode não dispara nada", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    await POST(req({ chaves: ["cnpj:111"] }));
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});

describe("GET — a lista para escolher", () => {
  it("devolve os fornecedores, as cópias e o intervalo", async () => {
    const j = await (await GET()).json();
    expect(j.fornecedores[0]).toMatchObject({ chave: "cnpj:111", nome: "ALFA", email: "alfa@x.com" });
    expect(j.copias).toEqual(["matheus@torg.com.br", "compras@torg.com.br"]);
    expect(j.respostaPara).toBe("compras@torg.com.br");
    expect(j.intervaloDias).toBe(2);
  });

  it("o motivo do bloqueio vem escrito, não só o código", async () => {
    mocks.agrupar.mockReturnValue([{ ...GRUPO, email: null, bloqueio: "sem-email" }]);
    const j = await (await GET()).json();
    expect(j.fornecedores[0].motivoBloqueio).toMatch(/Vendor List/);
  });
});

describe("POST — o que o corpo tem permissão de escolher", () => {
  // ⚠⚠ O corpo escolhe QUAIS chaves, e mais nada. Aceitar destinatário, pedido ou data do cliente
  // seria deixar a tela decidir para quem a Torg manda e-mail.
  it("⚠⚠ só as chaves passam do corpo para o envio", async () => {
    await POST(req({ chaves: ["cnpj:111"], destino: "invasor@x.com", pedidos: [{ id: "outro" }] }));
    const arg = mocks.enviar.mock.calls[0][1];
    expect(arg.chaves).toEqual(["cnpj:111"]);
    expect(arg.grupos).toEqual([GRUPO]); // recalculado no servidor
    expect(arg).not.toHaveProperty("destino");
  });

  it("lista vazia é recusada", async () => {
    expect((await POST(req({ chaves: [] }))).status).toBe(400);
  });

  // ⚠ A trava de 2 dias não pega isso: tudo aconteceria na mesma requisição.
  it("⚠ a mesma chave repetida é recusada — seriam dois e-mails ao mesmo fornecedor", async () => {
    const res = await POST(req({ chaves: ["cnpj:111", "cnpj:111"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/não repita/i);
  });

  // ⚠ `confirmar: "não"` é uma string, e string é truthy.
  it("⚠ `confirmar` precisa ser booleano de verdade", async () => {
    expect((await POST(req({ chaves: ["a"], confirmar: "não" }))).status).toBe(400);
  });

  it("recusa uma lista absurda de chaves", async () => {
    const muitas = Array.from({ length: 51 }, (_, i) => `c${i}`);
    expect((await POST(req({ chaves: muitas }))).status).toBe(400);
  });
});

// ─── PRÉVIA (TEMPORÁRIO, 18/09/2026) ────────────────────────────────────────
describe("⚠⚠ POST com `teste` — a prévia", () => {
  it("⚠⚠ o destinatário vem da SESSÃO, nunca do corpo", async () => {
    await POST(req({ chaves: ["cnpj:111"], teste: true, para: "invasor@fora.com" }));
    expect(mocks.teste).toHaveBeenCalled();
    expect(mocks.enviar).not.toHaveBeenCalled();
    const arg = mocks.teste.mock.calls[0][1];
    expect(arg.para).toBe("matheus@torg.com.br"); // o e-mail da sessão
    expect(JSON.stringify(arg)).not.toContain("invasor@fora.com");
  });

  it("sem `teste`, o caminho real é o que roda", async () => {
    await POST(req({ chaves: ["cnpj:111"] }));
    expect(mocks.enviar).toHaveBeenCalled();
    expect(mocks.teste).not.toHaveBeenCalled();
  });

  it("⚠ `teste` precisa ser booleano de verdade", async () => {
    expect((await POST(req({ chaves: ["a"], teste: "sim" }))).status).toBe(400);
  });

  it("usuário sem e-mail na sessão recebe recusa clara, não um 500", async () => {
    mocks.role.mockResolvedValue({ id: "u1" });
    const res = await POST(req({ chaves: ["cnpj:111"], teste: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/e-mail cadastrado/i);
    expect(mocks.teste).not.toHaveBeenCalled();
  });

  it("o GET diz para onde a prévia iria e quantas cabem", async () => {
    const j = await (await GET()).json();
    expect(j.testePara).toBe("matheus@torg.com.br");
    expect(j.maxTeste).toBeGreaterThan(0);
  });
});

describe("POST — a resposta", () => {
  // ⚠⚠ 200 com estado POR FORNECEDOR. Um 500 faria a tela oferecer "tentar de novo" para a lista
  // inteira — inclusive para quem já recebeu.
  it("⚠⚠ devolve 200 e o estado de cada um, mesmo com falha no meio", async () => {
    mocks.enviar.mockResolvedValue([
      { chave: "a", estado: "aceito" },
      { chave: "b", estado: "falhou", motivo: "recusado" },
      { chave: "c", estado: "indeterminado" },
    ]);
    const res = await POST(req({ chaves: ["a", "b", "c"] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.enviados).toBe(1);
    expect(j.total).toBe(3);
    expect(j.resultados.map((r) => r.estado)).toEqual(["aceito", "falhou", "indeterminado"]);
  });

  it("sem serviço de e-mail configurado, recusa antes de tentar", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(req({ chaves: ["cnpj:111"] }));
    expect(res.status).toBe(503);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  // ⚠ O link vai num e-mail, e e-mail não tem "mesma origem": sem endereço público, o link sairia
  // quebrado para o fornecedor.
  it("⚠ sem endereço público do portal, recusa em vez de mandar link torto", async () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
    const res = await POST(req({ chaves: ["cnpj:111"] }));
    expect(res.status).toBe(503);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
