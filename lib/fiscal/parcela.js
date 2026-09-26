// ─── A PARTE DA MEDIÇÃO QUE VAI NESTA NOTA ───────────────────────────────────
//
// Matheus (26/09/2026): *"na tela auditoria ser possível selecionar as medições/medições parciais
// para ver como deveria ser cada imposto"*. Parcial = PARTE de uma medição: o pedido do Omie é
// faturado aos poucos, e cada nota leva alguns itens em algumas quantidades.
//
// ⚠⚠ SELEÇÃO INVÁLIDA É RECUSADA, NÃO CORRIGIDA. Quantidade acima do pedido "ajustada" para o máximo
// auditaria uma parcela diferente da que a pessoa pediu, e o resultado pareceria certo.
//
// ⚠ Sem controle de saldo já faturado por item nesta versão: o teto é a quantidade do pedido.
const r2 = (n) => Math.round(n * 100) / 100;
const escala = (g, f) => (g
  ? { ...g, base: g.base == null ? null : r2(g.base * f), valor: g.valor == null ? null : r2(g.valor * f) }
  : g);

/**
 * @param {{ itens: Array<{item, quantidade, valor, ipi?, icms?}> }} doc — de `lerPedidoOmie`
 * @param {Array<{item: number, quantidade: number}>} selecao
 * @returns {{ doc } | { erro: string }}
 */
export function montarParcela(doc, selecao) {
  if (!Array.isArray(selecao) || selecao.length === 0) return { erro: "Marque ao menos um item da parcela." };
  const vistos = new Set();
  const itens = [];
  for (const s of selecao) {
    if (vistos.has(s.item)) return { erro: `Item ${s.item} repetido na parcela.` };
    vistos.add(s.item);
    const it = doc.itens.find((i) => i.item === s.item);
    if (!it) return { erro: `Item ${s.item} não existe neste pedido.` };
    const q = Number(s.quantidade);
    if (!(q > 0)) return { erro: `Item ${s.item}: a quantidade precisa ser maior que zero.` };
    if (q > it.quantidade) return { erro: `Item ${s.item}: ${q} está acima das ${it.quantidade} do pedido.` };
    const f = q / it.quantidade;
    itens.push({ ...it, quantidade: q, valor: r2(it.valor * f), ipi: escala(it.ipi, f), icms: escala(it.icms, f) });
  }
  return { doc: { ...doc, itens } };
}

/** Total da parcela por tributo. ⚠ Tributo sem valor em NENHUM item fica null — não "R$ 0,00". */
export function totaisPorTributo(esperados) {
  const mapa = new Map();
  for (const e of esperados ?? []) {
    for (const l of e.linhas ?? []) {
      const atual = mapa.has(l.tributo) ? mapa.get(l.tributo) : null;
      mapa.set(l.tributo, l.valor == null ? atual : r2((atual ?? 0) + l.valor));
    }
  }
  return [...mapa.entries()].map(([tributo, valor]) => ({ tributo, valor }));
}
