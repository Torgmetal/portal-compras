// A situação da peça no setor — uma regra só para PCP › Produção e Produção › Corte e montagem.
import { describe, it, expect } from "vitest";
import { feitoDaPeca, situacaoDaPeca, resumoDoSetor } from "@/lib/status-setor";

describe("situacaoDaPeca", () => {
  it("nada apontado: não iniciado", () => expect(situacaoDaPeca({ qte: 2 })).toBe("NAO_INICIADO"));
  it("parte apontada no Syneco: em produção", () => expect(situacaoDaPeca({ qte: 2, produzidoSyneco: 1 })).toBe("PARCIAL"));
  it("quantidade fechada: finalizado", () => expect(situacaoDaPeca({ qte: 2, produzidoSyneco: 2 })).toBe("FINALIZADO"));
  it("baixa no portal cobrindo a quantidade: finalizado", () => expect(situacaoDaPeca({ qte: 3, baixadoPortal: true, baixadoQtd: 3 })).toBe("FINALIZADO"));
  it("programação iniciada sem apontamento: em produção", () => expect(situacaoDaPeca({ qte: 1, programacao: { situacao: "INICIADA" } })).toBe("PARCIAL"));
  it("expedida ganha de tudo", () => expect(situacaoDaPeca({ qte: 1, expedida: true })).toBe("EXPEDIDA"));
  it("⚠ feito é o MAIOR entre Syneco e baixa — nunca a soma", () => expect(feitoDaPeca({ produzidoSyneco: 3, baixadoQtd: 2 })).toBe(3));
});

describe("resumoDoSetor", () => {
  it("conta por situação e separa conjuntos prontos para montar dos que esperam o corte", () => {
    const r = resumoDoSetor([
      { qte: 1, totalCroquis: 2, prontoMontar: true },
      { qte: 1, totalCroquis: 6, prontoMontar: false },
      { qte: 2, produzidoSyneco: 1, totalCroquis: 3, prontoMontar: false },
      { qte: 1, produzidoSyneco: 1, totalCroquis: 2, prontoMontar: true }, // já montado: não conta
    ]);
    expect(r).toEqual({ total: 4, naoIniciado: 2, emProducao: 1, prontas: 1, conjuntosProntosParaMontar: 1, conjuntosAguardandoCorte: 2 });
  });
  it("lista vazia", () => expect(resumoDoSetor([]).total).toBe(0));
});
