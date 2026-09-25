import { describe, it, expect, vi, afterEach } from "vitest";
import { escolherCmr, listarPlanilhas, localizarCmr, motivoDoGraph } from "@/lib/cmr-localizar";

// ⚠⚠ A busca do Graph (`root/search`) passou a dar HTTP 500 em 22–23/09/2026 e parou três crons
// (cmr-sincronizar, cmr-reconciliar, lqc-sharepoint). Listar pasta por caminho seguiu funcionando.

const json = (corpo, status = 200, headers = {}) => ({
  ok: status < 400, status, json: async () => corpo, headers: { get: (k) => headers[k] ?? null },
});
const arq = (name, data, extra = {}) => ({ id: name, name, file: {}, lastModifiedDateTime: data, ...extra });
const pasta = (name) => ({ id: name, name, folder: {} });

/** GET falso: rota por trecho da URL. */
const falso = (rotas) => vi.fn(async (url) => {
  for (const [trecho, resp] of rotas) if (url.includes(trecho)) return typeof resp === "function" ? resp(url) : resp;
  return json({ error: { code: "itemNotFound", message: "nada" } }, 404);
});
const RAIZ = encodeURI("/Almoxarifado/01. Rastreabilidade");

afterEach(() => { delete process.env.SHAREPOINT_CMR_FOLDER_PATH; });

describe("escolherCmr", () => {
  const n = (name, modificadoEm, caminho = "/Almoxarifado/01. Rastreabilidade") => ({ id: name, name, modificadoEm, caminho });

  it("a mais recente entre as do ano, ignorando o arquivo de trava do Excel", () => {
    const r = escolherCmr([
      n("CMR TORG-2026.xlsx", "2026-08-01"),
      n("CMR TORG-2026-Almoxarifado01.xlsx", "2026-09-20"),
      n("~$CMR TORG-2026-Almoxarifado01.xlsx", "2026-09-25"),
      n("CMR TORG-2025.xlsx", "2026-09-24"),
    ], 2026);
    expect(r.name).toBe("CMR TORG-2026-Almoxarifado01.xlsx");
  });

  it("a da rastreabilidade vence uma cópia mais nova fora dela", () => {
    const r = escolherCmr([n("CMR TORG-2026.xlsx", "2026-09-01"), n("CMR TORG-2026 (1).xlsx", "2026-09-25", "/Downloads")], 2026);
    expect(r.name).toBe("CMR TORG-2026.xlsx");
  });

  it("sem candidata, null", () => {
    expect(escolherCmr([n("outra.xlsx", "2026-09-01")], 2026)).toBeNull();
  });
});

describe("listarPlanilhas", () => {
  it("⚠⚠ segue a paginação de cada pasta", async () => {
    const get = falso([
      [`root:${RAIZ}:/children`, (url) => url.includes("pag2")
        ? json({ value: [arq("CMR TORG-2026.xlsx", "2026-09-20")] })
        : json({ value: [arq("a.pdf", "2026-01-01")], "@odata.nextLink": "https://graph/pag2" })],
      ["pag2", json({ value: [arq("CMR TORG-2026.xlsx", "2026-09-20")] })],
    ]);
    const r = await listarPlanilhas(get, "d", "/Almoxarifado/01. Rastreabilidade");
    expect(r.map((x) => x.name)).toEqual(["CMR TORG-2026.xlsx"]);
  });

  it("⚠⚠ uma subpasta que falha derruba a listagem — nunca devolve parcial", async () => {
    const get = falso([
      [`root:${RAIZ}/Sub:/children`, json({ error: { code: "generalException", message: "x" } }, 500)],
      [`root:${RAIZ}:/children`, json({ value: [pasta("Sub"), arq("CMR TORG-2025.xlsx", "2026-01-01")] })],
    ]);
    await expect(listarPlanilhas(get, "d", "/Almoxarifado/01. Rastreabilidade")).rejects.toThrow(/HTTP 500 · generalException/);
  });

  it("desce nas subpastas até a profundidade e guarda o caminho", async () => {
    const get = falso([
      [`root:${RAIZ}/CMR:/children`, json({ value: [arq("CMR TORG-2026.xlsx", "2026-09-20")] })],
      [`root:${RAIZ}:/children`, json({ value: [pasta("CMR")] })],
    ]);
    const [r] = await listarPlanilhas(get, "d", "/Almoxarifado/01. Rastreabilidade");
    expect(r).toEqual({ id: "CMR TORG-2026.xlsx", name: "CMR TORG-2026.xlsx", modificadoEm: "2026-09-20", caminho: "/Almoxarifado/01. Rastreabilidade/CMR" });
  });
});

