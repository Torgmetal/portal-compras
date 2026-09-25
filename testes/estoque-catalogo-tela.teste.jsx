// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RESPOSTA_LOCAIS, ALMOXARIFADO, FABRICA, TERCEIRO } from "@/testes/fixtures/omie-posicao-estoque";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import EstoqueClient from "@/app/compras/estoque/EstoqueClient";

// Compras › Estoque › Catálogo Omie. O detalhe por local nunca tinha aparecido nesta tela: a lista de
// locais nunca era gravada (ver lib/omie-estoque-posicao.js). Na primeira vez que aparecer, precisa
// dizer a verdade — inclusive o local NEGATIVO e o que fica FORA da Qtd.

// A configuração como o sincronismo grava: os seis locais, com quais entram na Qtd.
const LOCAIS = RESPOSTA_LOCAIS.locaisEncontrados.map((l) => ({
  cod: l.codigo_local_estoque, nome: l.descricao, padrao: l.padrao === "S",
  naQtd: [ALMOXARIFADO, FABRICA].includes(l.codigo_local_estoque),
}));

const CHAPA = {
  id: "i1", codigoOmie: "101000002", descricao: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 3,00MM",
  categoriaOmie: "3.1", categoriaLabel: "MATERIA PRIMA", unidade: "KG", cmc: 6.962834,
  qtdAtual: 1679.29, ultimaSincOmie: "2026-09-25T12:00:00.000Z",
  locaisQtd: { [ALMOXARIFADO]: -6480, [FABRICA]: 8159.29, [TERCEIRO]: 1392.6 },
};

const AGENDA = { produtos: "de hora em hora, das 3h às 17h", movimentacoes: "de hora em hora, das 3h30 às 17h30" };

const tela = () => render(
  <EstoqueClient
    itensIniciais={[CHAPA]}
    configInicial={{ locaisOmie: LOCAIS, ultimaSincProd: null, ultimaSincMov: null }}
    agendaCron={AGENDA}
  />,
);

afterEach(cleanup);

describe("Catálogo Omie — o detalhe por local", () => {
  // Quebra que pega: o rótulo `nome.split(" ")[0]` — os três locais começam por "ESTOQUE" e os
  // três botões diriam a mesma palavra.
  it("cada local com o seu nome curto, não três botões \"ESTOQUE\"", () => {
    tela();
    const linha = screen.getByText("101000002").closest("tr");
    for (const nome of ["ALMOXARIFADO", "FABRICA", "TERCEIRO"]) {
      expect(within(linha).getByRole("button", { name: new RegExp(nome) })).toBeTruthy();
    }
  });

  // ⚠⚠ Quebra que pega: o filtro `> 0` escondia o local negativo, e a Qtd (1.679) deixava de bater
  // com o que se via (8.159 + 1.392).
  it("⚠⚠ o local NEGATIVO aparece, com o número", () => {
    tela();
    const almox = within(screen.getByText("101000002").closest("tr")).getByRole("button", { name: /ALMOXARIFADO/ });
    expect(almox.textContent).toContain("-6.480");
  });

  it("⚠ o local fora da Qtd aparece, mas avisado", () => {
    tela();
    const linha = screen.getByText("101000002").closest("tr");
    expect(within(linha).getByRole("button", { name: /TERCEIRO/ }).getAttribute("title")).toMatch(/fora da Qtd/i);
    expect(within(linha).getByRole("button", { name: /FABRICA/ }).getAttribute("title")).not.toMatch(/fora da Qtd/i);
  });
});

describe("Catálogo Omie — o rodapé", () => {
  // Quebra que pega: voltar ao texto escrito à mão ("diariamente às 06:00…"), errado desde que a
  // agenda virou de hora em hora.
  it("mostra a agenda que a página recebeu, não um horário escrito à mão", () => {
    tela();
    expect(screen.getByText(/produtos de hora em hora, das 3h às 17h/)).toBeTruthy();
    expect(screen.queryByText(/diariamente/)).toBeNull();
  });

  it("diz quais locais somam a Qtd", () => {
    tela();
    expect(screen.getByText(/Qtd = ESTOQUE ALMOXARIFADO \+ ESTOQUE FABRICA/)).toBeTruthy();
  });
});
