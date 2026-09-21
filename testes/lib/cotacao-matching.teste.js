// O CASAMENTO PDF × RM — com a regra de hoje preservada e a nova por cima.
//
// ⚠⚠ Matheus (21/09/2026): "só não quebre ou piore o jeito que é feito hoje". O primeiro bloco
// abaixo é exatamente essa garantia: o caminho por PALAVRAS continua valendo, com o mesmo corte.
import { describe, it, expect } from "vitest";
import { casarItens, proximidadeQtd } from "@/lib/cotacao-matching";

// A MESMA função de hoje, copiada do formulário — é o contrato que não pode mudar.
function scoreTexto(descPdf, descRm) {
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = (s) => norm(s).split(" ").filter((t) => t.length >= 3);
  const a = toks(descPdf), aStr = norm(descPdf);
  const b = toks(descRm), bStr = norm(descRm);
  if (!a.length || !b.length) return 0;
  return Math.max(a.filter((t) => bStr.includes(t)).length / a.length,
    b.filter((t) => aStr.includes(t)).length / b.length);
}
const casar = (pdf, linhas) => casarItens(pdf, linhas, { scoreTexto });
const linha = (id, descricao, extra = {}) => ({ id, descricao, qtdRm: 0, precoUnit: "", semEstoque: false, ...extra });

describe("o caminho de HOJE continua valendo", () => {
  // ⚠⚠ Consumível não tem assinatura dimensional — e é a maioria das 108 famílias do portal.
  // Tinta, diluente, disco: tudo isso segue casando por palavra, como sempre casou.
  it("casa por palavras quando não há assinatura, como sempre fez", () => {
    const r = casar(
      [{ descricao: "DISCO CORTE INOX 230MM 9POL", precoUnit: 10 }],
      [linha("l1", 'DISCO DE CORTE 9"'), linha("l2", "WEG - DILUENTE PU 5003")],
    );
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0]).toMatchObject({ idxLinha: 0, via: "texto" });
  });

  it("não casa o que hoje também não casaria", () => {
    const r = casar([{ descricao: "PARAFUSO SEXT A325", precoUnit: 1 }], [linha("l1", "WEG - DILUENTE PU 5003")]);
    expect(r.pares).toHaveLength(0);
    expect(r.sobraram).toEqual([0]);
  });
});

describe("o que a T122-001 provou que faltava", () => {
  const PDF = [
    { descricao: "FERRO CANT. 2 X 3/16 6MT.", qtd: 3630, precoUnit: 6.19 },
    { descricao: "PERFIL W 250 X 38,5 - 12M", qtd: 20790, precoUnit: 7.35 },
  ];
  const LINHAS = [
    linha("l1", "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2POL", { qtdRm: 3593.7 }),
    linha("l2", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W250 X 38,5KG/M", { qtdRm: 20790 }),
  ];

  it("casa os dois — que por palavras davam 0,20 e 0,40 contra um corte de 0,50", () => {
    expect(scoreTexto(PDF[0].descricao, LINHAS[0].descricao)).toBeLessThan(0.5);
    const r = casar(PDF, LINHAS);
    expect(r.pares).toHaveLength(2);
    expect(r.pares.every((p) => p.via === "assinatura")).toBe(true);
    expect(r.sobraram).toEqual([]);
  });
});

describe("o peso do aço", () => {
  // ⚠⚠ Matheus: "as diferenças de peso vão acontecer por ser aço, nunca bate exatamente o do
  // pedido". Peso divergente NÃO pode reprovar um par que a assinatura aprovou.
  it("peso 12% fora ainda casa — só soma menos confiança", () => {
    const perto = casar([{ descricao: "PERFIL W 250 X 38,5", qtd: 20790 }],
      [linha("l1", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { qtdRm: 20790 })]);
    const longe = casar([{ descricao: "PERFIL W 250 X 38,5", qtd: 18300 }],
      [linha("l1", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { qtdRm: 20790 })]);
    expect(perto.pares).toHaveLength(1);
    expect(longe.pares).toHaveLength(1);                                   // continua casando
    expect(longe.pares[0].confianca).toBeLessThan(perto.pares[0].confianca); // com menos confiança
  });

  it("proximidade: 2% vale cheio, 15% não soma nada", () => {
    expect(proximidadeQtd(2551.5, 2565)).toBe(1);
    expect(proximidadeQtd(1000, 2000)).toBe(0);
  });
});

describe("o que ele se recusa a fazer", () => {
  // ⚠⚠ O ALERTA DO CODEX. As palavras são quase idênticas e o texto sozinho casaria; a massa
  // linear diz que são perfis que pesam o dobro um do outro.
  it("a assinatura VETA o par que o texto aprovaria", () => {
    const r = casar([{ descricao: "PERFIL W 200 X 26,6 - 12M", qtd: 957 }],
      [linha("l1", "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 52,0KG/M", { qtdRm: 957 })]);
    expect(r.pares).toHaveLength(0);
  });

  // ⚠⚠ EMPATE NÃO VIRA CERTEZA: uma moeda decidindo qual linha recebe o preço é o pior caminho.
  it("dois destinos igualmente plausíveis viram AMBÍGUO, não um chute", () => {
    const r = casar([{ descricao: "PERFIL W 250 X 38,5", qtd: 1000 }], [
      linha("l1", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { qtdRm: 1000 }),
      linha("l2", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { qtdRm: 1000 }),
    ]);
    expect(r.pares).toHaveLength(0);
    expect(r.ambiguos).toEqual([0]);
  });

  it("não escreve em linha recusada nem em linha já preenchida", () => {
    const r = casar([{ descricao: "PERFIL W 250 X 38,5", qtd: 1000 }], [
      linha("l1", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { semEstoque: true }),
      linha("l2", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { precoUnit: "7,80" }),
    ]);
    expect(r.pares).toHaveLength(0);
    expect(r.sobraram).toEqual([0]);
  });

  // ⚠ A ordem do arquivo deixa de decidir: hoje o primeiro item leva a linha que era do segundo.
  it("a escolha é global — inverter a ordem do PDF dá o mesmo resultado", () => {
    const LINHAS = [
      linha("l1", "PERFIL W ACO CARBONO A 572 DN. W250 X 38,5KG/M", { qtdRm: 20790 }),
      linha("l2", "PERFIL W ACO CARBONO A 572 DN. W310 X 52,0KG/M", { qtdRm: 4992 }),
    ];
    const a = { descricao: "PERFIL W 250 X 38,5 - 12M", qtd: 20790 };
    const b = { descricao: "PERFIL W 310 X 52,0 - 12M", qtd: 4992 };
    const chave = (r) => r.pares.map((p) => `${p.idxPdf}->${p.idxLinha}`).sort().join(",");
    expect(chave(casar([a, b], LINHAS))).toBe("0->0,1->1");
    expect(chave(casar([b, a], LINHAS))).toBe("0->1,1->0");
  });
});
