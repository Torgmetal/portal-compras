import { describe, expect, it } from "vitest";
import { FICHAS_EPS, completarEps, camposDaSelecao, partesEps, rotuloEps, descricaoEps } from "@/lib/eps-casa";

// Vitor (23/09/2026): "nos relatórios da OP-102 está faltando preencher Metal de adição, Processo de
// soldagem, EPS, RQS e tipo de junta". Quatro dos cinco saem da EPS escolhida — conferido contra a
// "EPS Resumida" e o cabeçalho de cada EPS (pasta Qualidade / Workspace / EPS + RQPS).

describe("a ficha das EPS da casa", () => {
  it("cada EPS tem o número do documento, o processo e o arame da folha resumo", () => {
    expect(FICHAS_EPS["01"]).toMatchObject({ numero: "001/2025", processo: "GMAW", metalAdicao: "ER70S-6" });
    expect(FICHAS_EPS["02"]).toMatchObject({ numero: "002/2025", processo: "FCAW", metalAdicao: "E71T-1C" });
    expect(FICHAS_EPS["03"]).toMatchObject({ numero: "003/2025", processo: "GMAW", metalAdicao: "ER70S-6" });
    expect(FICHAS_EPS["04"]).toMatchObject({ numero: "004/2025", processo: "SMAW", metalAdicao: "E7018" });
    expect(FICHAS_EPS["05"]).toMatchObject({ numero: "005/2025", processo: "FCAW", metalAdicao: "E71T-1C" });
  });

  it("completa o que o nome do arquivo não diz — as EPS 03, 04 e 05 vêm sem processo", () => {
    const e = completarEps({ codigo: "EPS-RQPS 05", processo: null, nome: "EPS-RQPS 05" });
    expect(e).toMatchObject({ codigo: "EPS-RQPS 05", processo: "FCAW", numero: "005/2025", metalAdicao: "E71T-1C", rqs: "RQPS 005/2025" });
  });

  it("EPS nova, ainda sem ficha, passa como veio do arquivo", () => {
    const e = { codigo: "EPS-RQPS 06", processo: "GTAW", nome: "EPS-RQPS 06 GTAW" };
    expect(completarEps(e)).toEqual(e);
    expect(rotuloEps(e)).toBe("EPS-RQPS 06");
  });

  const LISTA = ["01", "02", "03", "04", "05"].map((n) => completarEps({ codigo: `EPS-RQPS ${n}` }));

  it("escolher a EPS preenche EPS, RQS, processo e metal de adição — nunca o tipo de junta", () => {
    const campos = camposDaSelecao(["EPS 002/2025"], LISTA);
    expect(campos).toEqual({ eps: "EPS 002/2025", rqs: "RQPS 002/2025", processoSolda: "FCAW", metalAdicao: "E71T-1C" });
    expect(campos).not.toHaveProperty("tipoJunta");
  });

  it("duas EPS (GMAW e SMAW, como no EVS-102-001): cada campo lista as duas", () => {
    expect(camposDaSelecao(["EPS 001/2025", "EPS 004/2025"], LISTA)).toEqual({
      eps: "EPS 001/2025, EPS 004/2025", rqs: "RQPS 001/2025, RQPS 004/2025", processoSolda: "GMAW, SMAW", metalAdicao: "ER70S-6, E7018",
    });
  });

  it("002 e 005 são ambas FCAW com E71T-1C — sai uma vez, não repetido", () => {
    expect(camposDaSelecao(["EPS 002/2025", "EPS 005/2025"], LISTA)).toMatchObject({ processoSolda: "FCAW", metalAdicao: "E71T-1C" });
  });

  it("sem EPS, os derivados se esvaziam; EPS digitada antes, fora da lista, é mantida sem mexer nos outros", () => {
    expect(camposDaSelecao([], LISTA)).toEqual({ eps: "", rqs: "", processoSolda: "", metalAdicao: "" });
    expect(camposDaSelecao(["EPS-01"], LISTA)).toEqual({ eps: "EPS-01" });
  });

  it("lê de volta o que foi gravado", () => {
    expect(partesEps("EPS 001/2025, EPS 004/2025")).toEqual(["EPS 001/2025", "EPS 004/2025"]);
    expect(partesEps("")).toEqual([]);
  });

  it("a opção do seletor diz para que material é — 002 e 005 são ambas FCAW", () => {
    const d2 = descricaoEps(completarEps({ codigo: "EPS-RQPS 02" }));
    const d5 = descricaoEps(completarEps({ codigo: "EPS-RQPS 05" }));
    expect(d2).toContain("FCAW");
    expect(d5).toContain("FCAW");
    expect(d2).not.toBe(d5);
  });
});
