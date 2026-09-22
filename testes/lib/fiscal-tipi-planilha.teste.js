import { describe, it, expect } from "vitest";
import { lerTipi, lerAliquota, aliquotasConsultaveis, ALIQUOTA, NIVEL } from "@/lib/fiscal/tipi-planilha";

// ─── A LEITURA DA TIPI OFICIAL ───────────────────────────────────────────────
//
// ⚠ As fixtures são RECORTES do arquivo real da Receita (medido em 22/09/2026, 673.645 bytes,
// 15.653 linhas de corpo) — não invenções. O arquivo inteiro não entra no repositório: ele muda por
// decreto e um teste que o congelasse estaria testando a Receita, não o parser.

const CABECALHO = [
  ["", "", "", "", ""],
  ["TABELA DE INCIDÊNCIA DO IMPOSTO SOBRE PRODUTOS INDUSTRIALIZADOS (TIPI)", "", "", "", ""],
  ["NCM ", "EX", "DESCRIÇÃO ", "ALÍQUOTA (%)", ""],
];
const planilha = (...corpo) => [...CABECALHO, ...corpo];

describe("lerAliquota — NT, zero e ausência são três coisas diferentes", () => {
  // ⚠⚠ TRATAR `NT` COMO 0 FAZ O PORTAL AFIRMAR "tributado a zero" sobre mercadoria que está FORA do
  // campo de incidência. São 832 linhas assim na TIPI de hoje.
  it('"NT" não é zero', () => {
    expect(lerAliquota("NT")).toEqual({ tipo: ALIQUOTA.NT, valor: null, bruto: "NT" });
  });

  // ⚠⚠ E ZERO É ALÍQUOTA DE VERDADE — 6.405 linhas. Virar `null` apagaria a informação de que a
  // Receita DISSE zero, que é diferente de a planilha não ter dito nada.
  it("zero é alíquota, não ausência", () => {
    expect(lerAliquota("0")).toEqual({ tipo: ALIQUOTA.PERCENTUAL, valor: 0, bruto: "0" });
  });

  it("célula vazia é ausência declarada", () => {
    expect(lerAliquota("").tipo).toBe(ALIQUOTA.AUSENTE);
  });

  it.each([["3.25", 3.25], ["6,5", 6.5], ["9.75", 9.75], ["13", 13]])(
    "%s vira %s", (bruto, valor) => expect(lerAliquota(bruto).valor).toBe(valor));

  // ⚠ Valor que não é número nem NT é LAYOUT MUDADO, e não pode ser engolido como zero nem como
  // ausência: é o sinal de que a Receita mexeu no arquivo e alguém precisa olhar.
  it.each(["ver nota", "-", "12%a", "N/T "])("%s é recusado, não convertido", (v) => {
    expect(lerAliquota(v)).toBeNull();
  });
});

describe("lerTipi — o que é NCM e o que é estrutura", () => {
  // ⚠⚠ NEM TODA LINHA É UM NCM DE 8 DÍGITOS: 4.545 das 15.653 não são. Importá-las como NCM encheria
  // a consulta de códigos que não existem em nota nenhuma.
  it("separa hierarquia de NCM pelo tamanho do código", () => {
    const { itens } = lerTipi(planilha(
      ["84.37", "", "Máquinas para limpeza… de grãos", "", ""],
      ["8437.8", "", "- Outras máquinas e aparelhos", "", ""],
      ["8437.80.10", "", "Para trituração ou moagem de grãos ", "0", ""],
      ["8437.90.00", "", "- Partes ", "3.25", ""],
    ));
    expect(itens.map((i) => i.nivel)).toEqual([NIVEL.HIERARQUIA, NIVEL.HIERARQUIA, NIVEL.NCM, NIVEL.NCM]);
    expect(itens[3]).toMatchObject({ codigo: "84379000", aliquota: { valor: 3.25 } });
  });

  // ⚠ Aceita com e sem pontuação, e o código normalizado é o que vai à chave.
  it("normaliza o código para 8 dígitos sem pontuação", () => {
    const { itens } = lerTipi(planilha(["7325.99.90", "", "Outras ", "6.5", ""]));
    expect(itens[0]).toMatchObject({ codigo: "73259990", codigoFormatado: "7325.99.90" });
  });

  // ⚠⚠ O Ex É STRING: "01" não é 1. Virado número, o zero à esquerda some e o Ex deixa de casar
  // com o que a nota fiscal declara.
  it('o Ex guarda o zero à esquerda', () => {
    const { itens } = lerTipi(planilha(["1211.20.00", "01", "Secas", "0", ""]));
    expect(itens[0].ex).toBe("01");
  });

  it("o cabeçalho é procurado, não fixado numa linha", () => {
    const comPreambuloMaior = [["x"], ["y"], ["z"], ...planilha(["0101.21.00", "", "-- Reprodutores", "NT", ""])];
    const r = lerTipi(comPreambuloMaior);
    expect(r.problemas).toEqual([]);
    expect(r.itens).toHaveLength(1);
  });

  it("layout sem o cabeçalho conhecido é recusado inteiro", () => {
    const r = lerTipi([["Produto", "Valor"], ["x", "1"]]);
    expect(r.itens).toEqual([]);
    expect(r.problemas[0].motivo).toMatch(/layout da Receita mudou/i);
  });
});

