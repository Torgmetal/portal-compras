import { describe, it, expect } from "vitest";
import { casaOp, casaPasta, escolherPrincipal, avaliarResultado, normalizar } from "@/lib/permissoes-pastas";

describe("casaPasta — igualdade, nunca prefixo", () => {
  const pedidas = ["1. Comercial", "5. Medição", "9. Seguros"];

  it("casa a pasta pedida", () => {
    expect(casaPasta("1. Comercial", pedidas)).toBe(true);
    expect(casaPasta("9. Seguros", pedidas)).toBe(true);
  });

  it("NÃO casa pasta que apenas começa igual", () => {
    expect(casaPasta("1. Comercial Antigo", pedidas)).toBe(false);
    expect(casaPasta("9. Seguros - obsoleto", pedidas)).toBe(false);
  });

  it("ignora acento, caixa e espaço dobrado", () => {
    expect(casaPasta("5. MEDICAO", pedidas)).toBe(true);
    expect(casaPasta("  1.  comercial ", pedidas)).toBe(true);
  });

  it("não casa as pastas que ficam de fora", () => {
    for (const fora of ["2. Engenharia", "4. Expedição", "8. Qualidade", "10. Montagem"]) {
      expect(casaPasta(fora, pedidas)).toBe(false);
    }
  });
});

describe("casaOp — prefixo só em fronteira", () => {
  it("OP-1 não arrasta OP-10 nem OP-100", () => {
    expect(casaOp("OP-1 - Cliente", "OP-1")).toBe(true);
    expect(casaOp("OP-10 - Outro", "OP-1")).toBe(false);
    expect(casaOp("OP-100 - Outro", "OP-1")).toBe(false);
  });

  it("sem filtro, tudo entra", () => {
    expect(casaOp("OP-119 - Danpower", "")).toBe(true);
    expect(casaOp("OP-119 - Danpower", undefined)).toBe(true);
  });

  it("casa o nome inteiro", () => {
    expect(casaOp("OP-119 - Danpower - ENC 336", "OP-119 - Danpower - ENC 336")).toBe(true);
  });
});

describe("escolherPrincipal — ambiguidade para o lote", () => {
  const achado = (pid, titulo, tipo = 1) => ({ pid, titulo, tipo });

  it("aceita uma identidade única de usuário", () => {
    const r = escolherPrincipal([achado(42, "Leandro Guimarães - Expedição"), achado(42, "Leandro Guimarães - Expedição")]);
    expect(r.erro).toBeUndefined();
    expect(r.principal.pid).toBe(42);
  });

  it("recusa quando o nome casa duas pessoas diferentes", () => {
    const r = escolherPrincipal([achado(42, "Leandro Guimarães"), achado(77, "Leandro Souza")]);
    expect(r.principal).toBeUndefined();
    expect(r.erro).toMatch(/2 identidades/);
  });

  it("recusa grupo — remover grupo tira o acesso de todos os membros", () => {
    const r = escolherPrincipal([achado(9, "Expedição", 8)]);
    expect(r.principal).toBeUndefined();
    expect(r.erro).toMatch(/não é um usuário/);
  });

  it("recusa quando ninguém casou", () => {
    expect(escolherPrincipal([]).erro).toMatch(/nenhum principal/);
  });
});

describe("avaliarResultado — só quem tem papel real conta", () => {
  const p = (titulo, real) => ({ titulo, real });

  it("aprova quando some só o alvo", () => {
    const antes = { 1: p("Vitor", "Controle Total"), 2: p("Patrícia", "Colaboração"), 42: p("Leandro", "Colaboração") };
    const depois = { 1: p("Vitor", "Controle Total"), 2: p("Patrícia", "Colaboração") };
    expect(avaliarResultado(antes, depois, 42)).toMatchObject({ ok: true, sumiu: true, perdidos: [], novos: [] });
  });

  it("aprova a queda em massa de 'Acesso Limitado' — não é perda de acesso", () => {
    const antes = { 1: p("Vitor", "Controle Total"), 42: p("Leandro", "Colaboração") };
    for (let i = 100; i < 131; i++) antes[i] = p(`Fulano ${i}`, ""); // só Acesso Limitado
    const depois = { 1: p("Vitor", "Controle Total") };
    expect(avaliarResultado(antes, depois, 42).ok).toBe(true);
  });

  it("reprova quando outra pessoa perde o papel", () => {
    const antes = { 1: p("Vitor", "Controle Total"), 2: p("Patrícia", "Colaboração"), 42: p("Leandro", "Colaboração") };
    const depois = { 1: p("Vitor", "Controle Total") };
    const r = avaliarResultado(antes, depois, 42);
    expect(r.ok).toBe(false);
    expect(r.perdidos).toEqual(["Patrícia"]);
  });

  it("reprova quando o papel de outro muda", () => {
    const antes = { 2: p("Patrícia", "Colaboração"), 42: p("Leandro", "Colaboração") };
    const depois = { 2: p("Patrícia", "Leitura"), 42: undefined };
    delete depois[42];
    expect(avaliarResultado(antes, depois, 42).perdidos).toEqual(["Patrícia"]);
  });

  it("reprova quando aparece alguém novo com papel real", () => {
    const antes = { 42: p("Leandro", "Colaboração") };
    const depois = { 7: p("Estranho", "Controle Total") };
    const r = avaliarResultado(antes, depois, 42);
    expect(r.ok).toBe(false);
    expect(r.novos).toEqual(["Estranho"]);
  });

  it("reprova quando o alvo continua lá", () => {
    const antes = { 42: p("Leandro", "Colaboração") };
    expect(avaliarResultado(antes, antes, 42)).toMatchObject({ ok: false, sumiu: false });
  });
});

describe("normalizar", () => {
  it("tira acento e normaliza espaços", () => {
    expect(normalizar("  5.  MEDIÇÃO ")).toBe("5. medicao");
  });
});
