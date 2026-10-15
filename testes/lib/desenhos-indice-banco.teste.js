// O ÍNDICE DA PASTA DE FABRICAÇÃO GUARDADO NO BANCO.
//
// Matheus (15/10/2026): o desenho na Corte e montagem "está demorando muito para carregar (…) ajuste
// para ficar muito mais rápido". A varredura da pasta custa ~13 s na OP-105 e o cache só morava na
// memória de cada lambda. Agora o índice também fica no banco (DesenhoIndice), valendo para todas.
// Desenho aprovado pelo Codex (consulta database, 15/10/2026): TTL contado da varredura, não da
// leitura; só varredura completa é gravada; falha de banco nunca derruba a resposta.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MIN = 60 * 1000;
const ARQ = [{ id: "1", name: "T1.pdf", size: 0, pasta: "A1", relativo: "A1" }];
let banco, varrer;

async function carregar() {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: { desenhoIndice: banco } }));
  vi.doMock("@/lib/sharepoint-arvore", () => ({ varrerPasta: varrer }));
  return import("@/lib/desenhos-fabricacao");
}

beforeEach(() => {
  banco = { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) };
  varrer = vi.fn(async () => ({ arquivos: ARQ, pastas: 1 }));
});
afterEach(() => { vi.doUnmock("@/lib/prisma"); vi.doUnmock("@/lib/sharepoint-arvore"); vi.resetModules(); });

describe("arquivosDaFabricacao — índice no banco", () => {
  it("índice fresco no banco: não varre o SharePoint", async () => {
    const agora = Date.now();
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: ARQ, em: new Date(agora - 2 * MIN) });
    const mod = await carregar();
    expect(await mod.arquivosDaFabricacao("/OP-1", { agora })).toEqual(ARQ);
    expect(varrer).not.toHaveBeenCalled();
  });

  it("⚠ a validade conta da VARREDURA: o índice de 4 min vale só mais 1 min na memória", async () => {
    const agora = Date.now();
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: ARQ, em: new Date(agora - 4 * MIN) });
    const mod = await carregar();
    await mod.arquivosDaFabricacao("/OP-1", { agora });
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: ARQ, em: new Date(agora - 4 * MIN) });
    await mod.arquivosDaFabricacao("/OP-1", { agora: agora + 2 * MIN });
    expect(banco.findUnique).toHaveBeenCalledTimes(2); // a memória já tinha vencido
    expect(varrer).toHaveBeenCalledTimes(1);            // e o banco, também vencido, levou a varrer
  });

  it("índice vencido: varre e grava a varredura nova", async () => {
    const agora = Date.now();
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: [], em: new Date(agora - 30 * MIN) });
    const mod = await carregar();
    expect(await mod.arquivosDaFabricacao("/OP-1", { agora })).toEqual(ARQ);
    expect(banco.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ arquivos: ARQ }), update: expect.objectContaining({ arquivos: ARQ }),
    }));
  });

  it("⚠⚠ índice vencido nunca serve — nem para só ver: varre (revisão pode ter ido para OBSOLETOS)", async () => {
    const agora = Date.now();
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: [{ id: "velho", name: "T1.pdf" }], em: new Date(agora - 6 * MIN) });
    const mod = await carregar();
    expect(await mod.arquivosDaFabricacao("/OP-1", { agora })).toEqual(ARQ);
    expect(varrer).toHaveBeenCalledTimes(1);
  });

  it("banco fora do ar (leitura e gravação): varre e responde mesmo assim", async () => {
    banco.findUnique.mockRejectedValue(new Error("P1001"));
    banco.upsert.mockRejectedValue(new Error("P1001"));
    const erro = vi.fn();
    vi.doMock("@/lib/log", () => ({ log: () => ({ erro, aviso: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));
    const mod = await carregar();
    expect(await mod.arquivosDaFabricacao("/OP-1")).toEqual(ARQ);
    expect(erro).toHaveBeenCalled(); // a falha de gravação é registrada, não engolida em silêncio
    vi.doUnmock("@/lib/log");
  });

  it("⚠ conteúdo do banco em formato estranho é ignorado e a pasta é varrida", async () => {
    banco.findUnique.mockResolvedValue({ pasta: "x", arquivos: { quebrado: true }, em: new Date() });
    const mod = await carregar();
    expect(await mod.arquivosDaFabricacao("/OP-1")).toEqual(ARQ);
    expect(varrer).toHaveBeenCalledTimes(1);
  });

  it("⚠ varredura que falhou não é gravada", async () => {
    varrer.mockRejectedValue(new Error("SharePoint caiu"));
    const mod = await carregar();
    await expect(mod.arquivosDaFabricacao("/OP-1")).rejects.toThrow("SharePoint caiu");
    expect(banco.upsert).not.toHaveBeenCalled();
  });
});
