// A reconciliação de pedidos ENCERRADOS no Omie — a parte PURA, sem rede nem banco.
//
// ⚠ O que estes testes protegem é a assimetria: marcar é sempre seguro, DESMARCAR só com coleta
// completa. Foi o achado do Codex (17/09/2026) — uma página que falhou no Omie viraria "o pedido
// reabriu" e apagaria sozinha a marca de um pedido que ninguém tocou.
import { describe, it, expect } from "vitest";
import { decidirEncerramentos, janelaDaColeta } from "@/lib/omie-encerramento";

const coleta = (codigos, completa = true) => ({ codigos: new Set(codigos), completa });
const ped = (id, codigoPedido, encerradoOmieEm = null) => ({ id, codigoPedido, encerradoOmieEm });

describe("decidirEncerramentos", () => {
  it("marca o pedido que o Omie devolveu como encerrado", () => {
    const r = decidirEncerramentos([ped("a", "111")], coleta(["111"]));
    expect(r.marcar).toEqual(["a"]);
    expect(r.desmarcar).toEqual([]);
  });

  it("não remarca o que já estava marcado", () => {
    const r = decidirEncerramentos([ped("a", "111", new Date())], coleta(["111"]));
    expect(r.marcar).toEqual([]);
  });

  it("desmarca quem saiu do conjunto — mas só com coleta COMPLETA", () => {
    const pedidos = [ped("a", "111", new Date())];
    expect(decidirEncerramentos(pedidos, coleta([], true)).desmarcar).toEqual(["a"]);
    expect(decidirEncerramentos(pedidos, coleta([], false)).desmarcar).toEqual([]);
  });

  it("coleta incompleta ainda marca o que ELA achou", () => {
    const r = decidirEncerramentos([ped("a", "111"), ped("b", "222", new Date())], coleta(["111"], false));
    expect(r.marcar).toEqual(["a"]);
    expect(r.desmarcar).toEqual([]);
  });

  it("ignora pedido sem código do Omie", () => {
    const r = decidirEncerramentos([ped("a", null, new Date())], coleta([], true));
    expect(r.marcar).toEqual([]);
    expect(r.desmarcar).toEqual([]);
  });

  it("compara por texto — o Omie devolve número e o banco guarda string", () => {
    const r = decidirEncerramentos([ped("a", "7827929809")], coleta([String(7827929809)]));
    expect(r.marcar).toEqual(["a"]);
  });
});

describe("janelaDaColeta", () => {
  it("começa antes do pedido mais antigo e termina bem depois de hoje", () => {
    const { de, ate } = janelaDaColeta([new Date("2024-03-10"), new Date("2026-01-05")]);
    expect(de.getTime()).toBeLessThan(new Date("2024-03-10").getTime());
    expect(ate.getTime()).toBeGreaterThan(Date.now());
  });

  it("sem pedidos, não quebra", () => {
    const { de, ate } = janelaDaColeta([]);
    expect(de instanceof Date && ate instanceof Date).toBe(true);
    expect(ate.getTime()).toBeGreaterThan(de.getTime());
  });

  it("ignora datas inválidas em vez de devolver janela NaN", () => {
    const { de } = janelaDaColeta([null, "não é data", new Date("2025-06-01")]);
    expect(Number.isFinite(de.getTime())).toBe(true);
  });
});
