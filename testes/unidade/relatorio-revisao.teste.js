import { describe, it, expect } from "vitest";
import { montarSnapshotRevisao } from "@/lib/relatorio-revisao";

describe("relatório de inspeção — abrir revisão", () => {
  const rel = { revisao: 0, status: "EMITIDO", resultadoInspecao: "APROVADO", inspetor: "Alexandre", linhas: [{ letra: "A" }], resultados: { tempo: "Bom" }, marcas: ["71444170-1", "71444170-P1"], emitidoEm: "2026-09-04T21:21:13.648Z", envioAssinaturaId: "env1" };
  const ass = [{ nome: "Fabrine", setor: "Torg Metal", email: "f@torg.com.br", assinadoEm: "2026-09-04T21:45:59.809Z" }, { nome: "Davi", setor: "Cliente", email: "d@x.com", assinadoEm: null }];
  it("congela a rodada inteira: conteúdo, peças, quem assinou e quando", () => {
    const s = montarSnapshotRevisao(rel, ass, { motivo: "peças informadas erradas", porQuem: "Vitor", agora: new Date("2026-09-11T12:00:00Z") });
    expect(s.revisao).toBe(0);
    expect(s.marcas).toEqual(["71444170-1", "71444170-P1"]);
    expect(s.linhas).toEqual([{ letra: "A" }]);
    expect(s.assinaturas).toHaveLength(2);
    expect(s.assinaturas[0].assinadoEm).toBe("2026-09-04T21:45:59.809Z");
    expect(s.assinaturas[1].assinadoEm).toBeNull();
    expect(s.envioAssinaturaId).toBe("env1");
    expect(s.fechadaEm).toBe("2026-09-11T12:00:00.000Z");
    expect(s.origem).toBe("PORTAL");
  });
  it("aguenta relatório sem marcas, linhas ou emissão", () => {
    const s = montarSnapshotRevisao({ revisao: 2, status: "EMITIDO" }, [], { origem: "ASSINANTE" });
    expect(s).toMatchObject({ revisao: 2, marcas: [], linhas: [], emEm: null, resultadoInspecao: null, origem: "ASSINANTE" });
  });
  it("corta motivo e nome ao tamanho do campo", () => {
    const s = montarSnapshotRevisao(rel, [], { motivo: "x".repeat(2000), porQuem: "y".repeat(300) });
    expect(s.motivo).toHaveLength(1000);
    expect(s.porQuem).toHaveLength(120);
  });
});
