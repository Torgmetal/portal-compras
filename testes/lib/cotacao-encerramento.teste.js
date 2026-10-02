// Matheus (02/10/2026): "quando as RM/cotações estiverem com status PEDIDO GERADO é preciso dar um
// aviso para os fornecedores que ainda não responderam a cotação, avisando que já foi encerrada".
// Medido no dia: 236 cotações sem resposta em 103 RMs já em Pedido gerado, todas com o link aberto.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cotacaoPodeEncerrar, encerrarCotacoesDaRM, emailDeEncerramento } from "@/lib/cotacao-encerramento";

const cot = (over = {}) => ({
  id: "c1", status: "PENDENTE", fornecedorNome: "GERDAU", fornecedorEmail: "vendas@gerdau.com", createdAt: new Date("2026-09-20T12:00:00Z"),
  rm: { id: "rm1", numero: "T119-001-R00", status: "PEDIDO_GERADO" },
  itens: [{ rmItem: { rm: { id: "rm1", numero: "T119-001-R00", status: "PEDIDO_GERADO" } } }],
  ...over,
});

function db(cotacoes, { atualiza = 1 } = {}) {
  return {
    cotacao: {
      findMany: vi.fn(async () => cotacoes),
      updateMany: vi.fn(async () => ({ count: atualiza })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

describe("cotacaoPodeEncerrar", () => {
  it("RM em Pedido gerado e cotação sem resposta: encerra", () => {
    expect(cotacaoPodeEncerrar(cot())).toBe(true);
  });
  it("⚠⚠ cotação consolidada com OUTRA RM ainda aberta não encerra — o fornecedor ainda pode cotar a outra", () => {
    const c = cot({ itens: [...cot().itens, { rmItem: { rm: { id: "rm2", numero: "T119-002-R00", status: "COTADA" } } }] });
    expect(cotacaoPodeEncerrar(c)).toBe(false);
  });
  it("RM cancelada conta como fechada", () => {
    expect(cotacaoPodeEncerrar(cot({ rm: { id: "rm1", numero: "X", status: "CANCELADA" }, itens: [] }))).toBe(true);
  });
  it("cotação que já respondeu, declinou ou foi cancelada não é tocada", () => {
    for (const status of ["RECEBIDA", "DECLINADA", "CANCELADA", "ENCERRADA"]) expect(cotacaoPodeEncerrar(cot({ status }))).toBe(false);
  });
  it("vencida (prazo passou, sem resposta) também encerra", () => {
    expect(cotacaoPodeEncerrar(cot({ status: "VENCIDA" }))).toBe(true);
  });
});

describe("encerrarCotacoesDaRM", () => {
  let enviar;
  beforeEach(() => { enviar = vi.fn(async () => ({ ok: true })); });

  it("grava ENCERRADA condicionado ao status lido, registra e avisa", async () => {
    const d = db([cot()]);
    const r = await encerrarCotacoesDaRM(d, "rm1", { enviar });
    expect(d.cotacao.updateMany).toHaveBeenCalledWith({ where: { id: "c1", status: { in: ["PENDENTE", "VENCIDA"] } }, data: { status: "ENCERRADA" } });
    expect(d.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "ENCERRAR_COTACAO_PEDIDO_GERADO", entityId: "c1" }) }));
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ to: "vendas@gerdau.com", cc: ["compras@torg.com.br"], replyTo: "compras@torg.com.br" }));
    expect(r).toEqual([{ cotacaoId: "c1", fornecedor: "GERDAU", aviso: "enviado" }]);
  });

  it("⚠⚠ a gravação vem ANTES do e-mail — e quem perdeu a corrida (outra chamada já encerrou) não manda de novo", async () => {
    const d = db([cot()], { atualiza: 0 });
    const r = await encerrarCotacoesDaRM(d, "rm1", { enviar });
    expect(enviar).not.toHaveBeenCalled();
    expect(r).toEqual([]);
  });

  it("avisar: false encerra sem e-mail (a carga das antigas)", async () => {
    const d = db([cot()]);
    const r = await encerrarCotacoesDaRM(d, "rm1", { enviar, avisar: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(r[0].aviso).toBe("nao-avisar");
  });

  it("⚠ e-mail que falha não desfaz o encerramento nem lança", async () => {
    enviar = vi.fn(async () => { throw new Error("Resend fora"); });
    const d = db([cot()]);
    const r = await encerrarCotacoesDaRM(d, "rm1", { enviar });
    expect(d.cotacao.updateMany).toHaveBeenCalled();
    expect(r[0].aviso).toBe("falhou");
  });

  it("fornecedor sem e-mail: encerra e diz que ninguém foi avisado", async () => {
    const r = await encerrarCotacoesDaRM(db([cot({ fornecedorEmail: null })]), "rm1", { enviar });
    expect(r[0].aviso).toBe("sem-email");
  });

  it("⚠ erro do banco não sobe para quem gerou o pedido — devolve vazio", async () => {
    const d = db([]); d.cotacao.findMany = vi.fn(async () => { throw new Error("P1001"); });
    expect(await encerrarCotacoesDaRM(d, "rm1", { enviar })).toEqual([]);
  });

  it("só as que podem encerrar: a consolidada com outra RM aberta fica", async () => {
    const aberta = cot({ id: "c2", itens: [{ rmItem: { rm: { id: "rm2", numero: "B", status: "ABERTA" } } }] });
    const d = db([cot(), aberta]);
    await encerrarCotacoesDaRM(d, "rm1", { enviar });
    expect(d.cotacao.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("o texto do e-mail (neutro — aprovado por Matheus, 02/10/2026)", () => {
  it("diz que foi encerrada e agradece, sem dizer que outro ganhou", () => {
    const e = emailDeEncerramento(cot());
    expect(e.subject).toBe("Cotação encerrada — RM T119-001-R00 · Torg Metal");
    expect(e.text).toMatch(/foi encerrada/);
    expect(e.text).toMatch(/não aceita mais propostas/);
    expect(e.text).not.toMatch(/outro fornecedor|ganh|vencedor/i);
  });
  it("⚠ o nome do fornecedor é escapado no HTML", () => {
    expect(emailDeEncerramento(cot({ fornecedorNome: "<b>X</b>" })).html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
