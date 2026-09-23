import { describe, it, expect } from "vitest";
import {
  CLASSIFICACAO, STATUS, normalizar, canonico, verbetesDoCodigo, procurarClassificacao, compararNcm,
} from "@/lib/fiscal/classificacao-produto";

// ─── O REGISTRO DE CLASSIFICAÇÃO ─────────────────────────────────────────────
//
// ⚠⚠ O QUE ESTES TESTES DEFENDEM É O QUE O MÓDULO **NÃO** FAZ. Ele não enquadra, não escolhe entre
// verbetes que se sobrepõem, não trata falha de leitura como ausência e não preenche NCM nenhum.
// A tentação em todos esses pontos é dar uma resposta útil; dar resposta útil aqui é inventar
// classificação fiscal, que é exatamente o que o briefing proíbe.

// ⚠⚠ A FIXTURE TEM A FORMA QUE O BANCO DEVOLVE, e isso não é detalhe (achado do Codex,
// 23/09/2026). A versão anterior inventava `aprovadoPor` onde a coluna se chama `aprovadoPorNome`,
// e omitia `codigoNormalizado`: o motor lia `null` em produção e a tela escrevia "—" no campo que
// dá sentido ao registro inteiro. O teste passava — ele **defendia o defeito**. Daí o
// `codigoNormalizado` sair de `canonico()`, como a gravação faz, e não de um literal escrito à mão.
const verbete = (over = {}) => {
  const codigoProduto = "codigoProduto" in over ? over.codigoProduto : null;
  return {
    id: over.id ?? "v1",
    status: STATUS.APROVADA,
    padraoDescricao: "FLANGE",
    ncm: "73072900",
    fundamento: "RGI 1 — acessório de tubulação.",
    aprovadoPorNome: "Matheus",
    aprovadoEm: "2026-09-23",
    ...over,
    codigoProduto,
    codigoNormalizado: codigoProduto ? canonico(codigoProduto) : null,
  };
};

const item = (over = {}) => ({
  codigo: "ARM000010",
  descricao: "ARMACAO DE ESTRUTURAS METALICAS",
  descricaoItem: "FLANGE MAIOR CONEXAO SAIDA - DES 71264380",
  ...over,
});

const procurar = (it, vs) => procurarClassificacao(it, verbetesDoCodigo(vs, it.codigo));

describe("a normalização é determinística e é a mesma chave do índice único", () => {
  it("colapsa acento, caixa e pontuação", () => {
    expect(normalizar("Armação  de-Estruturas, Metálicas")).toBe("ARMACAO DE ESTRUTURAS METALICAS");
  });

  it("dois padrões que só diferem em acento e caixa normalizam igual", () => {
    expect(normalizar("flange")).toBe(normalizar("FLANGÉ".normalize("NFC")));
  });

  it("texto vazio ou só pontuação vira string vazia", () => {
    expect(normalizar("  --  ")).toBe("");
    expect(normalizar(null)).toBe("");
  });
});

describe("o escopo do verbete", () => {
  it("o verbete global vale para qualquer código", () => {
    expect(verbetesDoCodigo([verbete({ codigoProduto: null })], "QUALQUER")).toHaveLength(1);
  });

  it("o verbete de um código não vale para outro", () => {
    expect(verbetesDoCodigo([verbete({ codigoProduto: "ARM000010" })], "ARM000001")).toHaveLength(0);
  });

  // ⚠⚠ O ESCOPO É CANÔNICO NOS DOIS LADOS (achado do Codex, 23/09/2026).
  it("o código casa independente de caixa e pontuação", () => {
    expect(verbetesDoCodigo([verbete({ codigoProduto: "arm-000010" })], "ARM 000010")).toHaveLength(1);
  });

  it("um código que só tem pontuação normaliza para vazio — é por isso que a gravação o recusa", () => {
    expect(canonico("---")).toBe("");
  });

  // ⚠⚠ NO CÓDIGO A PONTUAÇÃO SOME; na DESCRIÇÃO ela vira espaço. São regras diferentes de
  // propósito: código é identificador, descrição tem fronteira de palavra.
  it("no código, traço e ponto são ruído de digitação", () => {
    expect(canonico("arm.000010")).toBe("ARM000010");
    expect(canonico("ARM-000010")).toBe(canonico("ARM000010"));
    expect(normalizar("ARM-000010")).toBe("ARM 000010");
  });

  it("proposta e revogada nunca entram — só APROVADA orienta", () => {
    const vs = [verbete({ id: "p", status: STATUS.PROPOSTA }), verbete({ id: "r", status: STATUS.REVOGADA })];
    expect(verbetesDoCodigo(vs, "ARM000010")).toHaveLength(0);
  });
});

