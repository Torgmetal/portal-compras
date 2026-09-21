// O botão "Sincronizar" da tela Prazos das RMs — a coordenação das duas varreduras.
//
// Matheus (17/09/2026): "para quando eu receber alguns pedidos e quiser sincronizar eu conseguir
// sem precisar esperar o cron".
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), reconciliar: vi.fn(), comTrava: vi.fn() }));
vi.mock("@/lib/omie-recebimento", () => ({ syncEntregas: mocks.sync }));
vi.mock("@/lib/omie-encerramento", () => ({ reconciliarEncerramentos: mocks.reconciliar }));
vi.mock("@/lib/cron-trava", () => ({ comTravaDeCron: mocks.comTrava }));

import {
  sincronizarPrazos, resumoDoSincronismo, deuCerto, rodouAlgo, houveMudanca, ORCAMENTO,
} from "@/lib/sincronismo-prazos";

const OK_ENTREGAS = { sincronizados: 2, processados: 9, total: 9, erros: 0, timeboxed: false };
const OK_ENCERRADOS = { marcados: 1, desmarcados: 0, indefinidos: 0, total: 30, completa: true, pulou: false, motivo: null };

beforeEach(() => {
  vi.clearAllMocks();
  // por padrão a vez está livre: a trava só repassa o trabalho
  mocks.comTrava.mockImplementation(async (_p, _job, fn) => fn());
  mocks.sync.mockResolvedValue(OK_ENTREGAS);
  mocks.reconciliar.mockResolvedValue(OK_ENCERRADOS);
});

describe("sincronizarPrazos — as duas etapas", () => {
  it("roda entregas e encerrados e relata cada uma", async () => {
    const r = await sincronizarPrazos({});
    expect(r.entregas).toMatchObject({ estado: "concluida", sincronizados: 2 });
    expect(r.encerrados).toMatchObject({ estado: "concluida", marcados: 1 });
  });

  // ⚠⚠ ESTA É A RAZÃO DE O BOTÃO EXISTIR NESTA TELA E NÃO SER O DO CRONOGRAMA: quem recebe
  // material mexe nas DUAS coisas no Omie — dá entrada na nota (entregas) e encerra o pedido
  // (encerrados). Uma etapa só corrigiria metade do que a pessoa acabou de fazer.
  it("⚠⚠ a etapa de entregas corre sob a MESMA trava do cron", async () => {
    await sincronizarPrazos({});
    expect(mocks.comTrava).toHaveBeenCalledWith(expect.anything(), "sync-entregas", expect.any(Function));
  });

  it("o caminho manual não varre NFs e só olha os pedidos sem entrega", async () => {
    await sincronizarPrazos({});
    expect(mocks.sync).toHaveBeenCalledWith({}, expect.objectContaining({ apenasPendentes: true, pularNF: true }));
  });

  // ⚠⚠ O SEGUNDO PRAZO É ABSOLUTO, NÃO "MAIS TANTO". Somar as duas janelas era o jeito de a
  // Vercel matar a rota e o navegador receber a página de erro em HTML no lugar do JSON.
  it("⚠⚠ os dois orçamentos saem do MESMO instante inicial", async () => {
    const t0 = 1_000_000;
    await sincronizarPrazos({}, { t0 });
    expect(mocks.sync.mock.calls[0][1].ateMs).toBe(t0 + ORCAMENTO.entregas);
    expect(mocks.reconciliar.mock.calls[0][1].ateMs).toBe(t0 + ORCAMENTO.total);
    expect(ORCAMENTO.total).toBeGreaterThan(ORCAMENTO.entregas);
  });

  // ⚠⚠ SÃO PESQUISAS DIFERENTES NO OMIE. Meia sincronização informada é melhor que nenhuma
  // sincronização explicada.
  it("⚠⚠ entregas falhando NÃO impede os encerrados de rodar", async () => {
    mocks.sync.mockRejectedValue(new Error("Omie fora do ar"));
    const r = await sincronizarPrazos({});
    expect(r.entregas).toEqual({ estado: "falhou", motivo: "Omie fora do ar" });
    expect(r.encerrados.estado).toBe("concluida");
    expect(mocks.reconciliar).toHaveBeenCalled();
  });

  it("encerrados falhando não apaga o que as entregas atualizaram", async () => {
    mocks.reconciliar.mockRejectedValue(new Error("pane"));
    const r = await sincronizarPrazos({});
    expect(r.entregas.sincronizados).toBe(2);
    expect(r.encerrados.estado).toBe("falhou");
  });

  it("vez tomada na etapa de entregas vira `ocupada`, não erro", async () => {
    mocks.comTrava.mockResolvedValue(null);
    const r = await sincronizarPrazos({});
    expect(r.entregas).toEqual({ estado: "ocupada" });
    expect(deuCerto(r)).toBe(true);
  });

  it("reconciliação pulada pela própria trava também vira `ocupada`", async () => {
    mocks.reconciliar.mockResolvedValue({ ...OK_ENCERRADOS, pulou: true });
    const r = await sincronizarPrazos({});
    expect(r.encerrados.estado).toBe("ocupada");
  });

  it("timebox das entregas vira `parcial`", async () => {
    mocks.sync.mockResolvedValue({ ...OK_ENTREGAS, timeboxed: true });
    expect((await sincronizarPrazos({})).entregas.estado).toBe("parcial");
  });

  // ⚠ Coleta incompleta é `parcial`, nunca sucesso mudo: nessa rodada nada foi desmarcado de
  // propósito, e quem clicou precisa saber que o retrato do Omie veio pela metade.
  it("⚠ coleta incompleta dos encerrados vira `parcial`", async () => {
    mocks.reconciliar.mockResolvedValue({ ...OK_ENCERRADOS, completa: false, motivo: "tempo esgotado" });
    expect((await sincronizarPrazos({})).encerrados.estado).toBe("parcial");
  });
});

