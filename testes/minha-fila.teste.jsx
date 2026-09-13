// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MinhaFila from "@/components/producao/MinhaFila";
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/DesenhoPecaModal", () => ({
  default: ({ marca }) => <div>Desenho aberto {marca}</div>,
}));
vi.mock("@/components/FichaPecaModal", () => ({ default: () => null }));
const dados = {
  hoje: "2026-09-12",
  geradoEm: "2026-09-12T12:00:00Z",
  lotes: [
    {
      id: "l",
      op: "112",
      opId: "op112",
      setor: "SOLDA",
      recurso: "SOLDA 1",
      dia: "2026-09-12",
      itens: [{ id: "i", m: "MARCA-A", q: 12, f: 2 }],
    },
    {
      id: "l2",
      op: "107",
      opId: "op107",
      setor: "SOLDA",
      recurso: "SOLDA 2",
      dia: "2026-09-12",
      itens: [{ id: "j", m: "MARCA-B", q: 8 }],
    },
  ],
};
beforeEach(() => {
  globalThis.React = React;
  const armazenamento = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k) => armazenamento.get(k) || null,
    setItem: (k, v) => armazenamento.set(k, v),
    clear: () => armazenamento.clear(),
  });
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => dados }));
});
it("mostra montadores, bancadas sem programação e remaneja somente após confirmação", async () => {
  const montagem = {
    ...dados,
    recursos: { MONTAGEM: ["MONTAGEM 1", "MONTAGEM 2", "MONTAGEM 10"] },
    lotes: [
      {
        ...dados.lotes[0],
        setor: "MONTAGEM",
        recurso: "MONTAGEM 1",
        itens: [
          {
            id: "i",
            m: "MARCA-A",
            q: 12,
            f: 2,
            qTotal: 12,
            prioridade: 1,
            prontidao: { pronto: true },
          },
        ],
      },
    ],
  };
  globalThis.fetch = vi.fn(async (url, opts) => ({
    ok: true,
    json: async () => (opts?.method === "POST" ? { ok: true } : montagem),
  }));
  render(<MinhaFila />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Montagem", exact: true }),
  );
  expect(
    await screen.findByRole("option", {
      name: "Edivando Oliveira · MONTAGEM 1",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("option", { name: "Marcos Bahia · MONTAGEM 10" }),
  ).toBeTruthy();
  expect(
    screen.getByText("10 peças prioritárias para fazer primeiro"),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Trocar bancada / data" }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Bancada de destino" }),
    { target: { value: "MONTAGEM 2" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Conferir troca" }));
  expect(
    globalThis.fetch.mock.calls.filter(([, o]) => o?.method === "POST"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Salvar no Gantt" }));
  await screen.findByRole("button", { name: "Trocar bancada / data" });
  const post = globalThis.fetch.mock.calls.find(
    ([, o]) => o?.method === "POST",
  );
  const body = JSON.parse(post[1].body);
  expect(body.recurso).toBe("MONTAGEM 2");
  expect(body.fracoes).toEqual([
    {
      id: "i",
      inicio: 2,
      quantidade: 10,
      qTotal: 12,
      diaOrigem: "2026-09-12",
      recursoOrigem: "MONTAGEM 1",
    },
  ]);
  expect(
    screen.getAllByText("Jurandir Donizeti · MONTAGEM 2").length,
  ).toBeGreaterThan(0);
});
afterEach(cleanup);
it("abre o trabalho pelo setor e lembra a bancada no aparelho", async () => {
  const tela = render(<MinhaFila />);
  fireEvent.click(await screen.findByRole("button", { name: "Solda" }));
  expect(await screen.findByText("Soldar · OP 112")).toBeTruthy();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Minha bancada ou máquina" }),
    { target: { value: "SOLDA 1" } },
  );
  expect(screen.queryByText("Soldar · OP 107")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver peças e desenhos" }));
  expect(screen.getByText("10 un.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Desenho", exact: true }));
  expect(screen.getByText("Desenho aberto MARCA-A")).toBeTruthy();
  tela.unmount();
  render(<MinhaFila />);
  expect(await screen.findByText("Soldar · OP 112")).toBeTruthy();
  expect(screen.queryByText("Em qual setor você trabalha?")).toBeNull();
  expect(
    screen.getByRole("combobox", { name: "Minha bancada ou máquina" }).value,
  ).toBe("SOLDA 1");
});
