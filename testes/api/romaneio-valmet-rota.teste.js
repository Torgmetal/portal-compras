// Obras da Valmet emitem o Packing List dela (Excel + PDF) no lugar do FORM 22, com os dados da pasta da obra
// (Vitor, 16/10/2026). A pasta é simulada: nenhum teste toca SharePoint nem banco.
import { it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Larissa" }) }));
const form22 = vi.fn();
vi.mock("@/lib/romaneio-form22", () => ({ gerarRomaneioForm22: (...a) => form22(...a) }));
const salvar = vi.fn();
vi.mock("@/lib/sharepoint-lista", () => ({ salvarRomaneioNoServidor: (...a) => salvar(...a) }));
vi.mock("@/lib/packing-valmet-dados", () => ({ dadosValmet: vi.fn().mockResolvedValue({
  oc: { orderTxt: "351/401541", projeto: "J5A199" },
  instrucao: { comprador: { razao: "Valmet Celulose Papel e Energia Ltda.", cnpj: "43.443.043/0014-79" }, contato: "Marcos Bueno", telefone: "(42) 99126-6799" },
  equivalencia: new Map([["T94A1", { valmet: "MF01219515" }]]), revisaoEquivalencia: 1, volumes: null, avisos: [] }) }));
import { POST } from "@/app/api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio/route";

const PREVIO = { id: "p3", numero: 3, revisao: 0, emitidoEm: null, historico: [], dataPrevista: null,
  itens: [{ marca: "T94A1", descricao: "COLUNA", qte: 1, pesoTotal: 591.88 }] };
beforeEach(() => {
  vi.clearAllMocks();
  salvar.mockImplementation(async ({ fileNome }) => ({ nome: fileNome, caminho: "c", webUrl: `https://sp/${fileNome}` }));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op", numero: "094", cliente: "VALMET", obra: "BRACELL" });
  mockPrisma.loteExpedicao.findFirst.mockResolvedValue({ id: "l3", opId: "op" });
  mockPrisma.romaneioPrevio.findFirst.mockResolvedValue(PREVIO);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.romaneioPrevio.update.mockResolvedValue({});
  mockPrisma.loteExpedicao.update.mockResolvedValue({});
});
const emitir = (extra = {}) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ transportadora: "IGR", placa: "HRA9731", motorista: "LAZARO", contato: "19 99716-8811", ...extra }) }), { params: { id: "op", loteId: "l3" } });

it("emite o Packing List: Excel e PDF salvos na pasta da OP, sem FORM 22, com NF, OC, transporte e Valmet Code", async () => {
  const j = await (await emitir({ nf: "12345" })).json();
  expect(j.valmet).toBe(true);
  expect(form22).not.toHaveBeenCalled();
  expect(salvar.mock.calls.map(([x]) => x.fileNome)).toEqual(["Romaneio R3 - OP-094 - VALMET.xlsx", "Romaneio R3 - OP-094 - VALMET.pdf"]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(j.arquivo, "base64"));
  const ws = wb.worksheets[0];
  expect(["G1", "I1", "M1", "Q1", "B9", "B10", "B11"].map((a) => ws.getCell(a).value)).toEqual(["J5A199", "351/401541", "12345", 3, "IGR", "HRA9731", "LAZARO / 19 99716-8811"]);
  expect(["M13", "N13", "G13"].map((a) => ws.getCell(a).value)).toEqual(["MF01219515", "T94A1", "COLUNA"]);
});

it("prévia não salva nem emite", async () => {
  const j = await (await emitir({ previa: true })).json();
  expect(j).toMatchObject({ previa: true, valmet: true });
  expect(j.nomePdf).toMatch(/VALMET\.pdf$/);
  expect(salvar).not.toHaveBeenCalled();
});
