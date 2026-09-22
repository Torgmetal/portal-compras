import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u" }) }));
import { GET } from "@/app/api/comercial/op/[id]/lista-expedicao/marcas/route";

// MARCA PELA METADE NÃO É MARCA EXPEDIDA.
//
// Larissa (PCP, 22/09/2026): "eram 2 peças de cada marca, e uma peça de cada foi enviada no
// romaneio 24, o portal entende que as peças já foram expedidas e não aparece para que eu possa
// selecionar". O romaneio da pasta virava um booleano; agora traz a quantidade de cada carga.

const marcas = () => [
  // o caso da OP-067: 2 peças, 1 saiu no romaneio 24
  { marca: "T67F62", qte: 2, pesoTotal: 37.1, romaneio: "24", expedidoRomaneio: true, expedidoPorRomaneio: { 24: 1 }, expedidoQtd: 1 },
  // o romaneio 27 saiu PELO PORTAL e também está salvo como FORM 22 na pasta
  { marca: "T67F70", qte: 3, pesoTotal: 60, romaneio: "27", expedidoRomaneio: true, expedidoPorRomaneio: { 27: 3 }, expedidoQtd: 3 },
  // lista antiga, importada antes desta versão: só o booleano
  { marca: "T67F90", qte: 2, pesoTotal: 20, romaneio: "12", expedidoRomaneio: true },
  { marca: "T67F99", qte: 1, pesoTotal: 10 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "067", obra: "ENC 326", cliente: "DANPOWER", refCliente: null });
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ frente: "T67-LE", arquivo: "T67-LE-R00.xlsx", revisao: "0", pesoContratado: 1, pesoExpedido: 0, marcasJson: marcas() }]);
  mockPrisma.romaneioPrevio.findMany.mockResolvedValue([
    { numero: 27, emitidoEm: new Date("2026-09-10"), itens: [{ marca: "T67F70", qte: 3 }] },
  ]);
  mockPrisma.baixaExpedicao.findMany.mockResolvedValue([]);
});

const ler = async () => {
  const r = await GET(new Request("http://localhost"), { params: { id: "op" } });
  expect(r.status).toBe(200);
  const j = await r.json();
  return Object.fromEntries(j.frentes[0].marcas.map((m) => [m.marca, m]));
};

it("1 de 2 peças embarcadas = parcial, com 1 pendente para o próximo romaneio", async () => {
  const m = (await ler())["T67F62"];
  expect(m.expedidoQtd).toBe(1);
  expect(m.expedido).toBe(false);
  expect(m.romaneio).toBe("24");
});

it("o romaneio emitido pelo portal e o arquivo dele na pasta contam UMA vez", async () => {
  const m = (await ler())["T67F70"];
  expect(m.expedidoQtd).toBe(3); // não 6
  expect(m.expedido).toBe(true);
});

it("lista importada antes desta versão continua como estava — só o booleano", async () => {
  const m = (await ler())["T67F90"];
  expect(m.expedidoQtd).toBe(0);
  expect(m.expedido).toBe(true);
});

it("marca que nunca saiu continua pendente", async () => {
  const m = (await ler())["T67F99"];
  expect(m.expedidoQtd).toBe(0);
  expect(m.expedido).toBe(null);
});

it("a baixa manual soma ao que os romaneios já levaram", async () => {
  mockPrisma.baixaExpedicao.findMany.mockResolvedValue([{ id: "b1", marca: "T67F62", qtd: 1, motivo: "SUCATA", observacao: null }]);
  const m = (await ler())["T67F62"];
  expect(m.expedidoQtd).toBe(2);
  expect(m.expedido).toBe(true);
});
