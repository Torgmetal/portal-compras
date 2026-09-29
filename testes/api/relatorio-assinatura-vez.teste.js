// Quem assina passa a vez: com o relatório em fila (inspetor → Torg Metal → cliente), o convite do
// próximo sai no ato da assinatura de quem vem antes (Geraldo, 29/09/2026). O e-mail era o dos
// planos: "Aceite — documento", sem dizer que é um relatório de inspeção.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => null) }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email", () => email);
vi.mock("@/lib/assinatura-cadastro", () => ({ imagemDoCadastro: vi.fn(async () => null) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ aoConcluirAssinaturas: vi.fn() }));

import { POST } from "@/app/api/assinar/[token]/route";

const ENVIO = { id: "e1", tipo: "RELATORIO_INSPECAO", status: "EM_ANDAMENTO", revisao: 2, titulo: "RIP-089-002 — Inspeção de pintura · OP-089", opNumero: "089", snapshot: { relatorioId: "rel1" } };
const PROXIMO = { id: "a2", envioId: "e1", nome: "Geraldo Tank", email: "qualidade@torg.com.br", setor: "Torg Metal", token: "t2", ordem: 201, assinadoEm: null, convidadoEm: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.assinaturaDocumento.findUnique.mockResolvedValue({ id: "a1", envioId: "e1", email: "stival2112@gmail.com", nome: "Alexandre Stival", setor: "Inspetor", ordem: 100, assinadoEm: null, envio: ENVIO });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.assinaturaDocumento.update.mockResolvedValue({ assinadoEm: new Date(), ip: null });
  // 1ª consulta: quem falta ANTES dele (ninguém); 2ª: o próximo da fila
  mockPrisma.assinaturaDocumento.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(PROXIMO);
  email.sendEmail.mockResolvedValue({ ok: true });
});

it("o inspetor assina e o convite do RELATÓRIO vai para a Torg, com o link dela", async () => {
  const r = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }), { params: { token: "t1" } });
  expect(r.status).toBe(200);
  expect(email.sendEmail).toHaveBeenCalledTimes(1);
  const m = email.sendEmail.mock.calls[0][0];
  expect(m.to).toBe("qualidade@torg.com.br");
  expect(m.html).toContain("Relatório de Inspeção");
  expect(m.html).not.toContain("Aceite — documento");
  expect(m.html).toContain("/assinar/t2");
  expect(mockPrisma.assinaturaDocumento.update).toHaveBeenCalledWith({ where: { id: "a2" }, data: { convidadoEm: expect.any(Date) } });
});
