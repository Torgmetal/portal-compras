import { expect, it } from "vitest";
import { podeGerenciarComercialOP, protegerDadosObra } from "@/lib/op-obra-acesso";

it.each(["RH", "ENGENHARIA", "COMPRAS", "PCP", "PLANEJAMENTO", "FINANCEIRO"])("não libera orçamento para %s", modulo => {
  expect(podeGerenciarComercialOP({ tipo: "USUARIO", modulos: [modulo] })).toBe(false);
});
it("libera ADMIN e Comercial inclusive como módulo secundário", () => {
  expect(podeGerenciarComercialOP({ tipo: "ADMIN" })).toBe(true);
  expect(podeGerenciarComercialOP({ modulos: ["RH", "COMERCIAL"] })).toBe(true);
});
it("retira contrato e documentos comerciais do payload operacional, inclusive aditivos", () => {
  const dados = { numero: "001", valorTotalContrato: 5754, valorFaturarPorKg: 4, orcamentoPasta: "privado", propostas: [{ valor: 5754 }], estudoDados: { preco: 5754 }, aditivos: [{ numero: 1, estudoArquivo: { id: "privado" } }] };
  protegerDadosObra(dados, {});
  expect(dados).toEqual({ numero: "001", aditivos: [{ numero: 1 }] });
});
it("preserva valores financeiros para Financeiro, mas remove documentos do Comercial", () => {
  const dados = { valorTotalContrato: 5754, propostas: [{ valor: 5754 }] };
  protegerDadosObra(dados, { podeVerFinanceiro: true });
  expect(dados).toEqual({ valorTotalContrato: 5754 });
});
it("preserva dados para Comercial autorizado", () => {
  const dados = { valorTotalContrato: 5754, propostas: [{ valor: 5754 }] };
  protegerDadosObra(dados, { podeVerFinanceiro: true, podeGerenciarComercial: true });
  expect(dados).toEqual({ valorTotalContrato: 5754, propostas: [{ valor: 5754 }] });
});
