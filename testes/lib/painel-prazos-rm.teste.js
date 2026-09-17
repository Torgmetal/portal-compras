import { describe, it, expect } from "vitest";
import { agruparPorRM, situacaoDoPedido, situacaoDaRM, resumoPorSituacao, rotuloSituacao, filtrarLinhas } from "@/lib/painel-prazos-rm";

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

// ⚠⚠ A TAG FD. Matheus (16/09/2026): "marque na listagem Prazos de RM as RMs que são Faturamento
// Direto, coloque uma TAG FD para saber quais são". Faturamento Direto é atributo do PEDIDO — o
// material vai do fornecedor direto ao cliente e nunca entra no estoque da Torg — e a RM herda a
// marca dos pedidos dela.
describe("agruparPorRM — a marca de Faturamento Direto", () => {
  const rm = { id: "rm1", numero: "T97-006-R00", tipoRM: "ENGENHARIA", op: null };
  const ped = (id, fd) => ({
    id, rm, faturamentoDireto: fd, total: 100,
    createdAt: "2026-09-01T12:00:00.000Z",
    prazoEntregaPrevisto: "2026-09-30T00:00:00.000Z",
    prazoHistorico: [], acompanhamentos: [],
  });

  it("RM cujos pedidos são todos FD é marcada TODOS", () => {
    const [l] = agruparPorRM([ped("a", true), ped("b", true)]);
    expect(l.fd).toBe("TODOS");
  });

  it("RM sem nenhum pedido FD não ganha marca", () => {
    expect(agruparPorRM([ped("a", false), ped("b", false)])[0].fd).toBe("NENHUM");
  });

  it("⚠⚠ RM MISTA é PARCIAL, não 'FD' — senão o cabeçalho diria que nada passa pela Torg", () => {
    const [l] = agruparPorRM([ped("a", true), ped("b", false)]);
    expect(l.fd).toBe("PARCIAL");
  });

  it("⚠ cada pedido carrega a própria marca, para a linha dizer QUAL deles é o direto", () => {
    const [l] = agruparPorRM([ped("a", true), ped("b", false)]);
    const porId = Object.fromEntries(l.pedidos.map((p) => [p.id, p.faturamentoDireto]));
    expect(porId).toEqual({ a: true, b: false });
  });

  it("⚠ campo ausente vira false, nunca undefined — a tela testa por verdadeiro", () => {
    const [l] = agruparPorRM([{ id: "x", rm, total: 0, createdAt: "2026-09-01", prazoHistorico: [], acompanhamentos: [] }]);
    expect(l.pedidos[0].faturamentoDireto).toBe(false);
    expect(l.fd).toBe("NENHUM");
  });
});

// ─── Pedido ENCERRADO no Omie (Matheus, 17/09/2026) ──────────────────────────
describe("pedido encerrado no Omie", () => {
  const ontem = new Date(Date.now() - 5 * 86400000);
  const encerrado = { id: "p1", createdAt: new Date("2026-01-01"), prazoEntregaPrevisto: ontem, encerradoOmieEm: new Date("2026-09-15") };

  it("sai de ATRASADO e vira ENCERRADO", () => {
    expect(situacaoDoPedido({ ...encerrado, encerradoOmieEm: null }).situacao).toBe("ATRASADO");
    expect(situacaoDoPedido(encerrado).situacao).toBe("ENCERRADO");
  });

  it("mas a CHEGADA continua ganhando — encerrar não apaga um recebimento", () => {
    const p = { ...encerrado, statusEntrega: "ENTREGUE", dataEntregaReal: new Date("2026-09-10") };
    expect(situacaoDoPedido(p).situacao).toBe("CHEGOU");
  });

  it("mantém a previsão à vista — o prazo existiu, só deixou de ser cobrado", () => {
    expect(situacaoDoPedido(encerrado).previsao).toEqual(ontem);
  });

  it("não empresta a data da RM nem conta como pendente", () => {
    const [linha] = agruparPorRM([{ ...encerrado, rm: { id: "r1", numero: "RM-1" } }]);
    expect(linha.situacao).toBe("ENCERRADO");
    expect(linha.proximaPrevisao).toBeNull();
    expect(resumoPorSituacao([linha]).pendentes).toBe(0);
  });

  it("some do filtro padrão, e reaparece em TODAS e no filtro próprio", () => {
    const linhas = agruparPorRM([{ ...encerrado, rm: { id: "r1", numero: "RM-1" } }]);
    expect(filtrarLinhas(linhas, "PENDENTES")).toHaveLength(0);
    expect(filtrarLinhas(linhas, "TODAS")).toHaveLength(1);
    expect(filtrarLinhas(linhas, "ENCERRADO")).toHaveLength(1);
  });

  it("⚠ RM MISTA continua apertando: um pedido encerrado não silencia o irmão atrasado", () => {
    const [linha] = agruparPorRM([
      { ...encerrado, rm: { id: "r1", numero: "RM-1" } },
      { id: "p2", createdAt: new Date("2026-01-01"), prazoEntregaPrevisto: ontem, rm: { id: "r1", numero: "RM-1" } },
    ]);
    expect(linha.situacao).toBe("ATRASADO");
    expect(linha.proximaPrevisao).toEqual(ontem);
    expect(resumoPorSituacao([linha]).pendentes).toBe(1);
  });

  it("⚠ encerrado SEM previsão não vira SEM_PRAZO — a RM sem prazo é que tem de aparecer", () => {
    const semPrazo = { id: "p3", createdAt: new Date("2026-01-01"), encerradoOmieEm: new Date("2026-09-15") };
    expect(situacaoDoPedido(semPrazo).situacao).toBe("ENCERRADO");
    const [linha] = agruparPorRM([
      { ...semPrazo, rm: { id: "r1", numero: "RM-1" } },
      { id: "p4", createdAt: new Date("2026-01-01"), rm: { id: "r1", numero: "RM-1" } },
    ]);
    expect(linha.situacao).toBe("SEM_PRAZO");
  });
});
