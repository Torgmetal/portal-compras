// Os recebimentos nascem dos CERTIFICADOS do CMR, não de peças. Vitor (07/10/2026), para a QWS:
// "relatório de recebimento de tintas: está para selecionar as peças, mas nesse eu preciso apenas
// selecionar os certificados das tintas e diluentes"; e criar o de penetrante/revelador e o de arame de
// solda, "selecionar apenas os certificados deles, sem peças".
import { describe, it, expect } from "vitest";
import {
  TIPOS_RECEBIMENTO, ehRecebimento, certificadoDaClasse, linhaDoCertificado, componenteDaTinta,
  lotesDaTinta, ordenarCertificados, MAX_CERTIFICADOS, componentesDosCertificados,
} from "@/lib/recebimento-certificados";

const cmr = (extra) => ({
  id: "d1", importRef: "260021", nome: "DILUENTE PARA INDUSTHANE ACR 34.019", fornecedor: "INDUSCOLOR",
  nfNumero: "17819", pedidoCompra: "803", numeroDocumento: "3285", numeroCorrida: "84257",
  quantidade: 20, pesoKg: null, dataValidade: new Date("2027-01-14T00:00:00Z"), dataRecebimento: new Date("2026-01-14T00:00:00Z"),
  opNumero: "036", arquivoUrl: "https://blob/x.pdf", norma: null, ...extra,
});

describe("os três recebimentos", () => {
  it("são tintas, penetrante/revelador e arame de solda", () => {
    expect(TIPOS_RECEBIMENTO).toEqual(["RECEBIMENTO_TINTA", "RECEBIMENTO_PENETRANTE", "RECEBIMENTO_ARAME"]);
    expect(ehRecebimento("RECEBIMENTO_ARAME")).toBe(true);
    expect(ehRecebimento("PINTURA")).toBe(false);
  });

  it("o de tintas tem três componentes (A, B e C); os outros, uma linha por certificado", () => {
    expect(MAX_CERTIFICADOS.RECEBIMENTO_TINTA).toBe(3);
    expect(MAX_CERTIFICADOS.RECEBIMENTO_ARAME).toBeGreaterThanOrEqual(20);
  });
});

describe("qual certificado do CMR serve para cada recebimento", () => {
  it("tintas: tinta, catalisador e diluente", () => {
    for (const n of ["TINTA INDUSTHANE RHB 650 CINZA", "DILUENTE EPOXI ECN 34.008", "ENDURECEDOR PARA INDUSTHANE 35.010"]) {
      expect(certificadoDaClasse("RECEBIMENTO_TINTA", n), n).toBe(true);
    }
    expect(certificadoDaClasse("RECEBIMENTO_TINTA", "ARAME TUBULAR K-71T - 1,20MM")).toBe(false);
  });

  it("penetrante: penetrante, revelador e removedor (o Metalcheck D-70 da OP-102)", () => {
    expect(certificadoDaClasse("RECEBIMENTO_PENETRANTE", "REVELADOR DE TRINCAS METALCHECK D-70")).toBe(true);
    expect(certificadoDaClasse("RECEBIMENTO_PENETRANTE", "LIQUIDO PENETRANTE VERMELHO VP-30")).toBe(true);
    expect(certificadoDaClasse("RECEBIMENTO_PENETRANTE", "REMOVEDOR E-59")).toBe(true);
    expect(certificadoDaClasse("RECEBIMENTO_PENETRANTE", "CHAPA ACO 9,50")).toBe(false);
  });

  it("arame: arame e eletrodo de solda", () => {
    expect(certificadoDaClasse("RECEBIMENTO_ARAME", "ARAME TUBULAR METAL CORE 71C - 1,20MM")).toBe(true);
    expect(certificadoDaClasse("RECEBIMENTO_ARAME", "ELETRODO 6013 3,25")).toBe(true);
    expect(certificadoDaClasse("RECEBIMENTO_ARAME", "DILUENTE EPOXI ECN 34.008")).toBe(false);
  });
});

