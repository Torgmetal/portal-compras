import { describe, it, expect, vi } from "vitest";
import { carimbarPassagem } from "@/lib/mes/passagem-auditoria";

// ⚠⚠ O `motivoFim` DA PRESENÇA NÃO BASTA (achado do Codex, 14/09/2026): ele guarda o nome de quem
// ASSUMIU, não quem mandou render, nem por qual caminho, nem qual vínculo morreu.

const fake = () => ({ auditLog: { create: vi.fn().mockResolvedValue({}) } });
const CTX = { usuario: { id: "u1" }, recurso: { id: "r1", codigo: "LASER_PERFIL" }, modo: "ASSUMIU",
              de: { id: "op-jur" }, para: { id: "op-rod" } };
const OK = { saiu: "Jurandir", assumiu: "Rodrigo", vinculoEncerrado: "p-jur",
             presenca: { id: "p-rod" }, marcasQueSeguemAbertas: 6 };

describe("o carimbo da passagem", () => {
  it("grava autoria, modo, os dois operadores e os dois vínculos", async () => {
    const prisma = fake();
    await carimbarPassagem(prisma, OK, CTX);
    const { data } = prisma.auditLog.create.mock.calls[0][0];
    expect(data.userId).toBe("u1");
    expect(data.action).toBe("MES_PASSAR_POSTO");
    expect(data.entityId).toBe("p-jur");
    expect(data.diff).toEqual({
      modo: "ASSUMIU", recurso: "LASER_PERFIL", deOperadorId: "op-jur", paraOperadorId: "op-rod",
      saiu: "Jurandir", assumiu: "Rodrigo", vinculoEncerrado: "p-jur", vinculoAtivo: "p-rod",
      marcasQueSeguemAbertas: 6,
    });
  });

  // ⚠ Recusa não é passagem, e reenvio não é passagem nova — nenhum dos dois vira linha.
  it("não carimba recusa nem reenvio", async () => {
    const prisma = fake();
    await carimbarPassagem(prisma, { erro: "não deu" }, CTX);
    await carimbarPassagem(prisma, { jaEstava: true }, CTX);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  // ⚠⚠ O trabalho já está trocado no chão de fábrica: falhar ao carimbar não pode derrubar a
  // resposta e fazer o operador tentar de novo uma passagem que já aconteceu.
  it("falha ao carimbar não derruba a passagem", async () => {
    const prisma = { auditLog: { create: vi.fn().mockRejectedValue(new Error("banco fora")) } };
    await expect(carimbarPassagem(prisma, OK, CTX)).resolves.toBe(OK);
  });
});
