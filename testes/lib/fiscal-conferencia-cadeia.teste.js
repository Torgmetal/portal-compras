import { describe, it, expect } from "vitest";
import { ESTADO, cfopsDaNota, conferirCadeia, operacaoPorId } from "@/lib/fiscal/conferencia-cadeia";

// ─── A CONFERÊNCIA DA CADEIA ─────────────────────────────────────────────────
//
// ⚠⚠ O QUE ESTES TESTES DEFENDEM É O QUE ELA SE RECUSA A DIZER. "Falta uma nota" é a frase que o
// recurso existe para NÃO produzir: metade da cadeia é emitida por terceiros e nunca passou pelo
// Omie da TORG, e nem toda nota da TORG passa por medição. Toda negativa carrega o escopo.

const cobertura = (over = {}) => ({ fontes: ["2 medições"], escopo: "as 2 medições da OP", falhas: [], ...over });
const doc = (over = {}) => ({
  origem: "MEDICAO", cfops: ["6101"], numero: "973", serie: "1", chave: "35…", situacao: "AUTORIZADA",
  vinculo: "medição 12", ...over,
});
const etapa = (r, cfop) => r.etapas.find((e) => e.cfop === cfop);

describe("os códigos da etapa", () => {
  it("“5925/6925” são alternativas, não um código fundido", () => {
    expect(cfopsDaNota("5925/6925")).toEqual(["5925", "6925"]);
  });
  it("aceita o código pontuado e descarta o vazio", () => {
    expect(cfopsDaNota("5.101")).toEqual(["5101"]);
    expect(cfopsDaNota(null)).toEqual([]);
  });
});

describe("venda normal — a cadeia de uma nota só", () => {
  const op = operacaoPorId("venda-normal");

  it("acha a venda quando a NF da medição tem o CFOP", () => {
    const r = conferirCadeia(op, [doc()], cobertura());
    expect(etapa(r, "5101/6101").estado).toBe(ESTADO.ENCONTRADO);
    expect(r.resumo.encontradas).toBe(1);
  });

  // ⚠⚠ "NÃO LOCALIZADO" CARREGA O ESCOPO — nunca "ausente da OP".
  it("sem documento, o motivo diz ONDE procurou", () => {
    const r = conferirCadeia(op, [], cobertura());
    const e = etapa(r, "5101/6101");
    expect(e.estado).toBe(ESTADO.NAO_ENCONTRADO);
    expect(e.motivo).toContain("as 2 medições da OP");
    expect(e.motivo).not.toContain("ausente");
  });

  // ⚠⚠ CONSULTA QUE FALHOU NÃO VIRA AUSÊNCIA.
  it("nenhuma fonte respondendo é NAO_CONSULTADO, não NAO_ENCONTRADO", () => {
    const r = conferirCadeia(op, [], cobertura({ fontes: [], falhas: ["Omie HTTP 500"], escopo: "nenhuma fonte" }));
    expect(etapa(r, "5101/6101").estado).toBe(ESTADO.NAO_CONSULTADO);
    expect(r.resumo.naoLocalizadas).toBe(0);
  });

  // ⚠⚠ CANCELADA É EVIDÊNCIA, NÃO CUMPRIMENTO.
  it("NF cancelada não cumpre a etapa, mas aparece como evidência", () => {
    const r = conferirCadeia(op, [doc({ situacao: "CANCELADA" })], cobertura());
    const e = etapa(r, "5101/6101");
    expect(e.estado).toBe(ESTADO.NAO_ENCONTRADO);
    expect(e.evidencias).toHaveLength(1);
    expect(e.motivo).toContain("cancelado");
  });

  it("a busca incompleta é dita mesmo quando não achou", () => {
    const r = conferirCadeia(op, [], cobertura({ falhas: ["pedido 12: Omie bloqueou"] }));
    expect(etapa(r, "5101/6101").motivo).toContain("ficou incompleta");
  });
});

