// ─── EDITAR E EXCLUIR UM ADITIVO ─────────────────────────────────────────────
// Matheus (15/10/2026), na OP-105: "a Patricia criou os aditivos mas as OC's estavam erradas e o
// Rogério revisou. Agora eu precisava revisar o aditivo mas não consigo… não tem a opção de editar e
// nem a opção de excluir". Vitor, no mesmo dia: editar vale também para o aditivo JÁ DIVULGADO; e a
// exclusão é RECUSADA quando algo já depende dele — nada é desvinculado sozinho.
//
// Puro: a rota (app/api/comercial/aditivo/[id]) e a tela usam as mesmas regras.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Por que este aditivo não pode ser apagado — lista vazia = pode.
 * ⚠ DIVULGADO não sai: o comunicado já foi aos setores, com aceite; apagar faria o PDF que eles
 * assinaram apontar para um aditivo que não existe. Para esse, o caminho é EDITAR.
 */
export function bloqueiosDaExclusao(ad) {
  const motivos = [];
  if (ad?.status && ad.status !== "RASCUNHO") motivos.push("já foi divulgado aos setores — edite em vez de excluir");
  const medicoes = Number(ad?._count?.medicoes) || 0;
  if (medicoes) motivos.push(plural(medicoes, "medição vinculada", "medições vinculadas"));
  const itens = ad?.itens || [];
  const rm = itens.reduce((s, i) => s + (Number(i?._count?.rmItens) || 0), 0);
  const verba = itens.reduce((s, i) => s + (Number(i?._count?.solicitacoesVerba) || 0), 0);
  if (rm) motivos.push(plural(rm, "item de RM", "itens de RM"));
  if (verba) motivos.push(plural(verba, "solicitação de verba", "solicitações de verba"));
  return motivos;
}

// "1234.5" → "1234,5": a tela lê com numeroBR, que trataria "1.234" como milhar
const paraTela = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));

/** As receitas gravadas (OPReceita) no formato do editor — com o id, para atualizar no lugar. */
export function receitasParaEditor(receitas) {
  return (receitas || []).map((r) => {
    const fechado = r.tipoPreco !== "POR_UNIDADE";
    return {
      id: r.id,
      categoria: r.categoria || "FABRICACAO",
      descricao: r.descricao || "",
      unidade: fechado ? "vb" : r.unidade || "un",
      quantidade: fechado ? "" : paraTela(r.quantidade),
      valorUnitario: fechado ? "" : paraTela(r.valorUnitario),
      valor: fechado ? paraTela(r.valor) : "",
    };
  });
}

/**
 * O que fazer com as receitas do aditivo. ⚠ ATUALIZA NO LUGAR, não recria: a aba Resumo acrescenta à
 * linha CFOP, impostos e endereço de faturamento, e recriar apagaria isso em silêncio. Um id que não
 * é deste aditivo vira linha nova — a rota nunca altera receita de outro aditivo nem do contrato.
 */
export function planoDasReceitas(existentes, enviadas) {
  const ids = new Set((existentes || []).map((r) => r.id));
  const atualizar = [], criar = [];
  for (const r of enviadas || []) {
    if (r.id && ids.has(r.id)) atualizar.push(r);
    else { const { id: _id, ...resto } = r; criar.push(resto); }
  }
  const mantidos = new Set(atualizar.map((r) => r.id));
  return { atualizar, criar, apagar: [...ids].filter((id) => !mantidos.has(id)) };
}
