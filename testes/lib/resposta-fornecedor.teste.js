// O aviso de que o fornecedor respondeu.
//
// ⚠⚠ O LINK EXISTIA DESDE MAIO, FOI USADO 6 VEZES E NADA REAGIA. Para um recurso cujo propósito é
// obter uma resposta, esse era o elo que faltava (Matheus, 18/09/2026).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ sino: vi.fn(), email: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: mocks.sino }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.email }));

import {
  avisarResposta, podeAvisar, textoDoAviso, destinosDoAviso,
  INTERVALO_AVISO_MS, TETO_AVISOS_DIA,
} from "@/lib/resposta-fornecedor";

const PEDIDO = { id: "p1", numeroPedido: "1977", fornecedorNome: "SOUFER", rmNumero: "T118-001-R00" };

const prismaFake = (avisos = []) => ({
  auditLog: {
    findMany: vi.fn(async () => avisos),
    create: vi.fn(async () => ({ id: "a1" })),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sino.mockResolvedValue({ id: "n1" });
  mocks.email.mockResolvedValue({ ok: true, id: "re_1" });
});

describe("para quem o aviso vai", () => {
  it("compras e Matheus por padrão, sem repetição e sem endereço torto", () => {
    expect(destinosDoAviso({})).toEqual(["compras@torg.com.br", "matheus@torg.com.br"]);
    expect(destinosDoAviso({ RESPOSTA_FORNECEDOR_CC: "a@b.com, lixo, A@B.com" })).toEqual(["a@b.com"]);
  });
});

describe("o texto do aviso", () => {
  // ⚠⚠ Quem lê precisa saber que é declaração de terceiro, não recebimento conferido — a
  // diferença decide se alguém vai ao pátio olhar.
  it("⚠⚠ diz INFORMOU, nunca ENTREGOU", () => {
    const t = textoDoAviso(PEDIDO, { entregue: true, nfNumero: "000362322" });
    expect(t.titulo).toMatch(/informou ENTREGA/);
    expect(t.linha).toMatch(/informou que o pedido 1977 · RM T118-001-R00 já foi entregue, na NF 000362322/);
    expect(t.acao).toMatch(/Confira o recebimento/);
    expect(t.linha).not.toMatch(/\bentregou\b/i);
  });

  it("na nova previsão, diz a data e de onde veio", () => {
    const t = textoDoAviso(PEDIDO, {
      prazoNovo: new Date("2026-10-01T12:00:00-03:00"),
      prazoAnterior: new Date("2026-09-08T12:00:00-03:00"),
    });
    expect(t.linha).toMatch(/01\/10\/2026/);
    expect(t.linha).toMatch(/a data combinada é 08\/09\/2026/);
    // ⚠ "propôs", não "informou": a data não vale até Compras aprovar.
    expect(t.titulo).toMatch(/propôs/);
    expect(t.acao).toMatch(/aprovar/);
  });

  it("pedido sem número nem RM não vira 'undefined' no assunto", () => {
    const t = textoDoAviso({ fornecedorNome: "X" }, { entregue: true });
    expect(t.titulo).not.toMatch(/undefined|null/);
    expect(t.titulo).toMatch(/um pedido/);
  });
});

// ⚠⚠ A ROTA É PÚBLICA, SEM LOGIN. Avisar a cada chamada transforma um token vazado numa torneira
// de e-mail apontada para compras@ (achado do Codex, 18/09/2026).
describe("⚠⚠ a trava contra inundar a caixa de Compras", () => {
  it("avisa quando não houve aviso nenhum", async () => {
    expect(await podeAvisar(prismaFake([]), "p1")).toEqual({ ok: true });
  });

  it("⚠ não avisa de novo dentro do intervalo", async () => {
    const agora = new Date(Date.now() - INTERVALO_AVISO_MS / 2);
    const r = await podeAvisar(prismaFake([{ createdAt: agora }]), "p1");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/há pouco/);
  });

  it("passado o intervalo, avisa de novo", async () => {
    const antes = new Date(Date.now() - INTERVALO_AVISO_MS - 1000);
    expect((await podeAvisar(prismaFake([{ createdAt: antes }]), "p1")).ok).toBe(true);
  });

  it("⚠ teto por dia é a defesa que sobra se alguém insistir", async () => {
    const velhos = Array.from({ length: TETO_AVISOS_DIA },
      () => ({ createdAt: new Date(Date.now() - 2 * INTERVALO_AVISO_MS) }));
    const r = await podeAvisar(prismaFake(velhos), "p1");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/teto/);
  });

  // ⚠ O pior caso de não avisar é um atraso; o de avisar sem limite é inundar quem precisa ler.
  it("⚠ falhar a leitura do limite NÃO libera o aviso", async () => {
    const prisma = { auditLog: { findMany: vi.fn(async () => { throw new Error("banco fora"); }) } };
    expect((await podeAvisar(prisma, "p1")).ok).toBe(false);
  });
});

describe("avisarResposta", () => {
  it("toca o sino de COMPRAS e manda o e-mail", async () => {
    const prisma = prismaFake();
    const r = await avisarResposta(prisma, PEDIDO, { entregue: true, nfNumero: "123" });
    expect(r.avisado).toBe(true);
    expect(mocks.sino).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "FORNECEDOR_RESPONDEU", modulos: ["COMPRAS"],
    }));
    expect(mocks.email).toHaveBeenCalled();
  });

  // ⚠ Uma falha do Resend não pode virar aviso sem limite nenhum.
  it("⚠ carimba o aviso mesmo quando o e-mail falha", async () => {
    mocks.email.mockResolvedValue({ ok: false, error: "fora" });
    const prisma = prismaFake();
    const r = await avisarResposta(prisma, PEDIDO, { entregue: true });
    expect(r).toMatchObject({ avisado: true, emailOk: false });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("o sino falhando não impede o e-mail", async () => {
    mocks.sino.mockRejectedValue(new Error("sem destinatário"));
    await avisarResposta(prismaFake(), PEDIDO, { entregue: true });
    expect(mocks.email).toHaveBeenCalled();
  });

  // ⚠ O que o fornecedor escreveu entra no HTML — cru, um "<" já quebraria a formatação.
  it("⚠ escapa o que o fornecedor escreveu", async () => {
    await avisarResposta(prismaFake(), PEDIDO, { entregue: true, motivo: '<script>x</script>' });
    const html = mocks.email.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("dentro do intervalo, não avisa e não manda nada", async () => {
    const prisma = prismaFake([{ createdAt: new Date() }]);
    const r = await avisarResposta(prisma, PEDIDO, { entregue: true });
    expect(r.avisado).toBe(false);
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.sino).not.toHaveBeenCalled();
  });
});
