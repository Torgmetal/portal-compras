// A ASSINATURA DIMENSIONAL — pares REAIS, e os negativos que importam.
//
// ⚠⚠ Os positivos saíram da T122-001 (21/09/2026): à esquerda o que a SOUFER escreveu no PDF, à
// direita o que a RM diz. Todos casavam ZERO pelo algoritmo de palavras.
//
// ⚠⚠ E OS NEGATIVOS SÃO A METADE QUE IMPORTA. Casar errado põe preço errado no item errado do
// pedido, e ninguém percebe — ao contrário de não casar, que o fornecedor vê na hora.
import { describe, it, expect } from "vitest";
import { medida, assinatura, mesmaPeca } from "@/lib/cotacao-assinatura";

describe("medida", () => {
  // ⚠⚠ No aço "1.3/4" é UM E TRÊS QUARTOS. Lido como decimal daria 1,3 e casaria outra bitola.
  it("lê fração mista, fração, decimal e inteiro", () => {
    expect(medida("1.3/4")).toBeCloseTo(1.75);
    expect(medida("2.1/2")).toBeCloseTo(2.5);
    expect(medida("3/16")).toBeCloseTo(0.1875);
    expect(medida("38,5")).toBeCloseTo(38.5);
    expect(medida("250")).toBe(250);
    expect(medida('3/4"')).toBeCloseTo(0.75);
    expect(medida("2POL")).toBe(2);
  });

  it("devolve null no que não é medida", () => {
    expect(medida("")).toBeNull();
    expect(medida("ACO")).toBeNull();
    expect(medida("3 16")).toBeNull(); // fração perdida na extração do PDF
  });
});

describe("pares reais da SOUFER × RM (hoje casam ZERO por palavras)", () => {
  const pares = [
    ["FERRO CANTONEIRA 1.3/4 X 3/16 - 6M", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 1.3/4POL"],
    ["FERRO CANT. 2 X 3/16 6MT.", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2POL"],
    ["FERRO CANT. 2.1/2 X 3/16 - 6 MT", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2.1/2POL"],
    ["PERFIL W 200 X 26,6 - 12M", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 26,6KG/M"],
    ["PERFIL W 250 X 25,3 - 12M", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 25,3KG/M"],
    ["PERFIL W 250 X 38,5 - 12M", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 38,5KG/M"],
    ["PERFIL W 310 X 52,0 - 12M", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W310 X 52,0KG/M"],
  ];
  for (const [pdf, rm] of pares) {
    it(`casa "${pdf.slice(0, 34)}"`, () => expect(mesmaPeca(pdf, rm)).toBe(true));
  }

  // ⚠⚠ A LETRA DO PERFIL NÃO ENTRA NA IDENTIDADE: a RM diz "PERFIL H ... DN. W200 X 52,0KG/M" e a
  // SOUFER, "PERFIL WH 200 X 52,0". Três letras para a mesma designação dimensional.
  it("casa o perfil mesmo com H / WH / W trocados, porque a designação é a mesma", () => {
    expect(mesmaPeca("PERFIL WH 200 X 52,0 - 12M - FX4,992T",
      "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 52,0KG/M")).toBe(true);
  });

  // ⚠⚠ O ITEM QUE NÃO PODE SER LIDO. Saiu do PDF como "3 X 3 16" — a barra da fração se perdeu
  // na extração. Chutar "3/16" é inventar bitola; vai para a associação manual.
  it("NÃO arrisca quando a fração se perdeu na extração", () => {
    expect(mesmaPeca("FERRO CANT 3 X 3 16 6MT",
      "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 3POL")).toBe(false);
  });
});

// ⚠⚠ A T122-002 (21/09/2026) ensinou que espessura NÃO identifica chapa: a RM tem DOIS itens de
// 19,00mm, um em 6 × 2,44 e outro em 3 × 1,2. E o fornecedor escreve "CHP", com as medidas em
// milímetros dentro da descrição, enquanto a RM guarda em metros, em campos próprios.
describe("chapa: espessura mais as medidas do plano", () => {
  const rm = (desc, comprimento, largura) => ({ descricao: desc, comprimento, largura });

  it("casa CHP do fornecedor com CHAPA da RM, convertendo mm → m", () => {
    expect(mesmaPeca("CHP GR 19,00 X 2440 X 6000 N11889 A36",
      rm("CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 19,00MM - COM U.S", 6, 2.44))).toBe(true);
  });

  // ⚠⚠ O CASO QUE JUSTIFICA A REGRA. Mesma espessura, chapa de outro tamanho — a SOUFER ofertou
  // 1500 × 3000 onde a RM pede 3 × 1,2, e escreveu na proposta "ATENÇÃO NAS MEDIDAS OFERTADAS".
  // Casar aqui poria o preço de uma chapa na linha da outra.
  it("NÃO casa mesma espessura com plano diferente", () => {
    expect(mesmaPeca("CHP GR 19,00 X 1500 X 3000 N11889 A36",
      rm("CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 19,00MM - COM U.S", 3, 1.2))).toBe(false);
  });

  // ⚠ Sem medida de um dos lados, a espessura decide. Se houver duas da mesma espessura, quem
  // segura é a regra de margem do casamento — não um palpite aqui.
  it("sem o plano de um dos lados, a espessura decide", () => {
    expect(mesmaPeca("CHAPA 19,00MM",
      rm("CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 19,00MM - COM U.S", 6, 2.44))).toBe(true);
  });
});

describe("os negativos — o que NÃO pode casar", () => {
  // ⚠⚠ O ALERTA DO CODEX, em teste: mesmo perfil, mesma altura, massa linear DIFERENTE. Um saco
  // de números sem ordem casaria os dois; eles pesam o dobro um do outro.
  it("W200 x 26,6 não é W200 x 52,0", () => {
    expect(mesmaPeca("PERFIL W 200 X 26,6 - 12M",
      "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 52,0KG/M")).toBe(false);
  });

  it("W250 x 38,5 não é W310 x 38,5", () => {
    expect(mesmaPeca("PERFIL W 250 X 38,5 - 12M",
      "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W310 X 38,5KG/M")).toBe(false);
  });

  it("cantoneira de aba diferente não casa", () => {
    expect(mesmaPeca("FERRO CANT. 2 X 3/16 6MT.",
      "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2.1/2POL")).toBe(false);
  });

  it("chapa de espessura diferente não casa", () => {
    expect(mesmaPeca("CHAPA ACO 19,00MM", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 25,00MM")).toBe(false);
    expect(mesmaPeca("CHAPA ACO 19,00MM", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 19,00MM - COM U.S")).toBe(true);
  });

  it("famílias diferentes nunca casam", () => {
    expect(mesmaPeca("PERFIL W 200 X 26,6", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2POL")).toBe(false);
  });

  // ⚠⚠ `null` É "NÃO SEI", E NUNCA PODE VIRAR "SIM". Tinta, diluente e consumível — a maioria das
  // 108 famílias do portal — não têm assinatura, e continuam no casamento por palavras de sempre.
  it("família desconhecida devolve null, não um palpite", () => {
    expect(mesmaPeca("WEG - DILUENTE PU 5003", "WEG - DILUENTE PU 5003")).toBeNull();
    expect(mesmaPeca("DISCO CORTE INOX 230MM", 'DISCO DE CORTE 9"')).toBeNull();
    expect(assinatura("PARAFUSO SEXT. A325 - 3/4\"X2\" - GF")).toBeNull();
  });
});
