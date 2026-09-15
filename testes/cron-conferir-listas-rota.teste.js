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
import { aquecerBanco } from "@/lib/db-retry";
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

    // ⚠ CONFERIR O CONTEÚDO, não só que foi chamado (regressão apontada pelo Codex): um aviso que
    // sai para o módulo errado, sem link ou sem a obra dentro é indistinguível de sucesso aqui.
    const aviso = criarNotificacao.mock.calls[0][0];
    expect(aviso).toMatchObject({ tipo: "LE_DESATUALIZADA", modulos: ["ENGENHARIA"], link: "/engenharia/listas" });
    expect(aviso.dados.obras).toEqual([{ op: "115", situacao: "nunca-importada", arquivo: "T115-LE-R00.xlsx" }]);
    expect(aviso.mensagem).toMatch(/OP-115/);
    const carta = sendEmail.mock.calls[0][0];
    expect(carta.to).toEqual(["eng@torg.com.br"]);
    expect(carta.subject).toMatch(/lista\(s\) de expedição a importar/);
    expect(carta.html).toMatch(/OP-115/);
    expect(carta.html).toMatch(/T115-LE-R00\.xlsx/);
  });

  // ⚠⚠ O TESTE QUE DEU ORIGEM AO ARQUIVO. Antes, isto respondia ok:true com heartbeat ok:true.
  it("nenhum canal entregou é FALHA — na resposta e no heartbeat", async () => {
    criarNotificacao.mockResolvedValue(null);          // nenhum destinatário resolvido
    sendEmail.mockResolvedValue({ ok: false, error: "Resend fora" });

    const res = await GET(req());
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.problemas.join()).toMatch(/NENHUM canal confirmou/);
    expect(json.problemas.join()).toMatch(/Resend fora/);
    expect(heartbeat()).toMatchObject({ ok: false });
    expect(heartbeat().mensagem).toMatch(/NENHUM canal confirmou/);
    // ⚠⚠ 500 COM O CORPO INTEIRO. Eu tinha escrito este teste exigindo 200 "para não esconder as
    // pendências"; o parecer do Codex mostrou que o corpo vai igual nos dois casos e que o 200
    // sinalizava sucesso para todo observador que não lê `ok` — o painel de crons da Vercel
    // inclusive. A Vercel não faz retry de cron que falha, então o 500 não reenvia nada.
    expect(res.status).toBe(500);
    expect(json.pendentes).toHaveLength(1);
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
    expect(json.problemas.join()).toMatch(/nenhum e-mail de Engenharia cadastrado/);
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


  // ─── O QUE O PARECER DO CODEX (15/09/2026) APONTOU COMO BURACO ──────────────

  // ⚠⚠ O CASO MAIS PRÓXIMO DA REALIDADE: numa execução com 22 obras, uma recusada pelo Graph não
  // pode segurar o aviso das outras. O alerta sai; o heartbeat é que registra que faltou obra.
  it("obra ilegível não impede o aviso das pendentes, mas derruba o heartbeat", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([
      { numero: "115", cliente: "TMSA" },
      { numero: "103", cliente: "DANPOWER" },
    ]);
    lesDeVariasOps.mockResolvedValue(new Map([
      ["115", { arquivos: [{ nome: "T115-LE-R00.xlsx", modificadoEm: "2026-09-10T12:00:00Z" }], pasta: "/x" }],
      ["103", { arquivos: [], pasta: "/y", erro: "HTTP 429" }],
    ]));

    const res = await GET(req());
    const json = await res.json();
    expect(criarNotificacao).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(json.pendentes.map((p) => p.op)).toEqual(["115"]);
    expect(json.incompletas).toEqual([{ op: "103", erro: "HTTP 429" }]);
    expect(json.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(heartbeat()).toMatchObject({ ok: false });
  });

  it("obra ilegível E nenhum canal confirmando: as duas causas aparecem juntas", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([
      { numero: "115", cliente: "TMSA" },
      { numero: "103", cliente: "DANPOWER" },
    ]);
    lesDeVariasOps.mockResolvedValue(new Map([
      ["115", { arquivos: [{ nome: "T115-LE-R00.xlsx", modificadoEm: "2026-09-10T12:00:00Z" }], pasta: "/x" }],
      ["103", { arquivos: [], pasta: "/y", erro: "HTTP 429" }],
    ]));
    criarNotificacao.mockResolvedValue(null);
    sendEmail.mockResolvedValue({ ok: false, error: "Resend fora" });

    const json = await (await GET(req())).json();
    expect(json.problemas).toHaveLength(2);
    expect(heartbeat().mensagem).toMatch(/não consegui ler 1 obra/);
    expect(heartbeat().mensagem).toMatch(/NENHUM canal confirmou/);
  });

  it("simulação que explode no Graph: 500, ninguém avisado e NENHUM heartbeat", async () => {
    lesDeVariasOps.mockRejectedValue(new Error("Graph fora do ar"));
    const res = await GET(req("?simular=1"));
    expect(res.status).toBe(500);
    expect(criarNotificacao).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    // ⚠ O ensaio não pode gravar heartbeat NEM no caminho de erro: alarme vindo da ferramenta de
    // alarme, por causa de uma prova minha.
    expect(registrarExecucao).not.toHaveBeenCalled();
  });

  // ⚠⚠ O ACHADO ALTA DO PARECER. A chave do sino era só a data e o upsert não atualiza conteúdo:
  // uma segunda execução no mesmo dia, com outra lista de obras, reencontrava o aviso da manhã,
  // não mexia nele e devolvia "sino entregue". O conjunto de obras agora entra na chave.
  it("reexecução no mesmo dia com pendências diferentes gera aviso próprio", async () => {
    await GET(req());
    const chave1 = criarNotificacao.mock.calls[0][0].chaveEvento;

    mockPrisma.oP.findMany.mockResolvedValue([
      { numero: "115", cliente: "TMSA" },
      { numero: "118", cliente: "DANPOWER" },
    ]);
    lesDeVariasOps.mockResolvedValue(new Map([
      ["115", { arquivos: [{ nome: "T115-LE-R00.xlsx", modificadoEm: "2026-09-10T12:00:00Z" }], pasta: "/x" }],
      ["118", { arquivos: [{ nome: "T118-LE-R02.xlsx", modificadoEm: "2026-09-12T12:00:00Z" }], pasta: "/y" }],
    ]));
    await GET(req());
    const chave2 = criarNotificacao.mock.calls[1][0].chaveEvento;

    expect(chave1).not.toBe(chave2);
    expect(chave2).toMatch(/115,118$/);
  });

  it("a MESMA lista em outra ordem é o mesmo aviso — a chave não depende do orderBy", async () => {
    const obras = (ordem) => {
      mockPrisma.oP.findMany.mockResolvedValue(ordem.map((n) => ({ numero: n, cliente: "X" })));
      lesDeVariasOps.mockResolvedValue(new Map(ordem.map((n) => [n,
        { arquivos: [{ nome: `T${n}-LE-R00.xlsx`, modificadoEm: "2026-09-10T12:00:00Z" }], pasta: "/x" }])));
    };
    obras(["115", "118"]);
    await GET(req());
    obras(["118", "115"]);
    await GET(req());
    expect(criarNotificacao.mock.calls[0][0].chaveEvento).toBe(criarNotificacao.mock.calls[1][0].chaveEvento);
  });

  it("sino que EXPLODE não impede o e-mail", async () => {
    criarNotificacao.mockRejectedValue(new Error("banco fora"));
    const json = await (await GET(req())).json();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(json.sino).toBe(false);
    expect(json.email).toBe(1);
    expect(json.ok).toBe(true);
  });

  // ⚠ Banco fora ≠ ninguém cadastrado. Antes, um `.catch(() => [])` dizia "nenhum e-mail de
  // Engenharia" quando o banco caiu — e quem lesse o alerta iria cadastrar e-mail para resolver
  // um problema que não era esse.
  it("falha ao CONSULTAR os e-mails não vira 'ninguém cadastrado'", async () => {
    criarNotificacao.mockResolvedValue(null);
    mockPrisma.user.findMany.mockRejectedValue(new Error("connection terminated"));
    const json = await (await GET(req())).json();
    expect(json.problemas.join()).toMatch(/não consegui consultar os e-mails/);
    expect(json.problemas.join()).not.toMatch(/cadastrado/);
    expect(heartbeat()).toMatchObject({ ok: false });
  });

  it("os dois canais explodindo ainda respondem falha, não exceção", async () => {
    criarNotificacao.mockRejectedValue(new Error("banco fora"));
    sendEmail.mockRejectedValue(new Error("Resend fora"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).problemas.join()).toMatch(/NENHUM canal confirmou/);
    expect(heartbeat()).toMatchObject({ ok: false });
  });

  it("nenhuma obra vigente: sucesso silencioso", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([]);
    lesDeVariasOps.mockResolvedValue(new Map());
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ ok: true, conferidas: 0, incompletas: [] });
    expect(criarNotificacao).not.toHaveBeenCalled();
    expect(heartbeat()).toMatchObject({ ok: true });
  });

  it("sem o segredo do cron, em produção, responde 401 sem tocar no banco", async () => {
    temCronSecret.mockReturnValue(false);
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await GET(req());
      expect(res.status).toBe(401);
      // ⚠ "sem tocar no banco" tem de ser verificado inteiro: antes eu só olhava o Graph, e um
      // aquecerBanco ou um heartbeat antes da porta passariam batido (apontado pelo Codex).
      for (const espiao of [lesDeVariasOps, aquecerBanco, criarNotificacao, sendEmail, registrarExecucao, mockPrisma.oP.findMany]) {
        expect(espiao).not.toHaveBeenCalled();
      }
    } finally {
      process.env.NODE_ENV = antes;
    }
  });
});