describe("a linha que nasce de um certificado do CMR", () => {
  it("leva NF, pedido, nº do certificado, lote, validade e quantidade", () => {
    expect(linhaDoCertificado(cmr())).toEqual({
      docId: "d1", r: "260021", descricao: "DILUENTE PARA INDUSTHANE ACR 34.019", fornecedor: "INDUSCOLOR",
      nf: "17819", itemNf: "", pc: "803", certificado: "3285", lote: "84257", validade: "2027-01-14",
      quantidade: "20", recebidoEm: "2026-01-14", opNumero: "036", temPdf: true, norma: "",
      visual: "", dimensional: "", documentos: "", rnc: "",
    });
  });

  it("peso em kg vence a quantidade (o arame chega pesado), e campo vazio fica vazio", () => {
    const l = linhaDoCertificado(cmr({ nome: "ARAME DE SOLDA MIG 1.20MM", quantidade: 0, pesoKg: 2160, pedidoCompra: "N/A", dataValidade: null, arquivoUrl: null, sharepointUrl: null }));
    expect(l.quantidade).toBe("2.160 kg");
    expect(l.validade).toBe("");
    expect(l.temPdf).toBe(false);
  });
});

describe("tintas: cada certificado no seu componente", () => {
  it("catalisador vai no B, diluente no C, a tinta no A", () => {
    expect(componenteDaTinta("ENDURECEDOR PARA INDUSTHANE 35.010")).toBe("B");
    expect(componenteDaTinta("DILUENTE EPOXI ECN 34.008")).toBe("C");
    expect(componenteDaTinta("TINTA INDUSTHANE RHB 650")).toBe("A");
  });

  it("monta A/B/C no formato do preenchimento pelo CMR, sem perder ninguém quando a posição já está ocupada", () => {
    const linhas = [
      linhaDoCertificado(cmr({ id: "t", nome: "TINTA INDUSTHANE RHB 650 CINZA MN 6,5", numeroCorrida: "85596", numeroDocumento: "2735", norma: "N-2677" })),
      linhaDoCertificado(cmr({ id: "d", nome: "DILUENTE PARA INDUSTHANE ACR 34.019", numeroCorrida: "85598" })),
      linhaDoCertificado(cmr({ id: "t2", nome: "TINTA INDUSDUR HB FS 90", numeroCorrida: "99" })),
    ];
    const e = lotesDaTinta(linhas);
    expect(e.A.lote).toBe("85596");
    expect(e.A.certificado).toBe("2735");
    expect(e.C.lote).toBe("85598");
    expect(e.B.lote).toBe("99"); // a segunda tinta ocupa a posição livre
    expect(e.A.tipo).toBe("TINTA INDUSTHANE RHB 650"); // o nome sem a cor vai para o material
  });

  it("a tela mostra a MESMA posição que a criação vai usar", () => {
    const nomes = ["DILUENTE EPOXI", "TINTA A", "TINTA B", "TINTA C"].map((descricao) => ({ descricao }));
    expect(componentesDosCertificados(nomes)).toEqual(["C", "A", "B", null]); // a quarta não tem posição
  });
});

describe("ordem da lista", () => {
  it("primeiro os da classe, depois os da obra, depois o mais recente", () => {
    const lista = [
      { docId: "1", descricao: "CHAPA ACO 9,50", opNumero: "102", recebidoEm: "2026-10-01" },
      { docId: "2", descricao: "ARAME TUBULAR K-71T", opNumero: null, recebidoEm: "2026-01-07" },
      { docId: "3", descricao: "ARAME TUBULAR METAL CORE 71C", opNumero: "102", recebidoEm: "2026-02-10" },
      { docId: "4", descricao: "ELETRODO 6013 3,25", opNumero: null, recebidoEm: "2026-09-24" },
    ];
    expect(ordenarCertificados(lista, { tipo: "RECEBIMENTO_ARAME", opNumero: "102" }).map((l) => l.docId)).toEqual(["3", "4", "2", "1"]);
  });
});
