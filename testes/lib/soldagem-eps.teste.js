import { beforeEach, expect, it, vi } from "vitest";

// A lista de EPS vem dos NOMES dos arquivos na pasta do SGQ — e as EPS 03, 04 e 05 não dizem o
// processo no nome. Sem ele, o soldador SMAW (Adailson, Reinnan) ficava sem EPS permitida: no
// EVS-102-001 a junta do Adailson foi gravada sem EPS (23/09/2026).

vi.mock("@/lib/sharepoint", () => ({
  listChildrenByPath: vi.fn(async () => [
    "EPS Resumida.pdf", "EPS-RQPS 01 GMAW.pdf", "EPS-RQPS 02 FCAW.pdf", "EPS-RQPS 03.pdf", "EPS-RQPS 04.pdf", "EPS-RQPS 05.pdf",
  ].map((name) => ({ name, file: {} }))),
  downloadFileByPath: vi.fn(),
}));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn(async () => "drive") }));

let listarEPS, epsDoProcesso;
beforeEach(async () => { ({ listarEPS, epsDoProcesso } = await import("@/lib/soldagem")); });

it("a lista da pasta sai completa: processo, número do documento, arame e RQPS", async () => {
  const lista = await listarEPS(true);
  expect(lista.map((e) => [e.codigo, e.processo, e.numero, e.metalAdicao, e.rqs])).toEqual([
    ["EPS-RQPS 01", "GMAW", "001/2025", "ER70S-6", "RQPS 001/2025"],
    ["EPS-RQPS 02", "FCAW", "002/2025", "E71T-1C", "RQPS 002/2025"],
    ["EPS-RQPS 03", "GMAW", "003/2025", "ER70S-6", "RQPS 003/2025"],
    ["EPS-RQPS 04", "SMAW", "004/2025", "E7018", "RQPS 004/2025"],
    ["EPS-RQPS 05", "FCAW", "005/2025", "E71T-1C", "RQPS 005/2025"],
  ]);
});

it("o soldador SMAW ganha a EPS 004; GMAW e FCAW seguem com a 01 e a 02", async () => {
  const lista = await listarEPS(true);
  expect(epsDoProcesso(lista, "SMAW")?.codigo).toBe("EPS-RQPS 04");
  expect(epsDoProcesso(lista, "GMAW")?.codigo).toBe("EPS-RQPS 01");
  expect(epsDoProcesso(lista, "FCAW")?.codigo).toBe("EPS-RQPS 02");
});
