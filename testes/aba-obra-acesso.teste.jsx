// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AbaObra from "@/app/comercial/[id]/AbaObra";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ itens: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const op = { id: "op1", numero: "001", cliente: "Cliente", valorTotalContrato: 5754 };
it("não exibe o valor do contrato na aba Obra nem para Comercial", () => {
  render(<AbaObra op={op} podeEditar />);
  expect(screen.queryByText("Valor do contrato")).toBeNull();
});
// ⚠⚠ A ASSERÇÃO ERA "NENHUM FETCH", E ENVELHECEU — MAS A GUARDA CONTINUA (17/09/2026). A consulta
// técnica de propostas (e4a46f815e, 16/09) fez a aba Obra buscar UMA coisa: `proposta-consulta`,
// que só devolve conteúdo de versão com conferência assinada (`assinaturaConsultaValida` +
// `consultaConferida`) e responde `pendente` caso contrário — fail-closed, sem valor financeiro.
//
// Trocar isto por "não verifica nada" seria jogar fora o que o teste protege. O que ele passa a
// dizer é o mesmo em forma mais precisa: a aba não busca ORÇAMENTO nem PASTA comercial. Se alguém
// pendurar aqui um fetch de orçamento, volta a quebrar — que é o ponto.
const urlsBuscadas = () => fetch.mock.calls.map((c) => String(c[0]));
const PROIBIDO = /orcamento|orçamento|pastas?-comerciais?|comercial\/pastas/i;

it("oculta orçamento por padrão e não consulta pastas comerciais", () => {
  render(<AbaObra op={op} />);
  expect(screen.queryByText("Orçamento do Comercial")).toBeNull();
  expect(urlsBuscadas().filter((u) => PROIBIDO.test(u))).toEqual([]);
});
it("não exibe orçamento nem consulta pastas mesmo com permissão comercial", () => {
  // ⚠ `podeEditar`, não `podeGerenciarComercial`: a prop foi renomeada e o teste continuava
  // passando uma que o componente ignora — ou seja, o caso "com permissão" não era testado.
  render(<AbaObra op={op} podeEditar />);
  expect(screen.queryByText("Orçamento do Comercial")).toBeNull();
  expect(urlsBuscadas().filter((u) => PROIBIDO.test(u))).toEqual([]);
});
it("a única consulta da aba é a da proposta, que é fail-closed no servidor", () => {
  render(<AbaObra op={op} />);
  const urls = urlsBuscadas();
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain("/proposta-consulta");
});
it("mostra endereço do cliente e de entrega separados para qualquer usuário", () => {
  render(<AbaObra op={{ ...op, clienteEndereco: "Rua do Cliente, 10", clienteCidade: "Conchal", clienteUF: "SP", clienteCep: "13835-000", kickoff: { entregaEndereco: "Portaria 2\nRua da Obra, 200 — Itaguaí/RJ" } }} />);
  expect(screen.getByText("Endereço do cliente")).toBeTruthy();
  expect(screen.getByText("Rua do Cliente, 10 · Conchal · SP · 13835-000")).toBeTruthy();
  expect(screen.getByText("Endereço de entrega")).toBeTruthy();
  expect(screen.getByText(/Portaria 2/)).toBeTruthy();
});
it("indica entrega não informada sem repetir o endereço fiscal", () => {
  render(<AbaObra op={{ ...op, clienteEndereco: "Rua Fiscal, 10" }} />);
  const campo = screen.getByText("Endereço de entrega").parentElement;
  expect(campo.textContent).toContain("Não informado");
  expect(campo.textContent).not.toContain("Rua Fiscal");
});
