import { it, expect } from "vitest";
import { montarFilaOperador } from "@/lib/fila-operador";
const lote = {
  id: "l",
  op: "112",
  setor: "SOLDA",
  recurso: "SOLDA 1",
  dia: "2026-09-12",
  itens: [{ id: "p", m: "A", q: 10, f: 3 }],
};
it("mostra só o saldo do setor e recurso escolhidos", () => {
  const fila = montarFilaOperador(
    [lote, { ...lote, id: "outro", recurso: "SOLDA 2" }],
    "SOLDA",
    "SOLDA 1",
    "2026-09-12",
  );
  expect(fila.hoje).toHaveLength(1);
  expect(fila.hoje[0].saldo).toBe(7);
  expect(fila.hoje[0].itens[0].saldo).toBe(7);
});
it("não manda executar peça sem prontidão ou sem programação", () => {
  const fila = montarFilaOperador(
    [
      {
        ...lote,
        setor: "MONTAGEM",
        itens: [
          {
            id: "a",
            m: "A",
            q: 10,
            prontidao: { pronto: false, motivo: "Croquis pendentes" },
          },
          { id: "b", m: "B", q: 2, prontidao: { pronto: true } },
        ],
      },
      { ...lote, id: "fila", setor: "MONTAGEM", fila: true },
    ],
    "MONTAGEM",
    "",
    "2026-09-12",
  );
  expect(fila.hoje[0].saldo).toBe(2);
  expect(fila.aguardando.reduce((s, l) => s + l.saldo, 0)).toBe(17);
});
it("separa futuro, retorno previsto e concluído do trabalho de hoje", () => {
  const fila = montarFilaOperador(
    [
      { ...lote, id: "futuro", dia: "2026-09-13" },
      { ...lote, id: "terceiro", terceiroPrevisto: true },
      { ...lote, id: "fim", itens: [{ id: "p", m: "A", q: 10, f: 10 }] },
    ],
    "SOLDA",
    "",
    "2026-09-12",
  );
  expect(fila.hoje).toHaveLength(0);
  expect(fila.proximos).toHaveLength(1);
  expect(fila.aguardando).toHaveLength(1);
});
it("mantém saldo vencido no turno noturno e respeita uma data futura real", () => {
  const f = montarFilaOperador(
    [
      { ...lote, id: "saldo", dia: "2026-09-13", veioDe: "2026-09-11" },
      { ...lote, id: "planejado", dia: "2026-09-13" },
    ],
    "SOLDA",
    "",
    "2026-09-12",
  );
  expect(f.hoje.map((l) => l.id)).toEqual(["saldo:hoje"]);
  expect(f.proximos.map((l) => l.id)).toEqual(["planejado:proximos"]);
});
it("respeita a programação do retorno já recebido sem exigir croquis de uma peça virtual", () => {
  const f = montarFilaOperador(
    [{ ...lote, setor: "MONTAGEM", terceiroRecebido: true }],
    "MONTAGEM",
    "",
    "2026-09-12",
  );
  expect(f.hoje).toHaveLength(1);
  expect(f.aguardando).toHaveLength(0);
});
it("reúne a OP na bancada somando as faixas restantes de cada marca", () => {
  const itens = [{ id: "p", m: "A", q: 1, f: 0, inicioUnidade: 0, qTotal: 2 }];
  const f = montarFilaOperador(
    [
      { ...lote, id: "dia1", itens },
      {
        ...lote,
        id: "dia2",
        veioDe: "2026-09-10",
        itens: [{ ...itens[0], inicioUnidade: 1 }],
      },
    ],
    "SOLDA",
    "",
    "2026-09-12",
  );
  expect(f.hoje).toHaveLength(1);
  expect(f.hoje[0].saldo).toBe(2);
  expect(f.hoje[0].itens).toHaveLength(1);
  expect(f.hoje[0].itens[0].q).toBe(2);
});
