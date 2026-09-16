// Papéis fixos, palavras do cliente (16/09/2026).
import { describe, it, expect } from "vitest";
import { termosEfetivos, rotuloDoPapel, montarRefCliente, lerListaDeCodigos, nomeClienteNormalizado, DICIONARIOS_INICIAIS } from "@/lib/referencias-cliente";

describe("termos do cliente", () => {
  it("sem dicionário valem os rótulos genéricos", () => {
    const t = termosEfetivos(null);
    expect(t.pedido.rotulo).toBe("Pedido");
    expect(t.tag.ativo).toBe(false);
  });
  it("o dicionário do cliente cobre só o que ele preencheu", () => {
    const t = termosEfetivos({ pedido: { rotulo: "AF" }, tag: { ativo: true } });
    expect(t.pedido.rotulo).toBe("AF");
    expect(t.pedido.exemplo).toBe("nº do pedido de compra");
    expect(t.tag.ativo).toBe(true);
    expect(t.projeto.rotulo).toBe("Projeto");
  });
  it("rotuloDoPapel: TMSA fala OC, Marko fala AF, OUTRO não tem rótulo fixo", () => {
    expect(rotuloDoPapel("PEDIDO", DICIONARIOS_INICIAIS["TMSA Tecnologia em movimentação"])).toBe("OC");
    expect(rotuloDoPapel("PEDIDO", DICIONARIOS_INICIAIS.MARKO)).toBe("AF");
    expect(rotuloDoPapel("OUTRO", null)).toBe("Outro");
  });
});

describe("montarRefCliente — o texto que os documentos imprimem", () => {
  it("projeto + pedidos com o rótulo; ITEM e TAG ficam de fora", () => {
    const refs = [
      { papel: "PROJETO", rotulo: "TPR", codigo: "TPR00751" },
      { papel: "PEDIDO", rotulo: "OC", codigo: "231297-1" },
      { papel: "TAG", rotulo: "TAG", codigo: "TC 8011" },
      { papel: "ITEM", rotulo: "ETC", codigo: "ETC-00846-16" },
    ];
    expect(montarRefCliente(refs)).toBe("TPR00751 · OC 231297-1");
  });
  it("não duplica o rótulo quando o código já vem com ele (AF 10862)", () => {
    expect(montarRefCliente([{ papel: "PEDIDO", rotulo: "AF", codigo: "AF 10862" }])).toBe("AF 10862");
  });
  it("vazio → null (o texto manual continua valendo)", () => {
    expect(montarRefCliente([])).toBeNull();
    expect(montarRefCliente([{ papel: "PEDIDO", rotulo: "OC", codigo: "  " }])).toBeNull();
  });
});

describe("lerListaDeCodigos", () => {
  it("aceita vírgula, ponto e vírgula e linha; tira repetição sem diferenciar caixa", () => {
    expect(lerListaDeCodigos("TC 8011, TC 8012;\ntc 8011\n SE-001 ")).toEqual(["TC 8011", "TC 8012", "SE-001"]);
  });
});

describe("nomeClienteNormalizado", () => {
  it("NFKC + espaços", () => {
    expect(nomeClienteNormalizado("  TMSA   Tecnologia em movimentação ")).toBe("TMSA Tecnologia em movimentação");
  });
});

import { planificarReferencias, agruparReferencias } from "@/lib/referencias-cliente";

describe("planificarReferencias — da árvore da tela às linhas do banco", () => {
  const TMSA = DICIONARIOS_INICIAIS["TMSA Tecnologia em movimentação"];
  it("fotografa o rótulo do cliente e liga ITEM/TAG ao pedido pelo índice", () => {
    const linhas = planificarReferencias({
      projetos: ["TPR00751"],
      pedidos: [{ codigo: "231297-1", valor: "1.234,50", data: "2026-09-10", itens: "ETC-00846-16", tags: [{ codigo: "TC 8011", frente: "a" }, "TC 8012"] }],
      outros: [{ rotulo: "Pacote", codigo: "N1455" }],
    }, TMSA);
    expect(linhas.map((l) => `${l.papel}:${l.rotulo}:${l.codigo}`)).toEqual([
      "PROJETO:TPR:TPR00751", "PEDIDO:OC:231297-1", "ITEM:ETC:ETC-00846-16", "TAG:TAG:TC 8011", "TAG:TAG:TC 8012", "OUTRO:Pacote:N1455",
    ]);
    expect(linhas[1].valor).toBe(1234.5);
    expect(linhas[1].data).toBeInstanceOf(Date);
    expect(linhas[3].paiIndice).toBe(1);
    expect(linhas[3].frente).toBe("A");
    expect(linhas.map((l) => l.ordem)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("pedido sem código não entra, nem os filhos dele; lista vazia devolve nada", () => {
    expect(planificarReferencias({ pedidos: [{ codigo: " ", tags: ["TC 1"] }] }, null)).toEqual([]);
    expect(planificarReferencias(null, null)).toEqual([]);
  });
});

describe("agruparReferencias — do banco à árvore", () => {
  it("remonta pedidos com itens e tags, e projetos/outros", () => {
    const linhas = [
      { id: "a", papel: "PROJETO", rotulo: "TPR", codigo: "TPR00751", ordem: 0 },
      { id: "b", papel: "PEDIDO", rotulo: "OC", codigo: "231297-1", ordem: 1, aditivoId: null },
      { id: "c", papel: "TAG", rotulo: "TAG", codigo: "TC 8011", paiId: "b", ordem: 3, frente: "A" },
      { id: "d", papel: "ITEM", rotulo: "ETC", codigo: "ETC-1", paiId: "b", ordem: 2 },
      { id: "e", papel: "OUTRO", rotulo: "CNO", codigo: "9002719538/78", ordem: 4 },
    ];
    const a = agruparReferencias(linhas);
    expect(a.projetos.map((p) => p.codigo)).toEqual(["TPR00751"]);
    expect(a.pedidos[0].itens.map((i) => i.codigo)).toEqual(["ETC-1"]);
    expect(a.pedidos[0].tags[0]).toMatchObject({ codigo: "TC 8011", frente: "A" });
    expect(a.outros[0].rotulo).toBe("CNO");
  });
});
