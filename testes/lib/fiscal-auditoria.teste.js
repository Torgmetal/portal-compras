import { describe, it, expect } from "vitest";
import { lerNfe } from "@/lib/fiscal/xml-nfe";
import { auditar, indiceDaTipi, GRAVIDADE } from "@/lib/fiscal/auditoria";

// ─── A AUDITORIA DA NF-e ─────────────────────────────────────────────────────
//
// ⚠⚠ O CASO REAL QUE ORIGINOU ISTO (NF-e 973, TORG → TMSA, 14/09/2026): 24 itens, todos NCM
// 8437.90.00 e CFOP 6101 — 22 com CST 53 ("saída não tributada") e 2 com CST 50 a 3,25%. Matheus
// (22/09/2026): *"o fiscal realmente esqueceu de declarar o IPI, porque o operador não sabia que o
// NCM precisava destacar — por isso estamos criando essa tela, para ajudar ele"*.
//
// ⚠⚠ E O SISTEMA APONTA, NÃO CONDENA. Mesmo sabendo hoje que foi erro, o motor não pode DECLARAR
// erro: ele diz o que a nota afirmou, o que a fonte diz, e por que discordam. Quem conclui é a
// contabilidade — e nenhuma NF complementar sai daqui.

const linha = (codigo, valor, ex = "") => ({
  codigo, ex, aliquotaTipo: valor == null ? "NT" : "PERCENTUAL", aliquotaValor: valor,
});
const tipi = (...ls) => indiceDaTipi(ls);

