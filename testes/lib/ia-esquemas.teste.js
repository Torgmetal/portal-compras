import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

import {
  ESQUEMA_PESO_PROJETO, esquemaProdutividade, ESQUEMA_PARAFUSOS, ESQUEMA_ACESSORIOS, ESQUEMA_KICKOFF,
  ESQUEMA_RETORNO_TERCEIRO, TIPOS_MATERIAL, TIPOS_PARAFUSO, CATEGORIAS_ACESSORIO,
} from "@/lib/ia-esquemas";
import { ESQUEMA_TAREFAS } from "@/lib/extrair-tarefas";
import { ESQUEMA_DOC } from "@/lib/extrair-doc-qualidade";
import { ESQUEMA_SUGESTOES } from "@/lib/auditoria-sugestao";
import { ESQUEMA_ATA } from "@/lib/extrair-ata";
import { ESQUEMA_ATIVIDADES } from "@/lib/extrair-atividades-ata";
import { ESQUEMA_RNC_CLIENTE } from "@/lib/extrair-rnc-cliente";
import { ESQUEMA_CLASSIFICACAO } from "@/lib/classificar-email-ia";
import { ESQUEMA_BOLETIM } from "@/lib/extrair-boletim";
import { ESQUEMA_CALIBRACAO } from "@/lib/extrair-calibracao";
import { ESQUEMA_PLP } from "@/lib/extrair-plp";

// A API recusa (400) o schema que sai do subconjunto de JSON Schema que ela compila, e impõe tetos
// por requisição: 24 campos opcionais e 16 campos com união de tipos. Estes testes fazem a conta de
// cada schema do portal — o erro aparece aqui, e não na tela de quem subiu o documento.

const TODOS = {
  ESQUEMA_PESO_PROJETO, ESQUEMA_PRODUTIVIDADE: esquemaProdutividade(["TRELICADA_LEVE", "ALMA_CHEIA_MEDIA"]),
  ESQUEMA_PARAFUSOS, ESQUEMA_ACESSORIOS, ESQUEMA_KICKOFF, ESQUEMA_RETORNO_TERCEIRO,
  ESQUEMA_TAREFAS, ESQUEMA_DOC, ESQUEMA_SUGESTOES, ESQUEMA_ATA, ESQUEMA_ATIVIDADES, ESQUEMA_RNC_CLIENTE,
  ESQUEMA_CLASSIFICACAO, ESQUEMA_BOLETIM, ESQUEMA_CALIBRACAO, ESQUEMA_PLP,
};

const NAO_SUPORTADAS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems"];

function percorrer(no, visitar, caminho = "$") {
  visitar(no, caminho);
  for (const [campo, filho] of Object.entries(no.properties || {})) percorrer(filho, visitar, `${caminho}.${campo}`);
  if (no.items) percorrer(no.items, visitar, `${caminho}[]`);
  (no.anyOf || []).forEach((filho, i) => percorrer(filho, visitar, `${caminho}|${i}`));
}

describe("os schemas das respostas da IA cabem no que a API compila", () => {
  it.each(Object.entries(TODOS))("%s", (nome, esquema) => {
    let unioes = 0;
    let opcionais = 0;
    percorrer(esquema, (no, caminho) => {
      if (no.type === "object") {
        expect(no.additionalProperties, `${caminho}: objeto aberto`).toBe(false);
        opcionais += Object.keys(no.properties || {}).filter((c) => !(no.required || []).includes(c)).length;
      }
      if (Array.isArray(no.type) || no.anyOf) unioes += 1;
      for (const chave of NAO_SUPORTADAS) expect(no, `${caminho} usa "${chave}"`).not.toHaveProperty(chave);
    });
    expect(unioes, `${nome}: campos com união de tipos`).toBeLessThanOrEqual(16);
    expect(opcionais, `${nome}: campos opcionais`).toBeLessThanOrEqual(24);
  });
});

describe("as listas de tipos dos schemas são as do banco", () => {
  const schemaPrisma = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const enumDoBanco = (nome) =>
    schemaPrisma.match(new RegExp(`enum ${nome} \\{([\\s\\S]*?)\\}`))[1]
      .split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);

  it("valor fora do enum estouraria ao gravar o item que a IA leu", () => {
    expect(TIPOS_MATERIAL).toEqual(enumDoBanco("TipoMaterial"));
    expect(TIPOS_PARAFUSO).toEqual(enumDoBanco("TipoParafuso"));
    expect(CATEGORIAS_ACESSORIO).toEqual(enumDoBanco("CategoriaAcessorio"));
  });
});
