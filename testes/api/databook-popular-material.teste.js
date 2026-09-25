// O botão "Puxar certificados" (§04/§05/§15) e o vínculo automático do cron escolhem os certificados
// pela MESMA função (lib/databook-certificados-novos.js). Este teste trava o que o botão faz, para que
// o automático nunca passe a trazer outra coisa: o aço da OP, o R declarado de outra obra, e — só no
// botão — a granalha vigente nos dias de jato.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u-geraldo", name: "Geraldo" })) }));
const consumo = vi.hoisted(() => ({ consumiveisDaOP: vi.fn(async () => []), abrasivosDaOP: vi.fn(async () => []) }));
vi.mock("@/lib/consumivel-solda", () => consumo);

import { POST } from "@/app/api/qualidade/data-books/secao/[secaoId]/popular-material/route";

const DOCS = {
  aco: { id: "d-aco", nome: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 12,50MM", importRef: "261646" },
  tinta: { id: "d-tinta", nome: "TINTA LACKTHANE N 2677 CINZA MUNSELL N6,5", importRef: "261353" },
  telha: { id: "d-telha", nome: "TELHA TRAPEZOIDAL 0,50MM", importRef: "261700" },
  declarado: { id: "d-decl", nome: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W150 X 18,0KG/M", importRef: "261019" },
  granalha: { id: "d-gran", nome: "GRANALHA DE AÇO G-40", importRef: "261009" },
};

function secao(numero) {
  mockPrisma.dataBookSecao.findUnique.mockResolvedValue({
    id: `s${numero}`, numero, dataBook: { status: "EM_MONTAGEM", emitidoEm: null, revisao: 0, opNumero: "102", opId: "op102" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) => {
    if (where?.origem) return []; // fichas do CMR
    if (where?.opNumero === "102") return [DOCS.aco, DOCS.tinta, DOCS.telha];
    const rs = where?.importRef?.in || [];
    return [DOCS.declarado, DOCS.granalha].filter((d) => rs.includes(d.importRef));
  });
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([{ rUsado: "261019", updatedAt: new Date("2026-09-25T12:00:00Z") }]);
  mockPrisma.dataBookSecaoDoc.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
  mockPrisma.dataBookSecao.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

const puxar = async (numero) => (await POST(new Request("http://x", { method: "POST" }), { params: { secaoId: `s${numero}` } })).json();
const vinculados = () => mockPrisma.dataBookSecaoDoc.createMany.mock.calls[0][0].data.map((d) => d.documentoId);

describe("Puxar certificados", () => {
  it("§04: o aço da OP e o R declarado de outra obra — sem tinta e sem telha", async () => {
    secao("04");
    const j = await puxar("04");
    expect(vinculados()).toEqual(["d-aco", "d-decl"]);
    expect(mockPrisma.dataBookSecaoDoc.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s04" }, data: { estado: "ANEXADO" } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: "u-geraldo", action: "POPULAR_SECAO_MATERIAL_DATABOOK", entityId: "s04" });
    expect(j).toEqual({ success: true, vinculados: 2, total: 2 });
  });

  it("§15: a tinta da OP e a granalha vigente nos dias de jato", async () => {
    secao("15");
    consumo.abrasivosDaOP.mockResolvedValue([{ rastreio: "261009" }]);
    await puxar("15");
    expect(vinculados()).toEqual(["d-tinta", "d-gran"]);
  });
});
