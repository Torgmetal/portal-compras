// @vitest-environment jsdom
//
// ⚠⚠ SALVAR, REABRIR E SALVAR SEM MEXER EM NADA NÃO PODE MUDAR VALOR (achado do Codex, 22/09/2026).
//
// O modal montava cada linha copiando `precoUnit`/`qtdCotada` e IGNORAVA `unidadeCotada` e
// `fatorParaRM`. O reenvio levava os metadados nulos, o servidor caía no caminho "sem conversão" e
// arredondava: R$ 0,4999 virava R$ 0,50 e os 2.500 parafusos subiam de R$ 1.249,75 para R$
// 1.250,00. Ninguém tinha tocado em nada.
//
// A correção tem DUAS metades e este arquivo cobre a segunda: o servidor (`page.js`) manda os
// valores já na unidade do DOCUMENTO, e o modal precisa carregar a trilha junto — senão ele mostra
// "25 CT" e reenvia sem dizer que são CT, o que é pior que o defeito original.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/compras/rm/[id]/_componentes/PropostaUploadIA", () => ({ PropostaUploadIA: () => null }));

// Captura as linhas que o modal monta, que é o estado que o reenvio usa.
const capturadas = { linhas: null };
vi.mock("@/app/compras/rm/[id]/_componentes/TabelaLinhasProposta", () => ({
  TabelaLinhasProposta: ({ linhas }) => { capturadas.linhas = linhas; return null; },
}));

import { ModalLancarManual } from "@/app/compras/rm/[id]/_componentes/ModalLancarManual";

const RM = { id: "rm1", numero: "T118-006-R00", itens: [] };
afterEach(cleanup);

// O que `page.js` manda: já desconvertido para o papel do fornecedor, com a trilha ao lado.
const itemDoServidor = {
  rmItemId: "i1", descricao: "PARAFUSO SEXTAVADO 1/2", unidade: "UN", qtdRm: 2500,
  qtdCotada: 25, precoUnit: "49.99", unidadeCotada: "CT", fatorParaRM: "100",
  icmsPct: "", ipiPct: "",
};

describe("o modal reabre uma proposta convertida", () => {
  it("carrega a unidade cotada e o fator junto dos valores", () => {
    render(<ModalLancarManual cotacao={{ id: "c1", itensCotaveis: [itemDoServidor] }} rm={RM} onClose={() => {}} />);

    expect(capturadas.linhas).toHaveLength(1);
    expect(capturadas.linhas[0]).toMatchObject({
      rmItemId: "i1",
      // ⚠ O que aparece é o PAPEL do fornecedor, não os 2500 UN a R$ 0,4999 do banco.
      qtdCotada: 25,
      precoUnit: "49.99",
      // ⚠⚠ ESTES DOIS ERAM O BURACO: sem eles o reenvio arredondava e subia o total.
      unidadeCotada: "CT",
      fatorParaRM: "100",
    });
  });

  it("item sem conversão abre com a trilha vazia, não indefinida", () => {
    render(<ModalLancarManual
      cotacao={{ id: "c1", itensCotaveis: [{ ...itemDoServidor, unidadeCotada: null, fatorParaRM: null }] }}
      rm={RM} onClose={() => {}} />);

    expect(capturadas.linhas[0].unidadeCotada).toBe("");
    expect(capturadas.linhas[0].fatorParaRM).toBe("");
  });
});
