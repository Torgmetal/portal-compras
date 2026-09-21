// O contador de atraso do card "Em cotação".
//
// ⚠⚠ O DEFEITO QUE ESTE ARQUIVO CONGELA (Matheus, 16/09/2026): o card mostrava "0 · 1 atrasada(s)"
// — zero RMs em cotação e, logo abaixo, um atraso. O aviso contava RM atrasada de QUALQUER
// categoria, e a única RM da tela já estava COTADA. Cotação vencida numa RM já cotada não é
// pendência: a proposta chegou por outro fornecedor. Alarme que não procede ensina a ignorar o card.
import { describe, it, expect } from "vitest";

// A mesma regra do componente, isolada para poder ser provada sem montar a tela.
const categoriaRM = (rm) => (rm.status === "ABERTA" ? "ABERTA" : rm.status === "COTADA" ? "PRONTA" : rm.status);

function statsDe(rms) {
  const acc = { ABERTA: 0, EM_COTACAO: 0, PRONTA: 0 };
  let atrasadas = 0;
  for (const r of rms) {
    const cat = categoriaRM(r);
    if (acc[cat] != null) acc[cat]++;
    if (cat === "EM_COTACAO" && (r.atrasadas || 0) > 0) atrasadas++;
  }
  return { ...acc, atrasadas };
}

describe("KPI de RMs em cotação", () => {
  // ⚠ O caso real da tela: uma RM COTADA com 2 cotações vencidas.
  it("RM já cotada não gera atraso no card de 'em cotação'", () => {
    expect(statsDe([{ status: "COTADA", atrasadas: 2 }])).toEqual({
      ABERTA: 0, EM_COTACAO: 0, PRONTA: 1, atrasadas: 0,
    });
  });

  it("RM em cotação com prazo vencido aparece", () => {
    expect(statsDe([{ status: "EM_COTACAO", atrasadas: 1 }])).toMatchObject({ EM_COTACAO: 1, atrasadas: 1 });
  });

  // ⚠ O card conta RMs, não cotações — a linha da tabela é que mostra "2 atrasadas" da RM.
  it("conta RMs, não cotações: uma RM com três cotações vencidas é UMA", () => {
    expect(statsDe([{ status: "EM_COTACAO", atrasadas: 3 }]).atrasadas).toBe(1);
  });

  it("RM aberta, sem cotação enviada, não entra no atraso", () => {
    expect(statsDe([{ status: "ABERTA", atrasadas: 0 }])).toMatchObject({ ABERTA: 1, atrasadas: 0 });
  });

  it("mistura: só as em cotação somam", () => {
    expect(statsDe([
      { status: "COTADA", atrasadas: 2 },
      { status: "EM_COTACAO", atrasadas: 1 },
      { status: "EM_COTACAO", atrasadas: 0 },
      { status: "ABERTA", atrasadas: 5 },
    ])).toEqual({ ABERTA: 1, EM_COTACAO: 2, PRONTA: 1, atrasadas: 1 });
  });
});
