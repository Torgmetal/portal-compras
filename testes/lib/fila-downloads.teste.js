// O data book da OP-112 não abria (Geraldo, 30/09/2026): 264 anexos baixados UM POR VEZ do
// SharePoint estouravam os 120 s da função. Medido no Mac: 55 s em sequência, 9 s com 10 no ar —
// e montar o PDF leva menos de 1,5 s. O que faltava era baixar vários ao mesmo tempo, sem trocar
// a ordem em que eles entram no livro.
import { describe, it, expect, vi } from "vitest";
import { filaDeDownloads, comNovaTentativa } from "@/lib/fila-downloads";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

describe("fila de downloads do data book", () => {
  it("entrega na ordem do livro, mesmo quando os downloads terminam fora de ordem", async () => {
    const itens = [1, 2, 3, 4, 5, 6];
    // o primeiro é o mais lento: terminaria por último
    const fila = filaDeDownloads(itens, async (n) => { await espera((7 - n) * 5); return `arquivo-${n}`; }, { janela: 3 });
    const recebidos = [];
    for (const n of itens) recebidos.push((await fila.proximo(n)).valor);
    expect(recebidos).toEqual(["arquivo-1", "arquivo-2", "arquivo-3", "arquivo-4", "arquivo-5", "arquivo-6"]);
  });

  it("baixa vários ao mesmo tempo, mas nunca mais que a janela", async () => {
    let noAr = 0, pico = 0;
    const itens = Array.from({ length: 20 }, (_, i) => i);
    const fila = filaDeDownloads(itens, async (n) => { noAr++; pico = Math.max(pico, noAr); await espera(5); noAr--; return n; }, { janela: 4 });
    for (const n of itens) await fila.proximo(n);
    expect(pico).toBe(4);
  });

  it("começa a baixar já na criação — enquanto o livro desenha capa e sumário", () => {
    const baixar = vi.fn(async () => "x");
    filaDeDownloads([1, 2, 3, 4, 5], baixar, { janela: 3 });
    expect(baixar).toHaveBeenCalledTimes(3);
  });

  it("não corre à frente do consumo: no máximo a janela além do que já foi entregue", async () => {
    const baixar = vi.fn(async (n) => n);
    const fila = filaDeDownloads(Array.from({ length: 20 }, (_, i) => i), baixar, { janela: 3 });
    await fila.proximo(0);
    await fila.proximo(1);
    expect(baixar).toHaveBeenCalledTimes(5);
  });

  it("o erro de um anexo volta só para ele, sem derrubar os outros", async () => {
    const fila = filaDeDownloads(["a", "b", "c"], async (x) => { if (x === "b") throw new Error("HTTP 404"); return x.toUpperCase(); }, { janela: 3 });
    expect(await fila.proximo("a")).toEqual({ valor: "A" });
    const b = await fila.proximo("b");
    expect(b.erro.message).toBe("HTTP 404");
    expect(b.valor).toBeUndefined();
    expect(await fila.proximo("c")).toEqual({ valor: "C" });
  });

  it("se a ordem de consumo divergir, baixa o pedido direto — nunca entrega o arquivo de outro anexo", async () => {
    const baixar = vi.fn(async (d) => `conteúdo de ${d.id}`);
    const docs = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
    const fila = filaDeDownloads(docs, baixar, { janela: 2, chave: (d) => d.id });
    // a mesma peça chega como OUTRO objeto (o livro copia o documento ao juntar a ficha do CMR)
    expect((await fila.proximo({ id: "d2" })).valor).toBe("conteúdo de d2");
    expect((await fila.proximo({ id: "d1" })).valor).toBe("conteúdo de d1");
    expect((await fila.proximo({ id: "d3" })).valor).toBe("conteúdo de d3");
  });

  it("reconhece o mesmo documento por outra instância (a chave, não o objeto)", async () => {
    const baixar = vi.fn(async (d) => d.id);
    const fila = filaDeDownloads([{ id: "d1" }, { id: "d2" }], baixar, { janela: 2, chave: (d) => d.id });
    await fila.proximo({ id: "d1" });
    await fila.proximo({ id: "d2" });
    expect(baixar).toHaveBeenCalledTimes(2);
  });
});

describe("nova tentativa quando o SharePoint pede para esperar", () => {
  it("repete no HTTP 429 e devolve o arquivo", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("Falha ao baixar item X: HTTP 429")).mockResolvedValueOnce("ok");
    await expect(comNovaTentativa(fn, { esperaMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("repete em queda de rede (fetch failed) e em 503", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new Error("Falha ao baixar item X: HTTP 503"))
      .mockResolvedValueOnce("ok");
    await expect(comNovaTentativa(fn, { esperaMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não insiste no que não é passageiro (404, 403, arquivo inválido)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Falha ao baixar item X: HTTP 404"));
    await expect(comNovaTentativa(fn, { esperaMs: 0 })).rejects.toThrow("HTTP 404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("desiste depois das tentativas e devolve o último erro", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Falha ao baixar item X: HTTP 429"));
    await expect(comNovaTentativa(fn, { tentativas: 3, esperaMs: 0 })).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não dorme além do prazo: sem tempo para esperar, devolve o erro na hora", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Falha ao baixar item X: HTTP 429"));
    const t0 = Date.now();
    await expect(comNovaTentativa(fn, { esperaMs: 5_000, ateMs: Date.now() + 100 })).rejects.toThrow("HTTP 429");
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
