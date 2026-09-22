import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Larissa" }) }));
const gerar = vi.fn();
vi.mock("@/lib/romaneio-form22", () => ({ gerarRomaneioForm22: (...a) => gerar(...a) }));
vi.mock("@/lib/sharepoint-lista", () => ({ salvarRomaneioNoServidor: vi.fn().mockResolvedValue({ nome: "x.xlsx", caminho: "c", webUrl: "u" }) }));
import { POST } from "@/app/api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio/route";

// ITEM AVULSO NA CARGA — o que vai no caminhão sem ser peça da obra.
//
// Vitor (22/09/2026): "acontece o caso de enviar tinta para retoque, algum item específico, e
// precisamos colocar na mão". E, sobre pôr isso na Lista de Expedição: "meu medo é de quebrar
// alguma lógica e ficar pior, acho que o caminho vai ser reimportar".
//
// ⚠⚠ ENTÃO O AVULSO NÃO ENTRA EM CONTA DE PESO NENHUMA. Ele sai no FORM 22 (com o peso na linha) e
// fica na carga; expedido, contratado, faltante e kg do mês continuam medindo só peça de obra.

const LISTA = [{ frente: "T67-LE", marcasJson: [{ marca: "T67F13", descricao: "G.C", qte: 3, pesoTotal: 30 }] }];
const PREVIO = { id: "p28", numero: 28, revisao: 0, emitidoEm: null, historico: [], dataPrevista: null,
  itens: [{ marca: "T67F13", descricao: "G.C", frente: "T67-LE", qte: 3, pesoTotal: 30 }] };

beforeEach(() => {
  vi.clearAllMocks();
  gerar.mockResolvedValue(Buffer.from("xlsx"));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "067", cliente: "DANPOWER" });
  mockPrisma.loteExpedicao.findFirst.mockResolvedValue({ id: "l28", opId: "op" });
  mockPrisma.romaneioPrevio.findFirst.mockResolvedValue(PREVIO);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue(LISTA);
  for (const m of ["auditLog", "romaneioPrevio", "loteExpedicao"]) mockPrisma[m].update?.mockResolvedValue?.({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.romaneioPrevio.update.mockResolvedValue({});
  mockPrisma.loteExpedicao.update.mockResolvedValue({});
});

const TINTA = { marca: "TINTA RETOQUE", qtd: 2, avulso: true, descricao: "Tinta epóxi cinza N6,5 — galão 3,6 L", unidade: "GL", pesoKg: 9 };
const emitir = (itensSel, previa = false) =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ itensSel, previa }) }), { params: { id: "op", loteId: "l28" } });

it("o item avulso sai no romaneio com a unidade e o peso dele", async () => {
  const r = await emitir([{ marca: "T67F13", qtd: 3 }, TINTA]);
  expect(r.status).toBe(200);
  const itens = gerar.mock.calls[0][0].itens;
  expect(itens).toHaveLength(2);
  const t = itens.find((i) => i.marca === "TINTA RETOQUE");
  expect(t).toMatchObject({ qtd: 2, unidade: "GL", pesoKg: 9, avulso: true });
  expect(t.descricao).toContain("epóxi");
});

it("não entra no peso da carga que a obra usa para medir expedido", async () => {
  await emitir([{ marca: "T67F13", qtd: 3 }, TINTA]);
  // 30 kg da peça; os 9 kg da tinta ficam no documento, não na conta da obra
  expect(mockPrisma.romaneioPrevio.update.mock.calls[0][0].data.pesoKg).toBeCloseTo(30, 2);
});

it("avulso não precisa estar na Lista de Expedição nem no prévio — é ele que se descreve", async () => {
  const r = await emitir([TINTA]);
  expect(r.status).toBe(200);
  expect(gerar.mock.calls[0][0].itens.map((i) => i.marca)).toEqual(["TINTA RETOQUE"]);
});

it("avulso sem descrição ou sem nome é recusado — linha de romaneio sem o que é não serve", async () => {
  expect((await emitir([{ marca: "", qtd: 1, avulso: true, descricao: "x" }])).status).toBe(400);
  expect((await emitir([{ marca: "TINTA", qtd: 1, avulso: true, descricao: "" }])).status).toBe(400);
  expect(gerar).not.toHaveBeenCalled();
});

it("fica gravado na carga com a marca de avulso, para não virar peça depois", async () => {
  await emitir([{ marca: "T67F13", qtd: 3 }, TINTA]);
  const gravados = mockPrisma.romaneioPrevio.update.mock.calls[0][0].data.itens;
  expect(gravados.find((i) => i.marca === "TINTA RETOQUE").avulso).toBe(true);
  expect(gravados.find((i) => i.marca === "T67F13").avulso).toBeUndefined();
});
