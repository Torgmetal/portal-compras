// O disparo das cobranças. ⚠⚠ E-MAIL NÃO TEM DESFAZER — tudo aqui existe para que uma rodada que
// falha no meio não vire "manda tudo de novo" (achados do Codex, 17/09/2026).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ reservar: vi.fn(), soltar: vi.fn() }));
vi.mock("@/lib/cron-trava", () => ({ reservarVez: mocks.reservar, soltarVez: mocks.soltar }));

import { enviarCobrancas, ESTADOS, copiasInternas, respostaPara, garantirToken } from "@/lib/cobranca-atraso-envio";

const grupo = (o = {}) => ({
  chave: o.chave || "cnpj:111",
  nome: o.nome || "ALFA",
  email: o.email === undefined ? "alfa@x.com" : o.email,
  bloqueio: o.bloqueio || null,
  pedidos: o.pedidos || [{ id: "p1", numeroPedido: 1, rmNumero: "RM1", opNumero: "1", opCliente: "C",
    previsao: new Date("2026-09-01T12:00:00-03:00"), prazoOriginal: null, diasAtraso: 5, parcial: false }],
});

const prismaFake = () => ({
  pedidoOmie: {
    findUnique: vi.fn(async () => ({ tokenEntrega: "tok" })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  auditLog: {
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: "a1", diff: {} })),
    update: vi.fn(async () => ({})),
  },
});

const base = (extra = {}) => ({
  userId: "u1", baseUrl: "https://portal", gerarToken: () => "novo",
  enviar: vi.fn(async () => ({ ok: true, id: "re_1" })), env: {}, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reservar.mockResolvedValue({ ok: true, faltamSegundos: 120 });
});

