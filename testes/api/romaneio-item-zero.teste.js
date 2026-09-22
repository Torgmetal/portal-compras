import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Larissa" }) }));
const gerar = vi.fn();
vi.mock("@/lib/romaneio-form22", () => ({ gerarRomaneioForm22: (...a) => gerar(...a) }));
vi.mock("@/lib/sharepoint-lista", () => ({ salvarRomaneioNoServidor: vi.fn().mockResolvedValue({ nome: "x.xlsx", caminho: "c", webUrl: "u" }) }));
import { POST } from "@/app/api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio/route";

// A PEÇA QUE NÃO CHEGAVA NO ROMANEIO.
//
// Vitor (22/09/2026): "as peças da OP-67 não está puxando para o romaneio". As marcas que o portal
// dava por totalmente expedidas entraram no romaneio prévio com `qte: 0` — e na emissão o item de
// quantidade zero era descartado em SILÊNCIO (`filter(it => it.qtd > 0)`), sumindo do FORM 22 e do
// próprio prévio, que é reescrito com o que foi emitido. E, quando alguém corrigia a quantidade na
// tela, o peso vinha ZERO: ele era derivado do item do prévio (0 peças, 0 kg), não da marca.

const LISTA = [{ frente: "T67-LE", marcasJson: [
  { marca: "T67F62", descricao: "G.C EL. +5850", qte: 2, pesoTotal: 37.1 },
  { marca: "T67F13", descricao: "G.C EL. +3500", qte: 3, pesoTotal: 30 },
] }];
const PREVIO = {
  id: "p28", numero: 28, revisao: 0, emitidoEm: null, historico: [], dataPrevista: null,
  itens: [{ marca: "T67F62", descricao: "G.C EL. +5850", frente: "T67-LE", qte: 0, pesoTotal: 0 },
          { marca: "T67F13", descricao: "G.C EL. +3500", frente: "T67-LE", qte: 3, pesoTotal: 30 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  gerar.mockResolvedValue(Buffer.from("xlsx"));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "067", cliente: "DANPOWER" });
  mockPrisma.loteExpedicao.findFirst.mockResolvedValue({ id: "l28", opId: "op" });
  mockPrisma.romaneioPrevio.findFirst.mockResolvedValue(PREVIO);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue(LISTA);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.romaneioPrevio.update.mockResolvedValue({});
  mockPrisma.loteExpedicao.update.mockResolvedValue({});
});

const emitir = (itensSel, previa = true) =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ itensSel, previa }) }), { params: { id: "op", loteId: "l28" } });

it("a peça que estava com 0 no prévio sai com o PESO DA MARCA quando a quantidade é corrigida", async () => {
  const r = await emitir([{ marca: "T67F62", qtd: 1 }]);
  expect(r.status).toBe(200);
  const itens = gerar.mock.calls[0][0].itens;
  expect(itens).toHaveLength(1);
  // 37,1 kg para 2 peças → 18,55 por peça. Antes: 0.
  expect(itens[0].pesoKg).toBeCloseTo(18.55, 2);
  expect(itens[0].qtd).toBe(1);
});

it("marca sem quantidade não some calada — o romaneio sai sem ela e a tela recebe a lista", async () => {
  const r = await emitir([{ marca: "T67F62", qtd: 0 }, { marca: "T67F13", qtd: 3 }]);
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.ignoradas).toEqual(["T67F62"]);
  expect(gerar.mock.calls[0][0].itens.map((i) => i.marca)).toEqual(["T67F13"]);
});

it("tudo com quantidade zero é recusado, dizendo quais", async () => {
  const r = await emitir([{ marca: "T67F62", qtd: 0 }]);
  expect(r.status).toBe(400);
  expect((await r.json()).error).toContain("T67F62");
  expect(gerar).not.toHaveBeenCalled();
});

it("o peso da marca que já vinha certa no prévio continua o mesmo", async () => {
  await emitir([{ marca: "T67F13", qtd: 3 }]);
  expect(gerar.mock.calls[0][0].itens[0].pesoKg).toBeCloseTo(30, 2);
});
