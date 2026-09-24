import { describe, it, expect } from "vitest";
import { conferirProsa, lastroDosBlocos, blocoNcm, blocoLegislacao, blocoRegra, blocoClassificacao } from "@/lib/fiscal/assistente/contrato";

// ⚠⚠ ESTE ARQUIVO GUARDA A ÚNICA PROMESSA QUE O BRIEFING FAZ DUAS VEZES: não inventar alíquota,
// artigo, CFOP nem NCM. Se um teste daqui cair, o assistente está afirmando coisa sem lastro.

const blocosDoNcm = () => [blocoNcm({
  ncmFormatado: "8437.90.00",
  descricaoCompleta: "Partes de máquinas para limpeza de grãos",
  // ⚠⚠ A FORMA QUE `aliquotaParaTela` DEVOLVE DE VERDADE — tipo, valor, rótulo. A fixture antiga só
  // tinha o rótulo, e passava porque o lastro varria o JSON inteiro e achava "5%" no texto. Com o
  // lastro tipado (24/09/2026), fixture fora de forma vira teste vermelho — que é o certo.
  ncm: "84379000",
  geral: { ipi: { tipo: "PERCENTUAL", valor: 5, rotulo: "5%" } },
  excecoes: [],
  referencia: { tipi: { fonte: { sha256: "abc123", url: "https://x" } } },
})];

describe("conferirProsa — o que o modelo escreve tem de ter lastro", () => {
  it("aceita a alíquota e o NCM que vieram do bloco", () => {
    const { avisos } = conferirProsa("A TIPI tributa o NCM 8437.90.00 a 5%.", blocosDoNcm());
    expect(avisos).toEqual([]);
  });

  it("acusa alíquota que não está em nenhuma evidência", () => {
    const { avisos } = conferirProsa("A alíquota é 12%.", blocosDoNcm());
    expect(avisos).toEqual([{ tipo: "alíquota", citado: "12%" }]);
  });

  it("acusa NCM inventado", () => {
    const { avisos } = conferirProsa("Use o NCM 7308.90.90.", blocosDoNcm());
    expect(avisos).toContainEqual({ tipo: "NCM", citado: "7308.90.90" });
  });

  it("acusa CFOP inventado", () => {
    const { avisos } = conferirProsa("Emita com CFOP 5.101.", blocosDoNcm());
    expect(avisos).toContainEqual({ tipo: "CFOP", citado: "5.101" });
  });

  it("acusa artigo legal inventado", () => {
    const { avisos } = conferirProsa("Conforme o artigo 406 do RICMS.", blocosDoNcm());
    expect(avisos).toContainEqual({ tipo: "artigo", citado: "art. 406" });
  });

  it("aceita o artigo quando o dispositivo foi realmente recuperado", () => {
    const blocos = [blocoLegislacao([{ rotulo: "Artigo 406, II", trecho: "Na saída...", norma: "RICMS/SP", url: "u", sha256: "s", peso: "VINCULANTE" }])];
    const { avisos } = conferirProsa("Conforme o artigo 406, inciso II.", blocos);
    expect(avisos.filter((a) => a.tipo === "artigo")).toEqual([]);
  });

  // ⚠⚠ ESTE É O TESTE QUE PEGA A ARMADILHA DO REGEX: "8437.90.00" CONTÉM "8437", que casaria como
  // CFOP 8.437 — não, mas "5101.00.00" conteria o CFOP 5.101. Sem remover os NCMs antes de varrer
  // CFOP, todo NCM legítimo viraria um CFOP inventado.
  it("não confunde o NCM com um CFOP escondido dentro dele", () => {
    const blocos = [blocoNcm({
      ncm: "51010000", ncmFormatado: "5101.00.00", descricaoCompleta: "Lã", geral: { ipi: { tipo: "PERCENTUAL", valor: 0, rotulo: "0%" } }, excecoes: [],
      referencia: { tipi: { fonte: { sha256: "a", url: "u" } } },
    })];
    const { avisos } = conferirProsa("O NCM 5101.00.00 é lã.", blocos);
    expect(avisos).toEqual([]);
  });

  it("texto vazio não gera aviso", () => {
    expect(conferirProsa("", blocosDoNcm()).avisos).toEqual([]);
    expect(conferirProsa(null, []).avisos).toEqual([]);
  });
});

describe("lastroDosBlocos — a evidência sai do lastro TIPADO de cada bloco", () => {
  it("extrai alíquota, NCM e artigo dos blocos", () => {
    const l = lastroDosBlocos([
      ...blocosDoNcm(),
      blocoLegislacao([{ rotulo: "Artigo 406", trecho: "texto", norma: "RICMS", url: "u", sha256: "s", peso: "VINCULANTE" }]),
    ]);
    expect(l.ncms.has("84379000")).toBe(true);
    expect(l.aliquotas.has("5")).toBe(true);
    expect(l.artigos.has("406")).toBe(true);
  });
});

describe("os cinco estados da regra sobrevivem ao bloco", () => {
  it("CONTESTADA vira bloqueio no bloco", () => {
    const b = blocoRegra({ id: "cfop:5101", titulo: "5.101", situacao: "CONTESTADA", bloqueada: true, motivo: "A contabilidade contestou." });
    expect(b.bloqueio).toBe("A contabilidade contestou.");
  });
  it("INDISPONIVEL também bloqueia", () => {
    const b = blocoRegra({ id: "x", titulo: "x", situacao: "INDISPONIVEL", bloqueada: true, motivo: "suspensa" });
    expect(b.bloqueio).toBe("suspensa");
  });
  it("PENDENTE e ALTERADA orientam sem bloquear, mas dizem que não foi conferida", () => {
    for (const s of ["PENDENTE", "ALTERADA"]) {
      const b = blocoRegra({ id: "x", titulo: "x", situacao: s, bloqueada: false, motivo: "não conferida" });
      expect(b.bloqueio).toBeNull();
      expect(JSON.stringify(b.linhas)).toContain(s);
    }
  });
});

