// A lista da janela "Selecionar R" não oferece recebimento DESATIVADO. Achado na OP-118 (25/09/2026):
// o R 261401 tem um duplicado desativado no CMR, e a lista o mostrava ao lado do certo.
import { expect, it, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
import { buscarFardosCompativeis } from "@/lib/fardos-compativeis";

const CHAPA = "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 9,50MM";
const LINHAS = [
  { id: "ativo", importRef: "261401", nome: CHAPA, ativo: true, opNumero: "118", pesoKg: 500, dataRecebimento: new Date("2026-09-19") },
  { id: "desativado", importRef: "261401", nome: CHAPA, ativo: false, opNumero: "118", pesoKg: 500, dataRecebimento: new Date("2026-09-19") },
];

beforeEach(() => {
  vi.resetAllMocks();
  // o banco de verdade: só filtra `ativo` quando a consulta pede
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where, distinct }) => {
    const rows = LINHAS.filter((l) => where.ativo === undefined || l.ativo === where.ativo);
    if (distinct) return [...new Set(rows.map((r) => r.nome))].map((nome) => ({ nome }));
    return rows.filter((r) => !where.nome?.in || where.nome.in.includes(r.nome));
  });
});

it("recebimento desativado não aparece entre os compatíveis", async () => {
  expect((await buscarFardosCompativeis("CH10.00X120")).map((f) => f.id)).toEqual(["ativo"]);
});
