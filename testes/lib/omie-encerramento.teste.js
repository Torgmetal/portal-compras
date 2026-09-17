// A reconciliação de pedidos ENCERRADOS no Omie — a parte PURA, sem rede nem banco.
//
// ⚠ O que estes testes protegem é a assimetria: marcar é sempre seguro, DESMARCAR só com coleta
// completa. Foi o achado do Codex (17/09/2026) — uma página que falhou no Omie viraria "o pedido
// reabriu" e apagaria sozinha a marca de um pedido que ninguém tocou.
import { describe, it, expect } from "vitest";
import { decidirEncerramentos, janelaDaColeta, confirmarReaberturas } from "@/lib/omie-encerramento";


const coleta = (codigos, completa = true) => ({ codigos: new Set(codigos), completa });
const ped = (id, codigoPedido, encerradoOmieEm = null) => ({ id, codigoPedido, encerradoOmieEm });

describe("decidirEncerramentos", () => {
  it("marca o pedido que o Omie devolveu como encerrado", () => {
    const r = decidirEncerramentos([ped("a", "111")], coleta(["111"]));
    expect(r.marcar).toEqual(["a"]);
    expect(r.candidatos).toEqual([]);
  });

  it("não remarca o que já estava marcado", () => {
    const r = decidirEncerramentos([ped("a", "111", new Date())], coleta(["111"]));
    expect(r.marcar).toEqual([]);
  });

  it("⚠⚠ quem saiu do conjunto vira CANDIDATO, não desmarcado — ausência não é reabertura", () => {
    const pedidos = [ped("a", "111", new Date())];
    expect(decidirEncerramentos(pedidos, coleta([], true)).candidatos.map((p) => p.id)).toEqual(["a"]);
    expect(decidirEncerramentos(pedidos, coleta([], false)).candidatos).toEqual([]);
  });

  it("coleta incompleta ainda marca o que ELA achou", () => {
    const r = decidirEncerramentos([ped("a", "111"), ped("b", "222", new Date())], coleta(["111"], false));
    expect(r.marcar).toEqual(["a"]);
    expect(r.candidatos).toEqual([]);
  });

  it("ignora pedido sem código do Omie", () => {
    const r = decidirEncerramentos([ped("a", null, new Date())], coleta([], true));
    expect(r.marcar).toEqual([]);
    expect(r.candidatos).toEqual([]);
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

// ─── Desmarcar exige EVIDÊNCIA POSITIVA (achado do Codex, 17/09/2026) ────────
//
// ⚠⚠ O buraco era de perda total: `d.pedidos_pesquisa || []` com `Number(d.nTotalPaginas || 1)`
// transformava uma resposta `{}` em "coletei tudo e não há nenhum encerrado" — `completa: true`,
// que é a licença para desmarcar. Uma resposta vazia apagaria a marca dos 33 pedidos de uma vez.
describe("confirmarReaberturas", () => {
  const cand = (id, codigoPedido) => ({ id, codigoPedido, encerradoOmieEm: new Date() });

  it("sem candidatos, não consulta o Omie", async () => {
    const r = await confirmarReaberturas([], { de: new Date(), ate: new Date() });
    expect(r).toEqual({ desmarcar: [], indefinidos: [], consultou: false });
  });

  it("⚠ só desmarca quem o Omie devolve como PENDENTE", async () => {
    const coletar = async () => ({ codigos: new Set(["111"]), completa: true, motivo: null });
    const r = await confirmarReaberturas([cand("a", "111"), cand("b", "222")], { de: new Date(), ate: new Date() }, { coletar });
    expect(r.desmarcar).toEqual(["a"]);
    expect(r.indefinidos).toEqual(["b"]);
  });

  it("⚠⚠ pesquisa de pendentes incompleta NÃO desmarca ninguém", async () => {
    const coletar = async () => ({ codigos: new Set(), completa: false, motivo: "falhou" });
    const r = await confirmarReaberturas([cand("a", "111")], { de: new Date(), ate: new Date() }, { coletar });
    expect(r.desmarcar).toEqual([]);
    expect(r.indefinidos).toEqual(["a"]);
  });
});
