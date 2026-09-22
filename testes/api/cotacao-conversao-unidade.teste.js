import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
import { aplicarConversao } from "@/app/api/cotacao/[id]/lancar-manual/route";
import { paraODocumento, unidadeEfetivaDoItem } from "@/lib/unidades";

// ─── A CONVERSÃO ACONTECE NO SERVIDOR ────────────────────────────────────────
//
// O comprador digita o que está no papel do fornecedor ("25 CT a R$ 50,00"); o portal grava na
// unidade da RM ("2500 UN a R$ 0,50"), que é a base em que os outros 25 consumidores já leem.

const item = (extra) => ({
  rmItemId: "i1", precoUnit: 50, qtdCotada: 25,
  unidadeRM: "UN", unidadeCotada: "CT", fatorParaRM: 100, ...extra,
});

describe("aplicarConversao", () => {
  it("25 CT a R$ 50,00 vira 2500 UN a R$ 0,50", () => {
    const r = aplicarConversao(item());
    expect(r.item).toMatchObject({ qtdCotada: 2500, precoUnit: 0.5, unidadeCotada: "CT", fatorParaRM: 100 });
    expect(r.converteu).toBe(true);
  });

  // ⚠⚠ A ARMADILHA DO ARREDONDAMENTO. A rota arredonda preço e quantidade a duas casas; com
  // R$ 49,99 o cento, o unitário vira R$ 0,4999 e o `round2` o levaria a R$ 0,50 — o total saltaria
  // de R$ 1.249,75 para R$ 1.250,00. O que tem de fechar no centavo é o TOTAL, que é o que o
  // fornecedor assinou; o unitário convertido guarda as casas de que precisa.
  it("R$ 49,99 o cento não perde centavo no total", () => {
    const r = aplicarConversao(item({ precoUnit: 49.99 }));
    expect(r.item.precoUnit).toBeCloseTo(0.4999, 6);
    expect(Math.round(r.item.qtdCotada * r.item.precoUnit * 100) / 100).toBe(1249.75);
  });

  // ⚠ Sem unidade cotada (ou com ela igual à da RM) o caminho é exatamente o de antes — é o que
  // mantém as cotações já recebidas funcionando sem tratamento nenhum.
  it.each([
    [{ fatorParaRM: 1, unidadeCotada: "UN" }],
    [{ unidadeCotada: null }],
    [{ unidadeRM: "LATA 2,80L", unidadeCotada: null }],
  ])("sem conversão, arredonda e segue (%o)", (extra) => {
    const r = aplicarConversao(item({ precoUnit: 12.345, qtdCotada: 7.891, ...extra }));
    expect(r.converteu).toBe(false);
    expect(r.item).toMatchObject({ precoUnit: 12.35, qtdCotada: 7.89, unidadeCotada: null, fatorParaRM: null });
  });

  // ⚠⚠ UNIDADE ESCOLHIDA SEM FATOR NÃO PODE PASSAR COMO "sem conversão" (achado do Codex,
  // 22/09/2026). Era o furo mais caro: escolher CT e deixar o fator vazio gravava os 25 do papel
  // como 25 UN — cem vezes menos material, calado.
  describe("unidade escolhida sem fator", () => {
    // ⚠ CT→UN tem fator FIXO (100): o servidor calcula, não recusa nem espera o navegador mandar.
    it("par de fator fixo é convertido pelo servidor", () => {
      const r = aplicarConversao(item({ fatorParaRM: null }));
      expect(r.converteu).toBe(true);
      expect(r.item).toMatchObject({ qtdCotada: 2500, precoUnit: 0.5, unidadeCotada: "CT", fatorParaRM: 100 });
    });

    // ⚠ M→UN depende do ITEM (quanto mede uma telha): sem fator não há o que calcular — é recusa.
    it("par que depende do item é recusado", () => {
      const r = aplicarConversao(item({ unidadeCotada: "M", fatorParaRM: null }));
      expect(r.erro).toMatch(/Informe quantos UN cabem em 1 M/);
      expect(r.item).toBeUndefined();
    });
  });

  // ⚠⚠ A UNIDADE BASE VEM DO BANCO (achado do Codex): o corpo da requisição não decide a base.
  it("a unidade da RM no banco vence a que veio no corpo", () => {
    const r = aplicarConversao(item({ unidadeRM: "CT" }), "UN");
    expect(r.converteu).toBe(true);
    expect(r.item.qtdCotada).toBe(2500);
  });

  // ⚠ Telha: o fator é o comprimento, informado por quem tem o documento na mão.
  it("130 ML a R$ 10,00 com 25 UN no papel fecha em R$ 1.300,00", () => {
    const r = aplicarConversao(item({ precoUnit: 10, qtdCotada: 130, unidadeCotada: "M", fatorParaRM: 25 / 130 }));
    expect(r.item.qtdCotada).toBe(25);
    expect(Math.round(r.item.qtdCotada * r.item.precoUnit * 100) / 100).toBe(1300);
  });

  it("o resumo diz a conversão, para a trilha", () => {
    expect(aplicarConversao(item()).resumo).toBe("25 CT → 2500 UN");
  });
});

