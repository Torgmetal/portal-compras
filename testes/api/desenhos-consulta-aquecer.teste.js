// Corte e montagem (Matheus, 15/10/2026): "muito mais rápido". A tela aquece o índice da pasta ao
// abrir a obra, e o modal de CONSULTA aceita o índice vencido. Quem imprime continua pedindo fresco.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u" }) }));
vi.mock("@/lib/sharepoint", () => ({ acharPastaOp: vi.fn(async () => "/OP-105"), getAccessToken: vi.fn(), uploadFileToFolder: vi.fn() }));
vi.mock("@/lib/desenhos-fabricacao", () => ({
  arquivosDaFabricacao: vi.fn(async () => [{ id: "novo", name: "105A99.pdf" }]),
  indiceDaFabricacao: vi.fn(async () => ({ arquivos: [{ id: "a", name: "105A29.pdf" }], vencido: true })),
  desenhosDaMarca: (arqs, marca) => arqs.filter((a) => a.name.startsWith(marca)).map((a) => ({ itemId: a.id, nome: a.name })),
}));
import { arquivosDaFabricacao, indiceDaFabricacao } from "@/lib/desenhos-fabricacao";
import { GET } from "@/app/api/producao/desenhos/route";

const get = (qs) => GET(new Request(`http://localhost/api/producao/desenhos?${qs}`));
beforeEach(() => { vi.clearAllMocks(); mockPrisma.grdLiberacao.findMany.mockResolvedValue([]); });

it("aquecer: varre (ou reaproveita) a pasta e espera terminar antes de responder", async () => {
  const r = await get("opNumero=105&aquecer=1");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, pdfs: 1 });
  expect(arquivosDaFabricacao).toHaveBeenCalledWith("/OP-105");
});

it("consulta aceita o índice vencido quando a marca está nele — sem varrer", async () => {
  const j = await (await get("opNumero=105&marca=105A29&consulta=1")).json();
  expect(indiceDaFabricacao).toHaveBeenCalledWith("/OP-105", { aceitarVencido: true });
  expect(j.arquivos).toEqual([{ itemId: "a", nome: "105A29.pdf" }]);
  expect(arquivosDaFabricacao).not.toHaveBeenCalled();
});

it("⚠ consulta com índice vencido SEM a marca: varre de novo (desenho que acabou de subir)", async () => {
  const j = await (await get("opNumero=105&marca=105A99&consulta=1")).json();
  expect(arquivosDaFabricacao).toHaveBeenCalledWith("/OP-105");
  expect(j.arquivos).toEqual([{ itemId: "novo", nome: "105A99.pdf" }]);
});

it("⚠ sem `consulta` (o PCP, que imprime): não aceita índice vencido", async () => {
  indiceDaFabricacao.mockResolvedValueOnce({ arquivos: [{ id: "a", name: "105A29.pdf" }], vencido: false });
  await get("opNumero=105&marca=105A29");
  expect(indiceDaFabricacao).toHaveBeenCalledWith("/OP-105", { aceitarVencido: false });
});