describe("rodouAlgo — quando o intervalo mínimo NÃO foi gasto", () => {
  // ⚠ Nada rodou porque os dois crons estavam na vez? Nenhuma chamada ao Omie foi gasta, e não há
  // por que fazer a pessoa esperar dois minutos por um clique que não fez nada.
  it("⚠ as DUAS ocupadas significa que nenhuma chamada ao Omie foi gasta", async () => {
    mocks.comTrava.mockResolvedValue(null);
    mocks.reconciliar.mockResolvedValue({ ...OK_ENCERRADOS, pulou: true });
    expect(rodouAlgo(await sincronizarPrazos({}))).toBe(false);
  });

  it("uma só ocupada ainda é rodada gasta", async () => {
    mocks.comTrava.mockResolvedValue(null);
    expect(rodouAlgo(await sincronizarPrazos({}))).toBe(true);
  });
});

describe("resumoDoSincronismo — o que a tela lê", () => {
  const r = (entregas, encerrados) => ({ entregas, encerrados });

  // ⚠ "Nada mudou" é resposta legítima e precisa ser dita com todas as letras — sem ela, quem
  // clica e vê a mesma tela conclui que o botão não funciona e clica de novo.
  it("⚠ diz explicitamente que nada mudou", () => {
    expect(resumoDoSincronismo(r({ estado: "concluida" }, { estado: "concluida" })))
      .toBe("Nada mudou desde a última sincronização.");
  });

  it("conta o que mudou, em português e no plural certo", () => {
    expect(resumoDoSincronismo(r(
      { estado: "concluida", sincronizados: 1 },
      { estado: "concluida", marcados: 3 },
    ))).toBe("1 entrega atualizada · 3 pedidos encerrados no Omie.");
  });

  it("as duas ocupadas dizem para tentar de novo, sem fingir que rodou", () => {
    expect(resumoDoSincronismo(r({ estado: "ocupada" }, { estado: "ocupada" })))
      .toMatch(/já havia uma sincronização em andamento/i);
  });

  // ⚠ O aviso vem DEPOIS do que mudou, nunca no lugar: rodada pela metade que atualizou 3
  // entregas atualizou 3 entregas.
  it("⚠ rodada parcial mantém o que mudou na frente do aviso", () => {
    const t = resumoDoSincronismo(r({ estado: "parcial", sincronizados: 3 }, { estado: "concluida" }));
    expect(t).toMatch(/^3 entregas atualizadas\./);
    expect(t).toMatch(/rodada parcial/);
  });

  it("a falha aparece com o motivo, não como silêncio", () => {
    expect(resumoDoSincronismo(r({ estado: "falhou", motivo: "Omie fora do ar" }, { estado: "concluida" })))
      .toMatch(/entregas: Omie fora do ar/);
  });
});

describe("houveMudanca", () => {
  it("é o que separa 'pronto' de 'nada mudou' na tela", () => {
    expect(houveMudanca({ entregas: {}, encerrados: {} })).toBe(false);
    expect(houveMudanca({ entregas: { sincronizados: 1 }, encerrados: {} })).toBe(true);
    expect(houveMudanca({ entregas: {}, encerrados: { desmarcados: 2 } })).toBe(true);
  });
});
