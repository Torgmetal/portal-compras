// Trocar o e-mail de uma etapa do fluxo de assinaturas do Data Book que ainda não foi assinada.
// Vitor (06/10/2026): "preciso alterar o e-mail do inspetor que está com o e-mail do Alexandre
// Stival e deveria ser outro e-mail, poderia deixar uma forma de ser possível alterar o e-mail".
// Depois de criado o fluxo, a tela só oferecia "reenviar" — e a revisão do data book recria as
// etapas com os mesmos e-mails, então o endereço errado voltava a cada revisão.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u1", name: "Geraldo" }) }));
vi.mock("@/lib/token", () => ({ gerarTokenForte: vi.fn(() => "token-novo") }));
vi.mock("@/lib/databook-assinaturas", () => ({
  RT_NOME: "Guilherme A. Corte Campos", fmtOPdb: (n) => `OP-${n}`, baseUrlDe: () => "https://portal",
  enviarEmailEtapa: vi.fn().mockResolvedValue(true),
}));
import { PATCH } from "@/app/api/qualidade/data-books/[id]/assinaturas/route";
import { enviarEmailEtapa } from "@/lib/databook-assinaturas";

const etapa = (ordem, papel, status, extra = {}) => ({ id: `a${ordem}`, dataBookId: "db", ordem, papel, nome: null, email: `${papel.toLowerCase()}@torg.com.br`, token: `token-${ordem}`, status, ...extra });
const cadeia = (statusInspetor = "PENDENTE", statusElaborador = "PENDENTE") => [
  etapa(1, "ELABORADOR", statusElaborador, { nome: "Geraldo Tank", email: "qualidade@torg.com.br" }),
  etapa(2, "INSPETOR", statusInspetor, { nome: "Alexandre Stival", email: "alexandre_stival@yahoo.com.br" }),
  etapa(3, "RESP_TECNICO", "PENDENTE", { nome: "Guilherme A. Corte Campos", email: "guilherme@torg.com.br" }),
  etapa(4, "CLIENTE", "PENDENTE", { nome: "TMSA", email: "pinho.davi@tmsa.ind.br" }),
];
const req = (b) => new Request("http://localhost", { method: "PATCH", body: JSON.stringify(b) });
const params = { params: { id: "db" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({ opNumero: "103", obra: "Torocua - Ñacunday" });
  mockPrisma.dataBookAssinatura.findMany.mockResolvedValue(cadeia());
  mockPrisma.dataBookAssinatura.update.mockResolvedValue({});
});

describe("trocar o e-mail de uma etapa", () => {
  it("etapa ainda não convidada: grava o e-mail e o nome novos, com link novo, sem mandar e-mail", async () => {
    const res = await PATCH(req({ ordem: 2, email: " Insp.Novo@Torg.com.br ", nome: "Inspetor Novo" }), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.dataBookAssinatura.update).toHaveBeenCalledWith({
      where: { id: "a2" },
      data: { email: "insp.novo@torg.com.br", nome: "Inspetor Novo", token: "token-novo" },
    });
    expect(enviarEmailEtapa).not.toHaveBeenCalled();
  });

  it("etapa já convidada: o convite vai para o e-mail novo, com o link novo (o antigo deixa de valer)", async () => {
    mockPrisma.dataBookAssinatura.findMany.mockResolvedValue(cadeia("ENVIADO", "ASSINADO"));
    const res = await PATCH(req({ ordem: 2, email: "stival2112@gmail.com", nome: "Alexandre Stival" }), params);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.reenviado).toBe(true);
    expect(enviarEmailEtapa).toHaveBeenCalledWith(expect.objectContaining({
      email: "stival2112@gmail.com", papel: "INSPETOR", link: "https://portal/data-book/assinar/token-novo",
    }));
    const dados = mockPrisma.dataBookAssinatura.update.mock.calls.map((c) => c[0].data);
    expect(dados.some((d) => d.token === "token-novo" && d.email === "stival2112@gmail.com")).toBe(true);
  });

  it("registra antes e depois no AuditLog — e nunca o token", async () => {
    await PATCH(req({ ordem: 2, email: "insp.novo@torg.com.br", nome: "Inspetor Novo" }), params);
    const audit = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(audit.action).toBe("TROCAR_EMAIL_ASSINATURA_DATABOOK");
    expect(audit.entityId).toBe("a2");
    expect(audit.diff.antes).toEqual({ email: "alexandre_stival@yahoo.com.br", nome: "Alexandre Stival" });
    expect(audit.diff.depois).toEqual({ email: "insp.novo@torg.com.br", nome: "Inspetor Novo" });
    expect(JSON.stringify(audit)).not.toMatch(/token-/);
  });

  it("etapa assinada não muda: a assinatura é de quem assinou", async () => {
    mockPrisma.dataBookAssinatura.findMany.mockResolvedValue(cadeia("ASSINADO", "ASSINADO"));
    const res = await PATCH(req({ ordem: 2, email: "outro@torg.com.br" }), params);
    expect(res.status).toBe(400);
    expect(mockPrisma.dataBookAssinatura.update).not.toHaveBeenCalled();
    expect(enviarEmailEtapa).not.toHaveBeenCalled();
  });

  it("e-mail inválido é recusado", async () => {
    const res = await PATCH(req({ ordem: 2, email: "sem-arroba" }), params);
    expect(res.status).toBe(400);
    expect(mockPrisma.dataBookAssinatura.update).not.toHaveBeenCalled();
  });

  it("o nome do responsável técnico é fixo: só o e-mail troca", async () => {
    await PATCH(req({ ordem: 3, email: "rt@torg.com.br", nome: "Outra Pessoa" }), params);
    expect(mockPrisma.dataBookAssinatura.update.mock.calls[0][0].data).toEqual({ email: "rt@torg.com.br", nome: "Guilherme A. Corte Campos", token: "token-novo" });
  });

  it("mesmo e-mail e mesmo nome: nada a gravar, o link continua o mesmo", async () => {
    const res = await PATCH(req({ ordem: 2, email: "alexandre_stival@yahoo.com.br", nome: "Alexandre Stival" }), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.dataBookAssinatura.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("reenviar (sem e-mail no corpo) continua como antes", () => {
  it("reenvia para o e-mail gravado, com o mesmo link", async () => {
    mockPrisma.dataBookAssinatura.findMany.mockResolvedValue(cadeia("ENVIADO", "ASSINADO"));
    const res = await PATCH(req({ ordem: 2 }), params);
    expect(res.status).toBe(200);
    expect(enviarEmailEtapa).toHaveBeenCalledWith(expect.objectContaining({ email: "alexandre_stival@yahoo.com.br", link: "https://portal/data-book/assinar/token-2" }));
    expect(mockPrisma.auditLog.create.mock.calls.at(-1)[0].data.action).toBe("REENVIAR_ASSINATURA_DATABOOK");
  });
});
