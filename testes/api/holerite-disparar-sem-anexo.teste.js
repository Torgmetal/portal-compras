// Matheus (07/10/2026): o e-mail do holerite NÃO leva mais o PDF — só avisa que está no Portal do
// Colaborador. Com o anexo, ninguém entrava no portal, e a ciência (visualizado/confirmado/IP, base
// do Comprovante) não era registrada.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "rh", name: "RH", email: "rh@torg.com.br" }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
import { sendEmail } from "@/lib/email";
import { POST } from "@/app/api/rh/holerite/disparar/route";

const req = (corpo) => new Request("http://localhost/api/rh/holerite/disparar", { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.holerite.findMany.mockResolvedValue([{ id: "h1", funcionario: { nome: "Ana", email: "ana@x.com" } }]);
  mockPrisma.holerite.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("o e-mail avisa que está no portal e não leva anexo", async () => {
  const res = await POST(req({ competencia: "2026-09" }));
  expect(res.status).toBe(200);
  const msg = sendEmail.mock.calls[0][0];
  expect(msg.to).toBe("ana@x.com");
  expect(msg.attachments).toBeUndefined();
  expect(msg.html).toMatch(/Portal do Colaborador/);
  expect(msg.html).toMatch(/confirme o recebimento/);
  expect(msg.html).not.toMatch(/anexo/i);
  expect(mockPrisma.holerite.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "h1" } }));
});

it("mesmo se a tela antiga mandar anexarPdf: true, não anexa", async () => {
  await POST(req({ competencia: "2026-09", anexarPdf: true }));
  expect(sendEmail.mock.calls[0][0].attachments).toBeUndefined();
});
