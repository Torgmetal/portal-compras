// O cabeçalho do recebimento de ESTOQUE (arame, penetrante — Vitor, 14/10/2026) não cita obra nem
// cliente: o mesmo relatório vai ao data book de várias obras, e "OP-EST" não diz nada a quem lê.
import { describe, it, expect } from "vitest";
import { identificacaoRir } from "@/lib/relatorio-recebimento-rir-pdf";

const rotulos = (linhas) => linhas.map((l) => l.map(([r, v]) => `${r} ${v}`));

describe("identificação do recebimento", () => {
  it("de obra: OP, cliente e contrato", () => {
    const l = rotulos(identificacaoRir({ opNumero: "102", resultados: { contrato: "4600" } }, { dataRef: "01/10/26", cliente: "QWS", refCliente: "X" }));
    expect(l[0][0]).toBe("OP: OP-102");
    expect(l[1]).toEqual(["CLIENTE: QWS", "CONTRATO: 4600"]);
  });
  it("de estoque: diz estoque e não tem linha de cliente/contrato", () => {
    const l = rotulos(identificacaoRir({ opNumero: "EST", resultados: {} }, { dataRef: "01/10/26" }));
    expect(l[0][0]).toBe("ORIGEM: Estoque — uso em várias obras");
    expect(l.flat().some((t) => /CLIENTE|CONTRATO|OP-EST/.test(t))).toBe(false);
  });
});
