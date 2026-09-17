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
      // ⚠ `pesoConferidoKg` entrou em 17/09/2026: a planilha vira romaneio no PCP, e romaneio sem
      // peso não fecha carga. Aqui as marcas do fixture não têm peso, então soma zero.
      pesoConferidoKg: 0,
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

// ─── Peso e observações por marca (Matheus, 17/09/2026) ─────────────────────
//
// "precisa sair uma coluna somente com as marcas/tags, ou[tra] com descrição, quantidade, peso e
// observações de cada se tiver" — a planilha vai por e-mail ao PCP, que monta romaneio com ela.
describe("peso e observações na linha da marca", () => {
  const rel = (marcas, lancamentos) => montarRelatorio({
    sessao: { id: "s", status: "FINALIZADA" }, op: { numero: 97 }, marcas, lancamentos,
  });

  it("⚠⚠ o peso é o do CONFERIDO, não o do previsto — romaneio pesa o que sobe no caminhão", () => {
    const [l] = rel([{ marca: "A", previsto: 10, conferido: 4, saldo: 6, pesoUnitKg: 2.5 }]).linhas;
    expect(l.pesoUnitKg).toBe(2.5);
    expect(l.pesoConferidoKg).toBe(10); // 4 × 2,5 — e não 25, que seria o previsto
  });

  it("marca sem peso cadastrado não quebra nem inventa número", () => {
    const [l] = rel([{ marca: "A", previsto: 2, conferido: 2, saldo: 0 }]).linhas;
    expect(l.pesoUnitKg).toBe(0);
    expect(l.pesoConferidoKg).toBe(0);
  });

  it("o resumo soma o peso conferido de todas as marcas", () => {
    const r = rel([
      { marca: "A", previsto: 2, conferido: 2, saldo: 0, pesoUnitKg: 3 },
      { marca: "B", previsto: 4, conferido: 1, saldo: 3, pesoUnitKg: 1.5 },
    ]).resumo;
    expect(r.pesoConferidoKg).toBe(7.5);
  });

  it("⚠ as observações do operador sobem para a linha da marca, todas elas", () => {
    const [l] = rel(
      [{ marca: "A", previsto: 3, conferido: 3, saldo: 0 }],
      [{ marca: "A", observacao: "chegou amassada" }, { marca: "A", observacao: "faltou pintura" }]
    ).linhas;
    expect(l.observacoes).toBe("chegou amassada · faltou pintura");
  });

  it("casa a observação com a marca ignorando caixa e espaço", () => {
    const [l] = rel([{ marca: "T97A10", previsto: 1, conferido: 1, saldo: 0 }],
      [{ marca: " t97a10 ", observacao: "ok" }]).linhas;
    expect(l.observacoes).toBe("ok");
  });

  it("observação vazia não vira ' · ' solto na planilha", () => {
    const [l] = rel([{ marca: "A", previsto: 1, conferido: 1, saldo: 0 }],
      [{ marca: "A", observacao: "   " }, { marca: "A", observacao: null }]).linhas;
    expect(l.observacoes).toBe("");
  });
});
