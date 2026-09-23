import { describe, it, expect } from "vitest";
import { icmsDeReferencia, estimarIcms, ESTADO, SETE_POR_CENTO, ORIGEM_DECLARADA } from "@/lib/fiscal/icms";

// ─── ICMS: REFERÊNCIA COM CONDIÇÕES, NUNCA IMPOSTO DETERMINADO ───────────────
//
// ⚠⚠ O briefing veda *"aplicar automaticamente 12% de ICMS a toda venda interestadual"*, e a
// vedação é justa — 12% não vale para todo destino. O que sai daqui é a alíquota do art. 52 do
// RICMS/SP com as condições à vista. Referência condicionada é o oposto de automatismo.

describe("icmsDeReferencia — a tabela do art. 52 do RICMS/SP", () => {
  it.each([["RS", 12], ["MG", 12], ["RJ", 12], ["PR", 12], ["SC", 12]])("SP → %s é %i%%", (uf, a) => {
    expect(icmsDeReferencia("SP", uf)).toMatchObject({ estado: ESTADO.REFERENCIA, aliquota: a });
  });

  // ⚠⚠ O ES É SUDESTE E MESMO ASSIM RECEBE 7%. É o erro clássico de quem decora a regra pela
  // região em vez de pela lista — e era exatamente o "12% para toda venda interestadual".
  it.each([["ES", 7], ["BA", 7], ["DF", 7], ["MT", 7], ["AM", 7]])("SP → %s é %i%%", (uf, a) => {
    expect(icmsDeReferencia("SP", uf)).toMatchObject({ estado: ESTADO.REFERENCIA, aliquota: a });
  });

  it("as duas listas cobrem os 26 estados e o DF, sem sobreposição", () => {
    const doze = ["MG", "PR", "RJ", "RS", "SC"];
    expect(SETE_POR_CENTO.size + doze.length).toBe(26);
    expect(doze.filter((u) => SETE_POR_CENTO.has(u))).toEqual([]);
  });

  // ⚠⚠ A INTERNA FICA DE FORA DE PROPÓSITO: 18% com um campo enorme de reduções e benefícios por
  // mercadoria. Sem fonte estruturada, um número ali seria o chute que o módulo existe para evitar.
  it("dentro de SP não determina, e diz por quê", () => {
    const r = icmsDeReferencia("SP", "SP");
    expect(r.estado).toBe(ESTADO.NAO_DETERMINADO);
    expect(r.motivo).toMatch(/reduções e benefícios/i);
  });

  // ⚠ A tabela é a das saídas de SP; supor que a de outro estado é igual seria inventar.
  it("saída de outro estado não usa esta tabela", () => {
    expect(icmsDeReferencia("MG", "RS").motivo).toMatch(/legislação daquele estado/i);
  });

  it.each([["SP", ""], ["", "RS"]])("sem as duas UFs, não determina", (a, b) => {
    expect(icmsDeReferencia(a, b).estado).toBe(ESTADO.NAO_DETERMINADO);
  });

  it("UF de destino inexistente não vira 12% por descuido", () => {
    expect(icmsDeReferencia("SP", "XX").estado).toBe(ESTADO.NAO_DETERMINADO);
  });
});

describe("as condições vêm SEMPRE, inclusive quando não determina", () => {
  // ⚠⚠ A ALÍQUOTA É UM INSUMO DO CÁLCULO, NÃO O CÁLCULO. DIFAL, redução de base, ST e FCP entram
  // depois, e nenhum deles está estruturado no portal.
  it.each([["SP", "RS"], ["SP", "SP"], ["MG", "RS"]])("%s → %s lista as condições", (a, b) => {
    const r = icmsDeReferencia(a, b);
    expect(r.condicoes.length).toBeGreaterThanOrEqual(5);
    expect(r.condicoes.join(" ")).toMatch(/DIFAL/);
  });

  // ⚠⚠ DIFAL NÃO É SÓ PARA NÃO CONTRIBUINTE (LC 190/2022) — reduzir isso a um booleano era a
  // simplificação que o parecer apontou.
  it("o DIFAL é descrito sem virar o booleano 'não contribuinte'", () => {
    expect(icmsDeReferencia("SP", "RS").condicoes.join(" ")).toMatch(/tanto para contribuinte quanto para não contribuinte/i);
  });
});

