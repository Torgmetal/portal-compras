import { describe, it, expect } from "vitest";
import { linhaDoTempo, previsaoAtual, ETAPAS_VALIDAS, rotuloEtapa } from "@/lib/acompanhamento-pedido";

// ⚠⚠ O "HOJE" É FIXO NESTA SUÍTE (24/09/2026). Desde que etapa com data futura passou a ser PREVISÃO,
// `linhaDoTempo` depende do dia — e esta suíte, escrita em 16/09, tinha "material recebido em 25/09"
// como coisa passada. Virou amanhã, e o teste de atraso quebrou sozinho. Teste que depende do
// relógio da parede é teste que muda de sentido sem ninguém mexer no código.
const HOJE = { hoje: "2026-09-30" };

// ⚠⚠ Matheus (16/09/2026) quer controlar, depois que o pedido vai pro Omie, se o material foi
// recebido / encaminhado para obra / liberado para coleta DENTRO DO PRAZO ESTIMADO. A linha do
// tempo junta quatro fontes que já viviam separadas — criação, prazo original, remarcações
// (`PrazoHistorico`) e as etapas lançadas à mão — e é a junção que responde a pergunta.

const PEDIDO = {
  createdAt: "2026-09-01T10:00:00.000Z",
  numeroPedido: "1234",
  prazoEntregaPrevisto: "2026-09-20T00:00:00.000Z",
  prazoOriginal: "2026-09-15T00:00:00.000Z",
  prazoHistorico: [],
  acompanhamentos: [],
};

describe("previsaoAtual", () => {
  it("sem remarcação, vale o prazo previsto do pedido", () => {
    expect(previsaoAtual(PEDIDO)).toBe("2026-09-20T00:00:00.000Z");
  });

  it("⚠ com remarcações, vale a MAIS RECENTE — não a última posição do array", () => {
    const p = { ...PEDIDO, prazoHistorico: [
      { id: "h2", criadoEm: "2026-09-10T00:00:00.000Z", prazoNovo: "2026-09-30T00:00:00.000Z" },
      { id: "h1", criadoEm: "2026-09-05T00:00:00.000Z", prazoNovo: "2026-09-25T00:00:00.000Z" },
    ] };
    expect(previsaoAtual(p)).toBe("2026-09-30T00:00:00.000Z");
  });

  it("pedido sem prazo nenhum devolve null, não uma data inventada", () => {
    expect(previsaoAtual({ prazoHistorico: [] })).toBe(null);
    expect(previsaoAtual(null)).toBe(null);
  });
});

describe("linhaDoTempo — a ordem e as fontes", () => {
  it("junta criação, remarcação e etapa, do mais antigo para o mais recente", () => {
    const p = {
      ...PEDIDO,
      prazoHistorico: [{ id: "h1", criadoEm: "2026-09-08T00:00:00.000Z", prazoAnterior: "2026-09-15T00:00:00.000Z", prazoNovo: "2026-09-25T00:00:00.000Z", motivo: "fornecedor atrasou" }],
      acompanhamentos: [{ id: "a1", etapa: "LIBERADO_COLETA", data: "2026-09-24T00:00:00.000Z", observacao: "retirar com a transportadora" }],
    };
    const { eventos } = linhaDoTempo(p, HOJE);
    expect(eventos.map((e) => e.tipo)).toEqual(["pedido", "prazo", "etapa"]);
    expect(eventos[1].detalhe).toContain("de 2026-09-15 para 2026-09-25 fornecedor atrasou");
    expect(eventos[2].titulo).toBe("Liberado para coleta");
  });

  it("duas etapas no MESMO dia saem na ordem natural do processo", () => {
    const p = { ...PEDIDO, acompanhamentos: [
      { id: "a2", etapa: "MATERIAL_RECEBIDO", data: "2026-09-19T00:00:00.000Z" },
      { id: "a1", etapa: "LIBERADO_COLETA", data: "2026-09-19T00:00:00.000Z" },
    ] };
    expect(linhaDoTempo(p, HOJE).eventos.filter((e) => e.tipo === "etapa").map((e) => e.etapa))
      .toEqual(["LIBERADO_COLETA", "MATERIAL_RECEBIDO"]);
  });

  it("⚠ a mesma etapa pode acontecer duas vezes — entrega em duas levas", () => {
    const p = { ...PEDIDO, acompanhamentos: [
      { id: "a1", etapa: "ENCAMINHADO_OBRA", data: "2026-09-19T00:00:00.000Z", observacao: "metade" },
      { id: "a2", etapa: "ENCAMINHADO_OBRA", data: "2026-09-26T00:00:00.000Z", observacao: "restante" },
    ] };
    expect(linhaDoTempo(p, HOJE).eventos.filter((e) => e.etapa === "ENCAMINHADO_OBRA")).toHaveLength(2);
  });
});

