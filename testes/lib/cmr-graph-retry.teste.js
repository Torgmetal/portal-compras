// Um 504 do Graph derrubava a reconciliação do CMR inteira (17/09/2026, 60h parada).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ getAccessToken: async () => "tok" }));

const resp = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body });

describe("leitura do CMR com retry", () => {
  beforeEach(() => { vi.useFakeTimers(); process.env.SHAREPOINT_DRIVE_ID = "drive1"; });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

  /** roda a leitura adiantando os timers do backoff */
  async function correr(fetchMock) {
    vi.stubGlobal("fetch", fetchMock);
    const { lerLinhasCmr } = await import("@/lib/cmr-sharepoint");
    const p = lerLinhasCmr(2026);
    // marca como tratada já: enquanto os timers do backoff correm, uma rejeição sem handler
    // apareceria como "unhandled rejection" e sujaria a saída do vitest
    p.catch(() => {});
    await vi.runAllTimersAsync();
    return p;
  }

  it("sobrevive a um 504 no usedRange e devolve as linhas", async () => {
    const chamadas = [];
    const fetchMock = vi.fn(async (url) => {
      chamadas.push(String(url));
      const u = String(url);
      if (u.includes("/root/search")) return resp(200, { value: [{ id: "it1", name: "CMR TORG-2026.xlsx" }] });
      if (u.includes("/items/it1?")) return resp(200, { id: "it1", name: "CMR TORG-2026.xlsx" });
      if (u.includes("/worksheets?")) return resp(200, { value: [{ name: "2026" }] });
      if (u.includes("usedRange")) {
        // primeira tentativa cai com 504, a segunda vai
        return chamadas.filter((c) => c.includes("usedRange")).length === 1 ? resp(504) : resp(200, { address: "A1:N6" });
      }
      if (u.includes("range(address=")) return resp(200, { values: [["R", "260001", "PERFIL W", "", "", "", "", "", "", "", "", "", 10, ""]] });
      return resp(404);
    });
    const linhas = await correr(fetchMock);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ indiceR: "260001", descricao: "PERFIL W" });
    expect(chamadas.filter((c) => c.includes("usedRange"))).toHaveLength(2);
  });

  it("erro que não é transitório não é retentado", async () => {
    const chamadas = [];
    const fetchMock = vi.fn(async (url) => {
      chamadas.push(String(url));
      const u = String(url);
      if (u.includes("/root/search")) return resp(200, { value: [{ id: "it1", name: "CMR TORG-2026.xlsx" }] });
      if (u.includes("/items/it1?")) return resp(200, { id: "it1" });
      if (u.includes("/worksheets?")) return resp(200, { value: [{ name: "2026" }] });
      if (u.includes("usedRange")) return resp(403);
      return resp(404);
    });
    await expect(correr(fetchMock)).rejects.toThrow(/usedRange HTTP 403/);
    expect(chamadas.filter((c) => c.includes("usedRange"))).toHaveLength(1);
  });

  it("desiste depois das tentativas e propaga o 504", async () => {
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/root/search")) return resp(200, { value: [{ id: "it1", name: "CMR TORG-2026.xlsx" }] });
      if (u.includes("/items/it1?")) return resp(200, { id: "it1" });
      if (u.includes("/worksheets?")) return resp(200, { value: [{ name: "2026" }] });
      if (u.includes("usedRange")) return resp(504);
      return resp(404);
    });
    await expect(correr(fetchMock)).rejects.toThrow(/usedRange HTTP 504/);
  });
});
