import { it, expect, vi } from "vitest";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/fila-operador-servidor", () => ({
  carregarFilaOperador: vi.fn(),
}));
import { requireRole } from "@/lib/session";
import { carregarFilaOperador } from "@/lib/fila-operador-servidor";
import { GET } from "@/app/api/producao/fila/route";
it("verifica acesso antes de consultar a fila compartilhada", async () => {
  requireRole.mockRejectedValueOnce(new Error("Unauthorized"));
  expect((await GET(new Request("http://localhost/?setor=SOLDA"))).status).toBe(
    401,
  );
  expect(carregarFilaOperador).not.toHaveBeenCalled();
  requireRole.mockResolvedValue({});
  carregarFilaOperador.mockResolvedValue({ lotes: [] });
  expect((await GET(new Request("http://localhost/?setor=SOLDA"))).status).toBe(
    200,
  );
});
it('recusa setor inválido antes de carregar os dados', async()=>{
 vi.clearAllMocks();requireRole.mockResolvedValue({});
 expect((await GET(new Request('http://localhost/?setor=FINANCEIRO'))).status).toBe(400);
 expect(carregarFilaOperador).not.toHaveBeenCalled();
});
it('entrega somente os lotes do setor escolhido',async()=>{
 requireRole.mockResolvedValue({});carregarFilaOperador.mockResolvedValue({lotes:[{id:'s',setor:'SOLDA'},{id:'c',setor:'CORTE'}]});
 const r=await GET(new Request('http://localhost/?setor=SOLDA'));
 expect((await r.json()).lotes).toEqual([{id:'s',setor:'SOLDA'}]);
});
