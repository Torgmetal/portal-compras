// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: mocks.showToast }) }));
import PlanoAcaoIndicador from "@/app/qualidade/indicadores/PlanoAcaoIndicador";
const plano = { id: "pa21", numero: 21, titulo: "Absenteísmo — ago/26", ano: 2026, mes: 7, status: "EM_ANDAMENTO", responsavel: "RH, Pamela", total: 1, concluidos: 0, itens: [{ oque: "Acompanhar faltas", quanto: "Sem custo adicional. ".repeat(11), status: "A_FAZER" }] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({ ok: true, json: async () => init?.method === "PATCH" ? { plano: { ...plano, ...JSON.parse(init.body) } } : { planos: [plano] } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function abrir() {
  render(<PlanoAcaoIndicador ind={{ id: "absenteismo", nome: "Absenteísmo", meta: { valor: 2 } }} processo="RH" ano={2026} mes={7} />);
  fireEvent.click(await screen.findByText("abrir o plano deste mês"));
}
it("confirma salvamento e mostra o plano concluído na aba de encerrados", async () => {
  await abrir();
  fireEvent.change(screen.getByLabelText("Situação do plano"), { target: { value: "CONCLUIDO" } });
  fireEvent.click(screen.getByText("Salvar plano"));
  await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("Plano salvo com sucesso.", "success"));
  expect(screen.getByRole("button", { name: "Encerrados (1)" }).className).toContain("bg-torg-blue");
  expect(fetch.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1);
});
it("mantém texto digitado e mostra erro quando a API recusa o salvamento", async () => {
  await abrir();
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Ação 1 — Quanto: valor inválido." }) });
  fireEvent.click(screen.getByText("Salvar plano"));
  expect(await screen.findByText("Ação 1 — Quanto: valor inválido.")).toBeTruthy();
  expect(screen.getByLabelText(/^Quanto/).value).toBe(plano.itens[0].quanto);
  expect(mocks.showToast).not.toHaveBeenCalled();
});
it('só exclui após confirmação e remove o plano da lista', async () => {
  await abrir();
  fireEvent.click(screen.getByRole('button', {name:'Excluir plano',exact:true}));
  expect(fetch.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', {name:'Excluir definitivamente'}));
  await waitFor(()=>expect(mocks.showToast).toHaveBeenCalledWith('Plano excluído com sucesso.','success'));
  expect(screen.getByRole('button',{name:'Em aberto (0)'})).toBeTruthy();
});
