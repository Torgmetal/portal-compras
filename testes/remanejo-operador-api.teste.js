import { it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/gantt-pcp", () => ({ aplicarRemanejo: vi.fn() }));
vi.mock("@/lib/fila-operador-servidor", () => ({
  invalidarFilaOperador: vi.fn(),
}));
import { requireRole } from "@/lib/session";
import { aplicarRemanejo } from "@/lib/gantt-pcp";
import { POST } from "@/app/api/producao/fila/remanejar/route";
const body = {
  recurso: "MONTAGEM 2",
  dia: "2026-09-13",
  fracoes: [
    {
      id: "p",
      inicio: 3,
      quantidade: 7,
      qTotal: 10,
      diaOrigem: "2026-09-12",
      recursoOrigem: "MONTAGEM 1",
    },
  ],
};
const req = (b) =>
  new Request("http://localhost/", { method: "POST", body: JSON.stringify(b) });
beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: "u" });
  aplicarRemanejo.mockResolvedValue({ total: 1 });
});
it("exige acesso antes da mutação e distingue 401/403", async () => {
  for (const [erro, status] of [
    ["Unauthorized", 401],
    ["Forbidden", 403],
  ]) {
    requireRole.mockRejectedValueOnce(new Error(erro));
    expect((await POST(req(body))).status).toBe(status);
  }
  expect(aplicarRemanejo).not.toHaveBeenCalled();
});
it("recusa bancadas inválidas e retornos virtuais", async () => {
  for (const b of [
    { ...body, recurso: "FINANCEIRO" },
    { ...body, fracoes: [{ ...body.fracoes[0], id: "retorno:1" }] },
  ])
    expect((await POST(req(b))).status).toBe(400);
  expect(aplicarRemanejo).not.toHaveBeenCalled();
});
it("salva pelo Gantt com a proteção transacional do saldo ativada", async () => {
  expect((await POST(req(body))).status).toBe(200);
  expect(aplicarRemanejo).toHaveBeenCalledWith(
    [{ setor: "MONTAGEM", ids: ["p"], ...body }],
    { id: "u" },
    { somenteSaldo: true },
  );
});
it("não confirma quando a programação já mudou", async () => {
  aplicarRemanejo.mockRejectedValueOnce(
    new Error("A programação mudou. Atualize."),
  );
  expect((await POST(req(body))).status).toBe(400);
});