describe("a origem é DECLARADA, com escopo e data", () => {
  // ⚠⚠ COMPRAR DE FORNECEDOR NACIONAL NÃO PROVA AUSÊNCIA DE CONTEÚDO IMPORTADO: origem é atributo
  // do PRODUTO (apurado por FCI), não da compra. A declaração vale e fica à vista de quem lê.
  it("diz quem declarou, quando, e o que ela NÃO prova", () => {
    expect(ORIGEM_DECLARADA).toMatchObject({ codigo: "0", declaradoPor: "Matheus (Torg Metal)", declaradoEm: "2026-09-22" });
    expect(ORIGEM_DECLARADA.ressalva).toMatch(/FCI/);
    expect(ORIGEM_DECLARADA.ressalva).toMatch(/4%/);
  });
});

describe("estimarIcms", () => {
  it("aplica a alíquota de referência sobre o valor digitado", () => {
    expect(estimarIcms("SP", "RS", 222769.58)).toMatchObject({ aliquota: 12, valor: 26732.35 });
  });

  it("7% no destino de 7%", () => {
    expect(estimarIcms("SP", "ES", 1000)).toMatchObject({ aliquota: 7, valor: 70 });
  });

  // ⚠ Sem alíquota de referência não há estimativa — e nada de zero disfarçado de resultado.
  it("sem referência, devolve o não determinado e nenhum valor", () => {
    const r = estimarIcms("SP", "SP", 1000);
    expect(r.estado).toBe(ESTADO.NAO_DETERMINADO);
    expect(r.valor).toBeUndefined();
  });

  it("sem valor, fica só a alíquota de referência", () => {
    expect(estimarIcms("SP", "RS", 0).valor).toBeUndefined();
  });
});

describe("remessa e retorno não recebem alíquota de referência", () => {
  const cfop = (familia, codigoFormatado) => ({ familia, codigoFormatado });

  // ⚠⚠ VISTO NA VALIDAÇÃO DA TELA (22/09/2026): a remessa de R$ 222.769,58 saía com "12% ·
  // R$ 26.732,35". Número plausível, grande e provavelmente errado — a remessa para
  // industrialização em SP costuma correr com SUSPENSÃO (art. 402 do RICMS/SP).
  it.each(["Remessa", "Retorno", "Entrega futura", "Outras saídas"])("%s não recebe alíquota", (f) => {
    const r = icmsDeReferencia("SP", "RS", cfop(f, "6.901"));
    expect(r.estado).toBe(ESTADO.NAO_DETERMINADO);
    expect(r.aliquota).toBeUndefined();
  });

  // ⚠ E o portal NÃO afirma que há suspensão: suspensão tem condições e prazo. Ele se cala e diz
  // por quê — afirmá-la sem conferir seria o mesmo pecado ao contrário.
  it("o motivo cita a suspensão como possibilidade a confirmar, não como fato", () => {
    const m = icmsDeReferencia("SP", "RS", cfop("Remessa", "6.901")).motivo;
    expect(m).toMatch(/costuma ter tratamento próprio/i);
    expect(m).toMatch(/art\. 402 do RICMS\/SP/);
    expect(m).toMatch(/sem antes confirmar/i);
  });

  it.each(["Venda", "Industrialização"])("%s continua recebendo a referência", (f) => {
    expect(icmsDeReferencia("SP", "RS", cfop(f, "6.101")).aliquota).toBe(12);
  });

  it("sem CFOP, a referência sai (a tela ainda vai pedir o código)", () => {
    expect(icmsDeReferencia("SP", "RS").aliquota).toBe(12);
  });

  it("estimarIcms respeita o corte por família", () => {
    expect(estimarIcms("SP", "RS", 222769.58, cfop("Remessa", "6.901")).valor).toBeUndefined();
  });
});