describe("os destinatários internos", () => {
  it("o padrão é Matheus e a caixa de compras, e as respostas vão para compras", () => {
    expect(copiasInternas({})).toEqual(["matheus@torg.com.br", "compras@torg.com.br"]);
    expect(respostaPara({})).toBe("compras@torg.com.br");
  });

  // ⚠ Um endereço torto na variável derrubaria o envio inteiro por causa de uma cópia.
  it("⚠ descarta endereço inválido e não repete o mesmo duas vezes", () => {
    expect(copiasInternas({ COBRANCA_ATRASO_CC: "a@b.com, lixo, A@B.com ;c@d.com" }))
      .toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("um e-mail por fornecedor", () => {
  it("manda uma vez para cada, com as cópias e o reply-to", async () => {
    const prisma = prismaFake();
    const ctx = base();
    const g = [grupo({ chave: "a", nome: "ALFA" }), grupo({ chave: "b", nome: "BETA", email: "beta@y.com" })];
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: g, chaves: ["a", "b"] });

    expect(ctx.enviar).toHaveBeenCalledTimes(2);
    expect(ctx.enviar.mock.calls[0][0]).toMatchObject({
      to: "alfa@x.com", cc: ["matheus@torg.com.br", "compras@torg.com.br"], replyTo: "compras@torg.com.br",
    });
    expect(r.map((x) => x.estado)).toEqual([ESTADOS.ACEITO, ESTADOS.ACEITO]);
  });

  // ⚠⚠ Sem isso, o corpo da requisição escolheria para quem a Torg manda e-mail.
  it("⚠⚠ chave que não está entre os atrasados não vira busca nova — é recusa", async () => {
    const ctx = base();
    const r = await enviarCobrancas(prismaFake(), { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["zzz"] });
    expect(r[0].estado).toBe(ESTADOS.DESCONHECIDO);
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  it("grupo bloqueado não envia, e diz o motivo", async () => {
    const ctx = base();
    const r = await enviarCobrancas(prismaFake(), {
      ...ctx, grupos: [grupo({ chave: "a", bloqueio: "sem-email", email: null })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.BLOQUEADO);
    expect(r[0].motivo).toMatch(/Vendor List/);
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  // ⚠ Nenhum fornecedor derruba os outros.
  it("⚠ o que falhou não impede o seguinte de sair", async () => {
    const ctx = base({ enviar: vi.fn()
      .mockResolvedValueOnce({ ok: false, error: "endereço recusado" })
      .mockResolvedValueOnce({ ok: true, id: "re_2" }) });
    const g = [grupo({ chave: "a" }), grupo({ chave: "b" })];
    const r = await enviarCobrancas(prismaFake(), { ...ctx, grupos: g, chaves: ["a", "b"] });
    expect(r[0]).toMatchObject({ estado: ESTADOS.FALHOU, motivo: "endereço recusado" });
    expect(r[1].estado).toBe(ESTADOS.ACEITO);
  });
});

describe("⚠⚠ a tentativa é gravada ANTES do envio", () => {
  it("⚠⚠ falhar ao registrar IMPEDE o envio — a prova não pode nascer depois do fato", async () => {
    const prisma = prismaFake();
    prisma.auditLog.create.mockRejectedValue(new Error("banco fora"));
    const ctx = base();
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(ctx.enviar).not.toHaveBeenCalled();
    expect(r[0].estado).toBe(ESTADOS.FALHOU);
    expect(r[0].motivo).toMatch(/nada foi enviado/);
  });

  it("a tentativa abre como ENVIANDO e fecha como ENVIADO", async () => {
    const prisma = prismaFake();
    await enviarCobrancas(prisma, { ...base(), grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(prisma.auditLog.create.mock.calls[0][0].data.diff.estado).toBe("ENVIANDO");
    expect(prisma.auditLog.update.mock.calls[0][0].data.diff.estado).toBe("ENVIADO");
  });

  // ⚠ Token é credencial de acesso público, e log não é lugar de guardar credencial.
  it("⚠ o token NUNCA entra no registro de auditoria", async () => {
    const prisma = prismaFake();
    await enviarCobrancas(prisma, { ...base(), grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    const gravado = JSON.stringify(prisma.auditLog.create.mock.calls[0][0]);
    expect(gravado).not.toContain("tok");
    expect(gravado).not.toContain("fornecedores/entrega");
  });

  // ⚠⚠ Timeout depois de o provedor ter aceitado é indistinguível de recusa daqui.
  it("⚠⚠ exceção no envio vira INDETERMINADO, nunca 'falhou' — reenviar duplicaria", async () => {
    const prisma = prismaFake();
    const ctx = base({ enviar: vi.fn(async () => { throw new Error("timeout"); }) });
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.INDETERMINADO);
    expect(prisma.auditLog.update.mock.calls[0][0].data.diff.estado).toBe("INDETERMINADO");
  });
});

describe("⚠⚠ recusa comprovada × resultado desconhecido", () => {
  // ⚠⚠ `sendEmail` engole a exceção e devolve `ok:false` nos DOIS casos; ele marca `indeterminado`
  // só quando foi exceção. Sem isso, um timeout depois da aceitação viraria "falhou" e a tela
  // ofereceria reenvio (achado do Codex, 18/09/2026).
  it("⚠⚠ `ok:false` com `indeterminado` NÃO é falha — é dúvida", async () => {
    const prisma = prismaFake();
    const ctx = base({ enviar: vi.fn(async () => ({ ok: false, indeterminado: true, error: "timeout" })) });
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.INDETERMINADO);
    expect(prisma.auditLog.update.mock.calls[0][0].data.diff.estado).toBe("INDETERMINADO");
  });

  it("recusa comprovada do provedor continua sendo falha", async () => {
    const ctx = base({ enviar: vi.fn(async () => ({ ok: false, error: "endereço inexistente" })) });
    const r = await enviarCobrancas(prismaFake(), { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.FALHOU);
  });
});

describe("⚠⚠ um fornecedor não derruba a rodada", () => {
  // ⚠⚠ Uma exceção na reserva ou na geração dos links escapava do laço e matava a resposta
  // inteira — depois de alguns e-mails já terem saído, e sem dizer quais.
  it("⚠⚠ quebra ANTES do envio vira falha daquele, e os outros seguem", async () => {
    const prisma = prismaFake();
    prisma.pedidoOmie.findUnique
      .mockRejectedValueOnce(new Error("banco piscou"))
      .mockResolvedValue({ tokenEntrega: "tok" });
    const ctx = base();
    const g = [grupo({ chave: "a" }), grupo({ chave: "b" })];
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: g, chaves: ["a", "b"] });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ estado: ESTADOS.FALHOU, motivo: "banco piscou" });
    expect(r[1].estado).toBe(ESTADOS.ACEITO);
    expect(ctx.enviar).toHaveBeenCalledTimes(1);
  });
});

describe("intervalo mínimo e concorrência", () => {
  // ⚠ Sobrescreve só o `findMany`: trocar o `auditLog` inteiro tirava o `create`, e a rodada
  // falhava por "não consegui registrar a tentativa" em vez de testar o intervalo.
  const cobradoEm = (d) => {
    const prisma = prismaFake();
    prisma.auditLog.findMany = vi.fn(async () => [{ entityId: "a", createdAt: d }]);
    return prisma;
  };

  it("cobrado ontem, sem confirmar, não sai de novo", async () => {
    const prisma = cobradoEm(new Date(Date.now() - 86_400_000));
    const ctx = base();
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.RECENTE);
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  it("com `confirmar`, sai", async () => {
    const prisma = cobradoEm(new Date(Date.now() - 86_400_000));
    const ctx = base();
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"], confirmar: true });
    expect(r[0].estado).toBe(ESTADOS.ACEITO);
  });

  it("cobrado há uma semana sai sem confirmação", async () => {
    const prisma = cobradoEm(new Date(Date.now() - 7 * 86_400_000));
    const r = await enviarCobrancas(prisma, { ...base(), grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.ACEITO);
  });

  // ⚠ São coisas diferentes: uma é "eu sei que cobrei ontem", a outra é "alguém está cobrando agora".
  it("⚠ `confirmar` NÃO atropela uma cobrança em andamento", async () => {
    mocks.reservar.mockResolvedValue({ ok: false, faltamSegundos: 30 });
    const ctx = base();
    const r = await enviarCobrancas(prismaFake(), {
      ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"], confirmar: true });
    expect(r[0].estado).toBe(ESTADOS.OCUPADO);
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  // ⚠⚠ Um retrato tirado ANTES da fila decidiria com dado velho: duas requisições veriam as duas
  // "nunca cobrado", e a segunda enviaria logo depois de a primeira terminar.
  it("⚠⚠ o histórico é relido DENTRO da reserva, não antes dela", async () => {
    const prisma = cobradoEm(new Date(Date.now() - 86_400_000));
    const ordem = [];
    mocks.reservar.mockImplementation(async () => { ordem.push("reservar"); return { ok: true }; });
    prisma.auditLog.findMany = vi.fn(async () => { ordem.push("ler"); return [{ createdAt: new Date() }]; });
    await enviarCobrancas(prisma, { ...base(), grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(ordem).toEqual(["reservar", "ler"]);
  });

  // ⚠⚠ Sem leitura, o pior caso é cobrar de novo quem foi cobrado há uma hora.
  it("⚠⚠ falhar ao ler o histórico NÃO vale 'nunca foi cobrado' — não envia", async () => {
    const prisma = prismaFake();
    prisma.auditLog.findMany = vi.fn(async () => { throw new Error("banco fora"); });
    const ctx = base();
    const r = await enviarCobrancas(prisma, { ...ctx, grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(r[0].estado).toBe(ESTADOS.FALHOU);
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  it("a reserva é por FORNECEDOR, e é devolvida no fim", async () => {
    await enviarCobrancas(prismaFake(), { ...base(), grupos: [grupo({ chave: "a" })], chaves: ["a"] });
    expect(mocks.reservar).toHaveBeenCalledWith(expect.anything(), "cobranca:a", 120_000);
    expect(mocks.soltar).toHaveBeenCalledWith(expect.anything(), "cobranca:a");
  });
});

// ⚠⚠ Ler nulo e gravar sem condição deixa duas execuções sobrescreverem o token uma da outra — e o
// link que já saiu num e-mail anterior passa a dar 404 na cara do fornecedor.
describe("⚠⚠ o token do pedido é criado com condição", () => {
  it("reusa o token que já existe", async () => {
    const prisma = prismaFake();
    expect(await garantirToken(prisma, "p1", () => "novo")).toBe("tok");
    expect(prisma.pedidoOmie.updateMany).not.toHaveBeenCalled();
  });

  it("cria com `tokenEntrega: null` no WHERE", async () => {
    const prisma = prismaFake();
    prisma.pedidoOmie.findUnique.mockResolvedValue({ tokenEntrega: null });
    expect(await garantirToken(prisma, "p1", () => "novo")).toBe("novo");
    expect(prisma.pedidoOmie.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tokenEntrega: null }, data: { tokenEntrega: "novo" },
    });
  });

  it("⚠⚠ perdendo a corrida, relê o token de quem ganhou em vez de sobrescrever", async () => {
    const prisma = prismaFake();
    prisma.pedidoOmie.findUnique
      .mockResolvedValueOnce({ tokenEntrega: null })
      .mockResolvedValueOnce({ tokenEntrega: "do-outro" });
    prisma.pedidoOmie.updateMany.mockResolvedValue({ count: 0 });
    expect(await garantirToken(prisma, "p1", () => "novo")).toBe("do-outro");
  });
});
