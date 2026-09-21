import { it, expect } from "vitest";
import { conferirRemanejoSaldo } from "@/lib/remanejo-saldo";
const partes = [
  { inicio: 0, quantidade: 10, dia: "2026-09-10", recurso: "MONTAGEM 1" },
];
const f = {
  id: "p",
  inicio: 3,
  quantidade: 7,
  diaOrigem: "2026-09-10",
  recursoOrigem: "MONTAGEM 1",
  qTotal: 10,
};
it("remaneja só o saldo e conserva a faixa produzida", () => {
  expect(() =>
    conferirRemanejoSaldo(
      partes,
      3,
      [f],
      { dia: "2026-09-12", recurso: "MONTAGEM 2" },
      10,
    ),
  ).not.toThrow();
});
it("recusa peça que recebeu apontamento depois de abrir a tela", () => {
  expect(() =>
    conferirRemanejoSaldo(
      partes,
      4,
      [f],
      { dia: "2026-09-12", recurso: "MONTAGEM 2" },
      10,
    ),
  ).toThrow(/produz|atualiz/i);
});
it("recusa bancada/data alterada por outra pessoa e quantidade reimportada", () => {
  for (const alteracao of [
    { recursoOrigem: "MONTAGEM 2" },
    { diaOrigem: "2026-09-11" },
    { qTotal: 12 },
  ])
    expect(() =>
      conferirRemanejoSaldo(
        partes,
        3,
        [{ ...f, ...alteracao }],
        { dia: "2026-09-12", recurso: "MONTAGEM 2" },
        10,
      ),
    ).toThrow();
});
it("recusa antecipação que reatribuiria o produzido à nova bancada", () => {
  expect(() =>
    conferirRemanejoSaldo(
      partes,
      3,
      [f],
      { dia: "2026-09-09", recurso: "MONTAGEM 2" },
      10,
    ),
  ).toThrow(/histórico|produz/i);
});
it("recusa faixas duplicadas e permite mover quantidade parcial pendente", () => {
  expect(() =>
    conferirRemanejoSaldo(
      partes,
      3,
      [f, f],
      { dia: "2026-09-12", recurso: "MONTAGEM 2" },
      10,
    ),
  ).toThrow();
  expect(() =>
    conferirRemanejoSaldo(
      partes,
      3,
      [{ ...f, quantidade: 2 }],
      { dia: "2026-09-12", recurso: "MONTAGEM 2" },
      10,
    ),
  ).not.toThrow();
});