describe("classificação nunca vira enquadramento", () => {
  it("o bloco carrega o aviso de que não enquadra", () => {
    const b = blocoClassificacao({ status: "CORRESPONDENCIA_UNICA", motivo: "A descrição contém FLANGE.",
      candidatos: [{ ncm: "84379000", padrao: "FLANGE", aprovadoPor: "Eduarda", fundamento: "RC 5788/2015" }] });
    expect(b.aviso).toMatch(/não enquadramento automático/i);
    // ⚠⚠ O APROVADOR TEM DE APARECER — foi exatamente este campo que saiu "—" no §14 por eu ter
    // lido a chave errada. O teste agora usa a forma que o motor REALMENTE devolve.
    expect(JSON.stringify(b.linhas)).toContain("Eduarda");
    expect(JSON.stringify(b.linhas)).toContain("CORRESPONDENCIA_UNICA");
  });
});

// ─── O CÓDIGO DA NOTA NÃO É RECOMENDAÇÃO ─────────────────────────────────────
//
// ⚠⚠⚠ O ACHADO HIGH DO PARECER DE SEGURANÇA (24/09/2026). Com o XML de uma REMESSA anexado, o CFOP
// 5.915 entra na conversa. Se ele valesse como lastro igual ao de uma regra, "use o 5.915 no
// retorno" passaria sem aviso — o erro exato que o §16 do briefing proíbe.
import { lastro, ORIGEM, BLOCO } from "@/lib/fiscal/assistente/contrato";
import { blocoDocumento } from "@/lib/fiscal/assistente/blocos-documento";
import { lerAnexoNfe } from "@/lib/fiscal/assistente/anexo-nfe";
import { nfe } from "@/testes/apoio/nfe-exemplo";

describe("o que a nota declara × o que uma regra recomenda", () => {
  const docDaRemessa = () => blocoDocumento(lerAnexoNfe(nfe()).doc, { nome: "remessa.xml" });

  it("o CFOP que SÓ existe na nota vira aviso próprio (`soDocumento`), não passa calado", () => {
    const { avisos } = conferirProsa("Para o retorno, use o CFOP 5.915.", [docDaRemessa()]);
    expect(avisos).toContainEqual({ tipo: "CFOP", citado: "5.915", soDocumento: true });
  });

  it("…e também não é acusado de INVENTADO — ele existe, só não é recomendação", () => {
    const { avisos } = conferirProsa("A nota foi emitida com o CFOP 5.915.", [docDaRemessa()]);
    expect(avisos.filter((a) => a.tipo === "CFOP" && !a.soDocumento)).toEqual([]);
  });

  it("quando uma REGRA também respalda o código, não há aviso nenhum", () => {
    const regra = { tipo: BLOCO.CFOP, linhas: [], fontes: [], lastro: lastro(ORIGEM.REGRA, { cfops: ["5916"] }) };
    const { avisos } = conferirProsa("O retorno usa o CFOP 5.916.", [docDaRemessa(), regra]);
    expect(avisos).toEqual([]);
  });

  it("o CFOP de retorno que NINGUÉM consultou continua acusado como sem fonte", () => {
    const { avisos } = conferirProsa("O retorno usa o CFOP 5.916.", [docDaRemessa()]);
    expect(avisos).toContainEqual({ tipo: "CFOP", citado: "5.916" });
  });
});

describe("o lastro lê o campo tipado, nunca o texto do bloco", () => {
  // ⚠⚠ O FURO ANTIGO: varrendo o JSON, o art. 407 citado DENTRO do corpo do 406 virava "comprovado".
  it("artigo citado dentro do TRECHO de outro artigo não conta como recuperado", () => {
    const b = blocoLegislacao([{ rotulo: "Artigo 406", trecho: "…observado o disposto no artigo 407…", norma: "RICMS", url: "u", sha256: "s", peso: "VINCULANTE" }]);
    const { avisos } = conferirProsa("Conforme o artigo 407.", [b]);
    expect(avisos).toContainEqual({ tipo: "artigo", citado: "art. 407" });
  });

  it("número no texto livre da nota não vira lastro de nada", () => {
    const doc = blocoDocumento(lerAnexoNfe(nfe({ natOp: "RETORNO CONFORME CFOP 6107" })).doc, {});
    const { avisos } = conferirProsa("Use o CFOP 6.107.", [doc]);
    expect(avisos).toContainEqual({ tipo: "CFOP", citado: "6.107" });
  });

  it("CST rotulado é conferido; dois dígitos soltos não", () => {
    const { avisos } = conferirProsa("Emita com CST 53. São 50 peças.", [docDaRemessaSemCst()]);
    expect(avisos).toContainEqual({ tipo: "CST", citado: "CST 53" });
    expect(avisos.some((a) => a.citado === "CST 50")).toBe(false);
  });
});

function docDaRemessaSemCst() {
  return { tipo: BLOCO.NCM, linhas: [], fontes: [], lastro: lastro(ORIGEM.TIPI, {}) };
}
