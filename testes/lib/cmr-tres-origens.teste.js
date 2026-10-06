// O CMR é escrito por TRÊS caminhos: o import da planilha, a reconciliação com a planilha do
// SharePoint e a tela de lançamento do portal (`registro_manual`, `lib/cmr.js`). Achado na OP-120
// (06/10/2026): o R lançado pela tela sumia da janela "Selecionar R", da ficha do R no data book e do
// casamento do certificado escaneado — e os botões de importar a planilha criavam outra linha para o
// mesmo R (o R 261392 ganhou duas cópias, que alguém teve de desativar à mão). Vitor: "pode corrigir".
//
// ⚠ `registro_manual` também é gravado por calibração, documentos de inspetores, funcionários etc.:
// o filtro do CMR só vale JUNTO da categoria MATERIAL.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({ resolveSharedFolder: vi.fn(), listChildrenByPath: vi.fn() }));
vi.mock("@/lib/rastreabilidade-certificados", () => ({
  indiceCertificados: async () => ({
    indice: new Map([["261773", [{ id: "pdf-1", nome: "R 261773.pdf", url: "https://sp/R261773.pdf", modificadoEm: "2026-10-06" }]]]),
    arquivos: [{ nome: "R 261773.pdf" }],
    pastas: ["Certificados 2026"],
  }),
}));
import { DO_CMR, ORIGENS_CMR } from "@/lib/cmr-origens";
import { fichasPorR } from "@/lib/databook-ficha-r";
import { casarCertificados } from "@/lib/match-certificados";

const LINHAS = [
  { importRef: "261773", nome: "PERFIL DOBRADO UDC 115x60x4,75", origem: "registro_manual", categoria: "MATERIAL", ativo: true, opNumero: "120", numeroCorrida: "C-1", numeroDocumento: "CERT-1" },
  { importRef: "261500", nome: "CHAPA ACO 9,50", origem: "importacao_planilha", categoria: "MATERIAL", ativo: true, opNumero: "113" },
  { importRef: "261773", nome: "Paquímetro 300 mm", origem: "registro_manual", categoria: "EQUIPAMENTOS", ativo: true, opNumero: null },
];
const filtra = (where) => LINHAS.filter((l) =>
  (where.ativo === undefined || l.ativo === where.ativo)
  && (!where.categoria || l.categoria === where.categoria)
  && (!where.origem?.in || where.origem.in.includes(l.origem))
  && (!where.importRef?.in || where.importRef.in.includes(l.importRef)));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) => filtra(where));
  mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
});

describe("o filtro do CMR", () => {
  it("aceita as três origens, sempre com a categoria MATERIAL", () => {
    expect(ORIGENS_CMR).toEqual(expect.arrayContaining(["importacao_planilha", "planilha_sharepoint", "registro_manual"]));
    expect(DO_CMR.categoria).toBe("MATERIAL");
    expect(filtra(DO_CMR).map((l) => l.nome)).toEqual(["PERFIL DOBRADO UDC 115x60x4,75", "CHAPA ACO 9,50"]);
  });
});

describe("ficha do R no data book", () => {
  it("traz a ficha do R lançado pela tela do CMR — e não o equipamento com o mesmo número", async () => {
    const mapa = await fichasPorR([{ nome: "R 261773" }], "120");
    expect(mapa.get("261773")?.nome).toBe("PERFIL DOBRADO UDC 115x60x4,75");
    expect(mapa.get("261773")?.numeroDocumento).toBe("CERT-1");
  });
});

describe("certificado escaneado", () => {
  it("o UPDATE que vincula o PDF aceita o lançado pelo portal e exige MATERIAL", async () => {
    await casarCertificados();
    const [sql, , , , , origens] = mockPrisma.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/"categoria"\s*=\s*'MATERIAL'/);
    expect(origens).toContain("registro_manual");
  });
});