const nfe = (itens, { emit = "TORG METAL LTDA" } = {}) => `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe35260953694442000141550010000009731484823558">
  <ide><nNF>973</nNF><serie>1</serie><dhEmi>2026-09-14T10:00:00-03:00</dhEmi><natOp>VENDA</natOp></ide>
  <emit><CNPJ>53694442000141</CNPJ><xNome>${emit}</xNome><UF>SP</UF></emit>
  <dest><CNPJ>92782705000126</CNPJ><xNome>TMSA</xNome><UF>RS</UF></dest>
  ${itens}
  <total><ICMSTot><vProd>0</vProd><vIPI>0</vIPI><vNF>0</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

const item = (n, { ncm = "84379000", vProd = 1000, cst = "53", pIPI = null, cEnq = "999", desc = "PEÇA" } = {}) => `
  <det nItem="${n}">
    <prod><cProd>ARM000010</cProd><xProd>ARMACAO DE ESTRUTURAS METALICAS</xProd>
      <NCM>${ncm}</NCM><CFOP>6101</CFOP><uCom>KG</uCom><qCom>1</qCom>
      <vUnCom>${vProd}</vUnCom><vProd>${vProd}</vProd></prod>
    <imposto><IPI><cEnq>${cEnq}</cEnq>
      ${pIPI == null
        ? `<IPINT><CST>${cst}</CST></IPINT>`
        : `<IPITrib><CST>${cst}</CST><vBC>${vProd}</vBC><pIPI>${pIPI}</pIPI><vIPI>${(vProd * pIPI / 100).toFixed(2)}</vIPI></IPITrib>`}
    </IPI></imposto>
    <infAdProd>${desc}</infAdProd>
  </det>`;

describe("lerNfe — o que o Omie não entrega", () => {
  // ⚠⚠ É POR ISTO QUE A AUDITORIA PRECISA DO XML. O `ListarNF` do Omie não devolve CST, cEnq nem
  // `infAdProd` — e os 24 itens da 973 têm o MESMO código e a MESMA descrição de produto. Sem a
  // subdescrição, os itens são indistinguíveis entre si.
  it("extrai CST, cEnq e a descrição real do item", () => {
    const d = lerNfe(nfe(item(1, { desc: "FLANGE MAIOR CONEXAO SAIDA - DES 71264380" })));
    expect(d.itens[0]).toMatchObject({
      ncm: "84379000", cfop: "6101",
      descricao: "ARMACAO DE ESTRUTURAS METALICAS",
      descricaoItem: "FLANGE MAIOR CONEXAO SAIDA - DES 71264380",
    });
    expect(d.itens[0].ipi).toMatchObject({ grupo: "IPINT", cst: "53", cEnq: "999" });
  });

  it("lê o grupo tributado com alíquota e valor", () => {
    const d = lerNfe(nfe(item(1, { cst: "50", pIPI: 3.25, vProd: 3284.08 })));
    expect(d.itens[0].ipi).toMatchObject({ grupo: "IPITrib", cst: "50", aliquota: 3.25, valor: 106.73 });
  });

  it("a chave vem do atributo Id", () => {
    expect(lerNfe(nfe(item(1))).chave).toBe("35260953694442000141550010000009731484823558");
  });

  it.each(["", "<xml>nada</xml>", "não é xml"])("entrada que não é NF-e é recusada", (x) => {
    expect(lerNfe(x).erro).toBeTruthy();
  });
});

describe("auditar — o caso da NF-e 973", () => {
  const base = tipi(linha("84379000", 3.25));

  // ⚠⚠ O ACHADO CENTRAL: não é "vIPI é zero", é que a nota AFIRMOU estar fora do campo de
  // incidência (CST 53) sobre um NCM que a TIPI tributa. Comparar só o valor trataria 51, 52, 53 e
  // 55 como a mesma coisa — e cada um exige uma prova diferente.
  it("CST 53 num NCM tributado vira apontamento de alta gravidade", () => {
    const r = auditar(lerNfe(nfe(item(1, { vProd: 2542 }))), base, { vigenciaDeclarada: false });
    const a = r.achados.find((x) => x.tipo === "IPI_NAO_DESTACADO");
    expect(a.gravidade).toBe(GRAVIDADE.ALTA);
    expect(a.titulo).toMatch(/CST 53 .*3,25%/);
    expect(a.estimativa).toEqual({ base: 2542, aliquota: 3.25, ipi: 82.62 });
  });

  // ⚠⚠ O ACHADO MAIS FORTE, porque não depende de interpretar a lei: o mesmo NCM, no mesmo
  // documento, tratado de dois jeitos. Um dos dois está errado por construção.
  it("o mesmo NCM com dois CSTs na mesma nota é contradição interna", () => {
    const r = auditar(lerNfe(nfe(item(1) + item(2, { cst: "50", pIPI: 3.25 }))), base, {});
    const c = r.achados.find((x) => x.tipo === "CONTRADICAO_INTERNA");
    expect(c.gravidade).toBe(GRAVIDADE.ALTA);
    expect(c.detalhe).toMatch(/CST 53 em 1 item\(ns\) e CST 50 em 1 item\(ns\)/);
  });

  it("nota coerente e tributada não gera apontamento", () => {
    const r = auditar(lerNfe(nfe(item(1, { cst: "50", pIPI: 3.25 }))), base, {});
    expect(r.achados).toEqual([]);
    expect(r.resumo.diferencaEstimada).toBe(0);
  });

  // ⚠ A soma é de ESTIMATIVAS, item a item — que é como sairia numa complementar. Somar a base e
  // aplicar a alíquota no fim daria outro centavo, e o centavo de menos é o que o fiscal confere.
  it("a diferença estimada soma item a item", () => {
    const r = auditar(lerNfe(nfe(item(1, { vProd: 2542 }) + item(2, { vProd: 4158.40 }))), base, {});
    expect(r.resumo.diferencaEstimada).toBe(82.62 + 135.15);
  });
});

describe("auditar — o que ele se RECUSA a concluir", () => {
  // ⚠⚠ REGRA 2: campo ausente produz "não avaliável", NUNCA conformidade. Silêncio por falta de
  // dado é indistinguível de silêncio por estar tudo certo — a pior ambiguidade numa auditoria.
  it("item sem CST não é aprovado: é declarado não avaliável", () => {
    const xml = nfe(`<det nItem="1"><prod><NCM>84379000</NCM><CFOP>6101</CFOP><vProd>100</vProd></prod><imposto/></det>`);
    const r = auditar(lerNfe(xml), tipi(linha("84379000", 3.25)), {});
    const a = r.achados[0];
    expect(a.tipo).toBe("NAO_AVALIAVEL");
    expect(a.faltam).toContain("IPI/CST");
    expect(r.resumo.naoAvaliaveis).toBe(1);
  });

  // ⚠⚠ REGRA 3: Ex desconhecido não significa geral. Com exceções na tabela e sem saber em qual o
  // produto se enquadra, o apontamento sai marcado como INCONCLUSIVO.
  it("NCM com Ex TIPI deixa o apontamento inconclusivo", () => {
    const comEx = tipi(linha("84379000", 3.25), linha("84379000", 0, "01"));
    const r = auditar(lerNfe(nfe(item(1))), comEx, {});
    const a = r.achados.find((x) => x.tipo === "IPI_NAO_DESTACADO");
    expect(a.inconclusivo).toBe(true);
    expect(a.detalhe).toMatch(/Ex TIPI/);
  });

  it("NCM fora da TIPI não é comparado — é apontado como classificação a rever", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "99999999" }))), tipi(linha("84379000", 3.25)), {});
    expect(r.achados[0].tipo).toBe("NCM_FORA_DA_TIPI");
    expect(r.resumo.diferencaEstimada).toBe(0);
  });

  // ⚠⚠ O APONTAMENTO CARREGA A RESSALVA DA REFERÊNCIA. Sem vigência declarada, ele vale contra a
  // tabela que o portal usa HOJE — não contra a comprovadamente vigente na data de emissão. Omitir
  // isso faria um apontamento de nota antiga parecer mais sólido do que é.
  it("sem vigência declarada, a ressalva vai junto do resultado", () => {
    const r = auditar(lerNfe(nfe(item(1))), tipi(linha("84379000", 3.25)), { vigenciaDeclarada: false });
    expect(r.referencia.ressalva).toMatch(/não tem vigência declarada/i);
  });

  it("com vigência declarada, não há ressalva", () => {
    const r = auditar(lerNfe(nfe(item(1))), tipi(linha("84379000", 3.25)), { vigenciaDeclarada: true });
    expect(r.referencia.ressalva).toBeNull();
  });

  // ⚠ "NT" na TIPI não é alíquota positiva: CST 53 sobre ele é coerente, não divergência.
  it("NCM NT na TIPI com CST 53 não vira apontamento", () => {
    const r = auditar(lerNfe(nfe(item(1))), tipi(linha("84379000", null)), {});
    expect(r.achados.filter((a) => a.tipo === "IPI_NAO_DESTACADO")).toEqual([]);
  });
});

describe("auditar — o enquadramento legal", () => {
  // ⚠⚠ "999" NÃO É ENQUADRAMENTO — é a ausência dele com um código no lugar. O briefing é explícito:
  // não atribuir cEnq 999 automaticamente, e não usar CST 55 sem identificar o fundamento.
  it("CST que exige fundamento com cEnq 999 é apontado", () => {
    const r = auditar(lerNfe(nfe(item(1, { cst: "55" }))), tipi(linha("84379000", null)), {});
    const a = r.achados.find((x) => x.tipo === "ENQUADRAMENTO_GENERICO");
    expect(a.titulo).toMatch(/CST 55 com enquadramento 999/);
  });

  it("alíquota declarada diferente da TIPI é apontada", () => {
    const r = auditar(lerNfe(nfe(item(1, { cst: "50", pIPI: 5 }))), tipi(linha("84379000", 3.25)), {});
    expect(r.achados.find((x) => x.tipo === "ALIQUOTA_DIVERGENTE").titulo).toMatch(/5% × TIPI 3,25%/);
  });
});

describe("auditar — CST tributado sem alíquota não passa calado", () => {
  // ⚠⚠ FURAVA A REGRA 2 DO PRÓPRIO MOTOR (achado do Codex, 22/09/2026): um item com CST 50, NCM na
  // TIPI e `pIPI` ausente não entrava na comparação E não virava NAO_AVALIAVEL. A nota saía com
  // zero achados, diferença zero e zero não avaliáveis — indistinguível de uma nota conforme.
  const semAliquota = nfe(`
    <det nItem="1">
      <prod><NCM>84379000</NCM><CFOP>6101</CFOP><vProd>1000</vProd></prod>
      <imposto><IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>1000</vBC></IPITrib></IPI></imposto>
    </det>`);

  it("vira NAO_AVALIAVEL, e o contador da tela enxerga", () => {
    const r = auditar(lerNfe(semAliquota), tipi(linha("84379000", 3.25)), {});
    const a = r.achados.find((x) => x.tipo === "NAO_AVALIAVEL");
    expect(a.titulo).toMatch(/CST 50 .*sem alíquota declarada/);
    expect(a.faltam).toContain("IPI/pIPI");
    expect(r.resumo.naoAvaliaveis).toBe(1);
  });

  // ⚠ E não inventa divergência: sem o número não há o que comparar.
  it("não gera ALIQUOTA_DIVERGENTE a partir do nada", () => {
    const r = auditar(lerNfe(semAliquota), tipi(linha("84379000", 3.25)), {});
    expect(r.achados.filter((x) => x.tipo === "ALIQUOTA_DIVERGENTE")).toEqual([]);
    expect(r.resumo.diferencaEstimada).toBe(0);
  });
});

describe("auditar — o caso da NF-e 1000: CST 53 num NCM de alíquota ZERO", () => {
  // ⚠⚠ NF-e 1000 (TORG → DANPOWER, 22/09/2026), 1 item, NCM 9406.90.20, R$ 480.442,46: a TIPI
  // lista esse código com alíquota **0%**, e a nota saiu com **CST 53 — saída NÃO TRIBUTADA**.
  // Em dinheiro não muda nada; na declaração muda tudo. E o motor não via: a verificação principal
  // exige alíquota > 0, então todo NCM a 0% passava batido com qualquer CST.
  const zero = tipi(linha("94069020", 0));

  it("o CST 53 sobre alíquota zero vira apontamento", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "94069020", vProd: 480442.46 }))), zero, {});
    const a = r.achados.find((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI");
    expect(a.titulo).toMatch(/CST 53 .*num NCM que a TIPI tributa a 0%/);
    expect(a.detalhe).toMatch(/o CST correspondente é o 51/i);
  });

  // ⚠⚠ ZERO REAIS DE DIFERENÇA — e é exatamente por isso que o achado precisa existir separado:
  // ele não aparece em nenhuma conta, só na declaração que a fiscalização lê.
  it("não inventa diferença em dinheiro", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "94069020", vProd: 480442.46 }))), zero, {});
    expect(r.resumo.diferencaEstimada).toBe(0);
    expect(r.achados.find((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI").estimativa).toBeUndefined();
  });

  it("o CST 51 sobre alíquota zero é o correto e não alarma", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "94069020", cst: "51" }))), zero, {});
    expect(r.achados.filter((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI")).toEqual([]);
  });

  // ⚠ NT é outra coisa: o NCM NEM CONSTA como tributado, e aí o CST 53 é coerente.
  it("NT na TIPI não cai nesta verificação", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "94069020" }))), tipi(linha("94069020", null)), {});
    expect(r.achados.filter((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI")).toEqual([]);
  });

  it("o CST 50 com alíquota declarada zero também é apontado", () => {
    const r = auditar(lerNfe(nfe(item(1, { ncm: "94069020", cst: "52" }))), zero, {});
    expect(r.achados.some((x) => x.tipo === "CST_INCOMPATIVEL_COM_A_TIPI")).toBe(true);
  });
});

describe("o NCM da descrição vale para o XML também", () => {
  // ⚠⚠ EU TINHA POSTO A EXTRAÇÃO SÓ NO PEDIDO DO OMIE (achado do Codex, 23/09/2026): o mesmo
  // conflito — campo fiscal dizendo um NCM e a descrição dizendo outro — DESAPARECIA ao auditar o
  // XML da nota já emitida. A regra vale para o documento, não para a porta por onde ele entrou.
  it("acusa a divergência numa NF-e emitida", () => {
    const xml = nfe(item(1, { ncm: "94069020", desc: "LONGARINA DES 70408127 - [NCM: 84313900]" }));
    const t = tipi(linha("94069020", 0), linha("84313900", 0));
    const a = auditar(lerNfe(xml), t, {}).achados.find((x) => x.tipo === "NCM_DIVERGE_DA_DESCRICAO");
    expect(a.titulo).toMatch(/campo fiscal diz NCM 94069020, a descrição do item diz 84313900/);
  });

  it("o XML lê o NCM da descrição junto com a descrição", () => {
    const d = lerNfe(nfe(item(1, { desc: "PEÇA - [NCM: 84313900]" })));
    expect(d.itens[0].ncmDaDescricao).toBe("84313900");
  });

  it("descrição sem NCM não vira divergência", () => {
    const d = lerNfe(nfe(item(1, { desc: "FLANGE MAIOR CONEXAO SAIDA - DES 71264380" })));
    expect(d.itens[0].ncmDaDescricao).toBeNull();
  });
});