describe("procurar a decisão humana", () => {
  it("acha o verbete pela descrição do item, e diz por qual campo", () => {
    const r = procurar(item(), [verbete()]);
    expect(r.status).toBe(CLASSIFICACAO.CORRESPONDENCIA_UNICA);
    expect(r.verbete.campo).toBe("descricaoItem");
    // ⚠⚠ O NOME VEM DA COLUNA `aprovadoPorNome`. Era aqui que o defeito se escondia.
    expect(r.verbete.aprovadoPor).toBe("Matheus");
  });

  // ⚠⚠ O CASAMENTO ÚNICO NÃO É PROVA (achado do Codex, 23/09/2026).
  it("“SUPORTE PARA FLANGE” casa o verbete de FLANGE — e o resultado devolve o trecho para conferência", () => {
    const r = procurar(item({ descricaoItem: "SUPORTE PARA FLANGE" }), [verbete()]);
    expect(r.status).toBe(CLASSIFICACAO.CORRESPONDENCIA_UNICA);
    expect(r.verbete.trecho).toBe("SUPORTE PARA FLANGE");
    expect(r.verbete.padrao).toBe("FLANGE");
  });

  // ⚠⚠ GLOBAL E ESPECÍFICO CONCORREM, e nenhum ganha por ser mais específico.
  it("verbete global e verbete do código casando ao mesmo tempo é AMBIGUA, não precedência", () => {
    const vs = [
      verbete({ id: "global", codigoProduto: null, padraoDescricao: "FLANGE", ncm: "73072900" }),
      verbete({ id: "doCodigo", codigoProduto: "ARM000010", padraoDescricao: "FLANGE MAIOR", ncm: "94069020" }),
    ];
    const r = procurar(item(), vs);
    expect(r.status).toBe(CLASSIFICACAO.AMBIGUA);
    expect(r.candidatos).toHaveLength(2);
    expect(r.motivo).toContain("discordam");
  });

  it("dois verbetes sobrepostos com o MESMO NCM continuam ambíguos — é defeito de cadastro", () => {
    const vs = [
      verbete({ id: "a", padraoDescricao: "FLANGE" }),
      verbete({ id: "b", padraoDescricao: "FLANGE MAIOR" }),
    ];
    const r = procurar(item(), vs);
    expect(r.status).toBe(CLASSIFICACAO.AMBIGUA);
    expect(r.motivo).toContain("se sobrepõem");
  });

  it("sem verbete que case, o resultado é SEM_REGISTRO", () => {
    const r = procurar(item({ descricaoItem: "CANTONEIRA L 50X50" }), [verbete()]);
    expect(r.status).toBe(CLASSIFICACAO.SEM_REGISTRO);
  });

  it("item sem descrição nenhuma é NAO_AVALIAVEL, não “sem registro”", () => {
    const r = procurar(item({ descricao: null, descricaoItem: "  " }), [verbete()]);
    expect(r.status).toBe(CLASSIFICACAO.NAO_AVALIAVEL);
  });

  // ⚠⚠ FALHA DE LEITURA NÃO É AUSÊNCIA (achado do Codex).
  it("registro indisponível não vira SEM_REGISTRO", () => {
    expect(procurarClassificacao(item(), null).status).toBe(CLASSIFICACAO.INDISPONIVEL);
  });

  it("todo resultado diz que comparou com o cadastro de hoje", () => {
    for (const r of [procurar(item(), [verbete()]), procurarClassificacao(item(), null)]) {
      expect(r.comparadoCom).toBe("cadastro atual");
    }
  });

  it("a descrição genérica do cadastro também casa, e o campo é nomeado", () => {
    const r = procurar(item({ descricaoItem: null }), [verbete({ padraoDescricao: "ARMACAO DE ESTRUTURAS" })]);
    expect(r.verbete.campo).toBe("descricao");
  });

  it("não concatena os dois campos: um padrão que só existe atravessando os dois não casa", () => {
    const r = procurar(item(), [verbete({ padraoDescricao: "METALICAS FLANGE" })]);
    expect(r.status).toBe(CLASSIFICACAO.SEM_REGISTRO);
  });
});

describe("comparar o NCM declarado com o do registro", () => {
  it("confere quando batem", () => {
    const r = procurar(item(), [verbete({ ncm: "73072900" })]);
    expect(compararNcm(r, "7307.29.00")).toMatchObject({ comparavel: true, confere: true });
  });

  it("diverge quando não batem, e devolve os dois", () => {
    const r = procurar(item(), [verbete({ ncm: "73072900" })]);
    expect(compararNcm(r, "94069020")).toMatchObject({ comparavel: true, confere: false, registrado: "73072900" });
  });

  // ⚠⚠ DE AMBIGUIDADE NÃO SE TIRA COMPARAÇÃO — escolher um dos dois seria decidir no escuro.
  it("ambiguidade não é comparável", () => {
    const vs = [verbete({ id: "a", padraoDescricao: "FLANGE" }), verbete({ id: "b", padraoDescricao: "FLANGE MAIOR" })];
    expect(compararNcm(procurar(item(), vs), "73072900").comparavel).toBe(false);
  });

  it("sem registro, nada é comparável", () => {
    expect(compararNcm(procurar(item({ descricaoItem: "X" }), [verbete()]), "73072900").comparavel).toBe(false);
    expect(compararNcm(procurarClassificacao(item(), null), "73072900").comparavel).toBe(false);
  });

  it("NCM declarado incompleto não vira divergência", () => {
    const r = procurar(item(), [verbete()]);
    expect(compararNcm(r, "7307").comparavel).toBe(false);
  });
});
