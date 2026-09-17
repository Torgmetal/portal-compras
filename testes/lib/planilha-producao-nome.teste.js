// O nome da planilha do PCP ganha o mês no fim — e isso parou o cron por 17 dias (17/09/2026).
import { describe, expect, it } from "vitest";
import { escolherPlanilhaDaPasta, getPlanilhaProducaoCandidates } from "@/lib/sharepoint";

const arq = (name, lastModifiedDateTime = "2026-09-01T00:00:00Z") => ({ name, lastModifiedDateTime });

describe("escolherPlanilhaDaPasta", () => {
  const pasta = [
    arq("06-Estoque MP. REV00.xlsx"),
    arq("1. Planilha de Gestão Setembro.xlsx", "2026-09-16T10:00:00Z"),
    arq("2. Plano de Expedição Torg.xlsx"),
    arq("5. Dados Indicadores  - Produção.xlsx"),
  ];

  it("acha a planilha mesmo com o mês colado no fim do nome", () => {
    expect(escolherPlanilhaDaPasta(pasta, "1. Planilha de Gestão.xlsx").name).toBe("1. Planilha de Gestão Setembro.xlsx");
  });

  it("ignora acento, caixa e espaço a mais", () => {
    expect(escolherPlanilhaDaPasta([arq("1.  PLANILHA DE GESTAO  Outubro.xlsm")], "1. Planilha de Gestão.xlsx").name).toBe("1.  PLANILHA DE GESTAO  Outubro.xlsm");
  });

  it("não confunde com outro arquivo da mesma pasta", () => {
    expect(escolherPlanilhaDaPasta([arq("2. Plano de Expedição Torg.xlsx")], "1. Planilha de Gestão.xlsx")).toBe(null);
  });

  it("entre dois que casam, fica o mais recente", () => {
    const dois = [arq("1. Planilha de Gestão Agosto.xlsx", "2026-08-30T00:00:00Z"), arq("1. Planilha de Gestão Setembro.xlsx", "2026-09-16T00:00:00Z")];
    expect(escolherPlanilhaDaPasta(dois, "1. Planilha de Gestão.xlsx").name).toBe("1. Planilha de Gestão Setembro.xlsx");
  });

  it("pasta não traz pasta, nem arquivo de outro tipo", () => {
    expect(escolherPlanilhaDaPasta([{ name: "1. Planilha de Gestão", folder: {} }, arq("1. Planilha de Gestão.pdf")], "1. Planilha de Gestão.xlsx")).toBe(null);
  });
});

it("os candidatos por caminho exato continuam sendo tentados primeiro", () => {
  const c = getPlanilhaProducaoCandidates(new Date(2026, 8, 17));
  expect(c[0]).toMatch(/9\. Setembro\//);
  expect(c.some((x) => x.endsWith(".xlsm"))).toBe(true);
});
