import { describe, it, expect, vi } from "vitest";
import { carimbarNaTx } from "@/lib/mes/passagem-auditoria";

// ⚠⚠ O `motivoFim` DA PRESENÇA NÃO BASTA (achado do Codex, 14/09/2026): ele guarda o nome de quem
// ASSUMIU, não quem mandou render, nem por qual caminho, nem qual vínculo morreu.

// ⚠⚠ A TRILHA SAIU DO `AuditLog` DO PORTAL PARA `MesAuditoria` (21/09/2026). Com cliente e schema
// próprios, um `tx.auditLog.create` aqui seria escrita em OUTRA conexão: a transação da passagem
// voltaria atrás e o carimbo ficaria de pé, ou o contrário — e é a atomicidade dos dois que esta
// função inteira existe para garantir.
const fake = () => ({ mesAuditoria: { create: vi.fn().mockResolvedValue({}) } });
const CTX = { usuario: { id: "u1" }, recurso: { id: "r1", codigo: "LASER_PERFIL" }, modo: "ASSUMIU",
              de: { id: "op-jur" }, para: { id: "op-rod" } };
const OK = { saiu: "Jurandir", assumiu: "Rodrigo", vinculoEncerrado: "p-jur",
             presenca: { id: "p-rod" }, marcasQueSeguemAbertas: 6 };

describe("o carimbo da passagem", () => {
  it("grava autoria, modo, os dois operadores e os dois vínculos", async () => {
    const tx = fake();
    await carimbarNaTx(tx, OK, CTX);
    const { data } = tx.mesAuditoria.create.mock.calls[0][0];
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
    const tx = fake();
    await carimbarNaTx(tx, { erro: "não deu" }, CTX);
    await carimbarNaTx(tx, { jaEstava: true }, CTX);
    expect(tx.mesAuditoria.create).not.toHaveBeenCalled();
  });

  // ⚠⚠ ESTE TESTE MUDOU DE LADO EM 14/09/2026, DE PROPÓSITO. Ele dizia "falha ao carimbar não
  // derruba a passagem", porque o carimbo era gravado depois da transação com `.catch(() => {})`.
  // O Codex mostrou o preço: a passagem podia acontecer SEM RASTRO, e o reenvio não recuperava o
  // carimbo perdido. Passar o posto é assumir responsabilidade por ele; sem trilha, a pergunta que
  // este módulo existe para responder fica sem resposta. Agora o carimbo é parte da transação:
  // falhou, volta tudo atrás e o operador toca de novo — que é barato e deixa os dois de acordo.
  it("falha ao carimbar DESFAZ a passagem (a transação inteira cai)", async () => {
    const tx = { mesAuditoria: { create: vi.fn().mockRejectedValue(new Error("banco fora")) } };
    await expect(carimbarNaTx(tx, OK, CTX)).rejects.toThrow("banco fora");
  });

  // Sem contexto de auditoria (chamada interna, script de laboratório) não há o que carimbar.
  it("sem contexto, devolve o resultado sem gravar", async () => {
    const tx = fake();
    await expect(carimbarNaTx(tx, OK, null)).resolves.toBe(OK);
    expect(tx.mesAuditoria.create).not.toHaveBeenCalled();
  });
});
