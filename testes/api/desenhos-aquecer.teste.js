// Corte e montagem (Matheus, 15/10/2026): "muito mais rápido". A tela aquece o índice da pasta ao
// abrir a obra. ⚠ O modal NÃO aceita índice vencido, nem para só ver (achado do Codex, 15/10/2026).
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u" }) }));
vi.mock("@/lib/sharepoint", () => ({ acharPastaOp: vi.fn(async () => "/OP-105"), getAccessToken: vi.fn(), uploadFileToFolder: vi.fn() }));
vi.mock("@/lib/desenhos-fabricacao", () => ({
  arquivosDaFabricacao: vi.fn(async () => [{ id: "novo", name: "105A99.pdf" }]),
  desenhosDaMarca: (arqs, marca) => arqs.filter((a) => a.name.startsWith(marca)).map((a) => ({ itemId: a.id, nome: a.name })),
}));
import { arquivosDaFabricacao } from "@/lib/desenhos-fabricacao";
import { GET } from "@/app/api/producao/desenhos/route";

const get = (qs) => GET(new Request(`http://localhost/api/producao/desenhos?${qs}`));
beforeEach(() => { vi.clearAllMocks(); mockPrisma.grdLiberacao.findMany.mockResolvedValue([]); });

it("aquecer: varre (ou reaproveita) a pasta e espera terminar antes de responder", async () => {
  const r = await get("opNumero=105&aquecer=1");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, pdfs: 1 });
  expect(arquivosDaFabricacao).toHaveBeenCalledWith("/OP-105");
});

it("o modal pega a marca do índice fresco", async () => {
  const j = await (await get("opNumero=105&marca=105A99")).json();
  expect(arquivosDaFabricacao).toHaveBeenCalledWith("/OP-105");
  expect(j.arquivos).toEqual([{ itemId: "novo", nome: "105A99.pdf" }]);
});
