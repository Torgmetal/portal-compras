import { describe, it, expect } from "vitest";
import { resumirPeca, agruparMateriais } from "@/lib/producao-operacional";
describe("quantidades e pendências operacionais", () => {
  it("não soma o mesmo apontamento manual e Syneco", () => {
    const p = resumirPeca({ qte: 20, produzidoSyneco: 8, baixadoQtd: 5 });
    expect(p.feito).toBe(8);
    expect(p.saldo).toBe(12);
  });
  it("não transforma ausência de material consultado em falta confirmada", () => {
    expect(resumirPeca({ qte: 5, material: null }).motivos).not.toContain(
      "Aguardando material",
    );
    expect(
      resumirPeca({ qte: 5, destino: "AGUARDANDO_MATERIAL" }).motivos,
    ).toContain("Aguardando material");
  });
  it("não considera avanço em outro setor uma baixa total nesta etapa", () => {
    const p = resumirPeca({ qte: 10, produzidoSyneco: 2, avancouAlem: true });
    expect(p.saldo).toBe(8);
    expect(p.situacao).toBe("CONCILIAR");
    expect(p.proxima).toContain("não repetir");
  });
  it("conta unidades e mantém material sem rastreabilidade como informação incompleta", () => {
    const grupos = agruparMateriais([
      { id: "1", marca: "A", perfil: "I 200", qte: 12, material: null },
      { id: "2", marca: "B", perfil: "I 200", qte: 4, material: null },
    ]);
    expect(grupos[0].unidades).toBe(16);
    expect(grupos[0].marcas).toHaveLength(2);
    expect(grupos[0].rastreios).toEqual([]);
  });
});
