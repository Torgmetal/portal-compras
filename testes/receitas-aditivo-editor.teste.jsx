// @vitest-environment jsdom
// O editor da receita do aditivo: descrição, peso e unitário — o total sai sozinho (Vitor, 17/09/2026).
import React, { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import ReceitasAditivoEditor from "@/components/comercial/ReceitasAditivoEditor";
import { linhaReceitaVazia } from "@/lib/receita-aditivo";

afterEach(() => cleanup());

function Tela({ valorPedido = null }) {
  const [linhas, setLinhas] = useState([linhaReceitaVazia()]);
  return <ReceitasAditivoEditor linhas={linhas} onChange={setLinhas} valorPedido={valorPedido} />;
}

it("descrição + peso + unitário → o total sai sozinho e bate com o pedido", () => {
  render(<Tela valorPedido={331440} />);
  fireEvent.change(screen.getByLabelText("Descrição da receita 1"), { target: { value: "Passarela TC 8011" } });
  fireEvent.change(screen.getByLabelText("Peso (kg) da receita 1"), { target: { value: "12000" } });
  fireEvent.change(screen.getByLabelText("Unitário (R$/kg) da receita 1"), { target: { value: "27,62" } });
  expect(screen.getByTestId("rec-total-0").textContent).toMatch(/331\.440,00/);
  expect(screen.getByTestId("rec-total").textContent).toMatch(/331\.440,00/);
  expect(screen.queryByText(/não bate com o valor do pedido/)).toBeNull();
});

it("avisa quando a receita não bate com o pedido; valor fechado pede só o valor; dá para somar linhas", () => {
  render(<Tela valorPedido={100000} />);
  fireEvent.change(screen.getByLabelText("Unidade da receita 1"), { target: { value: "vb" } });
  fireEvent.change(screen.getByLabelText("Descrição da receita 1"), { target: { value: "Montagem" } });
  fireEvent.change(screen.getByLabelText("Valor da receita 1"), { target: { value: "90000" } });
  expect(screen.queryByLabelText(/Peso/)).toBeNull();
  expect(screen.getByText(/não bate com o valor do pedido/)).toBeTruthy();
  fireEvent.click(screen.getByText("linha de receita"));
  expect(screen.getByLabelText("Descrição da receita 2")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Remover receita 2"));
  expect(screen.queryByLabelText("Descrição da receita 2")).toBeNull();
});
