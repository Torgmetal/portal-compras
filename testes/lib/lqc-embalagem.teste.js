import { describe, it, expect } from "vitest";
import { calcularEmbalagem, calcularLqc, NIVEIS_EMBALAGEM } from "@/lib/lqc";

// Vitor (12/09/2026): madeira de embalagem entra na LQC por nível, medida no simulador de carga.
describe("embalagem (madeira) na LQC", () => {
  it("quatro níveis, do econômico ao especificado, em ordem de custo", () => {
    expect(NIVEIS_EMBALAGEM.map((e) => e.key)).toEqual(["ECONOMICA", "PADRAO", "REFORCADA", "ESPECIFICADA"]);
    const v = NIVEIS_EMBALAGEM.map((e) => e.rsKg);
    expect(v).toEqual([...v].sort((a, b) => a - b));
  });
  it("nível × peso, com R$/kg digitado sobrepondo a tabela", () => {
    expect(calcularEmbalagem({ nivel: "PADRAO" }, 136941)).toMatchObject({ nivel: "PADRAO", rsKg: 0.18, total: 24649.38 });
    expect(calcularEmbalagem({ nivel: "especificada", rsKg: "0,70" }, 1000).total).toBe(700);
    expect(calcularEmbalagem({}, 1000)).toMatchObject({ nivel: null, total: 0 });
  });
  it("sem nível o estudo não muda; com nível a madeira entra do lado Torg e no R$/kg", () => {
    const base = { resumos: [{ ativo: true, descricao: "Vigas", estrutura: "COBERTURA", classificacao: "MEDIO", perfil: "W", quantidade: 10, unidades: 1, pesoUnit: 1000 }] };
    const sem = calcularLqc(base), com = calcularLqc({ ...base, embalagem: { nivel: "REFORCADA" } });
    expect(sem.embalagem.total).toBe(0);
    expect(com.embalagem.total).toBe(2900);
    expect(com.custoTorg - sem.custoTorg).toBeCloseTo(2900, 1);
    expect(com.precoPorKg).toBeGreaterThan(sem.precoPorKg);
  });
});
