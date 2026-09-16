import { describe, it, expect } from "vitest";
import { agruparPorRM, situacaoDoPedido, situacaoDaRM, resumoPorSituacao, rotuloSituacao } from "@/lib/painel-prazos-rm";

// ⚠⚠ Matheus (16/09/2026): "preciso de uma aba fora para ver todas as RMs de uma vez, seus pedidos
// e prazos de cada", aberta pelo que aperta. A ordem NÃO é detalhe de tela: é a resposta da tela.

const HOJE = new Date("2026-09-16T12:00:00.000Z").getTime();
const dia = (d) => `2026-09-${String(d).padStart(2, "0")}T00:00:00.000Z`;

const ped = (over = {}) => ({
  id: "p1", numeroPedido: "1", fornecedorNome: "ACME", total: 100,
  createdAt: dia(1), prazoHistorico: [], acompanhamentos: [], ...over,
});

describe("situacaoDoPedido", () => {
  it("previsão no passado é atraso, com os dias que já passaram", () => {
    const r = situacaoDoPedido(ped({ prazoEntregaPrevisto: dia(10) }), HOJE);
    expect(r).toMatchObject({ situacao: "ATRASADO", diasAte: -6 });
  });

  it("previsão hoje tem casa própria — não é 'no prazo' nem 'atrasado'", () => {
    expect(situacaoDoPedido(ped({ prazoEntregaPrevisto: dia(16) }), HOJE).situacao).toBe("VENCE_HOJE");
  });

  it("dentro de 7 dias é 'próximo'; além disso, 'no prazo'", () => {
    expect(situacaoDoPedido(ped({ prazoEntregaPrevisto: dia(23) }), HOJE).situacao).toBe("PROXIMO");
    expect(situacaoDoPedido(ped({ prazoEntregaPrevisto: dia(24) }), HOJE).situacao).toBe("NO_PRAZO");
  });

  it("sem previsão nenhuma é 'sem prazo', não 'atrasado'", () => {
    expect(situacaoDoPedido(ped(), HOJE).situacao).toBe("SEM_PRAZO");
  });

  it("⚠⚠ CHEGOU ganha de previsão vencida — entregue com atraso é caso encerrado", () => {
    const p = ped({ prazoEntregaPrevisto: dia(10), acompanhamentos: [{ id: "a", etapa: "MATERIAL_RECEBIDO", data: dia(14) }] });
    const r = situacaoDoPedido(p, HOJE);
    expect(r.situacao).toBe("CHEGOU");
    // O atraso continua registrado — só não é mais pendência.
    expect(r.atrasoDias).toBe(4);
  });

  it("o carimbo do Omie também conta como chegada", () => {
    const p = ped({ prazoEntregaPrevisto: dia(10), statusEntrega: "ENTREGUE", dataEntregaReal: dia(12) });
    expect(situacaoDoPedido(p, HOJE).situacao).toBe("CHEGOU");
  });

  it("⚠ a previsão REMARCADA é a que vale para a situação", () => {
    const p = ped({
      prazoEntregaPrevisto: dia(10),
      prazoHistorico: [{ id: "h", criadoEm: dia(9), prazoNovo: dia(25) }],
    });
    expect(situacaoDoPedido(p, HOJE).situacao).toBe("NO_PRAZO");
  });

  it("etapa lançada que NÃO é recebimento não encerra o pedido", () => {
    const p = ped({ prazoEntregaPrevisto: dia(10), acompanhamentos: [{ id: "a", etapa: "LIBERADO_COLETA", data: dia(12) }] });
    expect(situacaoDoPedido(p, HOJE).situacao).toBe("ATRASADO");
  });
});

describe("situacaoDaRM — a pior manda", () => {
  it("um atrasado entre chegados deixa a RM atrasada", () => {
    expect(situacaoDaRM(["CHEGOU", "ATRASADO", "NO_PRAZO"])).toBe("ATRASADO");
  });

  it("tudo chegou: a RM fica 'Chegou' e não some da lista", () => {
    expect(situacaoDaRM(["CHEGOU", "CHEGOU"])).toBe("CHEGOU");
  });

  it("RM sem pedido nenhum não quebra", () => {
    expect(situacaoDaRM([])).toBe("SEM_PRAZO");
  });
});

