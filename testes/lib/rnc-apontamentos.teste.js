import { describe, it, expect } from "vitest";
import {
  apontamentosDaRnc, procedenciaDaRnc, contagemProcedencia, rotuloProcedencia,
  pesoRetrabalhoTotal, pesoRetrabalhoPorSetor, faltaDisposicao, resumoDosApontamentos,
  normalizarApontamento,
} from "@/lib/rnc-apontamentos";

const ap = (o) => normalizarApontamento(o);

// A RNC-012/26 (RTNC-014, DANPOWER, T74) — o caso que motivou os apontamentos.
const RNC12 = [
  ap({ id: "a1", descricao: "Furação do pé dos guarda-corpos", referencia: "P-PE880R0", procedente: true, decisao: "RETRABALHAR", disposicao: "Refeita em campo.", pesoKg: 128.4, setor: "ENGENHARIA" }),
  ap({ id: "a2", descricao: "Piso de acesso à elevação 2414", referencia: "P-PE879R0", procedente: true, decisao: "RETRABALHAR", disposicao: "Piso complementado.", pesoKg: 42.1, setor: "MONTAGEM" }),
  ap({ id: "a3", descricao: "Interferência nos degraus da 5136", referencia: "P-PE882R0", procedente: false, disposicao: "Executado conforme desenho aprovado." }),
];

describe("procedência agregada", () => {
  it("2 de 3 procedentes é PARCIAL — o estado que a RNC 12 não conseguia expressar", () => {
    expect(procedenciaDaRnc(RNC12)).toBe("PARCIAL");
    expect(contagemProcedencia(RNC12)).toEqual({ sim: 2, total: 3 });
    expect(rotuloProcedencia("PARCIAL", { sim: 2, total: 3 })).toBe("PARCIALMENTE PROCEDENTE (2 de 3)");
  });

  it("todos procedentes é PROCEDENTE; nenhum é IMPROCEDENTE", () => {
    expect(procedenciaDaRnc(RNC12.slice(0, 2))).toBe("PROCEDENTE");
    expect(procedenciaDaRnc([RNC12[2]])).toBe("IMPROCEDENTE");
  });
});

describe("peso do retrabalho", () => {
  it("soma só os procedentes com decisão de retrabalhar", () => {
    expect(pesoRetrabalhoTotal(RNC12)).toBe(170.5);
  });

  it("cada apontamento soma no setor que o gerou, não num setor da RNC", () => {
    expect(pesoRetrabalhoPorSetor(RNC12)).toEqual([
      { setor: "ENGENHARIA", kg: 128.4 },
      { setor: "MONTAGEM", kg: 42.1 },
    ]);
  });

  it("refugo e concessão não entram no retrabalho", () => {
    const outros = [ap({ decisao: "REFUGAR", pesoKg: 90, setor: "SOLDA" }), ap({ decisao: "APROVAR_CONCESSAO", pesoKg: 50, setor: "SOLDA" })];
    expect(pesoRetrabalhoTotal(outros)).toBe(0);
    expect(pesoRetrabalhoPorSetor(outros)).toEqual([]);
  });

  it("dois apontamentos do mesmo setor somam numa linha só", () => {
    const dois = [ap({ decisao: "RETRABALHAR", pesoKg: 10, setor: "SOLDA" }), ap({ decisao: "RETRABALHAR", pesoKg: 5.55, setor: "SOLDA" })];
    expect(pesoRetrabalhoPorSetor(dois)).toEqual([{ setor: "SOLDA", kg: 15.55 }]);
  });
});

describe("improcedente não dispõe do produto", () => {
  it("zera decisão, peso e setor mesmo se vierem preenchidos da tela", () => {
    const a = ap({ procedente: false, decisao: "RETRABALHAR", pesoKg: 300, setor: "SOLDA", disposicao: "Não procede." });
    expect(a.decisao).toBeNull();
    expect(a.pesoKg).toBeNull();
    expect(a.setor).toBeNull();
    // o texto da disposição fica: é ele que responde ao cliente
    expect(a.disposicao).toBe("Não procede.");
  });
});

describe("RNC antiga é lida como um apontamento só", () => {
  it("deriva dos campos de sempre, sem backfill no banco", () => {
    const aps = apontamentosDaRnc({
      tipo: "CLIENTE", pertinente: false, descricao: "Furo fora de posição",
      desenhoProjetoMarca: "T74A12", disposicao: "RETRABALHAR", respostaCliente: "Não procede.",
      pesoRetrabalhoKg: 12, setorRetrabalho: "SOLDA", apontamentos: [],
    });
    expect(aps).toHaveLength(1);
    expect(aps[0].descricao).toBe("Furo fora de posição");
    expect(aps[0].referencia).toBe("T74A12");
    expect(aps[0].procedente).toBe(false);
    expect(aps[0].disposicao).toBe("Não procede.");
  });

  it("RNC interna nasce procedente — `pertinente` lá não quer dizer procedência", () => {
    const aps = apontamentosDaRnc({ tipo: "INTERNA", pertinente: false, descricao: "x", apontamentos: [] });
    expect(aps[0].procedente).toBe(true);
  });

  it("uma RNC interna com retrabalho continua dando o mesmo peso e o mesmo setor de antes", () => {
    const aps = apontamentosDaRnc({ tipo: "INTERNA", descricao: "x", disposicao: "RETRABALHAR", pesoRetrabalhoKg: 197.54, setorRetrabalho: "SOLDA", apontamentos: [] });
    expect(pesoRetrabalhoTotal(aps)).toBe(197.54);
    expect(pesoRetrabalhoPorSetor(aps)).toEqual([{ setor: "SOLDA", kg: 197.54 }]);
  });
});

describe("disposição é exigida para encerrar", () => {
  it("aponta quais itens estão sem texto", () => {
    expect(faltaDisposicao(RNC12)).toEqual([]);
    expect(faltaDisposicao([...RNC12, ap({ id: "a4", procedente: true })])).toEqual(["a4"]);
  });
});

describe("resumo gravado na RNC", () => {
  it("pertinente é 'algum procede' — a RNC 12 conta 1 no indicador, com 2 de 3", () => {
    const r = resumoDosApontamentos(RNC12);
    expect(r.pertinente).toBe(true);
    expect(r.procedencia).toBe("PARCIAL");
  });

  it("só é improcedente quando nenhum apontamento procede", () => {
    expect(resumoDosApontamentos([RNC12[2]]).pertinente).toBe(false);
  });

  it("o setor do resumo é o que mais pesa, e o peso é a soma", () => {
    const r = resumoDosApontamentos(RNC12);
    expect(r.setorRetrabalho).toBe("ENGENHARIA");
    expect(r.pesoRetrabalhoKg).toBe(170.5);
    expect(r.disposicao).toBe("RETRABALHAR");
  });

  it("sem retrabalho, o peso fica nulo em vez de zero — zero apareceria como número medido", () => {
    const r = resumoDosApontamentos([ap({ decisao: "REFUGAR", pesoKg: 10, setor: "SOLDA" })]);
    expect(r.pesoRetrabalhoKg).toBeNull();
    expect(r.disposicao).toBe("REFUGAR");
  });
});
