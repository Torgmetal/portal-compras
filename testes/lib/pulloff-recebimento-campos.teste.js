// "Pode criar também, vamos deixar tudo funcionando" (Vitor, 02/10/2026): os modelos "Relatório de
// Pull-off" e "Relatório de Recebimento de Tintas" do SGQ. As contas são as da planilha; as travas, só o
// que o documento precisa para ser assinado — e todas com campo para preencher.
import { describe, it, expect } from "vitest";
import {
  N_DOLLIES, N_DEMAOS_PULLOFF, esquemaPullOff, espessuraTotal, dolliesPullOff, mediaAdesao, pendenciasPullOff,
  camposCabecalhoPullOff, dataDoEnsaioPullOff, FALHAS, mediaEhMinima, leituraDolly, avisosPullOff,
} from "@/lib/pulloff-campos";
import {
  ITENS_RECEBIMENTO, lotesRecebimento, checklistRecebimento, resultadoDoChecklist, lotesVencidos,
  pendenciasRecebimento, preencherDoCmr, dataCurtaBR, camposCabecalhoRecebimento,
} from "@/lib/recebimento-tinta-campos";

const PULLOFF_OK = {
  marcas: ["T112A1"], resultadoInspecao: "APROVADO",
  resultados: { adesivo: "Araldite 24h", aparelho: "Elcometer 510", dataFixacao: "2026-10-01", dataArrancamento: "2026-10-02",
    dollies: [{ adesao: "8,5", rompimento: "B 100%", falha: "Coesão" }] },
};

