import { describe, it, expect } from "vitest";
import { simular, ipiDaTipi, ambitoDe, NAO_DETERMINADOS } from "@/lib/fiscal/simulador";
import { AMBITO } from "@/lib/fiscal/cfop";

// ─── O SIMULADOR ─────────────────────────────────────────────────────────────
//
// ⚠⚠ É A METADE PREVENTIVA DA AUDITORIA, e é o ponto do módulo inteiro. Matheus (22/09/2026), sobre
// a NF-e 973: *"o operador não sabia que o NCM precisava destacar IPI, por isso estamos criando
// essa tela, para ajudar ele"*. O teste-chave aqui é justamente esse: a simulação da operação que
// gerou a 973 tem de ACENDER O ALERTA que ninguém acendeu na hora.

const linha = (valor, tipo = "PERCENTUAL") => ({ aliquotaTipo: tipo, aliquotaValor: valor });
const tipi = (geral, excecoes = []) => ({ geral, excecoes });

describe("ambitoDe — o âmbito cai das UFs, não é escolhido", () => {
  it.each([["SP", "SP", AMBITO.INTERNA], ["SP", "RS", AMBITO.INTERESTADUAL], ["sp", "rs", AMBITO.INTERESTADUAL]])(
    "%s → %s é %s", (a, b, esp) => expect(ambitoDe(a, b)).toBe(esp));

  // ⚠ Deixar o usuário escolher o âmbito é deixar ele errar o 5.xxx/6.xxx.
  it.each([["SP", ""], ["", "RS"], [null, null]])("sem as duas UFs não há âmbito", (a, b) => {
    expect(ambitoDe(a, b)).toBeNull();
  });
});

describe("ipiDaTipi — o CST é consequência da tabela, não escolha", () => {
  it("alíquota positiva sugere CST 50 (tributada)", () => {
    expect(ipiDaTipi(linha(3.25))).toMatchObject({ determinado: true, cstSugerido: "50", rotulo: "3,25%" });
  });

  // ⚠⚠ ZERO É TRIBUTAÇÃO, e o CST 51 diz isso. Tratá-lo como 53 seria afirmar que o produto está
  // fora do campo de incidência — outra coisa, com outra prova.
  it("alíquota zero sugere CST 51, não 53", () => {
    const r = ipiDaTipi(linha(0));
    expect(r.cstSugerido).toBe("51");
    expect(r.nota).toMatch(/tributação, não ausência/i);
  });

  it("NT sugere CST 53", () => {
    expect(ipiDaTipi(linha(null, "NT"))).toMatchObject({ cstSugerido: "53", rotulo: "NT — não tributado" });
  });

  it("sem linha na TIPI, não determina", () => {
    expect(ipiDaTipi(null).determinado).toBe(false);
  });
});

describe("simular — o alerta que a NF-e 973 não teve", () => {
  const entrada973 = {
    ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS",
    valor: 2542, cstPretendido: "53",
  };

  // ⚠⚠ O TESTE QUE JUSTIFICA A TELA. Mesma regra do motor de auditoria, aplicada ANTES de emitir.
  it("CST 53 pretendido num NCM tributado acende alerta ALTO", () => {
    const r = simular(entrada973, tipi(linha(3.25)));
    const a = r.alertas.find((x) => x.nivel === "alto");
    expect(a.texto).toMatch(/CST 53 .*Saída não tributada/);
    expect(a.texto).toMatch(/TIPI tributa o 84379000 a 3,25%/);
    expect(a.texto).toMatch(/exige fundamento legal/);
  });

  it("sem CST pretendido, o simulador sugere o da tabela e não alarma", () => {
    const r = simular({ ...entrada973, cstPretendido: null }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => x.nivel === "alto")).toEqual([]);
    expect(r.ipi).toMatchObject({ cstSugerido: "50", cstRotulo: "Saída tributada" });
  });

  it("CST coerente com a tabela não alarma", () => {
    const r = simular({ ...entrada973, cstPretendido: "50" }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => x.nivel === "alto")).toEqual([]);
  });

  it("a estimativa é sobre o valor digitado", () => {
    const r = simular(entrada973, tipi(linha(3.25)));
    expect(r.ipi.estimativa).toEqual({ base: 2542, aliquota: 3.25, valor: 82.62 });
  });

  // ⚠ Ex TIPI presente derruba a certeza — a alíquota geral deixa de decidir sozinha.
  it("NCM com Ex TIPI vira ressalva", () => {
    const r = simular(entrada973, tipi(linha(3.25), [linha(0)]));
    expect(r.alertas.some((a) => /Ex TIPI/.test(a.texto))).toBe(true);
  });
});

