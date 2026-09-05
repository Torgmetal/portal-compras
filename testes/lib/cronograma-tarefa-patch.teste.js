import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cronograma-recalcular", () => ({
  calcularDefasagem: vi.fn().mockResolvedValue(3),
  addWorkdays: (d, n) => new Date(d.getTime() + n * 86400000),      // 1 dia = 1 dia, basta pro teste
  addCalendarDays: (d, n) => new Date(d.getTime() + n * 86400000),
}));

const { montarAtualizacaoDaTarefa } = await import("@/lib/cronograma-tarefa-patch");

// A tarefa como está hoje no banco. Cada teste manda só o campo que quer exercitar.
const TAREFA = {
  nome: "Montagem do pórtico",
  area: "Eixo A",
  percentualRealizado: 40,
  qtdePlanejada: 100,
  qtdeRealizada: 40,
  duracaoDias: 5,
  responsavelId: "u1",
  antecessoraIds: ["t1", "t2"],
  diasParaConcluir: null,
  esperaDe: null,
  esperaInicio: null,
  motivoBloqueio: null,
  dataLiberacao: null,
  dataInicioPrevista: new Date("2026-03-02T00:00:00.000Z"),
  dataFimPrevista: new Date("2026-03-07T00:00:00.000Z"),
  cronogramaId: "c1",
  cronograma: { id: "c1", dataBase: null, tipoDias: "DU" },
};
const montar = (entrada, tarefa = TAREFA) => montarAtualizacaoDaTarefa(entrada, tarefa, "tX");

describe("campo inalterado não entra no UPDATE", () => {
  it("mandar o mesmo nome não gera diff nem grava", async () => {
    const r = await montar({ nome: TAREFA.nome });
    expect(r.data).toEqual({});
    expect(r.diffDepois).toEqual({});
  });

  // ⚠ o teste que justifica o `sempreGrava`: `data.duracaoDias` presente é o que
  // dispara o recálculo do fim. Duração repetida não pode mexer na data.
  it("mandar a mesma duração não recomputa a data de término", async () => {
    const r = await montar({ duracaoDias: 5 });
    expect(r.data.dataFimPrevista).toBeUndefined();
    expect(r.antecessorasChanged).toBe(false);
  });

  it("responsavelId e esperaDe gravam mesmo sem mudança (comportamento original)", async () => {
    const r = await montar({ responsavelId: "u1", esperaDe: null });
    expect(r.data).toEqual({ responsavelId: "u1", esperaDe: null });
    expect(r.diffDepois).toEqual({});
  });
});