describe("pull-off (ASTM D4541)", () => {
  it("o modelo tem 5 dollies e 3 demãos, sempre nas mesmas posições", () => {
    expect(N_DOLLIES).toBe(5);
    expect(N_DEMAOS_PULLOFF).toBe(3);
    expect(dolliesPullOff({}).map((d) => d.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(esquemaPullOff({ esquema: ["120"] })).toEqual(["120", "", ""]);
  });

  it("espessura total = SOMA das demãos preenchidas; vazio quando nenhuma (fórmula da planilha)", () => {
    expect(espessuraTotal({ esquema: ["120", "", "80"] })).toBe(200);
    expect(espessuraTotal({ esquema: ["", "", ""] })).toBeNull();
    expect(espessuraTotal({ esquema: ["60.5", "60,5"] })).toBe(121);
  });

  it("média da adesão = ROUND(AVERAGE, 2) sobre os dollies preenchidos", () => {
    expect(mediaAdesao({ dollies: [{ adesao: "8" }, { adesao: "9" }, { adesao: "9,5" }, {}, {}] })).toBe(8.83);
    expect(mediaAdesao({ dollies: [{}] })).toBeNull();
  });

  it("a data do ensaio é a do arrancamento", () => {
    expect(dataDoEnsaioPullOff({ dataFixacao: "2026-10-01", dataArrancamento: "2026-10-02" })).toBe("2026-10-02");
  });

  it("completo vai para assinatura; vazio diz cada coisa que falta", () => {
    expect(pendenciasPullOff(PULLOFF_OK)).toEqual([]);
    const p = pendenciasPullOff({ marcas: [], resultados: {} }).join(" ");
    for (const t of ["Peça", "Adesivo", "Aparelho", "fixação", "arrancamento", "Nenhum dolly completo", "Laudo"]) expect(p).toContain(t);
  });

  it("arrancamento antes da fixação, adesão ilegível e dolly pela metade são pendência", () => {
    const res = { ...PULLOFF_OK.resultados, dataArrancamento: "2026-09-30", dollies: [{ adesao: "8", falha: "Coesão" }, { adesao: "oito", falha: "Coesão" }, { rompimento: "B" }] };
    const p = pendenciasPullOff({ ...PULLOFF_OK, resultados: res }).join(" ");
    expect(p).toMatch(/arrancamento antes da fixação/);
    expect(p).toMatch(/Dolly 2: adesão ilegível/);
    expect(p).toMatch(/Dolly 3 incompleto/);
  });

  // ⚠ verificação de 02/10/2026: o dolly que NÃO rompe (o ensaio parou no limite do aparelho ou no mínimo
  // exigido) não tinha como ser lançado — "> 20" era "ilegível" e a falha obrigava a escolher uma que não houve
  it("dolly sem ruptura: '> 20' ou a falha 'Sem ruptura' é leitura válida; entra na média pelo limite e a média vira mínimo", () => {
    expect(FALHAS).toContain("Sem ruptura");
    const res = { ...PULLOFF_OK.resultados, dollies: [{ adesao: "> 20", falha: "Sem ruptura" }, { adesao: "8", falha: "Coesão" }] };
    expect(pendenciasPullOff({ ...PULLOFF_OK, resultados: res })).toEqual([]);
    expect(mediaAdesao(res)).toBe(14);
    expect(mediaEhMinima(res)).toBe(true);
    // no celular o teclado numérico não tem ">": a falha "Sem ruptura" já diz que o número é o limite
    const peloSelect = { dollies: [{ adesao: "20", falha: "Sem ruptura" }] };
    expect(leituraDolly(peloSelect.dollies[0])).toEqual({ valor: 20, minimo: true });
    expect(mediaEhMinima({ dollies: [{ adesao: "8", falha: "Coesão" }] })).toBe(false);
  });

  it("espessura negativa é pendência (adesão negativa já era)", () => {
    const res = { ...PULLOFF_OK.resultados, esquema: ["120", "-60"] };
    expect(pendenciasPullOff({ ...PULLOFF_OK, resultados: res }).join(" ")).toMatch(/Espessura da 2ª demão negativa/);
  });

  it("a pendência do dolly diz QUAL das duas falta: a adesão ou a falha", () => {
    const res = { ...PULLOFF_OK.resultados, dollies: [{ adesao: "8", falha: "Coesão" }, { adesao: "9" }, { falha: "Coesão" }] };
    const p = pendenciasPullOff({ ...PULLOFF_OK, resultados: res }).join(" ");
    expect(p).toMatch(/Dolly 2 incompleto — falta a falha/);
    expect(p).toMatch(/Dolly 3 incompleto — falta a adesão/);
  });

  it("aviso (não trava): adesivo vencido na data da fixação", () => {
    expect(avisosPullOff({ resultados: { validadeAdesivo: "2026-09-30", dataFixacao: "2026-10-01" } }).join(" ")).toMatch(/Adesivo vencido na data da fixação \(validade 30\/09\/2026\)/);
    expect(avisosPullOff({ resultados: { validadeAdesivo: "2026-10-01", dataFixacao: "2026-10-01" } })).toEqual([]);
  });

  it("o cabeçalho efetivo já traz a norma e a peça do relatório", () => {
    const c = camposCabecalhoPullOff({ resultados: {}, marcas: ["T112A1", "T112A2"] });
    expect(c.normas).toBe("ASTM D4541");
    expect(c.peca).toBe("T112A1, T112A2");
  });
});

const RECEB_OK = {
  resultadoInspecao: "APROVADO",
  resultados: { material: "Wegpoxi Wet Surface 89", fabricante: "WEG Tintas", dataInspecao: "2026-10-02",
    lotes: [{ lote: "8912-1", quantidade: "10 latas", validade: "2027-03-15" }, { lote: "8913-1", validade: "2027-03-15" }],
    checklist: Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, "A"])) },
};

