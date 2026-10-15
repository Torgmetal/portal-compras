// Obras da TMSA emitem o FOR-081 (Excel + PDF) no lugar do FORM 22 e salvam os dois na 4.2 Romaneios (Vitor, 15/10/2026).
import { it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Larissa" }) }));
const form22 = vi.fn();
vi.mock("@/lib/romaneio-form22", () => ({ gerarRomaneioForm22: (...a) => form22(...a) }));
const salvar = vi.fn();
vi.mock("@/lib/sharepoint-lista", () => ({ salvarRomaneioNoServidor: (...a) => salvar(...a) }));
vi.mock("@/lib/romaneio-tmsa-dados", () => ({ dadosTmsa: vi.fn().mockResolvedValue({
  tags: new Map([["105A3", [{ unidade: 1, tag: "TC 4706" }, { unidade: 2, tag: "TC 4706" }]]]),
  ocPorTag: new Map([["TC4706", "231297-1"]]), tpr: "TPR00846", volumes: null }) }));
import { POST } from "@/app/api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio/route";

const PREVIO = { id: "p2", numero: 2, revisao: 0, emitidoEm: null, historico: [], dataPrevista: null,
  itens: [{ marca: "105A3", descricao: "COLUNA", qte: 2, pesoTotal: 920 }] };
beforeEach(() => {
  vi.clearAllMocks();
  salvar.mockImplementation(async ({ fileNome }) => ({ nome: fileNome, caminho: "c", webUrl: `https://sp/${fileNome}` }));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "105", cliente: "TMSA Tecnologia em movimentação" });
  mockPrisma.loteExpedicao.findFirst.mockResolvedValue({ id: "l2", opId: "op" });
  mockPrisma.romaneioPrevio.findFirst.mockResolvedValue(PREVIO);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.romaneioPrevio.update.mockResolvedValue({});
  mockPrisma.loteExpedicao.update.mockResolvedValue({});
});
const emitir = (extra = {}) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...extra }) }), { params: { id: "op", loteId: "l2" } });

it("emite o FOR-081: Excel e PDF salvos na pasta da OP, sem FORM 22", async () => {
  const j = await (await emitir()).json();
  expect(j.tmsa).toBe(true);
  expect(form22).not.toHaveBeenCalled();
  expect(salvar.mock.calls.map(([x]) => x.fileNome)).toEqual(["Romaneio R2 - OP-105 - TMSA.xlsx", "Romaneio R2 - OP-105 - TMSA.pdf"]);
  expect(j.arquivoPdf.length).toBeGreaterThan(100);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(j.arquivo, "base64"));
  const ws = wb.worksheets[0];
  expect(ws.getCell("A1").value).toBe("ROMANEIO Nº 2");
  expect(ws.getCell("N2").value).toBe("TPR00846 / OP-105");
  expect(["J9", "K9", "L9", "M9"].map((a) => ws.getCell(a).value)).toEqual(["TC 4706", 2, "231297-1", "COLUNA — 105A3"]);
});

it("prévia não salva nem emite", async () => {
  const j = await (await emitir({ previa: true })).json();
  expect(j).toMatchObject({ previa: true, tmsa: true });
  expect(salvar).not.toHaveBeenCalled();
  expect(mockPrisma.romaneioPrevio.update).not.toHaveBeenCalled();
});

it("obra que não é da TMSA continua no FORM 22", async () => {
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "067", cliente: "DANPOWER" });
  form22.mockResolvedValue(Buffer.from("xlsx"));
  const j = await (await emitir()).json();
  expect(form22).toHaveBeenCalled();
  expect(j.tmsa).toBeUndefined();
});
