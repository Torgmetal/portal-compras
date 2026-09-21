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

// ─── CONCEDER ────────────────────────────────────────────────────────────────
// Matheus (16/09/2026): "igual foi feito com o usuário do Leandro para remover, mas agora
// adicionar o do Geraldo da Qualidade" nas pastas Comercial de todas as OPs.
describe("acharRoleDefId — o papel no site", () => {
  const DEFS = [
    { Id: 1073741829, Name: "Controle Total" },
    { Id: 1073741827, Name: "Colaboração" },
    { Id: 1073741826, Name: "Leitura" },
    { Id: 1073741825, Name: "Acesso Limitado" },
  ];

  it("acha pelo nome em português", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId(DEFS, "leitura")).toEqual({ id: 1073741826, nome: "Leitura" });
    expect(acharRoleDefId(DEFS, "colaboracao")).toEqual({ id: 1073741827, nome: "Colaboração" });
  });

  it("⚠ acha também num site em inglês — o nome muda com o idioma", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId([{ Id: 5, Name: "Read" }], "leitura").id).toBe(5);
    expect(acharRoleDefId([{ Id: 7, Name: "Contribute" }], "colaboracao").id).toBe(7);
  });

  it("⚠⚠ site sem o papel devolve erro, não um id chutado", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    const r = acharRoleDefId([{ Id: 1, Name: "Controle Total" }], "leitura");
    expect(r.erro).toContain("não tem o papel");
    expect(r.id).toBeUndefined();
  });

  it("papel inventado é recusado", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId(DEFS, "dono").erro).toContain("papel desconhecido");
  });
});

describe("jaTemAcesso — quem pular", () => {
  it("papel real conta como ter", async () => {
    const { jaTemAcesso } = await import("@/lib/permissoes-pastas");
    expect(jaTemAcesso({ 42: { titulo: "Geraldo", real: "Leitura" } }, 42)).toBe(true);
    expect(jaTemAcesso({ 42: { titulo: "Geraldo", real: "Leitura" } }, "42")).toBe(true);
  });

  it("⚠⚠ 'Acesso Limitado' NÃO conta — é passagem, não acesso", async () => {
    const { jaTemAcesso } = await import("@/lib/permissoes-pastas");
    expect(jaTemAcesso({ 42: { titulo: "Geraldo", papeis: "Acesso Limitado", real: "" } }, 42)).toBe(false);
  });

  it("quem não está na ACL não tem", async () => {
    const { jaTemAcesso } = await import("@/lib/permissoes-pastas");
    expect(jaTemAcesso({ 7: { real: "Leitura" } }, 42)).toBe(false);
    expect(jaTemAcesso(null, 42)).toBe(false);
  });
});

describe("avaliarConcessao — deu certo?", () => {
  const ANTES = { 7: { titulo: "Vitor", real: "Controle Total" }, 9: { titulo: "Ana", real: "Colaboração" } };

  it("o alvo entrou e ninguém mais mudou", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    const depois = { ...ANTES, 42: { titulo: "Geraldo", real: "Leitura" } };
    expect(avaliarConcessao(ANTES, depois, 42)).toMatchObject({ ok: true, entrou: true, perdidos: [], novos: [] });
  });

  it("⚠ não entrou: reprova", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    expect(avaliarConcessao(ANTES, ANTES, 42)).toMatchObject({ ok: false, entrou: false });
  });

  it("⚠⚠ entrou só com 'Acesso Limitado' reprova — passagem não é acesso", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    const depois = { ...ANTES, 42: { titulo: "Geraldo", papeis: "Acesso Limitado", real: "" } };
    expect(avaliarConcessao(ANTES, depois, 42).ok).toBe(false);
  });

  it("⚠⚠ alguém PERDEU papel no caminho: reprova e diz quem", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    const depois = { 7: { titulo: "Vitor", real: "Controle Total" }, 42: { titulo: "Geraldo", real: "Leitura" } };
    const r = avaliarConcessao(ANTES, depois, 42);
    expect(r.ok).toBe(false);
    expect(r.perdidos).toEqual(["Ana"]);
  });

  it("⚠⚠ alguém MAIS ganhou acesso: reprova — a quebra de herança só podia copiar", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    const depois = { ...ANTES, 42: { titulo: "Geraldo", real: "Leitura" }, 99: { titulo: "Estranho", real: "Colaboração" } };
    const r = avaliarConcessao(ANTES, depois, 42);
    expect(r.ok).toBe(false);
    expect(r.novos).toEqual(["Estranho"]);
  });

  it("o id circula como número e como string sem trocar o veredito", async () => {
    const { avaliarConcessao } = await import("@/lib/permissoes-pastas");
    const depois = { ...ANTES, 42: { titulo: "Geraldo", real: "Leitura" } };
    expect(avaliarConcessao(ANTES, depois, "42").ok).toBe(true);
  });
});

describe("opExcluida — tirar o molde do escopo", () => {
  it("exclui a OP nomeada", async () => {
    const { opExcluida } = await import("@/lib/permissoes-pastas");
    expect(opExcluida("OP-000 - PADRÃO", ["OP-000"])).toBe(true);
    expect(opExcluida("OP-103 - TMSA", ["OP-000"])).toBe(false);
  });

  it("⚠⚠ respeita a fronteira: --exceto=OP-1 não engole OP-10 nem OP-100", async () => {
    const { opExcluida } = await import("@/lib/permissoes-pastas");
    expect(opExcluida("OP-1 - Cliente", ["OP-1"])).toBe(true);
    expect(opExcluida("OP-10 - Outro", ["OP-1"])).toBe(false);
    expect(opExcluida("OP-100 - Outro", ["OP-1"])).toBe(false);
  });

  it("sem exceções, nada é excluído", async () => {
    const { opExcluida } = await import("@/lib/permissoes-pastas");
    expect(opExcluida("OP-000 - PADRÃO", [])).toBe(false);
    expect(opExcluida("OP-000 - PADRÃO", null)).toBe(false);
  });

  it("aceita mais de uma exceção", async () => {
    const { opExcluida } = await import("@/lib/permissoes-pastas");
    expect(opExcluida("OP-064 - Brasbio", ["OP-000", "OP-064"])).toBe(true);
  });
});

describe("⚠⚠ Colaboração NÃO é Editar", () => {
  // No SharePoint, Colaboração/Contribute mexe em ITENS; Editar/Edit mexe também na LISTA (cria e
  // apaga colunas, apaga a lista). O ensaio de 16/09/2026 resolveu "Editar" para um pedido de
  // Colaboração — promoveria o privilégio em 25 pastas sem ninguém notar.
  const DEFS = [
    { Id: 1073741827, Name: "Colaboração" },
    { Id: 1073741830, Name: "Editar" },
    { Id: 1073741826, Name: "Leitura" },
  ];

  it("colaboracao resolve Colaboração, nunca Editar", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId(DEFS, "colaboracao")).toEqual({ id: 1073741827, nome: "Colaboração" });
  });

  it("edicao é um papel à parte, pedido pelo nome", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId(DEFS, "edicao")).toEqual({ id: 1073741830, nome: "Editar" });
  });

  it("⚠ site que só tem Editar NÃO serve como Colaboração — erro, não substituição", async () => {
    const { acharRoleDefId } = await import("@/lib/permissoes-pastas");
    expect(acharRoleDefId([{ Id: 9, Name: "Editar" }], "colaboracao").erro).toContain("não tem o papel");
  });
});
