import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ upsert: vi.fn(), audit: vi.fn(), current: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { portalCliente: { findUnique: m.current, upsert: m.upsert }, auditLog: { create: m.audit } } }));
vi.mock("@/lib/session", () => ({ requireRole: m.role }));
vi.mock("@/lib/sharepoint", () => ({ acharPastaOp: async () => "OP/089", getAccessToken: async () => "fake", listAllFilesRecursive: vi.fn() }));
vi.mock("@/lib/portal-eng-pastas", () => ({ raizesDoTipo: vi.fn(), conteudoDoTipo: vi.fn(), caminhosDasRaizes: vi.fn() }));
vi.mock("@/lib/portal-cliente", () => ({ AREA: { ENGENHARIA: {} }, AREAS_COM_SELETOR: ["ENGENHARIA"], TIPO_ENG: { MODELO_3D: {} }, TIPOS_ENGENHARIA: [], tipoDoDocEng: (d) => d.tipo }));
import { POST } from "../../app/api/portal/engenharia-docs/route";
const salvar = (comparacaoIfc) => POST(new Request("https://local/api/portal/engenharia-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opNumero: "089", area: "ENGENHARIA", tipo: "MODELO_3D", docs: [{ id: "a", nome: "atual.ifc", comparacaoIfc }] }) }));
beforeEach(() => { vi.clearAllMocks(); m.role.mockResolvedValue({ id: "interno" }); m.current.mockResolvedValue(null); m.upsert.mockResolvedValue({}); m.audit.mockResolvedValue({}); });
describe("cadastro de revisão IFC", () => {
  it("rejeita falta de anterior e mesmo arquivo sem gravar", async () => {
    expect((await salvar({ publicar: true, anterior: null })).status).toBe(400);
    expect((await salvar({ publicar: true, anterior: { id: "a" } })).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("não aceita arquivo de outra OP", async () => {
    const f = vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({ id:"a", name:"atual.ifc", size:100, file:{}, parentReference:{path:"/drives/d/root:/OP/090"} }));
    try { expect((await salvar({publicar:true,anterior:{id:"b"}})).status).toBe(400); expect(m.upsert).not.toHaveBeenCalled(); } finally { f.mockRestore(); }
  });
  it("grava metadados canônicos, opção explícita e auditoria", async () => {
    const f = vi.spyOn(globalThis,"fetch").mockImplementation(async (url) => { const id=url.includes('/items/a?')?'a':'b'; return Response.json({id,name:`${id}.ifc`,size:100,file:{},eTag:`etag-${id}`,parentReference:{path:"/drives/d/root:/OP/089/2. Engenharia"}}); });
    try { expect((await salvar({publicar:false,anterior:{id:"b"}})).status).toBe(200); const d=m.upsert.mock.calls[0][0].update.docsPorArea.ENGENHARIA[0]; expect(d.comparacaoIfc.publicar).toBe(false); expect(d.comparacaoIfc.anterior.nome).toBe("b.ifc"); expect(d.etag).toBe("etag-a"); expect(m.audit).toHaveBeenCalled(); } finally { f.mockRestore(); }
  });
});
