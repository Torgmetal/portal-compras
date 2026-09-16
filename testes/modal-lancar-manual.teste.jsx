// @vitest-environment jsdom
//
// ⚠⚠ Matheus (16/09/2026): "quando meu fornecedor preencher prazo de entrega e prazo faturamento
// deve aparecer nos campos quando eu editar uma cotação".
//
// O QUE ESTE ARQUIVO EXISTE PARA PEGAR não é só o campo em branco: a rota `lancar-manual` REMONTA
// `Cotacao.observacao` a partir destes três campos e regrava `prazoPagamento`. Com eles vazios,
// salvar uma edição APAGAVA o prazo de entrega e a condição de pagamento que o fornecedor tinha
// informado. Mostrar e preservar são a mesma correção.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/compras/rm/[id]/_componentes/PropostaUploadIA", () => ({ PropostaUploadIA: () => null }));
vi.mock("@/app/compras/rm/[id]/_componentes/TabelaLinhasProposta", () => ({ TabelaLinhasProposta: () => null }));

import { ModalLancarManual } from "@/app/compras/rm/[id]/_componentes/ModalLancarManual";

const RM = { id: "rm1", numero: "T118-006-R00", itens: [] };
const abrir = (cotacao) => render(<ModalLancarManual cotacao={{ id: "c1", itensCotaveis: [], ...cotacao }} rm={RM} onClose={() => {}} />);

const campo = (rotulo) => screen.getByPlaceholderText(rotulo);
afterEach(cleanup);

describe("editar cotação respondida — os campos trazem o que o fornecedor mandou", () => {
  // O caso real: a PIZZINATTO respondeu 18 dias úteis e 30 + 45 + 60.
  const RESPONDIDA = {
    observacao: "Prazo de entrega: 18 dias úteis | Pagamento: 30 + 45 + 60 | sem frete incluso",
    prazoPagamento: "30 + 45 + 60",
  };

  it("⚠⚠ o prazo de entrega aparece — antes vinha vazio e era apagado ao salvar", () => {
    abrir(RESPONDIDA);
    expect(campo("Ex: 15 dias úteis").value).toBe("18 dias úteis");
  });

  it("⚠⚠ a condição de pagamento aparece", () => {
    abrir(RESPONDIDA);
    expect(campo("Ex: 30 dias").value).toBe("30 + 45 + 60");
  });

  it("a observação livre do fornecedor também, sem os rótulos grudados", () => {
    abrir(RESPONDIDA);
    const obs = screen.getByPlaceholderText("Observações da proposta");
    expect(obs.value).toBe("sem frete incluso");
    expect(obs.value).not.toContain("Prazo de entrega:");
    expect(obs.value).not.toContain("Pagamento:");
  });

  it("⚠ o campo próprio manda sobre a observação — cotação lançada à mão só preenche prazoPagamento", () => {
    abrir({ observacao: "Prazo de entrega: 10 dias", prazoPagamento: "28 DDL" });
    expect(campo("Ex: 30 dias").value).toBe("28 DDL");
    expect(campo("Ex: 15 dias úteis").value).toBe("10 dias");
  });

  it("formato antigo, só com a observação empilhada, ainda é lido", () => {
    abrir({ observacao: "Prazo de entrega: 7 dias | Pagamento: à vista", prazoPagamento: null });
    expect(campo("Ex: 15 dias úteis").value).toBe("7 dias");
    expect(campo("Ex: 30 dias").value).toBe("à vista");
  });
});

describe("lançar cotação nova — nada a trazer", () => {
  it("cotação sem resposta abre com os três campos vazios", () => {
    abrir({ observacao: null, prazoPagamento: null });
    expect(campo("Ex: 15 dias úteis").value).toBe("");
    expect(campo("Ex: 30 dias").value).toBe("");
    expect(screen.getByPlaceholderText("Observações da proposta").value).toBe("");
  });

  it("⚠ observação só com ruído não vira texto na cara do comprador", () => {
    abrir({ observacao: "Prazo de entrega: 5 dias |  | ", prazoPagamento: null });
    expect(screen.getByPlaceholderText("Observações da proposta").value).toBe("");
    expect(campo("Ex: 15 dias úteis").value).toBe("5 dias");
  });
});
