import { describe, it, expect } from "vitest";
import { montarRelatorio, nomeDoArquivo, rotuloSituacao, SITUACAO } from "@/lib/conferencia-relatorio";

const base = {
  sessao: { id: "c1", status: "FINALIZADA", observacao: "carga da manhã",
    iniciadaEm: "2026-09-16T11:00:00Z", iniciadaPorNome: "Leandro",
    finalizadaEm: "2026-09-16T14:30:00Z", finalizadaPorNome: "Leandro" },
  op: { numero: "103", cliente: "TMSA", obra: "Torocua" },
  marcas: [
    { marca: "T103A1", descricao: "VIGA", previsto: 4, conferido: 4, saldo: 0 },
    { marca: "T103A2", descricao: "COLUNA", previsto: 2, conferido: 1, saldo: 1 },
    { marca: "T103A3", descricao: "TERÇA", previsto: 6, conferido: 0, saldo: 6 },
  ],
  lancamentos: [
    { id: "l2", marca: "T103A2", qte: 1, criadoEm: "2026-09-16T13:00:00Z", criadoPorNome: "Leandro", observacao: "" },
    { id: "l1", marca: "T103A1", qte: 4, criadoEm: "2026-09-16T12:00:00Z", criadoPorNome: "Leandro", observacao: "ok" },
  ],
};

describe("montarRelatorio", () => {
  // ⚠⚠ O documento mostra a OBRA INTEIRA. Um papel que lista só o que foi bipado esconde a
  // pergunta que a expedição faz na hora de carregar — "o que falta?" — e certifica um
  // carregamento completo que não aconteceu.
  it("traz toda marca da lista, não só as conferidas", () => {
    const r = montarRelatorio(base);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas.map((l) => l.situacao)).toEqual([
      SITUACAO.NAO_CONFERIDA, SITUACAO.PARCIAL, SITUACAO.COMPLETA,
    ]);
  });

  // ⚠ Pendência no fim de uma lista de 500 marcas não é lida.
  it("ordena pelo que FALTA primeiro, e por marca dentro de cada grupo", () => {
    const r = montarRelatorio({ ...base, marcas: [
      { marca: "B2", previsto: 1, conferido: 0, saldo: 1 },
      { marca: "B10", previsto: 1, conferido: 0, saldo: 1 },
      { marca: "A1", previsto: 1, conferido: 1, saldo: 0 },
    ]});
    expect(r.linhas.map((l) => l.marca)).toEqual(["B2", "B10", "A1"]);
  });

  it("o resumo conta o que a expedição precisa saber", () => {
    expect(montarRelatorio(base).resumo).toEqual({
      marcas: 3, previsto: 12, conferido: 5, saldo: 7,
      completas: 1, parciais: 1, naoConferidas: 1, percentual: 42, pendente: true,
    });
  });

  it("conferência completa não fica marcada como pendente", () => {
    const r = montarRelatorio({ ...base, marcas: [{ marca: "X", previsto: 2, conferido: 2, saldo: 0 }] });
    expect(r.resumo).toMatchObject({ pendente: false, percentual: 100, saldo: 0 });
  });

  // ⚠ Obra sem lista não é obra com 0% conferido — zero seria uma acusação.
  it("sem peça prevista, o percentual é nulo em vez de zero", () => {
    const r = montarRelatorio({ ...base, marcas: [] });
    expect(r.resumo.percentual).toBeNull();
    expect(r.resumo.pendente).toBe(false);
  });

  // ⚠ A tela mostra do mais recente para o mais antigo; o papel é histórico e lê ao contrário.
  it("os lançamentos saem na ordem do turno", () => {
    expect(montarRelatorio(base).lancamentos.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("não quebra sem lançamento, sem marca e sem OP", () => {
    const r = montarRelatorio({ sessao: {}, op: null, marcas: null, lancamentos: null });
    expect(r.linhas).toEqual([]);
    expect(r.lancamentos).toEqual([]);
    expect(r.op).toEqual({ numero: null, cliente: "", obra: "" });
  });

  it("o nome do arquivo é o mesmo nos dois formatos, com a data da conferência", () => {
    const r = montarRelatorio(base);
    expect(nomeDoArquivo(r, "pdf")).toBe("Conferencia_OP-103_2026-09-16.pdf");
    expect(nomeDoArquivo(r, "xlsx")).toBe("Conferencia_OP-103_2026-09-16.xlsx");
  });

  it("os rótulos são os que vão impressos", () => {
    expect(rotuloSituacao(SITUACAO.COMPLETA)).toBe("Conferida");
    expect(rotuloSituacao(SITUACAO.PARCIAL)).toBe("Parcial");
    expect(rotuloSituacao(SITUACAO.NAO_CONFERIDA)).toBe("Não conferida");
  });
});
