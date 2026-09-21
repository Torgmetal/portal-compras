// A aba EAP de OUTRO mês não serve — e antes servia calada (17/09/2026).
import { expect, it, vi, describe } from "vitest";

const abas = (nomes) => ({ SheetNames: nomes, Sheets: Object.fromEntries(nomes.map((n) => [n, {}])) });
const linhas = [[null, null, null, new Date("2026-09-01T00:00:00Z")], ["Corte"], ["Prev.", null, null, 100], ["Real.", null, null, 90]];

vi.mock("xlsx", () => ({
  read: (buf) => buf._wb,
  utils: { sheet_to_json: () => linhas },
}));

const { parseEapProducao } = await import("@/lib/parse-pcp-eap");
const ler = (nomes, mesIdx) => parseEapProducao({ _wb: abas(nomes) }, { mesIdx });

describe("escolha da aba EAP", () => {
  it("usa a aba do mês pedido", () => {
    expect(ler(["EAP JUNHO", "EAP Setembro"], 8).sheet).toBe("EAP Setembro");
  });

  it("recusa quando só existe aba de OUTRO mês, e diz quais existem", () => {
    expect(() => ler(["EAP JUNHO", "Template"], 8)).toThrow(/Aba "EAP Setembro" nao existe/);
    expect(() => ler(["EAP JUNHO"], 8)).toThrow(/EAP JUNHO/);
    expect(() => ler(["EAP JUNHO"], 8)).toThrow(/criar ou renomear/);
  });

  it("aba genérica sem mês no nome serve para qualquer mês", () => {
    expect(ler(["EAP"], 8).sheet).toBe("EAP");
  });

  it("sem nenhuma aba EAP, o erro diz isso", () => {
    expect(() => ler(["Template", "Bd Exp"], 8)).toThrow(/nao tem nenhuma aba EAP/);
  });
});