// ─── SALVAR, REABRIR E SALVAR DE NOVO NÃO PODE MUDAR VALOR ─────────────────────────
//
// ⚠⚠ O DEFEITO (achado do Codex, 22/09/2026): o modal reabria copiando os números CANÔNICOS do
// banco e SEM os metadados da conversão. O reenvio caía no caminho "sem conversão", que arredonda —
// R$ 0,4999 virava R$ 0,50 e os 2.500 parafusos subiam de R$ 1.249,75 para R$ 1.250,00. Ninguém
// tinha tocado em nada.
//
// A volta é `paraODocumento` (o que `page.js` manda ao modal) e o reenvio é `aplicarConversao` de
// novo. Este teste amarra o ciclo inteiro.
describe("o ciclo salvar → reabrir → salvar", () => {
  const cicloFecha = (papel) => {
    const gravado = aplicarConversao(item(papel)).item;
    // O que `page.js` devolve para o modal: os valores do documento + a trilha.
    const volta = paraODocumento({ qtd: gravado.qtdCotada, preco: gravado.precoUnit, fator: gravado.fatorParaRM });
    const limpo = (n) => Math.round(n * 1e6) / 1e6;
    // O reenvio do modal, sem o comprador mexer em nada.
    const regravado = aplicarConversao(item({
      ...papel,
      qtdCotada: limpo(volta.qtd), precoUnit: limpo(volta.preco),
      unidadeCotada: gravado.unidadeCotada, fatorParaRM: gravado.fatorParaRM,
    })).item;
    return { gravado, volta: { qtd: limpo(volta.qtd), preco: limpo(volta.preco) }, regravado };
  };

  it("2500 parafusos a R$ 49,99 o cento continuam valendo R$ 1.249,75", () => {
    const { gravado, volta, regravado } = cicloFecha({ precoUnit: 49.99, qtdCotada: 25 });
    expect(volta).toEqual({ qtd: 25, preco: 49.99 });          // o papel do fornecedor, de volta
    expect(regravado.qtdCotada).toBe(gravado.qtdCotada);
    expect(regravado.precoUnit).toBeCloseTo(gravado.precoUnit, 10);
    expect(Math.round(regravado.qtdCotada * regravado.precoUnit * 100) / 100).toBe(1249.75);
  });

  // ⚠ O caso duro: 25/130 é dízima, e é por isso que o fator GRAVADO é o efetivo e não o digitado.
  it("130 M virando 25 UN sobrevive à ida e volta", () => {
    const { gravado, volta, regravado } = cicloFecha({
      precoUnit: 10, qtdCotada: 130, unidadeCotada: "M", fatorParaRM: 0.1923,
    });
    expect(gravado.qtdCotada).toBe(25);
    expect(volta).toEqual({ qtd: 130, preco: 10 });
    expect(regravado.qtdCotada).toBe(25);
    expect(Math.round(regravado.qtdCotada * regravado.precoUnit * 100) / 100).toBe(1300);
  });
});

// ⚠⚠ ITEM COM PESO É COTADO EM KG (achado do Codex, 22/09/2026) ─────────────────────
//
// A coluna `unidade` do RMItem pode dizer "UN" enquanto a tela do fornecedor, o modal e o pedido
// do Omie tratam o item em KG — quem decide é `peso > 0`. A consulta que alimenta a conversão lia
// só a coluna crua: comparava "UN" com "UN", concluía que não havia o que converter, e gravava
// quantidade e preço POR UNIDADE em algo que o resto do portal lê como QUILO.
describe("a base da conversão é a unidade EFETIVA do item", () => {
  it("peso positivo manda, mesmo com a coluna dizendo outra coisa", () => {
    expect(unidadeEfetivaDoItem({ unidade: "UN", peso: 1250 })).toBe("KG");
    expect(unidadeEfetivaDoItem({ unidade: "UN", peso: 0 })).toBe("UN");
    expect(unidadeEfetivaDoItem({ unidade: "UN", peso: null })).toBe("UN");
    expect(unidadeEfetivaDoItem({ unidade: null, peso: 0 })).toBe("KG");
  });

  // ⚠ O caso que passava calado: RM em "UN" COM peso, proposta cotada em UN. Lendo a coluna crua,
  // as unidades pareciam iguais e a conversão era descartada — os números por peça viravam quilo.
  it("RM com peso: cotar em UN contra base KG é conversão, não coincidência", () => {
    const base = unidadeEfetivaDoItem({ unidade: "UN", peso: 1250 });
    const r = aplicarConversao(item({ unidadeCotada: "UN", qtdCotada: 100, precoUnit: 12.5, fatorParaRM: 12.5 }), base);
    expect(r.converteu).toBe(true);
    expect(r.item.qtdCotada).toBe(1250);                     // 100 peças × 12,5 kg
    expect(Math.round(r.item.qtdCotada * r.item.precoUnit * 100) / 100).toBe(1250);
  });

  // ⚠ Sem peso, nada muda — a coluna continua mandando.
  it("sem peso, a coluna continua sendo a base", () => {
    const r = aplicarConversao(item(), unidadeEfetivaDoItem({ unidade: "UN", peso: 0 }));
    expect(r.item.qtdCotada).toBe(2500);
  });
});
