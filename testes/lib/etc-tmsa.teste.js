// A OC de cada peça pelas ETCs da TMSA (Vitor, 15/10/2026: "não consegue verificar se existe uma lista?"). Cada OC tem a
// sua ETC (FOR-1155) com Desenho e TAG por item; quando uma TAG está em duas OCs (TC 4708 da OP-105: quadro do vazador
// numa, longarinas noutra), quem decide é o desenho, que a marca da lista de equivalência carrega ("72118932-1").
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { lerEtcTmsa, ocDaOpPelasEtcs, ocDaPasta, revisaoDoArquivo } from "@/lib/etc-tmsa";

function etc(linhas, tpr = "TPR00846") {
  const aoa = [
    ["Especificação Técnica de Compra de Manufaturados", "", "ETC N.°:", "00846-16"],
    [], [], [`Nº TPR: ${tpr}`], [],
    ["Pos.", "Descrição do Item", "Qtd", "Desenho", "TAG", "COR"],
    ...linhas.map((l, i) => [i + 1, l.desc, l.qtd, l.desenho, l.tag, ""]),
    ["", "", "", "DESENHO", ""],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["instruções"]]), "Instruções para preenchimento");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "FOR-1155");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("a ETC", () => {
  it("lê TPR e os itens (desenho + TAG), ignorando as linhas de preenchimento", () => {
    const e = lerEtcTmsa(etc([{ desc: "QUADRO DO VAZADOR", qtd: 76, desenho: 72118932, tag: "TC4708" }]));
    expect(e.tpr).toBe("TPR00846");
    expect(e.itens).toEqual([{ desenho: "72118932", tag: "TC 4708", descricao: "QUADRO DO VAZADOR" }]);
  });
  it("OC e revisão pelo nome da pasta e do arquivo", () => {
    expect(ocDaPasta("OC233707-1_LONGARINAS")).toBe("233707-1");
    expect(ocDaPasta("OC228627_TRELIÇAS")).toBe("228627");
    expect(ocDaPasta("DOC_AUX")).toBe(null);
    expect(revisaoDoArquivo("ETC-00846-31 - TERC_INTERMEDIARIO TC 4702 R1.xls")).toBe(1);
    expect(revisaoDoArquivo("ETC-00846-15 - TERC_QUADRO VAZADORES TC 4708.xls")).toBe(0);
  });
});

describe("a OC de uma peça", () => {
  const etcs = [
    { oc: "228627", itens: [{ desenho: "72102447", tag: "TC 4706" }, { desenho: "72102447", tag: "TC 4707" }] },
    { oc: "228631", itens: [{ desenho: "72118932", tag: "TC 4708" }] },
    { oc: "228630", itens: [{ desenho: "72120236", tag: "TC 4708" }, { desenho: "70408127", tag: "TC 4708" }] },
    { oc: "233707-1", itens: [{ desenho: "70408127", tag: "TC-4702" }] },
  ];
  const oc = ocDaOpPelasEtcs(etcs);
  it("TAG que só uma OC tem: essa OC, qualquer que seja a marca", () => {
    expect(oc("TC 4706", "105A1")).toBe("228627");
    expect(oc("TC4702", "704081271")).toBe("233707-1");
  });
  it("TAG em duas OCs: o desenho da marca decide", () => {
    expect(oc("TC 4708", "72118932-1")).toBe("228631");
    expect(oc("TC 4708", "704081271")).toBe("228630");
  });
  it("não decide no chute: TAG desconhecida ou desenho que não casa", () => {
    expect(oc("TC 9999", "X")).toBe(null);
    expect(oc("TC 4708", "105A1")).toBe(null);
  });
});