describe("localizarCmr", () => {
  it("⚠⚠ acha pela PASTA sem tocar na busca (que está dando 500)", async () => {
    const get = falso([
      [`root:${RAIZ}:/children`, json({ value: [arq("CMR TORG-2026-Almoxarifado01.xlsx", "2026-09-20")] })],
      ["/search(", json({ error: { code: "generalException" } }, 500)],
    ]);
    const r = await localizarCmr({ ano: 2026, driveId: "d", get });
    expect(r).toMatchObject({ name: "CMR TORG-2026-Almoxarifado01.xlsx", origem: "pasta" });
    expect(get.mock.calls.some(([u]) => u.includes("/search("))).toBe(false);
  });

  it("pasta listada inteira sem candidata → cai na busca, com o formato normalizado", async () => {
    const get = falso([
      [`root:${RAIZ}:/children`, json({ value: [] })],
      ["/search(", json({ value: [{ id: "i1", name: "CMR TORG-2026.xlsx" }] })],
      ["/items/i1", json({ id: "i1", name: "CMR TORG-2026.xlsx", lastModifiedDateTime: "2026-09-20", parentReference: { path: "/drive/root:/Outra%20Pasta" } })],
    ]);
    const r = await localizarCmr({ ano: 2026, driveId: "d", get });
    expect(r).toMatchObject({ id: "i1", origem: "busca", modificadoEm: "2026-09-20", caminho: "/drive/root:/Outra Pasta" });
  });

  it("⚠⚠ subpasta em erro + busca com cópia antiga acessível → NENHUM arquivo selecionado", async () => {
    const get = falso([
      [`root:${RAIZ}/CMR:/children`, json({ error: { code: "generalException", message: "falhou" } }, 500, { "request-id": "abc-123" })],
      [`root:${RAIZ}:/children`, json({ value: [pasta("CMR")] })],
      ["/search(", json({ value: [{ id: "velha", name: "CMR TORG-2026.xlsx" }] })],
      ["/items/velha", json({ id: "velha", name: "CMR TORG-2026.xlsx", lastModifiedDateTime: "2026-01-01", parentReference: { path: "/x/Rastreabilidade" } })],
    ]);
    await expect(localizarCmr({ ano: 2026, driveId: "d", get })).rejects.toThrow(/HTTP 500 · generalException · falhou · request-id abc-123/);
    expect(get.mock.calls.some(([u]) => u.includes("/search("))).toBe(false);
  });

  it("⚠⚠ cópia antiga na raiz e a atual no 3º nível → a atual", async () => {
    const get = falso([
      [`root:${RAIZ}/A/B/C:/children`, json({ value: [arq("CMR TORG-2026-Almoxarifado01.xlsx", "2026-09-20", { id: "atual" })] })],
      [`root:${RAIZ}/A/B:/children`, json({ value: [pasta("C")] })],
      [`root:${RAIZ}/A:/children`, json({ value: [pasta("B")] })],
      [`root:${RAIZ}:/children`, json({ value: [arq("CMR TORG-2026.xlsx", "2026-03-01", { id: "velha" }), pasta("A")] })],
    ]);
    expect((await localizarCmr({ ano: 2026, driveId: "d", get })).id).toBe("atual");
  });

  it("⚠ teto de pastas estourado é erro, não escolha pelo que deu para ver", async () => {
    const get = falso([[`:/children`, json({ value: [pasta("x"), arq("CMR TORG-2026.xlsx", "2026-01-01")] })]]);
    await expect(listarPlanilhas(get, "d", "/r", 5)).rejects.toThrow(/mais de 5 pastas/);
  });

  it("⚠ na busca, metadado que falha é erro — a que faltou pode ser a atual", async () => {
    const get = falso([
      [`root:${RAIZ}:/children`, json({ value: [] })],
      ["/search(", json({ value: [{ id: "i1", name: "CMR TORG-2026.xlsx" }, { id: "i2", name: "CMR TORG-2026-B.xlsx" }] })],
      ["/items/i1", json({ id: "i1", name: "CMR TORG-2026.xlsx", lastModifiedDateTime: "2026-01-01" })],
      ["/items/i2", json({ error: { code: "accessDenied", message: "sem acesso" } }, 403)],
    ]);
    await expect(localizarCmr({ ano: 2026, driveId: "d", get })).rejects.toThrow(/item "CMR TORG-2026-B.xlsx": HTTP 403 · accessDenied/);
  });

  it("a busca em 500 (com a pasta listada inteira e vazia) diz o motivo do Graph", async () => {
    const get = falso([
      [`root:${RAIZ}:/children`, json({ value: [] })],
      ["/search(", json({ error: { code: "generalException", message: "An unexpected error occurred" } }, 500, { "request-id": "r-1" })],
    ]);
    await expect(localizarCmr({ ano: 2026, driveId: "d", get })).rejects.toThrow(/SharePoint busca HTTP 500 · generalException · An unexpected error occurred · request-id r-1/);
  });

  it("a pasta pode ser trocada por env", async () => {
    process.env.SHAREPOINT_CMR_FOLDER_PATH = "/Outra";
    const get = falso([["root:/Outra:/children", json({ value: [arq("CMR TORG-2026.xlsx", "2026-09-20")] })]]);
    expect((await localizarCmr({ ano: 2026, driveId: "d", get })).origem).toBe("pasta");
  });
});

describe("motivoDoGraph", () => {
  it("corpo não-JSON: fica o status", async () => {
    expect(await motivoDoGraph({ status: 502, json: async () => { throw new Error("html"); }, headers: { get: () => null } })).toBe("HTTP 502");
  });
});