describe("agruparPorRM — a ordem é a resposta da tela", () => {
  const rmA = { id: "a", numero: "RI-0010", tipoRM: "INTERNA", op: null };
  const rmB = { id: "b", numero: "RI-0002", tipoRM: "INTERNA", op: null };

  it("junta os pedidos da mesma RM numa linha só", () => {
    const linhas = agruparPorRM([
      ped({ id: "p1", rm: rmA, prazoEntregaPrevisto: dia(20) }),
      ped({ id: "p2", rm: rmA, prazoEntregaPrevisto: dia(25) }),
    ], HOJE);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pedidos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(linhas[0].total).toBe(200);
  });

  it("⚠⚠ o atrasado vem primeiro, mesmo que o número da RM seja maior", () => {
    const linhas = agruparPorRM([
      ped({ id: "p1", rm: rmB, prazoEntregaPrevisto: dia(30) }),
      ped({ id: "p2", rm: rmA, prazoEntregaPrevisto: dia(10) }),
    ], HOJE);
    expect(linhas.map((l) => l.numero)).toEqual(["RI-0010", "RI-0002"]);
  });

  it("⚠ dentro da RM, o pedido que aperta também vem primeiro", () => {
    const linhas = agruparPorRM([
      ped({ id: "tranquilo", rm: rmA, prazoEntregaPrevisto: dia(30) }),
      ped({ id: "atrasado", rm: rmA, prazoEntregaPrevisto: dia(10) }),
    ], HOJE);
    expect(linhas[0].pedidos.map((p) => p.id)).toEqual(["atrasado", "tranquilo"]);
  });

  it("⚠ a data da RM é a MAIS PRÓXIMA entre as pendentes", () => {
    const linhas = agruparPorRM([
      ped({ id: "p1", rm: rmA, prazoEntregaPrevisto: dia(30) }),
      ped({ id: "p2", rm: rmA, prazoEntregaPrevisto: dia(22) }),
    ], HOJE);
    expect(linhas[0].proximaPrevisao).toBe(dia(22));
  });

  it("⚠ pedido que já chegou não define a data da RM", () => {
    const linhas = agruparPorRM([
      ped({ id: "chegou", rm: rmA, prazoEntregaPrevisto: dia(5), acompanhamentos: [{ id: "a", etapa: "MATERIAL_RECEBIDO", data: dia(6) }] }),
      ped({ id: "aberto", rm: rmA, prazoEntregaPrevisto: dia(25) }),
    ], HOJE);
    expect(linhas[0].proximaPrevisao).toBe(dia(25));
    expect(linhas[0].situacao).toBe("NO_PRAZO");
  });

  it("⚠⚠ pedido SEM RM não é descartado — vai para um balde próprio", () => {
    const linhas = agruparPorRM([ped({ id: "solto", rm: null, prazoEntregaPrevisto: dia(20) })], HOJE);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].numero).toBe("Sem RM");
  });

  it("empate de situação e data desempata pelo número da RM, numericamente", () => {
    const linhas = agruparPorRM([
      ped({ id: "p1", rm: { id: "x", numero: "RI-0010" }, prazoEntregaPrevisto: dia(20) }),
      ped({ id: "p2", rm: { id: "y", numero: "RI-0002" }, prazoEntregaPrevisto: dia(20) }),
    ], HOJE);
    expect(linhas.map((l) => l.numero)).toEqual(["RI-0002", "RI-0010"]);
  });

  it("lista vazia devolve lista vazia, não erro", () => {
    expect(agruparPorRM([])).toEqual([]);
    expect(agruparPorRM(null)).toEqual([]);
  });

  it("leva as etapas lançadas junto, para a tela mostrar sem recalcular", () => {
    const linhas = agruparPorRM([
      ped({ rm: rmA, prazoEntregaPrevisto: dia(20), acompanhamentos: [{ id: "a", etapa: "LIBERADO_COLETA", data: dia(15) }] }),
    ], HOJE);
    expect(linhas[0].pedidos[0].etapas).toHaveLength(1);
    expect(linhas[0].pedidos[0].etapas[0].titulo).toBe("Liberado para coleta");
  });
});