describe("linhaDoTempo — o recebimento vem de duas origens que não concordam", () => {
  it("o carimbo do Omie entra quando ninguém lançou à mão", () => {
    const p = { ...PEDIDO, statusEntrega: "ENTREGUE", dataEntregaReal: "2026-09-18T00:00:00.000Z" };
    const recebido = linhaDoTempo(p, HOJE).eventos.find((e) => e.etapa === "MATERIAL_RECEBIDO");
    expect(recebido.detalhe).toBe("pela integração do Omie");
    expect(recebido.automatico).toBe(true);
  });

  it("⚠⚠ mas NÃO aparece duas vezes quando alguém lançou à mão", () => {
    const p = {
      ...PEDIDO,
      statusEntrega: "ENTREGUE",
      dataEntregaReal: "2026-09-18T00:00:00.000Z",
      acompanhamentos: [{ id: "a1", etapa: "MATERIAL_RECEBIDO", data: "2026-09-19T00:00:00.000Z", registradoPor: { name: "Ana" } }],
    };
    const recebidos = linhaDoTempo(p, HOJE).eventos.filter((e) => e.etapa === "MATERIAL_RECEBIDO");
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].detalhe).toContain("Ana");
  });

  it("statusEntrega PARCIAL sem data não inventa chegada", () => {
    const p = { ...PEDIDO, statusEntrega: "PARCIAL", dataEntregaReal: null };
    expect(linhaDoTempo(p, HOJE).eventos.some((e) => e.etapa === "MATERIAL_RECEBIDO")).toBe(false);
  });
});

describe("linhaDoTempo — chegou dentro do prazo estimado?", () => {
  it("chegou 1 dia depois da previsão", () => {
    const p = { ...PEDIDO, acompanhamentos: [{ id: "a1", etapa: "MATERIAL_RECEBIDO", data: "2026-09-21T00:00:00.000Z" }] };
    expect(linhaDoTempo(p, HOJE).atrasoDias).toBe(1);
  });

  it("chegou 2 dias antes — o número é negativo, não zero", () => {
    const p = { ...PEDIDO, acompanhamentos: [{ id: "a1", etapa: "MATERIAL_RECEBIDO", data: "2026-09-18T00:00:00.000Z" }] };
    expect(linhaDoTempo(p, HOJE).atrasoDias).toBe(-2);
  });

  it("⚠ compara com a previsão REMARCADA, não com a original", () => {
    const p = {
      ...PEDIDO,
      prazoHistorico: [{ id: "h1", criadoEm: "2026-09-08T00:00:00.000Z", prazoNovo: "2026-09-25T00:00:00.000Z" }],
      acompanhamentos: [{ id: "a1", etapa: "MATERIAL_RECEBIDO", data: "2026-09-25T00:00:00.000Z" }],
    };
    expect(linhaDoTempo(p, HOJE).atrasoDias).toBe(0);
  });

  it("⚠⚠ sem chegada não existe atraso — seria um número que cresce sozinho todo dia", () => {
    expect(linhaDoTempo(PEDIDO, HOJE).atrasoDias).toBe(null);
    expect(linhaDoTempo({ ...PEDIDO, acompanhamentos: [{ id: "a1", etapa: "LIBERADO_COLETA", data: "2026-09-19T00:00:00.000Z" }] }, HOJE).atrasoDias).toBe(null);
  });

  it("chegou mas o pedido nunca teve previsão: sem base de comparação, null", () => {
    const p = { createdAt: PEDIDO.createdAt, prazoHistorico: [], acompanhamentos: [{ id: "a1", etapa: "MATERIAL_RECEBIDO", data: "2026-09-21T00:00:00.000Z" }] };
    expect(linhaDoTempo(p, HOJE).atrasoDias).toBe(null);
  });
});