describe("industrialização com MP do cliente — cinco documentos, três emitentes", () => {
  const op = operacaoPorId("indust-mp-cliente");

  // ⚠⚠ O CORAÇÃO DO RECURSO: o que é de terceiro NUNCA vira "falta".
  it("as notas do fornecedor e do cliente saem FORA_DO_ALCANCE, não ausentes", () => {
    const r = conferirCadeia(op, [], cobertura());
    for (const c of ["5122/5123", "5924/6924", "5949/6949"]) {
      expect(etapa(r, c).estado).toBe(ESTADO.FORA_DO_ALCANCE);
      expect(etapa(r, c).motivo).toContain("documento recebido");
    }
    // as duas da TORG continuam sendo procuradas
    expect(etapa(r, "5925/6925").estado).toBe(ESTADO.NAO_ENCONTRADO);
    expect(etapa(r, "5125/6125").estado).toBe(ESTADO.NAO_ENCONTRADO);
  });

  it("a remessa simbólica do cliente — a etapa que faltava no portal — está na cadeia", () => {
    const r = conferirCadeia(op, [], cobertura());
    const e = etapa(r, "5949/6949");
    expect(e.quem).toBe("Cliente");
    expect(e.natureza).toBe("simbólica");
    expect(e.cita.rotulo).toBe("Artigo 406, II");
  });

  it("uma nota com dois CFOPs cumpre as duas etapas da TORG", () => {
    const r = conferirCadeia(op, [doc({ cfops: ["6925", "6125"] })], cobertura());
    expect(etapa(r, "5925/6925").estado).toBe(ESTADO.ENCONTRADO);
    expect(etapa(r, "5125/6125").estado).toBe(ESTADO.ENCONTRADO);
  });
});

describe("as etapas condicionais", () => {
  // ⚠⚠ A CADEIA DE "DOIS CAMINHÕES" DESCREVE DOIS CENÁRIOS NO MESMO ARRAY, e o 5.922 só existe
  // num deles. Cobrar os dois marcaria como defeito o comportamento correto.
  it("não entram na contagem de não localizadas", () => {
    const r = conferirCadeia(operacaoPorId("dois-caminhoes"), [], cobertura());
    expect(r.resumo.naoLocalizadas).toBe(0);
    expect(r.resumo.condicionaisNaoLocalizadas).toBe(3);
    expect(etapa(r, "5922/6922").condicional).toContain("ENTREGA FUTURA");
  });

  it("a dispensa do parágrafo único do art. 406 fica escrita na etapa do fornecedor", () => {
    const r = conferirCadeia(operacaoPorId("indust-mp-cliente"), [], cobertura());
    expect(etapa(r, "5924/6924").condicional).toContain("DISPENSA");
  });
});

describe("a ressalva de fecho", () => {
  // ⚠⚠ ELA NUNCA DIZ "CADEIA COMPLETA", nem quando tudo o que a TORG emite foi achado.
  it("acompanha o resultado mesmo com todas as etapas da TORG encontradas", () => {
    const r = conferirCadeia(operacaoPorId("venda-normal"), [doc()], cobertura());
    expect(r.resumo.naoLocalizadas).toBe(0);
    expect(r.ressalva).toContain("não afirma que a cadeia está completa");
    expect(r.ressalva).toContain("não prova que a etapa foi cumprida em quantidade");
  });
});

describe("etapa sem CFOP na cadeia", () => {
  it("é FORA_DO_ALCANCE — não há critério de busca, então não há negativa", () => {
    const r = conferirCadeia(operacaoPorId("venda-a-ordem"), [], cobertura());
    const semCfop = r.etapas.find((e) => e.cfop === null);
    expect(semCfop.estado).toBe(ESTADO.FORA_DO_ALCANCE);
  });
});

// ⚠⚠ QUEM CASOU SAI POR ID: depois do JSON, a evidência da etapa e o documento da lista são
// objetos diferentes com o mesmo conteúdo. Comparar por referência marcaria a obra inteira como
// "documentos que não casaram com nenhuma etapa".
describe("os documentos que casaram", () => {
  it("saem por id, e o id sobrevive ao JSON", () => {
    const d = doc({ id: "medicao:abc" });
    const r = JSON.parse(JSON.stringify(conferirCadeia(operacaoPorId("venda-normal"), [d], cobertura())));
    expect(r.casados).toEqual(["medicao:abc"]);
    expect(r.casados.includes(JSON.parse(JSON.stringify(d)).id)).toBe(true);
  });

  it("documento que não casou etapa nenhuma fica de fora da lista", () => {
    const r = conferirCadeia(operacaoPorId("venda-normal"), [doc({ id: "a", cfops: ["5949"] })], cobertura());
    expect(r.casados).toEqual([]);
  });
});
