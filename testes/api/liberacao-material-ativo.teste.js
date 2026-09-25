// Gravar o R escolhido confere o material contra o recebimento ATIVO. O R 261401 da OP-118 tem um
// duplicado desativado (a confusão de 22/09, quando o índice também era uma PORCA): sem o filtro, o
// `findFirst` podia pegar o desativado e recusar — ou aceitar — pelo material errado.
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u", name: "Gabriel" })) }));
vi.mock("@/lib/fardos-compativeis", () => ({ buscarFardosCompativeis: vi.fn() }));
vi.mock("@/lib/material-liberacao", () => ({ analisarMaterial: vi.fn(), pecasLiberaveis: vi.fn() }));
import { POST } from "@/app/api/pcp/liberacao-material/route";

const REGISTROS = [
  { id: "velho", importRef: "261401", nome: "PORCA SEXTAVADA M16", ativo: false, opNumero: "118" },
  { id: "certo", importRef: "261401", nome: "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 9,50MM", ativo: true, opNumero: "118" },
];
const post = () => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ opNumero: "118", perfil: "CH10.00X120", rUsado: "261401" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op118", numero: "118" });
  mockPrisma.documentoQualidade.findFirst.mockImplementation(async ({ where }) =>
    REGISTROS.find((r) => r.importRef === where.importRef && (where.ativo === undefined || r.ativo === where.ativo)) || null);
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
  mockPrisma.trocaRastreabilidade.upsert.mockResolvedValue({ id: "t", perfil: "CH10.00X120", rUsado: "261401" });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("confere o material pelo recebimento ATIVO — o duplicado desativado não decide", async () => {
  const r = await post();
  expect(r.status).toBe(200);
  expect(mockPrisma.trocaRastreabilidade.upsert).toHaveBeenCalled();
});
