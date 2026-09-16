// A planilha do SharePoint só passa por cima do estudo se for mais nova que a última mexida no portal.
import { describe, it, expect } from "vitest";
import { decidirImportacao } from "@/lib/lqc-sharepoint";

const lqc = (modificado) => ({ nome: "LQC-081-26-TMSA-VALE-TR36-TORG-R01.xlsx", modificado });

describe("decidirImportacao — o que a LQC do SharePoint faz com o estudo do portal", () => {
  it("sem estudo: cria", () => {
    expect(decidirImportacao(null, lqc("2026-09-15T10:00:00Z"))).toEqual({ acao: "criar", motivo: null });
  });

  it("estudo montado no portal (sem origemSharePoint): nunca sobrescreve", () => {
    const r = decidirImportacao({ composicao: { resumos: [{ area: "A" }] }, updatedAt: new Date("2026-08-01T00:00:00Z") }, lqc("2026-09-15T10:00:00Z"));
    expect(r.acao).toBe("pulado");
    expect(r.motivo).toMatch(/montado no portal/);
  });

  it("importado e depois trabalhado no portal (o 81 do Vitor, 16/09): a planilha velha não apaga", () => {
    const estudo = { composicao: { origemSharePoint: "LQC-081-26-TMSA-VALE-TR36-TORG-R01.xlsx", resumos: [] }, updatedAt: new Date("2026-09-16T17:31:00Z") };
    const r = decidirImportacao(estudo, lqc("2026-09-10T12:00:00Z"));
    expect(r.acao).toBe("pulado");
    expect(r.motivo).toMatch(/anterior à última mexida/);
  });

  it("LQC refeita no Excel depois da última mexida: atualiza", () => {
    const estudo = { composicao: { origemSharePoint: "LQC-081-26-TMSA-VALE-TR36-TORG-R00.xlsx" }, updatedAt: new Date("2026-09-10T12:00:00Z") };
    expect(decidirImportacao(estudo, lqc("2026-09-16T09:00:00Z"))).toEqual({ acao: "atualizar", motivo: null });
  });

  it("estudo importado sem composição e sem data: atualiza (não há trabalho a perder)", () => {
    expect(decidirImportacao({ composicao: null, updatedAt: null }, lqc("2026-09-16T09:00:00Z")).acao).toBe("atualizar");
  });
});
