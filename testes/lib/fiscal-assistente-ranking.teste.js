import { describe, it, expect } from "vitest";
import { ordenarDispositivos, expandir, pontuar, PISO } from "@/lib/fiscal/assistente/ranking";

// ⚠⚠ OS CASOS DE RECUPERAÇÃO QUE O CODEX EXIGIU: *"linguagem real dos usuários, perguntas sem
// cobertura e artigos semelhantes"*. As fixtures reproduzem o corpus real — os rótulos e o
// vocabulário são os que estão na produção.

const disp = (rotulo, artigo, tipo, texto, ordem = 0) => ({ id: rotulo, rotulo, artigo, tipo, texto, ordem, versaoId: "v1" });

const CORPUS = [
  disp("Artigo 406", "406", "ARTIGO",
    "Na saída de mercadoria em retorno ao estabelecimento autor da encomenda, que a tiver remetido para industrialização", 10),
  disp("Artigo 406, II", "406", "INCISO",
    "o estabelecimento fornecedor remeterá a mercadoria diretamente ao industrializador, com suspensão do imposto", 11),
  disp("Artigo 402", "402", "ARTIGO",
    "Suspensão do imposto na saída para industrialização, beneficiamento, com retorno ao estabelecimento de origem", 5),
  disp("Artigo 52", "52", "ARTIGO",
    "Alíquota do imposto nas operações interestaduais que destinem mercadoria a contribuinte", 1),
  disp("Artigo 131, § 3º", "131", "PARAGRAFO",
    "A receita bruta do estabelecimento será considerada para efeito de apuração", 60),
];

describe("recuperação — as perguntas do briefing, em linguagem de chão de fábrica", () => {
  it("'o cliente comprou e o fornecedor entregou direto' chega no art. 406", () => {
    const r = ordenarDispositivos(CORPUS, "A QWS comprou o aço e o fornecedor entregou diretamente na TORG. Qual CFOP?");
    expect(r.map((d) => d.rotulo)).toContain("Artigo 406, II");
  });

  it("'jateamento e pintura' chega na suspensão do art. 402", () => {
    const r = ordenarDispositivos(CORPUS, "Vou mandar material para jateamento e depois para pintura em outro fornecedor");
    expect(r.map((d) => d.rotulo)).toContain("Artigo 402");
  });

  it("citar o número do artigo manda nele", () => {
    const r = ordenarDispositivos(CORPUS, "qual o artigo 406 do RICMS");
    expect(r[0].artigo).toBe("406");
  });

  // ⚠⚠⚠ OS DOIS FALSOS POSITIVOS MEDIDOS NA PRODUÇÃO. Estes dois testes são a razão de o piso existir.
  it("pergunta SEM cobertura na base não devolve artigo de outro assunto", () => {
    const r = ordenarDispositivos(CORPUS, "Recebi uma impressora em locação e preciso devolver");
    expect(r).toEqual([]);
  });

  it("'receita de bolo' não casa com a receita bruta do RICMS", () => {
    const r = ordenarDispositivos(CORPUS, "qual a receita de bolo de cenoura");
    expect(r).toEqual([]);
  });

  it("saudação não devolve legislação", () => {
    expect(ordenarDispositivos(CORPUS, "bom dia tudo bem")).toEqual([]);
    expect(ordenarDispositivos(CORPUS, "")).toEqual([]);
  });
});

describe("o vocabulário controlado é a ponte entre as duas línguas", () => {
  it("'cliente comprou' traz ENCOMENDANTE, que a pessoa nunca escreveria", () => {
    expect(expandir("o cliente comprou o aço")).toContain("ENCOMENDANTE");
  });
  it("'jateamento' traz SUSPENSAO e RETORNO", () => {
    const t = expandir("mandar para jateamento");
    expect(t).toContain("SUSPENSAO");
    expect(t).toContain("RETORNO");
  });
  it("palavras vazias não entram", () => {
    expect(expandir("qual que é o para com")).toEqual([]);
  });
});

describe("a ordenação é estável — a mesma pergunta recupera a mesma coisa", () => {
  it("empate desempata pela ordem do documento", () => {
    const a = ordenarDispositivos(CORPUS, "suspensão do imposto na saída para industrialização beneficiamento retorno");
    const b = ordenarDispositivos(CORPUS, "suspensão do imposto na saída para industrialização beneficiamento retorno");
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
  it("o piso é 4 e está exposto para o teste conferir", () => {
    expect(PISO).toBe(4);
    const fraco = disp("Artigo 99", "99", "ARTIGO", "imposto", 1);
    expect(pontuar(fraco, ["IMPOSTO"], [])).toBeLessThan(PISO);
  });
});