describe("resumoPorSituacao", () => {
  it("conta RMs por situação, e pedidos pendentes à parte", () => {
    const linhas = agruparPorRM([
      ped({ id: "p1", rm: { id: "a", numero: "RI-1" }, prazoEntregaPrevisto: dia(10) }),
      ped({ id: "p2", rm: { id: "b", numero: "RI-2" }, prazoEntregaPrevisto: dia(30) }),
      ped({ id: "p3", rm: { id: "c", numero: "RI-3" }, acompanhamentos: [{ id: "a", etapa: "MATERIAL_RECEBIDO", data: dia(9) }] }),
    ], HOJE);
    const r = resumoPorSituacao(linhas);
    expect(r).toMatchObject({ rms: 3, pedidos: 3, pendentes: 2, ATRASADO: 1, NO_PRAZO: 1, CHEGOU: 1 });
  });

  it("sem linhas, todos os contadores são zero — não undefined", () => {
    expect(resumoPorSituacao([])).toMatchObject({ rms: 0, pedidos: 0, pendentes: 0, ATRASADO: 0 });
  });
});

describe("rótulos", () => {
  it("cada situação tem nome em português", () => {
    expect(rotuloSituacao("ATRASADO")).toBe("Atrasado");
    expect(rotuloSituacao("VENCE_HOJE")).toBe("Vence hoje");
    expect(rotuloSituacao("INVENTADA")).toBe("INVENTADA");
  });
});

// ⚠⚠ O PADRÃO ESCONDE O QUE JÁ CHEGOU, e isso veio de medir: a primeira versão da tela renderizou
// todas as RMs e saiu com 31 mil pixels — das 236 RMs com pedido, 168 já tinham chegado (71%).
describe("filtrarLinhas — por onde a tela começa", () => {
  const linhas = [
    { numero: "RI-1", situacao: "ATRASADO", pedidos: [] },
    { numero: "RI-2", situacao: "NO_PRAZO", pedidos: [] },
    { numero: "RI-3", situacao: "CHEGOU", pedidos: [] },
    { numero: "RI-4", situacao: "CHEGOU", pedidos: [] },
  ];

  it("o padrão mostra só o que ainda não chegou", async () => {
    const { filtrarLinhas } = await import("@/lib/painel-prazos-rm");
    expect(filtrarLinhas(linhas, "PENDENTES").map((l) => l.numero)).toEqual(["RI-1", "RI-2"]);
    expect(filtrarLinhas(linhas, null).map((l) => l.numero)).toEqual(["RI-1", "RI-2"]);
  });

  it("⚠ 'todas' mostra a lista inteira — o pedido era ver todas as RMs de uma vez", async () => {
    const { filtrarLinhas } = await import("@/lib/painel-prazos-rm");
    expect(filtrarLinhas(linhas, "TODAS")).toHaveLength(4);
  });

  it("⚠ o que chegou não some: tem filtro próprio", async () => {
    const { filtrarLinhas } = await import("@/lib/painel-prazos-rm");
    expect(filtrarLinhas(linhas, "CHEGOU").map((l) => l.numero)).toEqual(["RI-3", "RI-4"]);
  });

  it("filtro de uma situação mostra só ela", async () => {
    const { filtrarLinhas } = await import("@/lib/painel-prazos-rm");
    expect(filtrarLinhas(linhas, "ATRASADO").map((l) => l.numero)).toEqual(["RI-1"]);
  });

  it("lista vazia não quebra", async () => {
    const { filtrarLinhas } = await import("@/lib/painel-prazos-rm");
    expect(filtrarLinhas(null, "TODAS")).toEqual([]);
  });
});
