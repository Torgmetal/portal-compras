import { describe, it, expect } from "vitest";
import { validarLancamento, validarEdicao, mensagemDeExcesso, progresso } from "@/lib/conferencia-peca";

// ⚠⚠ ESTA É A RAZÃO DE A TELA EXISTIR. Matheus (08/09/2026): "precisa lincar a coluna quantidade
// com a L.E; caso ele digitar uma peça 3 vezes mas na lista só tem 2 vai dar erro e mensagem
// avisando". Sem esta regra, a Conferência de Peça é um bloco de notas.

const saldos = (marcas) => ({ marcas });
const marca = (m) => ({ marca: m.marca, descricao: "", previsto: m.previsto, conferido: m.conferido ?? 0,
  saldo: Math.max(0, m.previsto - (m.conferido ?? 0)), completa: (m.conferido ?? 0) >= m.previsto });

const LE = saldos([
  marca({ marca: "T97A140", previsto: 2 }),
  marca({ marca: "T97A180", previsto: 5, conferido: 3 }),
  marca({ marca: "T97-AC8", previsto: 40, conferido: 40 }),
]);

describe("validarLancamento — o teto é a Lista de Expedição", () => {
  it("aceita o que cabe", () => {
    expect(validarLancamento(LE, { marca: "T97A140", qte: 2 }).ok).toBe(true);
    expect(validarLancamento(LE, { marca: "T97A180", qte: 2 }).ok).toBe(true);
  });

  // O caso exato do pedido: 3 na mão, 2 na lista.
  it("recusa a terceira quando a lista só tem duas", () => {
    const r = validarLancamento(LE, { marca: "T97A140", qte: 3 });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("2 peças");
    expect(r.erro).toContain("T97A140");
  });

  it("soma o que já foi conferido antes, não só o lançamento", () => {
    // 3 de 5 já conferidas: 2 passam, 3 não.
    expect(validarLancamento(LE, { marca: "T97A180", qte: 2 }).ok).toBe(true);
    expect(validarLancamento(LE, { marca: "T97A180", qte: 3 }).ok).toBe(false);
  });

  it("marca já completa recusa até uma peça", () => {
    const r = validarLancamento(LE, { marca: "T97-AC8", qte: 1 });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("está completa");
  });

  // ⚠ as duas recusas são problemas diferentes no pátio e a mensagem tem que dizer qual.
  it("marca fora da lista é recusa DIFERENTE de quantidade estourada", () => {
    const fora = validarLancamento(LE, { marca: "T99Z1", qte: 1 });
    expect(fora.ok).toBe(false);
    expect(fora.erro).toContain("não está na Lista de Expedição");
    expect(fora.erro).not.toContain("já conferiu");
  });

  it("compara sem se importar com espaço nem caixa — é teclado de celular", () => {
    expect(validarLancamento(LE, { marca: " t97a140 ", qte: 1 }).ok).toBe(true);
  });

  // ⚠ grava a marca do CADASTRO, não a digitada
  it("devolve a marca como está no cadastro", () => {
    expect(validarLancamento(LE, { marca: "t97a140", qte: 1 }).item.marca).toBe("T97A140");
  });

  it.each([
    ["vazia", "", 1, "Informe a marca"],
    ["quantidade zero", "T97A140", 0, "inteiro"],
    ["quantidade negativa", "T97A140", -2, "inteiro"],
    ["quantidade quebrada", "T97A140", 1.5, "inteiro"],
    ["quantidade em texto", "T97A140", "duas", "inteiro"],
  ])("recusa %s", (_nome, m, q, trecho) => {
    const r = validarLancamento(LE, { marca: m, qte: q });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(trecho);
  });

  it("aceita quantidade numérica vinda como texto do formulário", () => {
    expect(validarLancamento(LE, { marca: "T97A140", qte: "2" }).ok).toBe(true);
  });
});

