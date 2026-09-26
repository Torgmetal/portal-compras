import { describe, it, expect } from "vitest";
import { extrairRegrasDaNf, agruparRegras, situacaoDaRegra } from "@/lib/fiscal/regras-ibs-cbs";

// Recorte da NF 943 real (ListarNF, 01/09/2026).
const nf = (nNF, dEmi, itens) => ({ ide: { nNF, dEmi }, det: itens.map((prod) => ({ prod })) });
const NF943 = nf("00000943", "01/09/2026", [
  { NCM: "9406.90.20", CFOP: "6.101", pAliqCbs: 0.9, pAliqIBSUf: 0.1, vBCIbsCbs: 7414.74 },
]);

describe("extrairRegrasDaNf", () => {
  it("normaliza NCM e CFOP para dígitos e lê a data", () => {
    expect(extrairRegrasDaNf(NF943)).toEqual([
      { ncm: "94069020", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1, nf: "943", emitidaEm: "2026-09-01" },
    ]);
  });
  it("⚠ item sem grupo IBS/CBS (remessa, nota antiga) não vira regra 0%", () => {
    const r = extrairRegrasDaNf(nf("10", "02/09/2026", [
      { NCM: "7308.90.10", CFOP: "5.901" },
      { NCM: "7308.90.10", CFOP: "5.101", pAliqCbs: 0, pAliqIBSUf: 0 },
    ]));
    expect(r).toEqual([]);
  });
});

describe("agruparRegras", () => {
  it("mesma combinação soma notas e guarda a primeira e a última", () => {
    const obs = [
      ...extrairRegrasDaNf(nf("943", "01/09/2026", [{ NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 }])),
      ...extrairRegrasDaNf(nf("950", "10/09/2026", [{ NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 }])),
    ];
    expect(agruparRegras(obs)).toEqual([{ ncm: "94069020", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1,
      qtdNotas: 2, primeiraNf: "943", primeiraEm: "2026-09-01", ultimaNf: "950", ultimaEm: "2026-09-10" }]);
  });
  it("⚠ alíquotas diferentes para o mesmo NCM×CFOP ficam em DUAS linhas", () => {
    const obs = [
      { ncm: "1", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1, nf: "1", emitidaEm: "2026-09-01" },
      { ncm: "1", cfop: "6101", pCbs: 0.8, pIbsUf: 0.1, nf: "2", emitidaEm: "2026-09-02" },
    ];
    expect(agruparRegras(obs)).toHaveLength(2);
  });
  it("a mesma NF com dois itens iguais conta uma nota", () => {
    const obs = extrairRegrasDaNf(nf("7", "01/09/2026", [
      { NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 },
      { NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 },
    ]));
    expect(agruparRegras(obs)[0].qtdNotas).toBe(1);
  });
});

describe("situacaoDaRegra", () => {
  it("sem linha → SEM_NF; uma → UNICA; duas → DIVERGENTE", () => {
    expect(situacaoDaRegra([]).situacao).toBe("SEM_NF");
    expect(situacaoDaRegra([{ pCbs: 0.9 }]).situacao).toBe("UNICA");
    expect(situacaoDaRegra([{ pCbs: 0.9 }, { pCbs: 0.8 }]).situacao).toBe("DIVERGENTE");
  });
});
