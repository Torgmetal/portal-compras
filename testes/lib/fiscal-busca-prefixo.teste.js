import { describe, it, expect, vi } from "vitest";

// ─── A BUSCA POR PREFIXO ─────────────────────────────────────────────────────
//
// ⚠⚠ `plainto_tsquery` EXIGE PALAVRA INTEIRA, E ISSO MATA UM AUTOCOMPLETE. Medido em 22/09/2026
// contra a produção: "constru" devolvia 0 resultados; `constru:*` devolve 96; `estrutur:*`, 413.
// Quem digita progressivamente passa a maior parte do tempo com uma palavra pela metade.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("server-only", () => ({}));

const { prefixoTsquery } = await import("@/lib/fiscal/consulta").then(async (m) => {
  // A função é interna; testamos a regra pelo comportamento exposto em `buscarNcm` seria custoso
  // (exige banco). Aqui ela é reexportada só para teste — ver a nota no arquivo.
  return m;
});

describe("prefixoTsquery — duas consultas, por motivos diferentes", () => {
  // ⚠⚠ O PREFIXO VAI EM **TODOS** OS TERMOS, e contra `simple`. Em `portuguese` o `:*` NÃO passa
  // pelo stemmer: "metalicas" é indexado como o radical `metal`, e `metalic:*` procura lexema
  // começando em "metalic" — nunca casa. Passar do limite do radical, digitando, zerava a lista.
  it.each([
    ["constru", "constru:*"],
    ["construções pré", "construcoes:* & pre:*"],
    ["estrutura metalic", "estrutura:* & metalic:*"],
    ["8437 partes", "8437:* & partes:*"],
  ])("%s → literal %s", (entrada, esperado) => {
    expect(prefixoTsquery(entrada).literal).toBe(esperado);
  });

  // ⚠ O ramo estemado resolve o que o literal não resolve: singular achar plural.
  it.each([
    ["constru", "constru"],
    ["construções pré", "construcoes & pre"],
    ["estrutura metalica", "estrutura & metalica"],
  ])("%s → estemado %s", (entrada, esperado) => {
    expect(prefixoTsquery(entrada).estemado).toBe(esperado);
  });

  // ⚠⚠ `to_tsquery` TEM SINTAXE PRÓPRIA (&, |, !, :, parênteses): um apóstrofo ou dois-pontos
  // digitado pelo usuário viraria ERRO DE SINTAXE no banco, não "nenhum resultado".
  it.each([
    ["o'brien", "o:* & brien:*"],
    ["pre-fabricada", "pre:* & fabricada:*"],
    ["a & b | !c", "a:* & b:* & c:*"],
    ["(x):*", "x:*"],
  ])("sanea a sintaxe do tsquery: %s", (entrada, esperado) => {
    expect(prefixoTsquery(entrada).literal).toBe(esperado);
  });

  it.each(["", "   ", "!!!", "&|"])("entrada sem termo devolve null", (v) => {
    expect(prefixoTsquery(v)).toBeNull();
  });

  // ⚠ Acento não entra: a coluna `busca` é gravada sem acento, e comparar com acento devolveria 0
  // — a mesma armadilha que já custou uma bateria inteira de busca vazia neste módulo.
  it("tira o acento dos dois lados", () => {
    expect(prefixoTsquery("PRÉ-FABRICADA").literal).toBe("pre:* & fabricada:*");
  });
});