describe("validarEdicao — corrigir um lançamento que já existe", () => {
  // ⚠⚠ O BUG QUE ESTE TESTE EXISTE PARA IMPEDIR: validando contra o saldo cru, `conferido` já
  // inclui o próprio lançamento, e QUALQUER correção seria recusada — inclusive as que diminuem.
  // A tela deixaria consertar só o que não precisava de conserto.
  const cheia = saldos([marca({ marca: "T97A140", previsto: 10, conferido: 10 })]);
  const item = { marca: "T97A140", qte: 10 };

  it("diminuir passa, mesmo com a marca completa", () => {
    expect(validarEdicao(cheia, item, 3).ok).toBe(true);
    expect(validarEdicao(cheia, item, 1).ok).toBe(true);
  });

  it("manter o mesmo número passa", () => {
    expect(validarEdicao(cheia, item, 10).ok).toBe(true);
  });

  it("aumentar até o previsto passa; além dele, não", () => {
    const parcial = saldos([marca({ marca: "T97A140", previsto: 10, conferido: 4 })]);
    const de4 = { marca: "T97A140", qte: 4 };
    expect(validarEdicao(parcial, de4, 10).ok).toBe(true);
    const r = validarEdicao(parcial, de4, 11);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("T97A140");
  });

  // ⚠ o desconto é SÓ do próprio lançamento; o que OUTROS lançaram continua ocupando o saldo.
  it("não devolve o que outro lançamento da mesma marca já ocupou", () => {
    // previsto 10, conferido 10 = 6 deste item + 4 de outro
    const s = saldos([marca({ marca: "T97A140", previsto: 10, conferido: 10 })]);
    const meu = { marca: "T97A140", qte: 6 };
    expect(validarEdicao(s, meu, 6).ok).toBe(true);
    expect(validarEdicao(s, meu, 7).ok).toBe(false);   // 4 do outro + 7 = 11 > 10
  });

  it("não mexe no saldo das outras marcas", () => {
    const s = saldos([
      marca({ marca: "A", previsto: 5, conferido: 5 }),
      marca({ marca: "B", previsto: 5, conferido: 5 }),
    ]);
    expect(validarEdicao(s, { marca: "A", qte: 5 }, 5).ok).toBe(true);
    expect(validarEdicao(s, { marca: "A", qte: 5 }, 5).item.marca).toBe("A");
    // B continua cheia
    expect(validarLancamento(s, { marca: "B", qte: 1 }).ok).toBe(false);
  });

  it.each([[0], [-1], [1.5]])("recusa quantidade %s", (q) => {
    expect(validarEdicao(cheia, item, q).ok).toBe(false);
  });
});

describe("mensagemDeExcesso — a frase que aparece no celular", () => {
  it("diz quanto ainda cabe, no singular certo", () => {
    expect(mensagemDeExcesso(marca({ marca: "X", previsto: 2, conferido: 1 }), 3))
      .toBe("X: a Lista de Expedição tem 2 peças e você já conferiu 1. Cabe mais 1 peça, não 3.");
  });

  it("uma peça só na lista não vira \"1 peças\"", () => {
    expect(mensagemDeExcesso(marca({ marca: "Y", previsto: 1, conferido: 1 }), 1))
      .toContain("tem 1 peça e");
  });
});

describe("progresso — o número do topo da tela", () => {
  it("conta peças e marcas completas", () => {
    const p = progresso(LE.marcas);
    expect(p).toMatchObject({ previsto: 47, conferido: 43, marcasCompletas: 1, marcasTotal: 3 });
    expect(p.pct).toBe(91);
  });

  it("obra vazia não divide por zero", () => {
    expect(progresso([])).toMatchObject({ previsto: 0, conferido: 0, pct: 0 });
  });
});

// ─── A MARCA QUE SAIU DA L.E. NUMA REVISÃO (14/09/2026) ──────────────────────
//
// ⚠⚠ Desde que a planilha passou a definir sozinha o conjunto de marcas, uma revisão da engenharia
// pode excluir uma marca que JÁ FOI conferida. O lançamento continua gravado — como tem de
// continuar —, mas ela não está mais em `saldosDaOP`. Sem tratamento, `validarLancamento` diria
// "não está na Lista de Expedição" e recusaria QUALQUER correção, inclusive as que DIMINUEM: quem
// quisesse desfazer o excesso ficaria preso a ele. Achado do Codex.
describe("corrigir lançamento de marca que saiu da lista", () => {
  const semAMarca = { marcas: [{ marca: "T97A140", previsto: 5, conferido: 0, saldo: 5, completa: false }] };
  const item = { marca: "105A92", qte: 3 };

  it("diminuir é permitido", () => {
    expect(validarEdicao(semAMarca, item, 1)).toMatchObject({ ok: true, foraDaLista: true });
  });

  it("manter a mesma quantidade é permitido — é o caso de corrigir só a observação", () => {
    expect(validarEdicao(semAMarca, item, 3).ok).toBe(true);
  });

  // ⚠ Não existe planejado contra o que medir o aumento: deixar crescer livre seria criar teto
  // infinito justamente onde a lista não ampara mais nada.
  it("aumentar é recusado, e a frase diz por quê", () => {
    const r = validarEdicao(semAMarca, item, 4);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("saiu da Lista de Expedição");
  });

  // ⚠ A marca que CONTINUA na lista segue pela regra de sempre — o teto é o previsto.
  it("marca que continua na lista não passa por esta saída", () => {
    const naLista = { marcas: [{ marca: "T97A140", previsto: 5, conferido: 5, saldo: 0, completa: true }] };
    expect(validarEdicao(naLista, { marca: "T97A140", qte: 5 }, 9).ok).toBe(false);
    expect(validarEdicao(naLista, { marca: "T97A140", qte: 5 }, 4).ok).toBe(true);
  });
});
