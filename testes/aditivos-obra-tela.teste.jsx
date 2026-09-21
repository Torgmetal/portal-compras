// @vitest-environment jsdom
// O aditivo na aba Obra tem de gritar que é aditivo (Vitor, 17/09/2026).
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import AditivosObra from "@/components/comercial/AditivosObra";

afterEach(() => cleanup());

const op = {
  receitas: [
    { id: "rc1", aditivoId: "ad1", descricao: "Passarela TC 8011", tipoPreco: "POR_UNIDADE", unidade: "kg", quantidade: 12000, valorUnitario: 27.62, valor: 331440 },
    { id: "rc0", aditivoId: null, descricao: "Contrato base", tipoPreco: "VALOR", valor: 1 },
  ],
  referencias: [{ id: "r1", papel: "PEDIDO", rotulo: "OC", codigo: "232301-1", aditivoId: "ad1", ordem: 0 }, { id: "r2", papel: "TAG", rotulo: "TAG", codigo: "TC 8011", paiId: "r1", aditivoId: "ad1", ordem: 1 }],
  aditivos: [{ id: "ad1", numero: 1, status: "DIVULGADO", valor: 429877.11, descricao: "Terceiro intermediário TC 8011 R0", dataInicio: "2026-09-14T00:00:00.000Z", dataFimPrevista: "2026-11-10T00:00:00.000Z", divulgadoEm: "2026-09-17T12:00:00.000Z", createdAt: "2026-09-15T12:00:00.000Z", createdBy: { name: "Matheus" }, itens: [{ id: "i1", descricao: "Perfis W", qtdContratada: 12000, unidade: "kg" }], aceites: [{ email: "a@torg.com.br", aceitoEm: "2026-09-17T13:00:00.000Z" }, { email: "b@torg.com.br", aceitoEm: null }] }],
};

it("mostra ADITIVO 1 em destaque, situação, pedido/TAG, prazo, o que muda e os aceites", () => {
  const onDivulgar = vi.fn();
  render(<AditivosObra op={op} podeGerenciar onDivulgar={onDivulgar} onNovo={() => {}} />);
  expect(screen.getByText("ADITIVO 1")).toBeTruthy();
  expect(screen.getByText("Divulgado aos setores")).toBeTruthy();
  expect(screen.getByText(/OC 232301-1/)).toBeTruthy();
  expect(screen.getByText("TAG TC 8011")).toBeTruthy();
  expect(screen.getByText("14/09/2026 → 10/11/2026")).toBeTruthy();
  expect(screen.getByText("Terceiro intermediário TC 8011 R0")).toBeTruthy();
  expect(screen.getByText(/1 de 2 confirmaram/)).toBeTruthy();
  // a receita do aditivo — só a dele, com peso × unitário
  expect(screen.getByText(/Passarela TC 8011/)).toBeTruthy();
  expect(screen.getByText(/12\.000 kg × R\$.?27,62/)).toBeTruthy();
  expect(screen.queryByText(/Contrato base/)).toBeNull();
  fireEvent.click(screen.getByText("Reenviar comunicado"));
  expect(onDivulgar).toHaveBeenCalledWith({ id: "ad1", numero: 1 });
});

it("sem aditivo: diz que não há e oferece criar para quem pode", () => {
  render(<AditivosObra op={{ aditivos: [], referencias: [] }} podeGerenciar onNovo={() => {}} />);
  expect(screen.getByText(/Nenhum aditivo nesta obra/)).toBeTruthy();
  expect(screen.getByText("Novo aditivo")).toBeTruthy();
});