describe("as etapas", () => {
  it("são as três que o Matheus pediu", () => {
    expect(ETAPAS_VALIDAS).toEqual(["LIBERADO_COLETA", "ENCAMINHADO_OBRA", "MATERIAL_RECEBIDO"]);
    expect(rotuloEtapa("ENCAMINHADO_OBRA")).toBe("Encaminhado para obra");
  });

  it("etapa desconhecida não quebra a tela — mostra a chave crua", () => {
    expect(rotuloEtapa("RETIDO_PORTARIA")).toBe("RETIDO_PORTARIA");
  });

  it("pedido vazio devolve uma linha do tempo vazia, não um erro", () => {
    expect(linhaDoTempo({})).toMatchObject({ eventos: [], previsao: null, atrasoDias: null });
    expect(linhaDoTempo(null).eventos).toEqual([]);
  });
});

// ⚠⚠ O "SEM PRAZO" QUE NÃO ERA SEM PRAZO. Matheus (16/09/2026), olhando a tela de Prazos: "tem
// algumas em cinza SEM PRAZO, mas tem prazo que o fornecedor colocou e foi para o pedido do Omie,
// porque estão sem?" — estava certo. O prazo que o fornecedor informa item a item ficava em
// `CotacaoItem.prazoEntrega`, e só a tela de Entregas o lia. A de Prazos dizia "sem prazo" sobre o
// mesmo pedido. O caso real é o 2077 (Pizzinatto): 15/10/2026 nos 19 itens vencedores e
// `prazoEntregaPrevisto` nulo.
describe("previsaoAtual — o prazo dos itens da cotação é a última fonte", () => {
  const comItens = (itens) => ({ cotacao: { itens } });

  it("⚠⚠ pedido sem prazo próprio usa o que o fornecedor informou nos itens", () => {
    const p = comItens([{ vencedor: true, prazoEntrega: "2026-10-15T00:00:00.000Z" }]);
    expect(previsaoAtual(p)).toEqual(new Date("2026-10-15T00:00:00.000Z"));
  });

  it("⚠ entre vários itens vale o MAIS TARDIO — o pedido só fecha quando o último chega", () => {
    const p = comItens([
      { vencedor: true, prazoEntrega: "2026-10-01T00:00:00.000Z" },
      { vencedor: true, prazoEntrega: "2026-10-20T00:00:00.000Z" },
      { vencedor: true, prazoEntrega: "2026-10-10T00:00:00.000Z" },
    ]);
    expect(previsaoAtual(p)).toEqual(new Date("2026-10-20T00:00:00.000Z"));
  });

  it("⚠ item PERDEDOR não conta — ele não virou pedido", () => {
    const p = comItens([
      { vencedor: true, prazoEntrega: "2026-10-05T00:00:00.000Z" },
      { vencedor: false, prazoEntrega: "2026-12-31T00:00:00.000Z" },
    ]);
    expect(previsaoAtual(p)).toEqual(new Date("2026-10-05T00:00:00.000Z"));
  });

  it("⚠⚠ o prazo do PEDIDO ganha do prazo dos itens — quem sabe mais manda", () => {
    const p = { prazoEntregaPrevisto: "2026-09-01T00:00:00.000Z",
                ...comItens([{ vencedor: true, prazoEntrega: "2026-10-15T00:00:00.000Z" }]) };
    expect(previsaoAtual(p)).toBe("2026-09-01T00:00:00.000Z");
  });

  it("⚠⚠ e a remarcação ganha dos dois", () => {
    const p = {
      prazoHistorico: [{ prazoNovo: "2026-11-30T00:00:00.000Z", criadoEm: "2026-09-10" }],
      prazoEntregaPrevisto: "2026-09-01T00:00:00.000Z",
      ...comItens([{ vencedor: true, prazoEntrega: "2026-10-15T00:00:00.000Z" }]),
    };
    expect(previsaoAtual(p)).toBe("2026-11-30T00:00:00.000Z");
  });

  it("sem nenhuma das três fontes continua sendo sem prazo", () => {
    expect(previsaoAtual({ cotacao: { itens: [] } })).toBe(null);
    expect(previsaoAtual({})).toBe(null);
    expect(previsaoAtual(null)).toBe(null);
  });

  it("⚠ item vencedor SEM data não inventa prazo", () => {
    expect(previsaoAtual(comItens([{ vencedor: true, prazoEntrega: null }]))).toBe(null);
  });
});