describe("simular — o que ele se RECUSA a calcular", () => {
  // ⚠⚠ O BRIEFING PROÍBE EXPLICITAMENTE: *"não aplicar automaticamente 12% de ICMS a toda venda
  // interestadual"* e *"não aplicar PIS 1,65% e COFINS 7,6% a todas as operações"*. Um número
  // plausível aqui é pior que um campo vazio: o vazio manda perguntar, o plausível vai para a nota.
  it("ICMS, PIS/COFINS e IBS/CBS saem como não determinados, COM motivo", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    expect(r.naoDeterminados.map((x) => x.tributo)).toEqual(["ICMS", "PIS/COFINS", "IBS/CBS"]);
    for (const nd of r.naoDeterminados) expect(nd.motivo.length).toBeGreaterThan(40);
  });

  it("nenhum tributo além do IPI vem com número", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", valor: 1000 }, tipi(linha(3.25)));
    const texto = JSON.stringify(r.naoDeterminados);
    expect(texto).not.toMatch(/"valor"|"aliquota"/);
  });

  // ⚠⚠ cEnq NÃO É SUGERIDO. O briefing proíbe atribuir 999 automaticamente, e sugerir um código
  // aqui seria o portal inventando fundamento legal.
  it("o enquadramento legal nunca é preenchido sozinho", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.ipi.cEnq).toBeNull();
    expect(r.ipi.cEnqNota).toMatch(/não é sugerido automaticamente/i);
  });

  it("NCM fora da TIPI não é simulado — manda rever a classificação", () => {
    const r = simular({ ncm: "99999999", cfop: "6101", ufOrigem: "SP", ufDestino: "RS" }, undefined);
    expect(r.ipi.determinado).toBe(false);
    expect(r.ipi.motivo).toMatch(/classificação precisa ser revista/i);
  });
});

describe("simular — as perguntas que faltam", () => {
  it("sem UF e sem operação, o simulador pergunta em vez de chutar", () => {
    const r = simular({ ncm: "84379000" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /UF de origem/.test(p))).toBe(true);
    expect(r.perguntas.some((p) => /Escolha o CFOP/.test(p))).toBe(true);
  });

  // ⚠ Cada CFOP candidato traz o que ainda precisa ser respondido — é isso que impede o simulador
  // de virar um carimbo.
  it("a industrialização pergunta de quem são os insumos e por onde transitaram", () => {
    const r = simular({ ncm: "84379000", cfop: "5901", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /insumos/i.test(p))).toBe(true);
    expect(r.alertas.some((a) => /TRÂNSITO dos insumos/i.test(a.texto))).toBe(true);
  });

  it("o CFOP escolhido traz a descrição e os exemplos reais em que aparece", () => {
    const r = simular({ ncm: "84379000", cfop: "6118", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    expect(r.cfop.escolhido).toMatchObject({ codigoFormatado: "6.118", ambito: "INTERESTADUAL" });
    expect(r.cfop.operacoes.map((o) => o.id)).toContain("venda-a-ordem");
    expect(r.cfop.ressalva).toMatch(/pendente de conferência/i);
  });

  // ⚠⚠ A VERIFICAÇÃO QUE SÓ EXISTE PORQUE O USUÁRIO ESCOLHE O CÓDIGO. 5.xxx é interna e 6.xxx é
  // interestadual — o primeiro dígito não é decoração. Escolher 5.101 numa venda para o RS é erro
  // que a SEFAZ rejeita, e é o tipo de coisa que o operador não sabe de cabeça.
  it("CFOP interno com destino fora do estado acende alerta ALTO", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "RS" }, tipi(linha(3.25)));
    const a = r.alertas.find((x) => x.nivel === "alto");
    expect(a.texto).toMatch(/5\.101 é de operação INTERNA/);
    expect(a.texto).toMatch(/O código equivalente é o 6\.101/);
  });

  it("CFOP coerente com as UFs não alarma", () => {
    const r = simular({ ncm: "84379000", cfop: "5101", ufOrigem: "SP", ufDestino: "SP" }, tipi(linha(3.25)));
    expect(r.alertas.filter((x) => /operação INTERNA|INTERESTADUAL/.test(x.texto))).toEqual([]);
  });

  // ⚠⚠ LISTA QUE PERGUNTA O QUE JÁ FOI RESPONDIDO ENSINA A IGNORAR A LISTA, e aí a pergunta que
  // importa some junto. Os `exige` de cada CFOP são estáticos — pedem "UF de destino" mesmo com o
  // campo preenchido. Apareceu na primeira validação da tela.
  it("não repete a pergunta que a entrada já responde", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", destinatarioContribuinte: true }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /UF de destino/i.test(p))).toBe(false);
    expect(r.perguntas.some((p) => /contribuinte/i.test(p))).toBe(false);
  });

  // ⚠ Conservador de propósito: sem a resposta, a pergunta FICA. Perguntar de novo é ruído;
  // deixar de perguntar é o defeito que o módulo existe para evitar.
  it("sem a resposta, a pergunta continua na lista", () => {
    const r = simular({ ncm: "84379000", cfop: "6101" }, tipi(linha(3.25)));
    expect(r.perguntas.some((p) => /contribuinte/i.test(p))).toBe(true);
  });

  it("destinatário não contribuinte vira aviso sobre o ICMS", () => {
    const r = simular({ ncm: "84379000", cfop: "6101", ufOrigem: "SP", ufDestino: "RS", destinatarioContribuinte: false }, tipi(linha(3.25)));
    expect(r.alertas.some((a) => /não contribuinte/i.test(a.texto))).toBe(true);
  });
});

describe("NAO_DETERMINADOS — o motivo é parte do contrato", () => {
  it("cada tributo diz por que não foi determinado", () => {
    expect(NAO_DETERMINADOS).toHaveLength(3);
    for (const x of NAO_DETERMINADOS) {
      expect(x.tributo).toBeTruthy();
      expect(x.motivo).toBeTruthy();
    }
  });
});
