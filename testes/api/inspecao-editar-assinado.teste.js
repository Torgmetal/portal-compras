import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH } from "@/app/api/qualidade/inspecoes/[id]/route";

// Vitor (22/09/2026), sobre os EVS e LP da OP-102 assinados com campos em branco: "não precisa
// gerar revisão, pode apenas alterar as informações". Decisão dele, e é a operação real da casa:
// o relatório foi assinado internamente antes de estar completo, e subir revisão de um documento
// que nunca saiu da Torg só encheria o histórico.
//
// ⚠⚠ A EDIÇÃO DEPOIS DA ASSINATURA FICA REGISTRADA. Quem assinou validou um conteúdo; se ele muda,
// a auditoria tem de dizer que mudou, quando e por quem — é o que sobra de defesa numa auditoria
// ISO. A revisão continua existindo para quando o documento já saiu para o cliente.
const params = { params: Promise.resolve({ id: "r1" }) };
const req = (body) => new Request("http://localhost/api/qualidade/inspecoes/r1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rel = (extra = {}) => ({ id: "r1", codigo: "RLP-102-001", opNumero: "102", tipo: "LP", revisao: 0, linhas: [], resultados: {}, marcas: ["T102B45"], envioAssinaturaId: null, ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Alexandre Stival" });
  mocks.salvar.mockImplementation(async (r, dados) => ({ ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel());
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
});

describe("editar relatório já enviado para assinatura", () => {
  it("salva — sem exigir revisão", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel({ envioAssinaturaId: "env1" }));
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([{ nome: "Geraldo Tank", email: "qualidade@torg.com.br", assinadoEm: new Date("2026-09-21T13:20:00Z") }]);
    const r = await PATCH(req({ resultados: { tipoPenetrante: "II", revelador: "Metal-Chek" } }), params);
    expect(r.status).toBe(200);
    expect(mocks.salvar).toHaveBeenCalled();
  });

  it("a auditoria diz que foi editado depois de assinado, e por quem estava assinado", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel({ envioAssinaturaId: "env1" }));
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([
      { nome: "Geraldo Tank", email: "qualidade@torg.com.br", assinadoEm: new Date("2026-09-21T13:20:00Z") },
      { nome: "Alexandre Stival", email: "stival2112@gmail.com", assinadoEm: null },
    ]);
    await PATCH(req({ resultados: { revelador: "Metal-Chek" } }), params);
    const aud = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(aud.action).toBe("EDITAR_RELATORIO_INSPECAO");
    expect(aud.diff.editadoAposAssinatura).toBe(true);
    expect(aud.diff.assinaturasVigentes).toEqual(["Geraldo Tank"]);
  });

  it("relatório sem assinatura nenhuma não ganha a marca", async () => {
    await PATCH(req({ resultados: { revelador: "X" } }), params);
    const aud = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(aud.diff.editadoAposAssinatura).toBeUndefined();
  });
});
