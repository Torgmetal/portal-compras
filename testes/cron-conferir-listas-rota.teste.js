// A ROTA do cron da L.E., com as dependências mockadas.
//
// ⚠⚠ O QUE ESTE ARQUIVO EXISTE PARA PEGAR: o cron avisa por DOIS canais e, até 15/09/2026,
// respondia sucesso mesmo quando NENHUM dos dois entregava — `criarNotificacao` engole a própria
// exceção e devolve `null`, e `sendEmail` devolve `{ok:false}` quando o Resend recusa. O heartbeat
// ia junto, "ok". Ou seja: o monitor ficava calado justamente no dia em que a Engenharia não foi
// avisada de nada. É o mesmo defeito que a obra recusada pelo Graph já tinha mostrado (achado do
// Codex), e a regra pura em `lib/le-pendencias.js` não alcança — só a rota sabe se entregou.
//
// A regra de comparação NÃO é mockada de propósito: testá-la de verdade aqui é o que garante que a
// rota liga o comparador ao aviso, e ela já tem os testes de unidade dela.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: vi.fn(() => true) }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: vi.fn() }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: vi.fn() }));
vi.mock("@/lib/le-servidor", () => ({ lesDeVariasOps: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { temCronSecret } from "@/lib/cron-auth";
import { registrarExecucao } from "@/lib/cron-monitor";
import { lesDeVariasOps } from "@/lib/le-servidor";
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";
import { GET } from "@/app/api/cron/conferir-listas/route";

const req = (qs = "") => new Request(`http://localhost/api/cron/conferir-listas${qs}`);
const heartbeat = () => registrarExecucao.mock.calls.at(-1)?.[1];

// Uma obra que nunca importou a lista — a pendência mais simples que existe.
function cenarioPendente() {
  mockPrisma.oP.findMany.mockResolvedValue([{ numero: "115", cliente: "TMSA" }]);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([{ email: "eng@torg.com.br" }]);
  lesDeVariasOps.mockResolvedValue(new Map([
    ["115", { arquivos: [{ nome: "T115-LE-R00.xlsx", itemId: "i1", modificadoEm: "2026-09-10T12:00:00Z" }], pasta: "/x" }],
  ]));
}

beforeEach(() => {
  vi.clearAllMocks();
  temCronSecret.mockReturnValue(true);
  criarNotificacao.mockResolvedValue({ id: "n1" });
  sendEmail.mockResolvedValue({ ok: true });
  cenarioPendente();
});

describe("cron conferir-listas — a rota", () => {
  it("avisa pelos dois canais e bate o heartbeat como sucesso", async () => {
    const json = await (await GET(req())).json();
    expect(json.ok).toBe(true);
    expect(json.pendentes).toHaveLength(1);
    expect(json.pendentes[0].situacao).toBe("nunca-importada");
    expect(criarNotificacao).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(json.sino).toBe(true);
    expect(json.email).toBe(1);
    expect(heartbeat()).toMatchObject({ ok: true });
  });

  // ⚠⚠ O TESTE QUE DEU ORIGEM AO ARQUIVO. Antes, isto respondia ok:true com heartbeat ok:true.
  it("nenhum canal entregou é FALHA — na resposta e no heartbeat", async () => {
    criarNotificacao.mockResolvedValue(null);          // nenhum destinatário resolvido
    sendEmail.mockResolvedValue({ ok: false, error: "Resend fora" });

    const res = await GET(req());
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.problemas.join()).toMatch(/NENHUM canal entregou/);
    expect(json.problemas.join()).toMatch(/Resend fora/);
    expect(heartbeat()).toMatchObject({ ok: false });
    expect(heartbeat().mensagem).toMatch(/NENHUM canal entregou/);
    // ⚠ 200, não 500: a conferência rodou e o corpo traz as pendências. Devolver 500 faria a
    // Vercel tratar como erro de execução e esconderia o que foi achado.
    expect(res.status).toBe(200);
  });

  it("um canal basta — sino entregue com e-mail recusado ainda é sucesso", async () => {
    sendEmail.mockResolvedValue({ ok: false });
    const json = await (await GET(req())).json();
    expect(json.ok).toBe(true);
    expect(json.sino).toBe(true);
    expect(json.email).toBe(0);
    expect(heartbeat()).toMatchObject({ ok: true });
  });

  it("e-mail que EXPLODE não derruba o cron nem apaga o aviso do sino", async () => {
    sendEmail.mockRejectedValue(new Error("timeout do Resend"));
    const res = await GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.sino).toBe(true);
  });

  // ⚠ Canais independentes: o sino falhar não pode cancelar o e-mail, que é o canal que a
  // Engenharia de fato lê fora do portal.
  it("sino falhando ainda manda o e-mail", async () => {
    criarNotificacao.mockResolvedValue(null);
    const json = await (await GET(req())).json();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(json.ok).toBe(true);
    expect(json.email).toBe(1);
  });

  it("sem e-mail cadastrado, o problema é nomeado quando o sino também falha", async () => {
    criarNotificacao.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([{ email: "123@funcionario.torg" }]);
    const json = await (await GET(req())).json();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(json.problemas.join()).toMatch(/nenhum e-mail de Engenharia/);
    expect(heartbeat()).toMatchObject({ ok: false });
  });

  it("obra em dia não avisa ninguém e o heartbeat é sucesso", async () => {
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([
      { opNumero: "115", arquivo: "T115-LE-R00.xlsx", fileModificado: new Date("2026-09-10T12:00:00Z"), importadoEm: new Date("2026-09-11") },
    ]);
    const json = await (await GET(req())).json();
    expect(json.pendentes).toHaveLength(0);
    expect(criarNotificacao).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(json.ok).toBe(true);
    expect(heartbeat()).toMatchObject({ ok: true });
  });

  // ⚠⚠ `?simular=1` é a ÚNICA forma de provar este cron contra o SharePoint de verdade sem mandar
  // e-mail para a Engenharia inteira. Se ele avisasse ou batesse heartbeat, cada ensaio meu viraria
  // alarme — e um heartbeat de simulação marcaria como "executado" um dia em que ninguém foi avisado.
  it("?simular=1 não avisa ninguém e não bate heartbeat", async () => {
    const json = await (await GET(req("?simular=1"))).json();
    expect(json.pendentes).toHaveLength(1);
    expect(criarNotificacao).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(registrarExecucao).not.toHaveBeenCalled();
  });

  it("obra que o Graph recusou sai da comparação e derruba o heartbeat", async () => {
    lesDeVariasOps.mockResolvedValue(new Map([["115", { arquivos: [], pasta: "/x", erro: "HTTP 403" }]]));
    const json = await (await GET(req())).json();
    expect(json.incompletas).toEqual([{ op: "115", erro: "HTTP 403" }]);
    expect(json.conferidas).toBe(0);
    expect(json.ok).toBe(false);
    expect(heartbeat()).toMatchObject({ ok: false });
    expect(heartbeat().mensagem).toMatch(/não consegui ler 1 obra/);
  });

  it("erro no meio do caminho vira 500 com heartbeat de falha", async () => {
    lesDeVariasOps.mockRejectedValue(new Error("Drive SERVIDOR não resolvido."));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(heartbeat()).toMatchObject({ ok: false, mensagem: "Drive SERVIDOR não resolvido." });
  });

  it("sem o segredo do cron, em produção, responde 401 sem tocar no banco", async () => {
    temCronSecret.mockReturnValue(false);
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await GET(req());
      expect(res.status).toBe(401);
      expect(lesDeVariasOps).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = antes;
    }
  });
});
