// O aviso depois de criar um relatório: com "só assinado entra" (Vitor, 25/09/2026), ficar fora do
// data book na criação é o NORMAL — não pode sair com ⚠, que é para problema de verdade.
import { describe, it, expect } from "vitest";
import { textoDoVinculo } from "@/lib/relatorio-vinculo-texto";

describe("aviso do data book ao criar o relatório", () => {
  it("aguardando assinatura: diz onde e quando entra, sem alerta", () => {
    const t = textoDoVinculo({ vinculado: false, aguardaAssinatura: true, secao: "14", secaoTitulo: "Tratamento de superfície e pintura" });
    expect(t).toBe("Entra na seção 14 do data book (Tratamento de superfície e pintura) quando todos assinarem.");
    expect(t).not.toMatch(/⚠/);
  });
  it("entrou: diz a seção", () => {
    expect(textoDoVinculo({ vinculado: true, secao: "12", secaoTitulo: "Relatório de Ensaios (END)" })).toBe("Entrou na seção 12 do data book (Relatório de Ensaios (END)).");
  });
  it("problema de verdade continua com alerta e motivo", () => {
    expect(textoDoVinculo({ vinculado: false, motivo: "A OP-120 ainda não tem data book criado." })).toBe("⚠ Não entrou no data book: A OP-120 ainda não tem data book criado.");
    expect(textoDoVinculo(null)).toBe("⚠ Não entrou no data book: seção não encontrada.");
  });
});
