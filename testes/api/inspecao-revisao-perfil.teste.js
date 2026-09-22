import { it, expect, vi, beforeEach, describe } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), abrir: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/relatorio-revisao", () => ({ abrirRevisaoRelatorio: mocks.abrir }));
import { POST } from "@/app/api/qualidade/inspecoes/[id]/revisao/route";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

// Vitor (22/09/2026), sobre os EVS e LP da OP-102 já enviados para assinatura: "preciso que libere
// para eu colocar as informações… e como já está aprovado não permite a Lais fazer essas
// alterações". Quem inspeciona é quem completa o relatório — e o caminho para mexer num documento
// já assinado é a REVISÃO, que congela a rodada anterior no histórico. Negá-la ao inspetor de campo
// é obrigar a Qualidade a fazer o trabalho dele, ou (pior) a editar por fora.
const req = (body = { motivo: "faltou preencher o penetrante e o revelador" }) =>
  new Request("http://localhost/api/qualidade/inspecoes/r1/revisao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.abrir.mockResolvedValue({ relatorio: { id: "r1", revisao: 1 }, snapshot: { revisao: 0, assinaturas: [{ assinadoEm: new Date() }] } });
});

describe("abrir revisão", () => {
  it("o inspetor de campo pode abrir — a rota pede os mesmos perfis do preenchimento", async () => {
    mocks.role.mockResolvedValue({ id: "u", name: "Inspetora de campo" });
    const r = await POST(req(), params);
    expect(r.status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith(PERFIS_CAMPO);
    expect(PERFIS_CAMPO).toContain("QUALIDADE_CAMPO");
  });

  it("quem não é da qualidade continua de fora", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await POST(req(), params)).status).toBe(403);
    expect(mocks.abrir).not.toHaveBeenCalled();
  });

  // ⚠ o motivo é o que explica a quem já assinou por que o documento mudou
  it("sem motivo não abre revisão", async () => {
    mocks.role.mockResolvedValue({ id: "u" });
    const r = await POST(req({ motivo: "x" }), params);
    expect(r.status).toBe(400);
    expect(mocks.abrir).not.toHaveBeenCalled();
  });
});
