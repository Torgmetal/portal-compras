import { describe, it, expect } from "vitest";
import { CST_ICMS, CST_PIS_COFINS, ORIGEM, porCst, FONTE_ICMS, FONTE_PIS_COFINS } from "@/lib/fiscal/cst";
import { CENARIOS, cenarioDaFamilia, cenarioDoCfop, AJUSTES_POR_CFOP } from "@/lib/fiscal/cenarios";
import { FAMILIA } from "@/lib/fiscal/cfop";

// ─── AS TABELAS DE CST ───────────────────────────────────────────────────────
//
// ⚠⚠ TABELA OFICIAL, NÃO INTERPRETAÇÃO. CST de ICMS e origem vêm das Tabelas A e B do Convênio
// s/nº de 15/12/1970 (redação do Ajuste SINIEF 03/2010); CST de PIS/COFINS, da tabela 4.3.3 do
// SPED. Guardá-las não é o portal decidindo nada — é ele parando de fingir que não sabe o que
// "41" quer dizer.

describe("as tabelas estão completas", () => {
  it("a Tabela B do ICMS tem os 11 códigos", () => {
    expect(CST_ICMS.map((c) => c.cst)).toEqual(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
  });

  it("a Tabela A da origem tem os 9 códigos", () => {
    expect(ORIGEM.map((o) => o.codigo)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("o PIS/COFINS de saída tem os 10 códigos", () => {
    expect(CST_PIS_COFINS.map((c) => c.cst)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "49"]);
  });

  it("as duas tabelas declaram a fonte", () => {
    expect(FONTE_ICMS).toMatch(/Ajuste SINIEF 03\/2010/);
    expect(FONTE_PIS_COFINS).toMatch(/4\.3\.3/);
  });
});

describe("cada código diz o que EXIGE que se prove", () => {
  // ⚠⚠ SEM `exige`, A TABELA VIRA UM MENU — e menu é o que faz alguém marcar "41 — não tributada"
  // porque a nota "não tem imposto".
  it.each([...CST_ICMS, ...CST_PIS_COFINS])("o CST $cst tem rótulo e exigência", (c) => {
    expect(c.rotulo).toBeTruthy();
    expect(c.exige.length).toBeGreaterThan(0);
  });

  // ⚠ Os códigos "outras" carregam o aviso de último recurso — são os que escondem a operação.
  it.each([["ICMS", CST_ICMS, "90"], ["PIS/COFINS", CST_PIS_COFINS, "49"]])(
    "o código genérico de %s pergunta qual é a situação de verdade", (_, tabela, cst) => {
      expect(porCst(tabela, cst).exige.join(" ")).toMatch(/situação de verdade/i);
    });

  it("porCst normaliza o código de um dígito", () => {
    expect(porCst(CST_PIS_COFINS, "1")?.cst).toBe("01");
    expect(porCst(CST_ICMS, "99")).toBeNull();
  });
});

describe("os cenários cobrem as famílias de CFOP que o portal oferece", () => {
  // ⚠⚠ Uma família sem cenário deixaria o operador com a tabela inteira na frente — que é o estado
  // de antes desta base.
  it("toda família tem cenário", () => {
    for (const f of Object.values(FAMILIA)) expect(cenarioDaFamilia(f), f).toBeTruthy();
  });

  it.each(Object.entries(CENARIOS))("o cenário %s diz POR QUE aqueles códigos", (_, c) => {
    expect(c.resumo).toBeTruthy();
    expect(c.icms.porque.length).toBeGreaterThan(40);
    expect(c.pisCofins.porque.length).toBeGreaterThan(40);
  });

  it("todo candidato existe na tabela oficial", () => {
    for (const c of Object.values(CENARIOS)) {
      for (const x of c.icms.candidatos) expect(porCst(CST_ICMS, x.cst), x.cst).toBeTruthy();
      for (const x of c.pisCofins.candidatos) expect(porCst(CST_PIS_COFINS, x.cst), x.cst).toBeTruthy();
    }
  });

  // ⚠ No máximo UM provável por tributo: dois "prováveis" é o mesmo que nenhum.
  it("cada cenário marca no máximo um provável por tributo", () => {
    for (const [nome, c] of Object.entries(CENARIOS)) {
      expect(c.icms.candidatos.filter((x) => x.provavel).length, nome).toBeLessThanOrEqual(1);
      expect(c.pisCofins.candidatos.filter((x) => x.provavel).length, nome).toBeLessThanOrEqual(1);
    }
  });

  // ⚠⚠ REMESSA E RETORNO NÃO SÃO RECEITA — e é por isso que o 08 é o provável nos dois.
  it.each(["Remessa", "Retorno"])("em %s o PIS/COFINS provável é o 08 (sem incidência)", (f) => {
    expect(CENARIOS[f].pisCofins.candidatos.find((c) => c.provavel).cst).toBe("08");
  });

  // ⚠ Família desconhecida devolve null, não um cenário genérico.
  it("família desconhecida não inventa cenário", () => {
    expect(cenarioDaFamilia("Inexistente")).toBeNull();
    expect(cenarioDaFamilia(undefined)).toBeNull();
  });
});

describe("a FAMÍLIA é grossa demais para alguns códigos (achado do Codex, 23/09/2026)", () => {
  const doCfop = (codigo, familia) => cenarioDoCfop({ codigo, familia });

  // ⚠⚠ O DEFEITO: "Remessa" junta a remessa para industrialização (5.901, suspensão do art. 402)
  // com a remessa por conta e ordem da VENDA À ORDEM (5.923), que não tem nada a ver com o art.
  // 402 — e o 5.923 recebia "CST 50, mais comum" com a justificativa da suspensão colada.
  // Ressalva em texto não desliga destaque.
  it("o 5.901 mantém o CST 50 com o fundamento do art. 402", () => {
    const c = doCfop("5901", "Remessa");
    expect(c.icms.candidatos.find((x) => x.provavel).cst).toBe("50");
    expect(c.icms.porque).toMatch(/art\. 402/);
  });

  it.each(["5923", "6923"])("o %s PERDE o destaque, e o porquê é o da venda à ordem", (cod) => {
    const c = doCfop(cod, "Remessa");
    expect(c.icms.candidatos.filter((x) => x.provavel)).toEqual([]);
    expect(c.icms.porque).toMatch(/referencia a venda/i);
    expect(c.icms.porque).toMatch(/não.*da suspensão do art\. 402/i);
    expect(c.resumo).toMatch(/VENDA À ORDEM/);
  });

  // ⚠ O ajuste NUNCA inventa um provável no lugar do que tirou: sem fundamento para eleger, a
  // lista fica sem destaque e o porquê diz de que depende.
  it("tirar o destaque não troca por outro código", () => {
    const c = doCfop("5923", "Remessa");
    expect(c.icms.candidatos.map((x) => x.cst)).toEqual(doCfop("5901", "Remessa").icms.candidatos.map((x) => x.cst));
  });

  // ⚠⚠ O 5.924 é emitido pelo FORNECEDOR: para a TORG é documento de ENTRADA.
  it("o 5.924 diz que a nota não é da TORG", () => {
    const c = doCfop("5924", "Remessa");
    expect(c.icms.porque).toMatch(/emitida pelo FORNECEDOR/i);
    expect(c.icms.candidatos.filter((x) => x.provavel)).toEqual([]);
    expect(c.pisCofins.candidatos.filter((x) => x.provavel)).toEqual([]);
  });

  // ⚠⚠ O SEGUNDO ACHADO: o CFOP já resolve qual das duas notas é, e o texto antigo apresentava
  // essa distinção como desconhecida. Só 5.922/6.922 são simples faturamento; 5.116/6.116 são a
  // saída física, e vivem na família Venda.
  it("o 5.922 é simples faturamento e não oferece o CST 00 de saída", () => {
    const c = doCfop("5922", "Entrega futura");
    expect(c.icms.candidatos.map((x) => x.cst)).toEqual(["41", "90"]);
    expect(c.icms.porque).toMatch(/não acompanha saída de mercadoria/i);
    expect(c.icms.candidatos.filter((x) => x.provavel)).toEqual([]);
  });

  it("o 5.116 é a saída física — ICMS tributado, mas PIS/COFINS sem destaque", () => {
    const c = doCfop("5116", "Venda");
    expect(c.icms.candidatos.find((x) => x.provavel).cst).toBe("00");
    // ⚠ A receita pode já ter sido reconhecida no simples faturamento: repetir a alíquota básica
    // correria o risco de contar duas vezes.
    expect(c.pisCofins.candidatos.filter((x) => x.provavel)).toEqual([]);
    expect(c.pisCofins.porque).toMatch(/contar duas vezes/i);
  });

  it("a venda comum não é afetada pelos ajustes", () => {
    const c = doCfop("5101", "Venda");
    expect(c.icms.candidatos.find((x) => x.provavel).cst).toBe("00");
    expect(c.pisCofins.candidatos.find((x) => x.provavel).cst).toBe("01");
  });

  // ⚠ O par 5.xxx/6.xxx compartilha o ajuste: o que muda entre eles é o destino, não a natureza.
  it.each([["5922", "6922", "Entrega futura"], ["5116", "6116", "Venda"]])(
    "%s e %s recebem o mesmo ajuste", (a, b, fam) => {
      expect(doCfop(b, fam).resumo).toBe(doCfop(a, fam).resumo);
    });

  it("CFOP sem família conhecida continua devolvendo null", () => {
    expect(cenarioDoCfop({ codigo: "9999", familia: "Inexistente" })).toBeNull();
    expect(cenarioDoCfop(null)).toBeNull();
  });
});
