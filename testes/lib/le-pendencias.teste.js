import { describe, it, expect } from "vitest";
import { SITUACAO, compararLista, pendentes, frase } from "@/lib/le-pendencias";

const arq = (nome, modificadoEm) => ({ nome, itemId: `i-${nome}`, modificadoEm });

describe("compararLista", () => {
  it("sem arquivo no servidor não é pendência — é obra que ainda não tem lista", () => {
    expect(compararLista([], null).situacao).toBe(SITUACAO.SEM_ARQUIVO);
    expect(compararLista(undefined, { arquivo: "x" }).situacao).toBe(SITUACAO.SEM_ARQUIVO);
  });

  it("arquivo no servidor e nada no portal: nunca importada", () => {
    const r = compararLista([arq("T105-LE-R01.xlsx", "2026-09-10T12:00:00Z")], null);
    expect(r.situacao).toBe(SITUACAO.NUNCA_IMPORTADA);
    expect(r.arquivo).toBe("T105-LE-R01.xlsx");
  });

  it("nome diferente é revisão nova, e a frase diz o que o portal tem", () => {
    const r = compararLista(
      [arq("T084-LE-R08.xlsx", "2026-09-01T10:00:00Z")],
      { arquivo: "T084-LE-R07.xlsx", fileModificado: new Date("2026-08-10T10:00:00Z") },
    );
    expect(r.situacao).toBe(SITUACAO.REVISAO_NOVA);
    expect(frase(r)).toBe("revisão mais nova no servidor: T084-LE-R08.xlsx (o portal tem T084-LE-R07.xlsx)");
  });

  // ⚠⚠ O CASO DA OP-104: mesmo nome, arquivo trocado por cima. Só a data denuncia.
  it("mesmo nome com data mais nova é arquivo trocado", () => {
    const r = compararLista(
      [arq("T104-LE-R02.xlsx", "2026-09-12T15:00:00Z")],
      { arquivo: "T104-LE-R02.xlsx", fileModificado: new Date("2026-09-02T09:00:00Z") },
    );
    expect(r.situacao).toBe(SITUACAO.ARQUIVO_TROCADO);
  });

  it("mesmo nome e mesma data está em dia", () => {
    const quando = "2026-09-02T09:00:00Z";
    const r = compararLista([arq("T104-LE-R02.xlsx", quando)], { arquivo: "T104-LE-R02.xlsx", fileModificado: new Date(quando) });
    expect(r.situacao).toBe(SITUACAO.EM_DIA);
  });

  // ⚠ Registro antigo não tem `fileModificado`. Chamar isso de "trocado" encheria o aviso de obra
  // em dia — e alarme falso em ferramenta de alarme ensina a ignorar a ferramenta.
  it("sem data conhecida no portal, não acusa troca", () => {
    const r = compararLista([arq("T104-LE-R02.xlsx", "2026-09-12T15:00:00Z")], { arquivo: "T104-LE-R02.xlsx" });
    expect(r.situacao).toBe(SITUACAO.EM_DIA);
  });

  it("data inválida no servidor não vira troca", () => {
    const r = compararLista([arq("T1.xlsx", "não é data")], { arquivo: "T1.xlsx", fileModificado: new Date("2026-09-01") });
    expect(r.situacao).toBe(SITUACAO.EM_DIA);
  });

  it("compara sempre com o arquivo MAIS NOVO, não com o primeiro da lista", () => {
    const r = compararLista(
      [arq("T105-LE-R01.xlsx", "2026-08-01T10:00:00Z"), arq("T105-LE-R03.xlsx", "2026-09-14T10:00:00Z")],
      { arquivo: "T105-LE-R01.xlsx", fileModificado: new Date("2026-08-01T10:00:00Z") },
    );
    expect(r.situacao).toBe(SITUACAO.REVISAO_NOVA);
    expect(r.arquivo).toBe("T105-LE-R03.xlsx");
  });

  // O portal pode estar à FRENTE (arquivo do servidor mais velho que o importado) — não é pendência.
  it("portal mais novo que o servidor não acusa nada", () => {
    const r = compararLista(
      [arq("T1.xlsx", "2026-09-01T10:00:00Z")],
      { arquivo: "T1.xlsx", fileModificado: new Date("2026-09-10T10:00:00Z") },
    );
    expect(r.situacao).toBe(SITUACAO.EM_DIA);
  });
});

describe("pendentes", () => {
  it("deixa de fora em-dia e sem-arquivo", () => {
    const linhas = [
      { situacao: SITUACAO.EM_DIA }, { situacao: SITUACAO.SEM_ARQUIVO },
      { situacao: SITUACAO.REVISAO_NOVA }, { situacao: SITUACAO.NUNCA_IMPORTADA },
      { situacao: SITUACAO.ARQUIVO_TROCADO },
    ];
    expect(pendentes(linhas).map((l) => l.situacao)).toEqual([
      SITUACAO.REVISAO_NOVA, SITUACAO.NUNCA_IMPORTADA, SITUACAO.ARQUIVO_TROCADO,
    ]);
  });

  it("lista vazia não quebra", () => {
    expect(pendentes(null)).toEqual([]);
  });
});
