import { describe, it, expect } from "vitest";
import { camposEditaveisCmr, mapearLancamento } from "@/lib/cmr";
import { linhaParaFormulario } from "@/app/compras/recebimento-cmr/CmrCampos";

// ⚠ POR QUE ESTE TESTE EXISTE. A edição de um lançamento CMR grava o FORMULÁRIO INTEIRO por cima do
// registro — é o que deixa "corrigir a linha" ser uma operação simples. O preço é que todo campo que
// não for carregado de volta no formulário volta VAZIO para o banco, e isso não dá erro em lugar
// nenhum: o dado some calado. Aqui a pergunta é a ida e a volta, campo a campo.

const FORM = {
  rc: "RC",
  descricao: "PERFIL W 200X15 ACO CARBONO",
  especificacao: "ASTM A572 GR50",
  certificado: "CERT-8842",
  loteCorrida: "C-1190",
  pedidoCompra: "4471",
  dataRecebimento: "2026-09-03",
  validade: "2027-04-30",
  nf: "118422",
  fornecedor: "GERDAU",
  obra: "OP 067",
  qtd: "12",
  pesoLitro: "1350,5",
  observacao: "chegou com a nota separada",
};

describe("camposEditaveisCmr — o que uma correção pode e não pode mexer", () => {
  // ⚠⚠ O ÍNDICE R É A CHAVE ENTRE O PORTAL, A PLANILHA E O QUE ESTÁ ESCRITO NO MATERIAL. Trocá-lo
  // não corrige um campo: aponta o registro para outro material.
  it("não deixa a edição tocar no índice R nem na categoria", () => {
    const d = camposEditaveisCmr(FORM);
    for (const proibido of ["importRef", "categoria", "tipo"]) expect(d).not.toHaveProperty(proibido);
  });

  // ⚠ `origem` conta de ONDE a linha veio (planilha ou portal). Uma linha importada do Excel que
  // alguém completou no portal continua tendo vindo do Excel.
  it("não reescreve a origem nem quem criou o lançamento", () => {
    const d = camposEditaveisCmr(FORM);
    expect(d).not.toHaveProperty("origem");
    expect(d).not.toHaveProperty("createdById");
  });

  // ⚠⚠ ESTE É O QUE APAGA DADO EM SILÊNCIO. O formulário de edição não tem campo de anexo; sem a
  // guarda, corrigir a NF de uma linha apagaria o certificado em PDF preso a ela.
  it("não apaga o anexo de quem não mandou anexo", () => {
    const d = camposEditaveisCmr(FORM);
    expect(d).not.toHaveProperty("arquivoUrl");
    expect(d).not.toHaveProperty("arquivoNome");
  });

  it("mas troca o anexo quando ele vem no pedido", () => {
    const d = camposEditaveisCmr({ ...FORM, arquivoUrl: "https://x/cert.pdf", arquivoNome: "cert.pdf" });
    expect(d.arquivoUrl).toBe("https://x/cert.pdf");
  });

  // O resto é o mesmo mapeamento do lançamento — inclusive a obra canônica, que é o que casa o
  // material com a OP.
  it("grava os campos com as mesmas regras do lançamento", () => {
    const d = camposEditaveisCmr(FORM);
    expect(d.nome).toBe(FORM.descricao);
    expect(d.norma).toBe("ASTM A572 GR50");
    expect(d.opNumero).toBe("067");
    expect(d.numeroDocumento).toBe("CERT-8842");
    expect(d.pesoKg).toBe(1350.5);
    expect(d.quantidade).toBe(12);
    expect(d.observacao).toBe("Tipo: RC | chegou com a nota separada");
    expect(d.dataValidade?.toISOString().slice(0, 10)).toBe("2027-04-30");
  });
});

describe("linhaParaFormulario — a volta, que é onde some dado", () => {
  /** O que a listagem entrega para a tela: o registro do banco + `obs`/`rc` já separados. */
  const comoVemDaTela = (form) => {
    const d = mapearLancamento(form, "260123", null);
    const m = String(d.observacao || "").match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
    return { ...d, id: "x", rc: m ? m[1] : "", obs: m ? d.observacao.slice(m[0].length) : d.observacao };
  };

  it("devolve ao formulário exatamente o que foi gravado", () => {
    const volta = linhaParaFormulario(comoVemDaTela(FORM));
    expect(volta).toEqual({ ...FORM, qtd: 12, pesoLitro: 1350.5 });
  });

  // ⚠⚠ O CASO QUE MOTIVOU O `dataValidade` NO SELECT DA LISTAGEM. Tinta tem validade, e o FEFO vive
  // dela; se a volta não trouxer a validade, corrigir a NF de um lote de tinta zera o vencimento.
  it("traz a validade da tinta de volta, senão corrigir a NF apagaria o FEFO", () => {
    const tinta = { ...FORM, descricao: "TINTA EPOXI CINZA", validade: "2027-01-15" };
    expect(linhaParaFormulario(comoVemDaTela(tinta)).validade).toBe("2027-01-15");
  });

  // ⚠ A obra volta com o prefixo porque é assim que a tela sempre mostrou. Devolver "067" cru faria
  // a edição parecer ter mudado o campo quando ninguém tocou nele.
  it("devolve a obra na forma que a tela usa, e ela volta à canônica ao salvar", () => {
    const volta = linhaParaFormulario(comoVemDaTela(FORM));
    expect(volta.obra).toBe("OP 067");
    expect(camposEditaveisCmr(volta).opNumero).toBe("067");
  });

  // Linha sem nada preenchido não pode virar "undefined" dentro de um input controlado — React
  // troca o campo para não-controlado e o valor digitado some no primeiro render seguinte.
  it("campo vazio vira string vazia, nunca undefined", () => {
    const volta = linhaParaFormulario({ id: "y", nome: "SÓ A DESCRIÇÃO" });
    for (const [k, v] of Object.entries(volta)) {
      expect(v, `campo ${k}`).toBeDefined();
      expect(v, `campo ${k}`).not.toBeNull();
    }
    expect(volta.rc).toBe("R");
  });
});