// ⚠⚠ A CONTA JÁ EXISTIA E SÓ NÃO ERA GUARDADA. Matheus (16/09/2026): "a data de entrega quando for
// apenas texto converter para dias úteis pegando da data de criação do pedido, acredito que já é
// feito essa lógica para enviar a data de entrega dentro do pedido do Omie". Exatamente:
// `gerar-pedidos` calcula com `previsaoEntregaDDMMYYYY` e manda em `dDtPrevisao`, mas nunca gravava
// em `prazoEntregaPrevisto`. Nove pedidos do acervo diziam "Sem prazo" sobre uma data que o próprio
// portal tinha escolhido e informado ao Omie.
describe("previsaoAtual — o prazo em palavras, contado da criação do pedido", () => {
  // 01/09/2026 é uma terça-feira.
  const criado = "2026-09-01T12:00:00.000Z";
  const comTexto = (obs) => ({ createdAt: criado, cotacao: { observacao: obs, itens: [] } });
  const iso = (d) => new Date(d).toISOString().slice(0, 10);

  it("⚠⚠ '18 dias úteis' vira data, contada da criação do pedido", () => {
    // 18 dias úteis a partir de terça 01/09 → 25/09 (pula 4 fins de semana).
    expect(iso(previsaoAtual(comTexto("Prazo de entrega: 18 dias úteis | Pagamento: 30")))).toBe("2026-09-25");
  });

  it("⚠ dias CORRIDOS não pulam fim de semana", () => {
    expect(iso(previsaoAtual(comTexto("Prazo de entrega: 10 dias")))).toBe("2026-09-11");
  });

  it("'2 semanas' conta 14 dias corridos", () => {
    expect(iso(previsaoAtual(comTexto("Prazo de entrega: 2 semanas")))).toBe("2026-09-15");
  });

  it("⚠⚠ a base é a CRIAÇÃO, não hoje — senão a previsão andaria sozinha todo dia", () => {
    const antigo = { createdAt: "2026-06-01T12:00:00.000Z", cotacao: { observacao: "Prazo de entrega: 5 dias", itens: [] } };
    expect(iso(previsaoAtual(antigo))).toBe("2026-06-06");
  });

  it("⚠ data explícita na observação é usada como está", () => {
    expect(iso(previsaoAtual(comTexto("Prazo de entrega: 15/10/2026")))).toBe("2026-10-15");
  });

  it("⚠⚠ é a ÚLTIMA fonte: data no item do fornecedor ganha do texto", () => {
    const p = { createdAt: criado, cotacao: {
      observacao: "Prazo de entrega: 90 dias",
      itens: [{ vencedor: true, prazoEntrega: "2026-09-10T00:00:00.000Z" }],
    } };
    expect(previsaoAtual(p)).toEqual(new Date("2026-09-10T00:00:00.000Z"));
  });

  it("⚠ e o prazo do próprio pedido ganha de todas", () => {
    const p = { createdAt: criado, prazoEntregaPrevisto: "2026-08-15T00:00:00.000Z",
                cotacao: { observacao: "Prazo de entrega: 90 dias", itens: [] } };
    expect(previsaoAtual(p)).toBe("2026-08-15T00:00:00.000Z");
  });

  it("observação sem prazo nenhum continua sem previsão", () => {
    expect(previsaoAtual(comTexto("Pagamento: 30 dias | sem frete"))).toBe(null);
    expect(previsaoAtual(comTexto(""))).toBe(null);
  });

  it("⚠ prazo em texto sem número não inventa data", () => {
    expect(previsaoAtual(comTexto("Prazo de entrega: a combinar"))).toBe(null);
  });

  it("⚠ pedido sem data de criação não tem de onde contar", () => {
    expect(previsaoAtual({ cotacao: { observacao: "Prazo de entrega: 5 dias", itens: [] } })).toBe(null);
  });
});
