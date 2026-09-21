// A rota do botão "Sincronizar" da tela Prazos das RMs.
//
// A coordenação das varreduras é testada em `testes/lib/sincronismo-prazos.teste.js`; aqui o que
// se trava é o que só a rota decide: quem pode, o intervalo mínimo entre cliques, e a devolução
// da vez quando o clique não gastou chamada nenhuma no Omie.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), reservar: vi.fn(), renovar: vi.fn(), soltar: vi.fn(), sincronizar: vi.fn(), aquecer: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cron-trava", () => ({ reservarVez: mocks.reservar, renovarVez: mocks.renovar, soltarVez: mocks.soltar }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer }));
vi.mock("@/lib/sincronismo-prazos", async (real) => ({
  ...(await real()), // resumo, deuCerto, rodouAlgo e as constantes são os de verdade
  sincronizarPrazos: mocks.sincronizar,
}));

import { POST } from "@/app/api/compras/prazos-rm/sincronizar/route";
import { RESERVA_DURANTE_MS, INTERVALO_MANUAL_MS, ORCAMENTO } from "@/lib/sincronismo-prazos";

const CONCLUIDA = {
  entregas: { estado: "concluida", sincronizados: 2 },
  encerrados: { estado: "concluida", marcados: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Matheus" });
  mocks.reservar.mockResolvedValue({ ok: true, faltamSegundos: 120 });
  mocks.aquecer.mockResolvedValue(true);
  mocks.sincronizar.mockResolvedValue(CONCLUIDA);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("quem pode sincronizar", () => {
  it("sem sessão → 401", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    expect((await POST()).status).toBe(401);
  });

  it("com sessão de outra área → 403", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await POST()).status).toBe(403);
  });

  // ⚠ A reserva vem DEPOIS da autorização: quem não pode sincronizar não pode gastar o intervalo
  // mínimo de quem pode.
  it("⚠ não reserva a vez de ninguém antes de conferir a permissão", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    await POST();
    expect(mocks.reservar).not.toHaveBeenCalled();
  });
});

describe("intervalo mínimo entre cliques", () => {
  // ⚠⚠ A TRAVA IMPEDE SIMULTANEIDADE, NÃO REPETIÇÃO (achado do Codex, 17/09/2026): terminada uma
  // varredura, o clique seguinte passaria na hora, e cada rodada gasta dezenas de chamadas numa
  // API com limite de 3 req/s.
  it("⚠⚠ clicado de novo cedo demais, devolve 429 SEM tocar no Omie", async () => {
    mocks.reservar.mockResolvedValue({ ok: false, faltamSegundos: 47 });
    const res = await POST();
    expect(res.status).toBe(429);
    expect(mocks.sincronizar).not.toHaveBeenCalled();
  });

  it("⚠ o 429 diz QUANTOS segundos faltam — 'tente mais tarde' faz clicar de novo na hora", async () => {
    mocks.reservar.mockResolvedValue({ ok: false, faltamSegundos: 47 });
    const j = await (await POST()).json();
    expect(j.esperarSegundos).toBe(47);
    expect(j.error).toMatch(/\d+s/);
  });

  it("sem conseguir ler o prazo, ainda recusa — só sem o número", async () => {
    mocks.reservar.mockResolvedValue({ ok: false, faltamSegundos: null });
    const j = await (await POST()).json();
    expect(j.esperarSegundos).toBeNull();
    expect(j.error).toMatch(/instantes/);
  });
});

