// Vitor (24/09/2026): "vamos tirar essa regra de ter a NF informada, pois principalmente esses da Aços
// Maq acaba sendo um problema". Material de faturamento direto sai com nota para o cliente — a Torg não
// tem NF de entrada dele, e o painel de rastreabilidade cobrava "falta NF" para sempre.
import { describe, it, expect } from "vitest";
import { conferir, ROTULO_LACUNA } from "@/lib/rastreio-tratativa";

// a chapa da OP-102 do jeito que viria do pedido 1719 (AÇOS MAQ, faturamento direto): tudo, menos NF
const CHAPA = {
  importRef: "261999", nome: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 12,50MM",
  numeroDocumento: "CERT-123", numeroCorrida: "C-456", nfNumero: null,
  pedidoCompra: "1719", dataRecebimento: new Date("2026-08-30T12:00:00Z"), opNumero: "102",
};

describe("rastreabilidade: a NF não é cobrada", () => {
  it("material sem NF, com certificado e corrida, está em dia e sem lacuna", () => {
    const r = conferir(CHAPA, { temArquivo: true });
    expect(r.situacao).toBe("EM_DIA");
    expect(r.lacunas).toEqual([]);
  });

  it("pedido, data e OP continuam sendo avisados", () => {
    const r = conferir({ ...CHAPA, pedidoCompra: null, dataRecebimento: null, opNumero: null }, { temArquivo: true });
    expect(r.lacunas).toEqual(["pedido", "data", "op"]);
  });

  it("o que bloqueia continua bloqueando: certificado e corrida", () => {
    const r = conferir({ ...CHAPA, numeroDocumento: null, numeroCorrida: null }, { temArquivo: true });
    expect(r.situacao).toBe("PENDENTE");
    expect(r.faltas).toEqual(["certificado", "corrida"]);
  });

  it("a tela não tem mais rótulo de NF para mostrar", () => {
    expect(ROTULO_LACUNA).not.toHaveProperty("nf");
  });
});