describe("lerTipi — a linha sem código", () => {
  // ⚠ São 5 no arquivo real: a descrição transborda para a linha seguinte.
  it("cola a continuação na linha anterior e guarda as duas origens", () => {
    const { itens, problemas } = lerTipi(planilha(
      ["9406.90.20", "", "Com estrutura de ferro ou aço", "0", ""],
      ["", "", "e paredes exteriores constituídas essencialmente de vidro", "", ""],
    ));
    expect(problemas).toEqual([]);
    expect(itens).toHaveLength(1);
    expect(itens[0].descricao).toBe("Com estrutura de ferro ou aço e paredes exteriores constituídas essencialmente de vidro");
    expect(itens[0].linhasDeOrigem).toEqual([4, 5]);
  });

  // ⚠⚠ CONTINUAÇÃO SEM DONA É LAYOUT DIFERENTE, NÃO DIAGRAMAÇÃO (parecer do Codex, 22/09/2026).
  // Colar em qualquer coisa faria a descrição de um produto valer para outro; engolir em silêncio
  // esconderia a mudança do arquivo.
  it("continuação sem linha anterior vira problema, não some", () => {
    const { itens, problemas } = lerTipi(planilha(["", "", "texto órfão", "", ""]));
    expect(itens).toEqual([]);
    expect(problemas[0].motivo).toMatch(/sem linha anterior/i);
  });

  it("linha totalmente em branco é só diagramação e não vira problema", () => {
    const { itens, problemas } = lerTipi(planilha(["", "", "", "", ""], ["8437.90.00", "", "- Partes", "3.25", ""]));
    expect(problemas).toEqual([]);
    expect(itens).toHaveLength(1);
  });
});

describe("aliquotasConsultaveis — a chave é (NCM, Ex)", () => {
  // ⚠⚠ O CASO REAL: 483 NCMs têm mais de uma linha. O 1211.20.00 é NT na geral e 0% no Ex 01
  // ("Secas"). Uma alíquota por NCM escolheria uma das duas em silêncio — e as duas estão certas,
  // para mercadorias diferentes.
  it("a geral e o Ex do mesmo NCM convivem", () => {
    const { itens } = lerTipi(planilha(
      ["1211.20.00", "", "- Raízes de ginseng", "NT", ""],
      ["1211.20.00", "01", "Secas", "0", ""],
    ));
    const { aliquotas, problemas } = aliquotasConsultaveis(itens);
    expect(problemas).toEqual([]);
    expect(aliquotas).toHaveLength(2);
    expect(aliquotas.find((a) => a.ex === "").aliquota.tipo).toBe(ALIQUOTA.NT);
    expect(aliquotas.find((a) => a.ex === "01").aliquota.valor).toBe(0);
  });

  it("hierarquia fica FORA das alíquotas consultáveis", () => {
    const { itens } = lerTipi(planilha(
      ["84.37", "", "Máquinas…", "", ""],
      ["8437.90.00", "", "- Partes", "3.25", ""],
    ));
    // ⚠ Ela continua nos `itens` — é de lá que sai a descrição que a folha abrevia.
    expect(itens).toHaveLength(2);
    expect(aliquotasConsultaveis(itens).aliquotas).toHaveLength(1);
  });

  // ⚠⚠ CHAVE REPETIDA COM VALOR DIFERENTE É ERRO, NUNCA SOBRESCRITA (parecer do Codex): a última
  // calada venceria e ninguém saberia qual alíquota valeu.
  it("mesmo (NCM, Ex) com alíquotas diferentes é denunciado", () => {
    const { itens } = lerTipi(planilha(
      ["8437.90.00", "", "- Partes", "3.25", ""],
      ["8437.90.00", "", "- Partes", "0", ""],
    ));
    const { aliquotas, problemas } = aliquotasConsultaveis(itens);
    expect(aliquotas).toHaveLength(1);
    expect(problemas[0].motivo).toMatch(/repetido com alíquotas diferentes/i);
  });

  it("repetição idêntica é só a planilha se repetindo, e não alarma", () => {
    const { itens } = lerTipi(planilha(
      ["8437.90.00", "", "- Partes", "3.25", ""],
      ["8437.90.00", "", "- Partes", "3.25", ""],
    ));
    expect(aliquotasConsultaveis(itens).problemas).toEqual([]);
  });
});

// ─── OS NCMs DA TORG ─────────────────────────────────────────────────────────
//
// ⚠⚠ ESTE TESTE NÃO CONGELA ALÍQUOTA, E ISSO É DE PROPÓSITO. Alíquota muda por decreto; um teste
// que gravasse "8437.90.00 = 3,25%" estaria testando a Receita Federal, e ficaria vermelho no dia
// em que a TIPI mudar — que é exatamente o dia em que o portal precisa funcionar. O que se trava
// aqui é a LEITURA: que esses códigos atravessam o parser inteiros e classificados.
describe("os NCMs usados pela TORG atravessam o parser", () => {
  it.each([
    ["8437.90.00", "84379000"],   // partes de máquinas — o NCM da NF-e 973
    ["8431.39.00", "84313900"],
    ["7325.99.90", "73259990"],
    ["9406.90.20", "94069020"],
  ])("%s é lido como NCM consultável", (formatado, normalizado) => {
    const { itens } = lerTipi(planilha([formatado, "", "descrição oficial", "3.25", ""]));
    const { aliquotas } = aliquotasConsultaveis(itens);
    expect(aliquotas).toHaveLength(1);
    expect(aliquotas[0]).toMatchObject({ codigo: normalizado, nivel: NIVEL.NCM });
  });
});
