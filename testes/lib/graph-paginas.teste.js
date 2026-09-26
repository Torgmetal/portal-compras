// A listagem do SharePoint (Microsoft Graph) vem em PÁGINAS — o resto está em `@odata.nextLink`.
// Achado em 26/09/2026 na OP-118 (Gabriel, Engenharia: "tem sim, no servidor … aí não conseguimos
// liberar desenho pro Alex"): a pasta "2.5.2.2 Croqui/B" tem 1.762 arquivos em duas páginas; a
// conferência lia só a primeira (996), e T118B-P382, P383 e P470 — com PDF na pasta — apareciam
// como "sem desenho".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { todasAsPaginas } from "@/lib/graph-paginas";

const resposta = (corpo, ok = true, status = 200) => ({ ok, status, json: async () => corpo });
afterEach(() => vi.unstubAllGlobals());

describe("todas as páginas de uma listagem do Graph", () => {
  let chamadas;
  beforeEach(() => { chamadas = []; });

  it("segue o @odata.nextLink até o fim", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      chamadas.push({ url, auth: init?.headers?.Authorization });
      if (url === "https://g/p1") return resposta({ value: [{ name: "T118B-P295 - CROQUI.pdf" }], "@odata.nextLink": "https://g/p2" });
      if (url === "https://g/p2") return resposta({ value: [{ name: "T118B-P382 - CROQUI.pdf" }], "@odata.nextLink": "https://g/p3" });
      return resposta({ value: [{ name: "T118B-P470 - CROQUI.pdf" }] });
    }));
    const r = await todasAsPaginas("https://g/p1", "tok");
    expect(r.ok).toBe(true);
    expect(r.itens.map((i) => i.name)).toEqual(["T118B-P295 - CROQUI.pdf", "T118B-P382 - CROQUI.pdf", "T118B-P470 - CROQUI.pdf"]);
    expect(chamadas.every((c) => c.auth === "Bearer tok")).toBe(true);
  });

  it("falha numa página: diz que falhou — pasta pela metade não pode passar por pasta inteira", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => (url === "https://g/p1"
      ? resposta({ value: [{ name: "a" }], "@odata.nextLink": "https://g/p2" })
      : resposta({ error: {} }, false, 503))));
    const r = await todasAsPaginas("https://g/p1", "tok");
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
});