describe("campo alterado grava e vai pro AuditLog", () => {
  it.each([
    ["nome", "Outro nome"],
    ["percentualRealizado", 75],
    ["qtdePlanejada", 200],
    ["qtdeRealizada", 90],
  ])("%s", async (campo, valor) => {
    const r = await montar({ [campo]: valor });
    expect(r.data[campo]).toBe(valor);
    expect(r.diffAntes[campo]).toBe(TAREFA[campo]);
    expect(r.diffDepois[campo]).toBe(valor);
  });

  it("duração alterada dispara o recálculo E recomputa o fim", async () => {
    const r = await montar({ duracaoDias: 8 });
    expect(r.data.duracaoDias).toBe(8);
    expect(r.antecessorasChanged).toBe(true);
    expect(r.data.dataFimPrevista).toEqual(new Date("2026-03-10T00:00:00.000Z"));
  });

  it("fim explícito no mesmo request vence o recálculo pela duração", async () => {
    const r = await montar({ duracaoDias: 8, dataFimPrevista: "2026-04-01T00:00:00.000Z" });
    expect(r.data.dataFimPrevista).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("duração zero fecha a tarefa no próprio dia de início", async () => {
    const r = await montar({ duracaoDias: 0 });
    expect(r.data.dataFimPrevista).toEqual(TAREFA.dataInicioPrevista);
  });
});

describe("antecessoras", () => {
  it("a tarefa não pode ser antecessora de si mesma", async () => {
    const r = await montar({ antecessoraIds: ["t1", "tX", "t9"] });
    expect(r.data.antecessoraIds).not.toContain("tX");
  });
  it("mesma lista em outra ordem não é mudança", async () => {
    const r = await montar({ antecessoraIds: ["t2", "t1"] });
    expect(r.antecessorasChanged).toBe(false);
    expect(r.diffDepois.antecessoraIds).toBeUndefined();
  });
  it("lista diferente dispara o recálculo", async () => {
    const r = await montar({ antecessoraIds: ["t1"] });
    expect(r.antecessorasChanged).toBe(true);
    expect(r.diffAntes.antecessoraIds).toEqual(["t1", "t2"]);
  });
});

describe("bloqueio — a espera precisa de relógio (Vitor, 29/08/2026)", () => {
  it("bloquear carimba o início da espera", async () => {
    const r = await montar({ motivoBloqueio: "Aguardando liberação do cliente" });
    expect(r.data.motivoBloqueio).toBe("Aguardando liberação do cliente");
    expect(r.data.esperaInicio).toBeInstanceOf(Date);
    expect(r.antecessorasChanged).toBe(true);
  });

  it("bloquear de novo NÃO reinicia o relógio da espera em curso", async () => {
    const bloqueada = { ...TAREFA, motivoBloqueio: "Antigo", esperaInicio: new Date("2026-01-01") };
    const r = await montar({ motivoBloqueio: "Novo motivo" }, bloqueada);
    expect(r.data.esperaInicio).toBeUndefined();
  });

  it("desbloquear zera o relógio, pra próxima espera não herdar o anterior", async () => {
    const bloqueada = { ...TAREFA, motivoBloqueio: "Algo", esperaInicio: new Date("2026-01-01"), esperaDe: "CLIENTE" };
    const r = await montar({ motivoBloqueio: null }, bloqueada);
    expect(r.data.esperaInicio).toBeNull();
    expect(r.data.esperaDe).toBeNull();
  });
});

describe("término real conclui a tarefa (Vitor, 29/08/2026)", () => {
  it("informar o fim real leva o percentual a 100", async () => {
    const r = await montar({ dataFimReal: "2026-03-06T00:00:00.000Z" });
    expect(r.data.percentualRealizado).toBe(100);
    expect(r.diffDepois.percentualRealizado).toBe(100);
  });
  it("mantém dataRealizacao em sincronia com o fim real", async () => {
    const r = await montar({ dataFimReal: "2026-03-06T00:00:00.000Z" });
    expect(r.data.dataRealizacao).toEqual(r.data.dataFimReal);
  });
  it("um percentual explícito no mesmo request continua mandando", async () => {
    const r = await montar({ dataFimReal: "2026-03-06T00:00:00.000Z", percentualRealizado: 90 });
    expect(r.data.percentualRealizado).toBe(90);
  });
  it("quem já está em 100 não gera diff redundante", async () => {
    const pronta = { ...TAREFA, percentualRealizado: 100 };
    const r = await montar({ dataFimReal: "2026-03-06T00:00:00.000Z" }, pronta);
    expect(r.diffDepois.percentualRealizado).toBeUndefined();
  });
  it("dataRealizacao explícita não é sobrescrita pelo fim real", async () => {
    const r = await montar({ dataFimReal: "2026-03-06T00:00:00.000Z", dataRealizacao: "2026-03-05T00:00:00.000Z" });
    expect(r.data.dataRealizacao).toEqual(new Date("2026-03-05T00:00:00.000Z"));
  });
});

describe("data de início digitada à mão guarda a defasagem", () => {
  it("com antecessora, calcula e grava a defasagem", async () => {
    const r = await montar({ dataInicioPrevista: "2026-03-04T00:00:00.000Z" });
    expect(r.data.defasagemDias).toBe(3);
  });
  it("sem antecessora, não há defasagem a guardar", async () => {
    const solta = { ...TAREFA, antecessoraIds: [] };
    const r = await montar({ dataInicioPrevista: "2026-03-04T00:00:00.000Z" }, solta);
    expect(r.data.defasagemDias).toBeUndefined();
  });
});

describe("estimativa envelhece", () => {
  it("informar dias para concluir carimba a data da estimativa", async () => {
    const r = await montar({ diasParaConcluir: 5 });
    expect(r.data.diasParaConcluir).toBe(5);
    expect(r.data.estimativaEm).toBeInstanceOf(Date);
  });
  it("limpar a estimativa limpa o carimbo junto", async () => {
    const comEstimativa = { ...TAREFA, diasParaConcluir: 5 };
    const r = await montar({ diasParaConcluir: null }, comEstimativa);
    expect(r.data.diasParaConcluir).toBeNull();
    expect(r.data.estimativaEm).toBeNull();
  });
});

describe("área é só rótulo", () => {
  it("não gera diff nem recálculo, e vira null quando vazia", async () => {
    const r = await montar({ area: "   " });
    expect(r.data.area).toBeNull();
    expect(r.diffDepois).toEqual({});
    expect(r.antecessorasChanged).toBe(false);
  });
});

describe("corpo vazio não faz nada", () => {
  it("nenhum campo, nenhuma alteração", async () => {
    const r = await montar({});
    expect(r).toEqual({ data: {}, diffAntes: {}, diffDepois: {}, antecessorasChanged: false });
  });
});
