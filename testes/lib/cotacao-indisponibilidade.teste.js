import { describe, it, expect } from "vitest";
import {
  textoDizIndisponivel, contradicaoDeDisponibilidade, bloqueioPorIndisponibilidade,
} from "@/lib/cotacao-indisponibilidade";

// ⚠⚠ O CASO QUE ORIGINOU ESTE ARQUIVO. T67-011-R00 (10/09/2026): a SOUFER não marcou item nenhum
// como sem estoque — digitou "SEM DISPONIBILIDADE" no campo livre "Prazo de entrega" e pôs R$ 2,00
// no preço, contra R$ 7,80 da TUBONASA. O texto foi parar na observação da cotação, que nenhuma
// regra lia; o R$ 2,00 era o menor preço, ganhou sozinho e virou o pedido 2037.
//
// Estes testes congelam as duas metades: reconhecer a frase, e só acender a luz quando ela vem
// ACOMPANHADA de preço — alarme em proposta honesta ensina a ignorar o alarme.

const OBS_SOUFER = "Prazo de entrega: SEM DISPONIBILIDADE  | Pagamento: 28";

describe("textoDizIndisponivel", () => {
  it("reconhece o texto exato da SOUFER, em maiúsculas e com espaço duplo", () => {
    expect(textoDizIndisponivel(OBS_SOUFER)).toBe(true);
  });

  it.each([
    "sem disponibilidade",
    "Sem Disponibilidade no momento",
    "não temos este material",
    "nao temos em estoque",
    "produto INDISPONÍVEL",
    "item fora de linha",
    "não trabalhamos com esse perfil",
    "sem estoque para pronta entrega",
  ])("reconhece %j", (t) => expect(textoDizIndisponivel(t)).toBe(true));

  // ⚠⚠ O FALSO POSITIVO É O QUE MATA A FERRAMENTA. Se "com disponibilidade" acender a luz, o
  // comprador aprende a clicar OK sem ler — e aí o próximo R$ 2,00 passa de novo.
  it.each([
    "Prazo de entrega: 03 | Pagamento: 30",
    "temos disponibilidade imediata",
    "com disponibilidade para 15 dias",
    "entrega conforme disponibilidade de frota",
    "material disponível em estoque",
    "",
    null,
    undefined,
  ])("não acende para %j", (t) => expect(textoDizIndisponivel(t)).toBe(false));
});

describe("contradicaoDeDisponibilidade — texto x número", () => {
  it("acusa a cotação da SOUFER: diz que não tem e manda R$ 2,00", () => {
    const r = contradicaoDeDisponibilidade({
      observacao: OBS_SOUFER,
      itens: [{ precoUnit: 2, semEstoque: false }],
    });
    expect(r.contradiz).toBe(true);
    expect(r.itensComPreco).toBe(1);
    expect(r.texto).toContain("SEM DISPONIBILIDADE");
  });

  // ⚠ Quem escreve "não tenho" E não põe preço está sendo claro — a coluna já sai vazia no mapa e
  // não há nada a avisar. Avisar aqui seria ruído em cima de um fornecedor que fez tudo certo.
  it("fica calada quando o fornecedor diz que não tem e não manda preço", () => {
    const r = contradicaoDeDisponibilidade({
      observacao: "Sem disponibilidade",
      itens: [{ precoUnit: 0, semEstoque: true }],
    });
    expect(r.contradiz).toBe(false);
  });

  it("fica calada na proposta normal", () => {
    const r = contradicaoDeDisponibilidade({
      observacao: "Prazo de entrega: 03 | Pagamento: 30",
      itens: [{ precoUnit: 7.8, semEstoque: false }],
    });
    expect(r.contradiz).toBe(false);
  });

  // O texto também pode vir na observação do ITEM, não só na da proposta.
  it("acha o texto na observação de um item", () => {
    const r = contradicaoDeDisponibilidade({
      observacao: null,
      itens: [{ precoUnit: 10, semEstoque: false, observacao: "não temos esta bitola" }],
    });
    expect(r.contradiz).toBe(true);
  });

  it("item marcado como sem estoque não conta como preço", () => {
    const r = contradicaoDeDisponibilidade({
      observacao: "sem disponibilidade",
      itens: [{ precoUnit: 5, semEstoque: true }],
    });
    expect(r.contradiz).toBe(false);
  });
});

describe("bloqueioPorIndisponibilidade — o que trava a geração de pedido", () => {
  const SOUFER = { id: "c1", fornecedorNome: "SOUFER", observacao: OBS_SOUFER, itens: [{ precoUnit: 2 }] };
  const TUBONASA = { id: "c2", fornecedorNome: "TUBONASA", observacao: "Prazo de entrega: 03 | Pagamento: 30", itens: [{ precoUnit: 7.8 }] };

  it("trava a SOUFER e deixa a TUBONASA passar", () => {
    const b = bloqueioPorIndisponibilidade([SOUFER, TUBONASA]);
    expect(b.map((x) => x.fornecedor)).toEqual(["SOUFER"]);
    expect(b[0].texto).toContain("SEM DISPONIBILIDADE");
  });

  // ⚠ A confirmação é POR COTAÇÃO. Um "ignorar avisos" geral seria clicado por reflexo na segunda
  // vez; confirmando o id, quem confirma diz de qual fornecedor está falando.
  it("libera só a cotação confirmada", () => {
    expect(bloqueioPorIndisponibilidade([SOUFER, TUBONASA], ["c1"])).toEqual([]);
    expect(bloqueioPorIndisponibilidade([SOUFER, TUBONASA], ["c2"]).map((x) => x.id)).toEqual(["c1"]);
  });

  it("sem cotação nenhuma, nada trava", () => {
    expect(bloqueioPorIndisponibilidade([])).toEqual([]);
    expect(bloqueioPorIndisponibilidade(null)).toEqual([]);
  });
});