describe("a rodada", () => {
  it("sincroniza, audita e devolve a frase pronta para a tela", async () => {
    const j = await (await POST()).json();
    expect(j.success).toBe(true);
    expect(j.mensagem).toBe("2 entregas atualizadas · 1 pedido encerrado no Omie.");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "SYNC_PRAZOS_MANUAL", userId: "u1" }),
    }));
  });

  // ⚠⚠ A compute do Neon suspende quando ociosa. A RESERVA já é um query: aquecer depois dela
  // deixaria o P1001 escapar fora do tratamento, devolvendo erro de servidor no lugar da resposta
  // que a tela sabe ler (achado do Codex, 17/09/2026).
  it("⚠⚠ acorda o banco ANTES de tentar reservar a vez", async () => {
    const ordem = [];
    mocks.aquecer.mockImplementation(async () => ordem.push("aquecer"));
    mocks.reservar.mockImplementation(async () => { ordem.push("reservar"); return { ok: true, faltamSegundos: 200 }; });
    await POST();
    expect(ordem).toEqual(["aquecer", "reservar"]);
  });

  it("banco que não acorda devolve 503 com a causa, não um 500 mudo", async () => {
    mocks.aquecer.mockRejectedValue(new Error("Can't reach database server"));
    const res = await POST();
    expect(res.status).toBe(503);
    expect(mocks.reservar).not.toHaveBeenCalled();
  });

  // ⚠⚠ A RESERVA NÃO GUARDA O DONO: quem a encontra vencida assume, e `renovarVez`/`soltarVez`
  // mexem na linha sem perguntar de quem é. Com reserva de 2min e orçamento de 2min30 existia este
  // roteiro (achado do Codex): A reserva em t=0, vence em t=120, B assume, A termina em t=140 e
  // renova a reserva de B. A invariante que segura tudo é a reserva durar MAIS que a rodada.
  it("⚠⚠ a reserva da EXECUÇÃO dura mais que o orçamento da rodada e que o maxDuration", async () => {
    await POST();
    expect(mocks.reservar).toHaveBeenCalledWith(mockPrisma, "sync-manual", RESERVA_DURANTE_MS);
    expect(RESERVA_DURANTE_MS).toBeGreaterThan(ORCAMENTO.total);
    expect(RESERVA_DURANTE_MS).toBeGreaterThan(180_000); // maxDuration da rota
    // ⚠ E o intervalo de verdade, menor, só entra no fim.
    expect(INTERVALO_MANUAL_MS).toBeLessThan(RESERVA_DURANTE_MS);
  });

  // ⚠⚠ MEDIDO EM 17/09/2026: a rodada levou 111s e a reserva feita no INÍCIO deixava só 10s de
  // espera — o intervalo mínimo sumia justamente nas rodadas longas, que são as caras. Intervalo
  // entre duas coisas se conta do FIM de uma ao começo da outra.
  it("⚠⚠ o intervalo mínimo é recontado a partir do FIM da rodada", async () => {
    await POST();
    expect(mocks.soltar).not.toHaveBeenCalled();
    expect(mocks.renovar).toHaveBeenCalledWith(mockPrisma, "sync-manual", INTERVALO_MANUAL_MS);
  });

  // ⚠⚠ Nada rodou porque os DOIS crons estavam na vez? Nenhuma chamada ao Omie foi gasta, e não há
  // por que fazer a pessoa esperar dois minutos por um clique que não fez nada.
  it("⚠⚠ devolve a vez quando as duas etapas estavam ocupadas", async () => {
    mocks.sincronizar.mockResolvedValue({ entregas: { estado: "ocupada" }, encerrados: { estado: "ocupada" } });
    const j = await (await POST()).json();
    expect(mocks.soltar).toHaveBeenCalledWith(mockPrisma, "sync-manual");
    expect(mocks.renovar).not.toHaveBeenCalled();
    expect(j.mensagem).toMatch(/já havia uma sincronização em andamento/i);
  });

  // ⚠ Bookkeeping não desfaz sincronização: o que foi gravado no Omie-espelho já está gravado.
  it("⚠ falha ao auditar não derruba a resposta", async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error("banco de auditoria fora"));
    expect((await POST()).status).toBe(200);
  });

  // ⚠ Fazer a pessoa esperar 2 min por uma rodada que explodiu seria punir o usuário pelo defeito.
  it("⚠ erro inesperado devolve 500 E devolve a vez", async () => {
    mocks.sincronizar.mockRejectedValue(new Error("pane geral"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect(mocks.soltar).toHaveBeenCalledWith(mockPrisma, "sync-manual");
  });

  it("uma etapa que falhou faz `success: false`, mas ainda conta o que a outra fez", async () => {
    mocks.sincronizar.mockResolvedValue({
      entregas: { estado: "falhou", motivo: "Omie fora do ar" },
      encerrados: { estado: "concluida", marcados: 2 },
    });
    const j = await (await POST()).json();
    expect(j.success).toBe(false);
    expect(j.mensagem).toMatch(/2 pedidos encerrados no Omie\./);
    expect(j.mensagem).toMatch(/Omie fora do ar/);
  });
});
