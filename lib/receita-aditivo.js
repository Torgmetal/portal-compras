// ─── RECEITA DO ADITIVO — o que passa a ser faturado ─────────────────────────
// Vitor (17/09/2026), olhando o modal antigo de aditivo: "e onde eu descrevo a receita por
// exemplo?" — não tinha onde. A receita nascia sozinha (das linhas da planilha do estudo, ou de
// UMA linha com o "valor do aditivo") e só dava para detalhar depois, na aba Resumo, editando a
// linha que já tinha nascido. "Para o caso de ter que digitar na mão precisamos de algumas
// coisas: informar o peso, unitário e a descrição."
//
// Puro de propósito: a tela (editor) e a rota fazem as MESMAS contas — o total da linha, o que
// vai para a API e a precedência no servidor. Se a tela mostrasse um total e a rota gravasse
// outro, o aditivo nasceria com dois valores.
//
// ⚠ RECEITA ≠ VERBA. As linhas daqui são o que a Torg FATURA (OPReceita, aba Resumo › Receitas
// do contrato); os itens do aditivo (AditivoItem) são o que o Compras pode GASTAR. Vitor (19/08):
// "a receita do contrato seria o valor a ser faturado, e itens de contrato seria o valor que o
// Compras deveria comprar".
import { numeroBR } from "./numero-br";
import { receitasDaPlanilhaComercial, categoriaDaReceita } from "./op-categorias";

export const CATEGORIAS_RECEITA = [
  { codigo: "FABRICACAO", rotulo: "Fabricação" },
  { codigo: "MONTAGEM", rotulo: "Montagem em campo" },
  { codigo: "PROJETO", rotulo: "Projeto / Engenharia" },
  { codigo: "MATERIAL", rotulo: "Venda de material" },
  { codigo: "OUTRO", rotulo: "Outro" },
];

/** A linha de valor fechado: só o total, sem quantidade × unitário. */
export const VALOR_FECHADO = "vb";

// ⚠ "kg" vem primeiro porque é como a Torg vende: peso × R$/kg.
export const UNIDADES_RECEITA = [
  { codigo: "kg", rotulo: "kg", quantidade: "Peso (kg)", unitario: "Unitário (R$/kg)" },
  { codigo: "pç", rotulo: "pç", quantidade: "Peças", unitario: "Unitário (R$/pç)" },
  { codigo: "m²", rotulo: "m²", quantidade: "Área (m²)", unitario: "Unitário (R$/m²)" },
  { codigo: "m", rotulo: "m", quantidade: "Metros", unitario: "Unitário (R$/m)" },
  { codigo: "un", rotulo: "un", quantidade: "Quantidade", unitario: "Unitário (R$/un)" },
  { codigo: VALOR_FECHADO, rotulo: "valor fechado", quantidade: null, unitario: null },
];

/** Rótulos da unidade. Uma unidade que veio da planilha e não está na lista ("t", "cj") é aceita como está. */
export function unidadeInfo(codigo) {
  const c = String(codigo || "").trim() || "un";
  return UNIDADES_RECEITA.find((u) => u.codigo === c) || { codigo: c, rotulo: c, quantidade: `Quantidade (${c})`, unitario: `Unitário (R$/${c})` };
}

export const linhaReceitaVazia = (parcial = {}) => ({ categoria: "FABRICACAO", descricao: "", unidade: "kg", quantidade: "", valorUnitario: "", valor: "", ...parcial });

const arred = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Total da linha: quantidade × unitário — ou o valor fechado, quando a unidade é "vb". */
export function totalDaLinha(l) {
  if (!l) return 0;
  if (l.unidade === VALOR_FECHADO) return arred(numeroBR(l.valor));
  return arred(numeroBR(l.quantidade) * numeroBR(l.valorUnitario));
}

export const totalDasLinhas = (linhas) => arred((linhas || []).reduce((s, l) => s + totalDaLinha(l), 0));

/** Linha preenchida = tem descrição e total > 0. As outras são linhas em branco, não erro. */
export const linhaPreenchida = (l) => Boolean(String(l?.descricao || "").trim()) && totalDaLinha(l) > 0;

/** As linhas do editor no formato que a rota grava (OPReceita). */
export function linhasParaEnvio(linhas) {
  return (linhas || []).filter(linhaPreenchida).map((l) => {
    const fechado = l.unidade === VALOR_FECHADO;
    return {
      categoria: l.categoria || categoriaDaReceita(l.descricao),
      descricao: String(l.descricao).trim().slice(0, 200),
      tipoPreco: fechado ? "VALOR" : "POR_UNIDADE",
      unidade: fechado ? null : unidadeInfo(l.unidade).codigo,
      quantidade: fechado ? null : arred(numeroBR(l.quantidade)),
      valorUnitario: fechado ? null : arred(numeroBR(l.valorUnitario)),
      valor: totalDaLinha(l),
    };
  });
}

/** As linhas de venda da planilha do estudo, no formato do editor — para pré-preencher a tela. */
export function linhasDaPlanilha(estudoDados) {
  return receitasDaPlanilhaComercial(estudoDados?.comercial, estudoDados?.bdi).map((r) => ({
    categoria: r.categoria,
    descricao: r.descricao,
    unidade: r.tipoPreco === "POR_UNIDADE" ? r.unidade || "un" : VALOR_FECHADO,
    quantidade: r.quantidade ?? "",
    valorUnitario: r.valorUnitario ?? "",
    valor: r.valor,
  }));
}

/**
 * O que a rota grava em OPReceita para um aditivo novo, e o valor do aditivo.
 *
 * Precedência: linhas digitadas > planilha do estudo > UMA linha com o valor do aditivo. O `valor`
 * explícito, quando vem, manda no valor do aditivo; senão é a soma das linhas.
 * @returns {{ linhas: object[], valor: number|null }}
 */
export function receitasDoAditivo({ receitas = [], estudoDados = null, valor = null, descricao = "", numero, pedidoTexto = null }) {
  const obs = `aditivo ${numero}`;
  const digitadas = (receitas || []).filter((r) => r && String(r.descricao || "").trim() && Number(r.valor) > 0);
  let linhas;
  if (digitadas.length) {
    linhas = digitadas.map((r) => {
      const porUnidade = r.tipoPreco === "POR_UNIDADE";
      return {
        categoria: r.categoria || categoriaDaReceita(r.descricao),
        descricao: String(r.descricao).trim().slice(0, 200),
        tipoPreco: porUnidade ? "POR_UNIDADE" : "VALOR",
        unidade: porUnidade ? r.unidade || null : null,
        quantidade: porUnidade ? r.quantidade ?? null : null,
        valorUnitario: porUnidade ? r.valorUnitario ?? null : null,
        valor: arred(r.valor),
        observacao: obs,
      };
    });
  } else {
    const daPlanilha = receitasDaPlanilhaComercial(estudoDados?.comercial, estudoDados?.bdi);
    if (daPlanilha.length) {
      linhas = daPlanilha.map((r) => ({ ...r, observacao: `${r.observacao} · ${obs}` }));
    } else {
      const v = arred(valor);
      linhas = v > 0
        ? [{ categoria: categoriaDaReceita(descricao), descricao: `Aditivo ${numero}${pedidoTexto ? ` — ${pedidoTexto}` : ""}`.slice(0, 200), tipoPreco: "VALOR", unidade: null, quantidade: null, valorUnitario: null, valor: v, observacao: obs }]
        : [];
    }
  }
  const soma = arred(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const explicito = arred(valor);
  return { linhas, valor: explicito > 0 ? explicito : soma || null };
}
