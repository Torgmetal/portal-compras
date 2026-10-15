// Editar e excluir um aditivo (Matheus, 15/10/2026: "não tem a opção de editar e nem a opção de
// excluir"). Vitor, no mesmo dia: editar vale também para o DIVULGADO; excluir é recusado quando
// algo já depende do aditivo (medição, RM, verba) — nada é desvinculado sozinho.
import { describe, expect, it } from "vitest";
import { bloqueiosDaExclusao, planoDasReceitas, receitasParaEditor } from "@/lib/aditivo-edicao";
import { linhasParaEnvio, totalDaLinha } from "@/lib/receita-aditivo";

const limpo = { status: "RASCUNHO", _count: { medicoes: 0, aceites: 0 }, itens: [{ _count: { rmItens: 0, solicitacoesVerba: 0 } }] };

describe("bloqueiosDaExclusao", () => {
  it("rascunho sem nada ligado pode sair", () => {
    expect(bloqueiosDaExclusao(limpo)).toEqual([]);
  });

  it("medição ligada recusa e diz quantas — o caso do aditivo 4 da OP-105", () => {
    expect(bloqueiosDaExclusao({ ...limpo, _count: { medicoes: 1, aceites: 0 } })).toEqual(["1 medição vinculada"]);
  });

  it("divulgado não sai: o comunicado já foi aos setores", () => {
    expect(bloqueiosDaExclusao({ ...limpo, status: "DIVULGADO", _count: { medicoes: 0, aceites: 21 } })[0]).toMatch(/divulgado/);
  });

  it("RM e solicitação de verba nos itens também recusam, somadas", () => {
    const ad = { ...limpo, itens: [{ _count: { rmItens: 2, solicitacoesVerba: 0 } }, { _count: { rmItens: 1, solicitacoesVerba: 1 } }] };
    expect(bloqueiosDaExclusao(ad)).toEqual(["3 itens de RM", "1 solicitação de verba"]);
  });
});

describe("receitasParaEditor — a volta do banco para a tela", () => {
  it("por unidade volta com vírgula decimal e o total não muda no caminho de ida e volta", () => {
    const banco = [{ id: "r1", categoria: "FABRICACAO", descricao: "Longarinas", tipoPreco: "POR_UNIDADE", unidade: "kg", quantidade: 1234.5, valorUnitario: 27.62, valor: 34096.89 }];
    const [l] = receitasParaEditor(banco);
    expect(l).toMatchObject({ id: "r1", unidade: "kg", quantidade: "1234,5", valorUnitario: "27,62" });
    expect(totalDaLinha(l)).toBe(34096.89);
    expect(linhasParaEnvio([l])[0]).toMatchObject({ id: "r1", quantidade: 1234.5, valor: 34096.89 });
  });

  it("valor fechado volta como 'vb'", () => {
    const [l] = receitasParaEditor([{ id: "r2", categoria: "MONTAGEM", descricao: "Montagem", tipoPreco: "VALOR", unidade: null, quantidade: null, valorUnitario: null, valor: 15000.5 }]);
    expect(l).toMatchObject({ unidade: "vb", valor: "15000,5" });
    expect(totalDaLinha(l)).toBe(15000.5);
  });
});

describe("planoDasReceitas — atualiza no lugar, não recria", () => {
  // ⚠ recriar perderia o que a aba Resumo acrescenta à linha (CFOP, impostos, endereço)
  it("linha com id conhecido é atualizada; sem id é criada; a que sumiu é apagada", () => {
    const plano = planoDasReceitas([{ id: "a" }, { id: "b" }], [{ id: "a", descricao: "x", valor: 1 }, { descricao: "nova", valor: 2 }]);
    expect(plano.atualizar.map((r) => r.id)).toEqual(["a"]);
    expect(plano.criar.map((r) => r.descricao)).toEqual(["nova"]);
    expect(plano.apagar).toEqual(["b"]);
  });

  it("id que não é deste aditivo vira linha nova — nunca altera receita de outro", () => {
    const plano = planoDasReceitas([{ id: "a" }], [{ id: "de-outro", descricao: "y", valor: 3 }]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.criar).toEqual([{ descricao: "y", valor: 3 }]);
    expect(plano.apagar).toEqual(["a"]);
  });
});
