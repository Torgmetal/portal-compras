// A gravação da SEPARAÇÃO confere o material, como a da liberação já fazia. Achado de 25/09/2026: o
// POST de /api/pcp/separacao só conferia se o R existia — dava para gravar o R de uma chapa num perfil
// W, e o certificado do Data Book apontaria para um aço que a peça não é (Vitor, 25/08: "vamos criar
// uma maneira de burlarmos e informar um material que não era destinado a essa obra").
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u", name: "Gabriel" })) }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn(async () => null) }));
import { POST } from "@/app/api/pcp/separacao/route";

const CHAPA_95 = "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 9,50MM";
const CMR = [
  { importRef: "261547", nome: CHAPA_95, ativo: true, opNumero: "118" },
  { importRef: "261401", nome: "PORCA SEXTAVADA M16", ativo: false, opNumero: "118" },
  { importRef: "261401", nome: CHAPA_95, ativo: true, opNumero: "118" },
  { importRef: "260999", nome: CHAPA_95, ativo: false, opNumero: "118" },
  { importRef: "261321", nome: "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. HP310 X 79,0KG", ativo: true, opNumero: "094" },
];
const post = (trocas) => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ opId: "op118", trocas }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op118", numero: "118" });
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) =>
    CMR.filter((l) => where.importRef.in.includes(l.importRef) && (where.ativo === undefined || l.ativo === where.ativo)));
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
  mockPrisma.trocaRastreabilidade.upsert.mockImplementation(async ({ create }) => ({ ...create, estoqueConferido: false }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("recusa o R de outro material, dizendo qual é o R e qual o perfil — e não grava nada", async () => {
  const r = await post([{ perfil: "W150X18", rUsado: "261547" }]);
  expect(r.status).toBe(400);
  const { error } = await r.json();
  expect(error).toMatch(/261547/);
  expect(error).toMatch(/W150X18/);
  expect(mockPrisma.trocaRastreabilidade.upsert).not.toHaveBeenCalled();
});

it("grava o R do material certo", async () => {
  const r = await post([{ perfil: "CH10.00X120", rUsado: "261547", escopo: "SEM_R" }]);
  expect(r.status).toBe(200);
  expect(mockPrisma.trocaRastreabilidade.upsert).toHaveBeenCalledTimes(1);
});

it("o duplicado desativado não decide — vale o recebimento ativo do mesmo R", async () => {
  expect((await post([{ perfil: "CH9.50X118", rUsado: "261401" }])).status).toBe(200);
});

it("R que só existe desativado é recusado", async () => {
  const r = await post([{ perfil: "CH9.50X118", rUsado: "260999" }]);
  expect(r.status).toBe(400);
  expect(mockPrisma.trocaRastreabilidade.upsert).not.toHaveBeenCalled();
});

// ⚠ "Encaminhar ao PCP" reenvia TODAS as linhas com R, inclusive trocas antigas. Oito delas, decididas
// pelo Vitor, a regra automática não reconhece (xadrez, barra quadrada, W310 × HP310…). A conferência
// vale para o R NOVO ou TROCADO; reenviar o que já está registrado não pode travar o encaminhamento.
it("troca já registrada com o mesmo R passa, mesmo que a regra não a reconheça", async () => {
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([{ perfil: "W310X79", rUsado: "261321", estoqueConferido: false }]);
  expect((await post([{ perfil: "W310X79", rUsado: "261321" }])).status).toBe(200);
});

it("mas TROCAR para um R de outro material continua recusado", async () => {
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([{ perfil: "W310X79", rUsado: "261321", estoqueConferido: false }]);
  expect((await post([{ perfil: "W310X79", rUsado: "261547" }])).status).toBe(400);
});
