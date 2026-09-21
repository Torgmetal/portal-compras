import { describe, it, expect } from "vitest";
import { planejarSeparacao } from "@/lib/fornecedores-email-multiplo";

// Os 10 cadastros do Omie com "a@x.com,b@y.com" no campo `email` (medido 21/09/2026).
describe("planejarSeparacao", () => {
  it("separa o primeiro em email e o resto em emailsAdicionais, preservando os adicionais que já existiam", () => {
    const plano = planejarSeparacao([
      { id: "f2", razaoSocial: "ARCELORMITTAL BRASIL S.A.", email: "equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br", emailsAdicionais: ["comercial@arcelormittal.com.br"] },
      { id: "f3", razaoSocial: "COMERCIAL ARARENSE LTDA", email: "fabiano@comercialararense.com.br", emailsAdicionais: [] },
      { id: "f1", razaoSocial: "GERDAU ACOS LONGOS SA", email: null, emailsAdicionais: [] },
      { id: "f4", razaoSocial: "SUJO", email: " Vendas@Sujo.com.br ", emailsAdicionais: [] },
      { id: "f5", razaoSocial: "LIXO", email: "sem arroba", emailsAdicionais: [] },
    ]);
    expect(plano).toEqual([
      { id: "f2", razaoSocial: "ARCELORMITTAL BRASIL S.A.", de: "equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br", email: "equipe.paralegal@arcelormittal.com.br", emailsAdicionais: ["comercial@arcelormittal.com.br", "nfe@arcelormittal.com.br"] },
      { id: "f4", razaoSocial: "SUJO", de: " Vendas@Sujo.com.br ", email: "vendas@sujo.com.br", emailsAdicionais: [] },
    ]);
  });
  it("é idempotente: o resultado de uma rodada não entra na próxima", () => {
    const depois = [{ id: "f2", razaoSocial: "A", email: "equipe.paralegal@arcelormittal.com.br", emailsAdicionais: ["nfe@arcelormittal.com.br"] }];
    expect(planejarSeparacao(depois)).toEqual([]);
  });
});