describe("recebimento de tintas", () => {
  it("os nove itens do modelo, na ordem e com o texto do modelo; três lotes A/B/C", () => {
    expect(ITENS_RECEBIMENTO).toHaveLength(9);
    expect(ITENS_RECEBIMENTO[0]).toBe("Deficiência ou Excesso de Enchimento");
    expect(ITENS_RECEBIMENTO[8]).toBe("Marcação Deficiente");
    expect(lotesRecebimento({}).map((l) => l.componente)).toEqual(["A", "B", "C"]);
  });

  it("o resultado sai dos itens: todos A → APROVADO; algum R → REPROVADO; faltando item → vazio", () => {
    expect(resultadoDoChecklist(RECEB_OK.resultados)).toBe("APROVADO");
    expect(resultadoDoChecklist({ checklist: { ...RECEB_OK.resultados.checklist, 4: "R" } })).toBe("REPROVADO");
    expect(resultadoDoChecklist({ checklist: { 1: "A" } })).toBe("");
    expect(checklistRecebimento({ checklist: { 1: "x" } })[0].valor).toBe("");
  });

  // ⚠ desde a verificação de 02/10/2026: reprovar com os nove itens aprovados é permitido (lote vencido, produto
  // trocado…), com o motivo nas observações; aprovar com item reprovado, não
  it("completo vai para assinatura; aprovar com item reprovado é pendência; reprovar sem motivo pede o motivo", () => {
    expect(pendenciasRecebimento(RECEB_OK)).toEqual([]);
    const comR = { ...RECEB_OK, resultados: { ...RECEB_OK.resultados, checklist: { ...RECEB_OK.resultados.checklist, 4: "R" } } };
    expect(pendenciasRecebimento(comR).join(" ")).toMatch(/Aprovado com item reprovado \(4\)/);
    expect(pendenciasRecebimento({ ...RECEB_OK, resultadoInspecao: "REPROVADO" }).join(" ")).toMatch(/escreva o motivo nas observações/);
  });

  it("vazio diz o que falta: material, fabricante, lote, itens e resultado", () => {
    const p = pendenciasRecebimento({ resultados: {} }, "2026-10-02").join(" ");
    for (const t of ["Material", "Fabricante", "Nenhum lote", "itens: 1, 2, 3, 4, 5, 6, 7, 8, 9", "Resultado da inspeção"]) expect(p).toContain(t);
  });

  it("lote com validade vencida na data do recebimento: marcado, e aprová-lo é pendência", () => {
    const res = { ...RECEB_OK.resultados, lotes: [{ lote: "L1", validade: "2026-09-30" }] };
    expect(lotesVencidos(res).map((l) => l.componente)).toEqual(["A"]);
    expect(pendenciasRecebimento({ ...RECEB_OK, resultados: res }, "2026-10-02").join(" ")).toMatch(/Lote vencido aprovado: componente A \(validade 30\/09\/2026\)/);
  });

  it("os lotes do CMR preenchem material, fabricante, certificado, lote e validade — sem apagar o que já foi escrito", () => {
    const tintaA = { tipo: "WEGPOXI WET SURFACE 89", produto: "WEGPOXI WET SURFACE 89 CINZA", fabricante: "WEG", lote: "8912-1", validade: "2027-03-15T00:00:00.000Z", certificado: "CQ-777" };
    const tintaB = { tipo: "WEGPOXI WET SURFACE 89", produto: "ENDURECEDOR", fabricante: "WEG", lote: "8913-1", validade: "2027-03-16" };
    const r = preencherDoCmr({ norma: "N-2680", material: "" }, { A: tintaA, B: tintaB });
    expect(r).toMatchObject({ material: "WEGPOXI WET SURFACE 89", fabricante: "WEG", certificado: "CQ-777", norma: "N-2680" });
    expect(r.lotes[0]).toMatchObject({ lote: "8912-1", validade: "2027-03-15" });
    expect(r.lotes[1]).toMatchObject({ lote: "8913-1", validade: "2027-03-16" });
    expect(preencherDoCmr({ material: "Já escrito" }, { A: tintaA }).material).toBe("Já escrito");
  });

  it("data no padrão brasileiro sem fuso, e o local padrão da casa", () => {
    expect(dataCurtaBR("2026-10-01")).toBe("01/10/2026");
    expect(camposCabecalhoRecebimento({ resultados: {} }).localEquipamento).toBe("Almoxarifado Torg Metal");
  });
});
