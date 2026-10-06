// A janela "Selecionar R" oferece também o recebimento LANÇADO PELA TELA DO CMR no portal. Achado na
// OP-120 (06/10/2026), pelo Gabriel (Engenharia): o UDC 115x60x4,75 (R 261773) e o 128x60x4,75
// (R 261774) chegaram e foram lançados pelo Eduardo na tela de lançamento — origem `registro_manual` —,
// e a janela listava "0 de 77 recebimentos compatíveis" na busca pelo 261773. Ela só aceitava as
// origens da planilha (`importacao_planilha`, `planilha_sharepoint`). A gravação do R já aceitava.
import { expect, it, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
import { buscarFardosCompativeis } from "@/lib/fardos-compativeis";

const UDC = "PERFIL DOBRADO UDC 115x60x4,75";
const LINHAS = [
  { id: "planilha", importRef: "261500", nome: UDC, ativo: true, origem: "importacao_planilha", categoria: "MATERIAL", opNumero: "113", pesoKg: 800, dataRecebimento: new Date("2026-09-01") },
  { id: "lancado", importRef: "261773", nome: UDC, ativo: true, origem: "registro_manual", categoria: "MATERIAL", opNumero: "120", pesoKg: 2396, dataRecebimento: new Date("2026-10-06") },
  { id: "estranho", importRef: "261999", nome: UDC, ativo: true, origem: "omie_sync", categoria: "MATERIAL", opNumero: "120", pesoKg: 10, dataRecebimento: new Date("2026-10-06") },
];

beforeEach(() => {
  vi.resetAllMocks();
  // o banco de verdade: filtra origem, ativo e categoria quando a consulta pede
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where, distinct }) => {
    const rows = LINHAS.filter((l) =>
      (where.ativo === undefined || l.ativo === where.ativo)
      && (!where.categoria || l.categoria === where.categoria)
      && (!where.origem?.in || where.origem.in.includes(l.origem)));
    if (distinct) return [...new Set(rows.map((r) => r.nome))].map((nome) => ({ nome }));
    return rows.filter((r) => !where.nome?.in || where.nome.in.includes(r.nome));
  });
});

it("o R lançado pela tela do CMR aparece entre os compatíveis (OP-120, R 261773)", async () => {
  const rs = (await buscarFardosCompativeis("U115X60X4.75")).map((f) => f.r);
  expect(rs).toContain("261773");
  expect(rs).toContain("261500");
});

it("origem que não é do CMR continua de fora", async () => {
  const rs = (await buscarFardosCompativeis("U115X60X4.75")).map((f) => f.r);
  expect(rs).not.toContain("261999");
});
