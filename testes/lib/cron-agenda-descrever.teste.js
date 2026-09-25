import { describe, it, expect } from "vitest";
import { descreverAgenda, AGENDA } from "@/lib/cron-agenda";

// ⚠⚠ O RODAPÉ DO ESTOQUE DIZIA "diariamente às 06:00 (produtos) e 06:30 (movimentações)" — texto
// escrito à mão quando a agenda era outra. O `vercel.json` roda os dois DE HORA EM HORA, e às 06:00
// UTC, que em Brasília são 03:00. Errava duas vezes. Mesma lição do `maxHoras` do monitor
// (lib/cron-agenda.js): o texto passa a SAIR da agenda, e não há mais o que esquecer de atualizar.
describe("descreverAgenda — a agenda da Vercel (UTC) em português, no horário de Brasília", () => {
  it("de hora em hora numa faixa, convertida para Brasília", () => {
    expect(descreverAgenda("0 6-20 * * *")).toBe("de hora em hora, das 3h às 17h");
  });

  it("com minuto, o minuto aparece", () => {
    expect(descreverAgenda("30 6-20 * * *")).toBe("de hora em hora, das 3h30 às 17h30");
  });

  it("uma vez por dia", () => {
    expect(descreverAgenda("0 9 * * *")).toBe("todo dia às 6h");
  });

  // ⚠ Quebra que pega: converter errado o que a regra não cobre. Melhor mostrar a expressão crua
  // do que uma frase bonita e falsa.
  it("o que a regra não cobre (dia da semana, virada da meia-noite) sai cru, dizendo que é UTC", () => {
    expect(descreverAgenda("0 8 * * 1-5")).toBe('agenda "0 8 * * 1-5" (UTC)');
    expect(descreverAgenda("0 1-5 * * *")).toBe('agenda "0 1-5 * * *" (UTC)');
  });

  it("cron fora da agenda não tem descrição", () => {
    expect(descreverAgenda(undefined)).toBeNull();
    expect(descreverAgenda("")).toBeNull();
  });

  // O que a tela do Estoque vai de fato mostrar hoje.
  it("os dois crons do estoque, como estão agendados", () => {
    expect(descreverAgenda(AGENDA.get("/api/cron/estoque-produtos"))).toMatch(/^de hora em hora/);
    expect(descreverAgenda(AGENDA.get("/api/cron/estoque-movimentacoes"))).toMatch(/^de hora em hora/);
  });
});
