// @vitest-environment jsdom
// Matheus (05/10/2026): "coloque um botão para selecionar todos os itens do pedido e alterar a data
// de recebimento de todos de uma vez". No pedido 2054, 42 das 43 linhas foram gravadas sem data.
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
import CmrColarMassa from "@/app/compras/recebimento-cmr/CmrColarMassa";
import { itensAReceber } from "@/app/compras/recebimento-cmr/CmrLancarClient";

afterEach(cleanup);

function Casca({ inicial, aoMudar }) {
  const [massa, setMassa] = useState(inicial);
  aoMudar(massa);
  return <CmrColarMassa massa={massa} setMassa={setMassa} colar={() => {}} salvarMassa={() => {}} salvando={false} origem="pedido" />;
}

describe("prévia do lote — data para todas as linhas", () => {
  it("aplica a mesma data nas 43 linhas", () => {
    let atual = [];
    const linhas = Array.from({ length: 43 }, (_, i) => ({ descricao: `ITEM ${i}`, dataRecebimento: i === 0 ? "2026-10-01" : "" }));
    render(<Casca inicial={linhas} aoMudar={(m) => { atual = m; }} />);
    const campo = screen.getByLabelText("Data de recebimento para todas");
    fireEvent.change(campo, { target: { value: "05/10/2026" } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByRole("button", { name: /aplicar em 43/i }));
    expect(new Set(atual.map((m) => m.dataRecebimento))).toEqual(new Set(["2026-10-05"]));
  });

  it("sem data escolhida, o botão não faz nada", () => {
    render(<Casca inicial={[{ descricao: "A" }]} aoMudar={() => {}} />);
    expect(screen.getByRole("button", { name: /aplicar em 1/i }).disabled).toBe(true);
  });
});

describe("Marcar todos — os itens do pedido com saldo", () => {
  it("deixa de fora o que já foi entregue inteiro", () => {
    const itens = [{ idx: 0, qtd: 10, qtdRecebida: 10 }, { idx: 1, qtd: 5, qtdRecebida: 2 }, { idx: 2, qtd: 3 }];
    expect(itensAReceber(itens).map((i) => i.idx)).toEqual([1, 2]);
  });
  it("pedido todo entregue: marca todos e o operador decide", () => {
    expect(itensAReceber([{ idx: 0, qtd: 1, qtdRecebida: 1 }]).map((i) => i.idx)).toEqual([0]);
  });
});
