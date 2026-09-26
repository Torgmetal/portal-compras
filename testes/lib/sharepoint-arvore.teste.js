import { describe, it, expect, vi } from "vitest";
import { varrerArvore, listarPasta, motivoDoGraph, getDoGraph } from "@/lib/sharepoint-arvore";

// ⚠⚠ O `search` do Graph devolve HTTP 500 neste drive desde 22–23/09/2026, e escopar em pasta
// falha igual. Este módulo é a alternativa: listar por caminho. O que os testes abaixo travam é o
// que torna a troca SEGURA — nunca devolver listagem parcial com cara de listagem inteira.

const json = (corpo, status = 200, headers = {}) => ({
  ok: status < 400, status, json: async () => corpo, headers: { get: (k) => headers[k] ?? null },
});
const arq = (name, extra = {}) => ({ id: name, name, file: {}, size: 1024, lastModifiedDateTime: "2026-09-20T10:00:00Z", ...extra });
const pasta = (name) => ({ id: name, name, folder: {} });

/** GET falso: casa por trecho da URL (já codificada). */
const falso = (rotas) => vi.fn(async (url) => {
  for (const [trecho, resp] of rotas) if (url.includes(encodeURI(trecho) + ":/children")) return typeof resp === "function" ? resp(url) : resp;
  return json({ error: { code: "itemNotFound", message: "nada" } }, 404);
});

const SEM_PAUSA = { pausaMs: 0 };

describe("varrerArvore", () => {
  it("acha arquivo em nível fundo, com o caminho e a pasta-mãe de cada um", async () => {
    // ⚠ A pasta de fabricação da OP-105 tem PDF no 5º nível, sob nomes que ninguém previu
    // ("CH 12.5"). Um `maxDepth` cortaria desenho de verdade sem dizer nada.
    const get = falso([
      ["/raiz", json({ value: [pasta("2.5.2.2 Croqui")] })],
      ["/raiz/2.5.2.2 Croqui", json({ value: [pasta("A")] })],
      ["/raiz/2.5.2.2 Croqui/A", json({ value: [arq("T105A1.pdf"), pasta("CH 12.5")] })],
      ["/raiz/2.5.2.2 Croqui/A/CH 12.5", json({ value: [arq("T105A9.pdf")] })],
    ]);
    const r = await varrerArvore(get, "d", "/raiz", SEM_PAUSA);
    expect(r.arquivos.map((a) => a.name).sort()).toEqual(["T105A1.pdf", "T105A9.pdf"]);
    const fundo = r.arquivos.find((a) => a.name === "T105A9.pdf");
    expect(fundo.pasta).toBe("CH 12.5");
    expect(fundo.relativo).toBe("2.5.2.2 Croqui/A/CH 12.5");
    expect(r.pastas).toBe(4);
  });

  it("⚠⚠ pasta que falha derruba a varredura — nunca devolve parcial", async () => {
    // Engolir o erro faria "a marca não tem desenho" e "o SharePoint não respondeu" saírem iguais.
    const get = falso([
      ["/raiz", json({ value: [pasta("boa"), pasta("ruim")] })],
      ["/raiz/boa", json({ value: [arq("existe.pdf")] })],
      ["/raiz/ruim", json({ error: { code: "serviceNotAvailable", message: "caiu" } }, 503)],
    ]);
    await expect(varrerArvore(get, "d", "/raiz", { ...SEM_PAUSA, paralelo: 2 })).rejects.toThrow(/ruim.*HTTP 503/s);
  });

  it("raiz que não existe é resposta (null); subpasta que some no meio é ignorada", async () => {
    expect(await varrerArvore(falso([]), "d", "/nao-existe", SEM_PAUSA)).toBeNull();

    const get = falso([
      ["/raiz", json({ value: [pasta("sumiu"), pasta("ficou")] })],
      ["/raiz/ficou", json({ value: [arq("a.pdf")] })],
      // "/raiz/sumiu" cai no 404 padrão — corrida normal entre listar o pai e listar o filho
    ]);
    const r = await varrerArvore(get, "d", "/raiz", SEM_PAUSA);
    expect(r.arquivos.map((a) => a.name)).toEqual(["a.pdf"]);
  });

  it("segue o @odata.nextLink — parar na 1ª página é meia pasta com cara de pasta inteira", async () => {
    const get = vi.fn(async (url) => (url.includes("pagina2")
      ? json({ value: [arq("b.pdf")] })
      : json({ value: [arq("a.pdf")], "@odata.nextLink": "https://graph/pagina2" })));
    const r = await varrerArvore(get, "d", "/raiz", SEM_PAUSA);
    expect(r.arquivos.map((a) => a.name)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("estourar o teto de pastas é ERRO, não 'o que deu para ver'", async () => {
    const get = falso([
      ["/raiz", json({ value: [pasta("a"), pasta("b"), pasta("c")] })],
      ["/raiz/a", json({ value: [] })], ["/raiz/b", json({ value: [] })], ["/raiz/c", json({ value: [] })],
    ]);
    await expect(varrerArvore(get, "d", "/raiz", { ...SEM_PAUSA, teto: 2 })).rejects.toThrow(/mais de 2 pastas/);
  });

  it("o filtro de arquivo tira o que não interessa antes de acumular", async () => {
    const get = falso([["/raiz", json({ value: [arq("desenho.pdf"), arq("planilha.xlsx")] })]]);
    const r = await varrerArvore(get, "d", "/raiz", { ...SEM_PAUSA, arquivo: (n) => /\.pdf$/i.test(n) });
    expect(r.arquivos.map((a) => a.name)).toEqual(["desenho.pdf"]);
  });
});

describe("listarPasta", () => {
  it("404 é null (pasta não existe), qualquer outro status lança com o motivo", async () => {
    expect(await listarPasta(async () => json({}, 404), "d", "/x")).toBeNull();
    await expect(listarPasta(async () => json({ error: { code: "generalException", message: "boom" } }, 500), "d", "/x"))
      .rejects.toThrow(/HTTP 500 · generalException · boom/);
  });
});

describe("getDoGraph", () => {
  it("⚠ espera o Retry-After em vez de desistir — a cota é compartilhada com todos os crons", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchFalso = vi.fn(async () => (++n === 1 ? json({}, 429, { "retry-after": "1" }) : json({ value: [] })));
    const original = globalThis.fetch;
    globalThis.fetch = fetchFalso;
    try {
      const p = getDoGraph("tok")("https://graph/x");
      p.catch(() => {});
      await vi.runAllTimersAsync();
      expect((await p).ok).toBe(true);
      expect(fetchFalso).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = original;
      vi.useRealTimers();
    }
  });
});

describe("motivoDoGraph", () => {
  it("corpo não-JSON não quebra: sobra o status", async () => {
    expect(await motivoDoGraph({ status: 502, json: async () => { throw new Error("html"); } })).toBe("HTTP 502");
  });
});
