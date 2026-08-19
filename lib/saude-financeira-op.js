import "server-only";
import { prisma } from "./prisma";
import { getCategoria, labelCategoria } from "./op-categorias";

// SAÚDE FINANCEIRA DA OP — o que o estudo previu × o que de fato aconteceu, por família.
//
// Vitor (19/08/2026): "na aba da OP no financeiro você deve trazer todos os cenários — verbas
// estimadas × realizadas, custos informados na planilha. Precisa trazer o resumo da saúde
// financeira para podermos auditar esses números posteriormente".
//
// A palavra que manda aqui é **auditar**. Um número sozinho não se audita: "gastou R$ 127 mil em
// aço" não diz se foi bom negócio. O que se audita é o PAR — previsto × realizado — e o caminho
// de volta até a origem. Por isso cada família devolve os itens que formaram a estimativa e os
// pedidos que formaram o realizado; quem for conferir daqui a um ano consegue reabrir a conta.
//
// 🚫 O que NÃO se faz aqui: inventar rateio pra fechar a conta. Pedido que não se amarra a nenhuma
// família fica em `naoAtribuido`, visível e incômodo. Diluir esse valor entre as famílias deixaria
// o quadro bonito e a auditoria impossível.

/** Valor da linha vencedora da cotação (é ela que virou pedido). */
function valorVencedor(rmItem) {
  const ci = (rmItem.cotacaoItens || []).find((c) => c.vencedor);
  if (!ci) return 0;
  const qtd = ci.qtdProposta ?? ci.qtdCotada ?? rmItem.qtd ?? 0;
  return (Number(ci.precoUnit) || 0) * (Number(qtd) || 0);
}

/**
 * Distribui o total de cada pedido entre as famílias.
 *
 * A ligação pedido → família tem TRÊS caminhos, do mais preciso ao mais grosso — e é preciso ter
 * os três, porque o portal não usa um só:
 *
 *   1. `RMItem.opItemId` → categoria do item da OP. É o mais exato e o menos disponível:
 *      na prática nunca é preenchido (conferido nas OPs 112/113 — zero de 19 linhas).
 *   2. `RM.categoriasOP` → é o vínculo REAL da casa, o mesmo que o painel de OPs e a derivação
 *      de faturamento direto usam (lib/faturamento-direto.js). Uma categoria = o pedido inteiro
 *      vai pra ela; várias = divide entre elas.
 *   3. `PedidoOmie.categoriaItem` → os FD avulsos, que nascem sem RM.
 *
 * ⚠ Rateia o TOTAL DO PEDIDO, não a soma das linhas: o total carrega frete, desconto e
 * arredondamento que não estão nas linhas — e é o total que consome verba.
 *
 * Quando a divisão é entre várias famílias, o peso é a verba ESTIMADA de cada uma. Não é exato,
 * mas é a melhor proporção disponível — e a linha aparece marcada como rateada, pra quem audita
 * saber que aquele número foi repartido e não medido.
 */
function ratearPedidos(pedidos, rmItens, estimado) {
  const catPorRmItem = new Map();
  for (const it of rmItens) {
    if (it.pedidoOmieId && it.opItem?.categoria) {
      const lista = catPorRmItem.get(it.pedidoOmieId) || [];
      lista.push({ cat: it.opItem.categoria, peso: valorVencedor(it) });
      catPorRmItem.set(it.pedidoOmieId, lista);
    }
  }

  const realizado = {};
  const origem = {};
  let naoAtribuido = 0;
  const pedidosSemFamilia = [];

  const creditar = (cat, valor, p, extra = {}) => {
    realizado[cat] = (realizado[cat] || 0) + valor;
    (origem[cat] ||= []).push({
      pedido: p.numeroPedido || p.codigoPedido,
      fornecedor: p.fornecedorNome,
      rm: p.rmNumero || null,
      valor,
      ...extra,
    });
  };

  for (const p of pedidos) {
    const total = Number(p.total) || 0;
    if (!total) continue;

    // 1) pelas linhas da RM que apontam pro item da OP
    const linhas = (catPorRmItem.get(p.id) || []).filter((l) => l.cat);
    if (linhas.length) {
      const somaPesos = linhas.reduce((s, l) => s + l.peso, 0);
      const juntas = new Map();
      for (const l of linhas) juntas.set(l.cat, (juntas.get(l.cat) || 0) + (somaPesos > 0 ? l.peso / somaPesos : 1 / linhas.length));
      for (const [cat, fr] of juntas) creditar(cat, total * fr, p, { rateado: juntas.size > 1, via: "item da RM" });
      continue;
    }

    // 2) pelas categorias declaradas na RM — o caminho que de fato existe nos dados
    const cats = (p.categoriasOP || []).filter(Boolean);
    if (cats.length === 1) { creditar(cats[0], total, p, { via: "categoria da RM" }); continue; }
    if (cats.length > 1) {
      const pesos = cats.map((c) => Math.max(0, Number(estimado[c]) || 0));
      const soma = pesos.reduce((s, v) => s + v, 0);
      cats.forEach((c, i) => creditar(c, total * (soma > 0 ? pesos[i] / soma : 1 / cats.length), p, { rateado: true, via: "categorias da RM" }));
      continue;
    }

    // 3) FD avulso, que nasce sem RM
    if (p.categoriaItem) { creditar(p.categoriaItem, total, p, { via: "categoria do pedido" }); continue; }

    naoAtribuido += total;
    pedidosSemFamilia.push({ pedido: p.numeroPedido || p.codigoPedido, fornecedor: p.fornecedorNome, valor: total });
  }
  return { realizado, origem, naoAtribuido, pedidosSemFamilia };
}

/** Custos que a planilha de estudo informou — a linha de base da auditoria. */
function custosDoEstudo(estudoDados) {
  const tg = estudoDados?.comercial?.totalGeral;
  const bdi = estudoDados?.bdi;
  if (!tg && !bdi) return null;

  const material = Number(tg?.material) || 0;
  const mdo = Number(tg?.mdoTerceirizada) || 0;
  const industrializacao = Number(tg?.industrializacao) || 0;
  const impostoNota = (bdi?.faturamento || []).reduce((s, f) => s + (Number(f.impostos) || 0), 0) || null;

  return {
    venda: Number(bdi?.venda) || Number(tg?.valor) || 0,
    // o que se COMPRA
    material, mdoTerceirizada: mdo, custoDeCompra: material + mdo,
    // o que a Torg TRANSFORMA (não se compra)
    industrializacao,
    bdi: Number(tg?.bdi) || Number(bdi?.bdi) || 0,
    // tributos
    impostoNota,
    credito: Number(bdi?.credito) || null,
    impostoLiquido: Number(bdi?.totalImpostos) || null,
    impostoLiquidoPct: bdi?.totalImpostosPct ?? null,
    // margem que o Comercial previu no BDI
    margemEstudo: Number(bdi?.margem) || null,
    margemEstudoPct: bdi?.venda > 0 && bdi?.margem > 0 ? bdi.margem / bdi.venda : null,
  };
}

/**
 * @param {string} opId
 * @returns {Promise<object|null>} null quando a OP não existe
 */
export async function saudeFinanceiraOP(opId) {
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: {
      id: true, numero: true, valorTotalContrato: true, estudoDados: true, estudoArquivo: true,
      itens: { select: { id: true, categoria: true, descricao: true, valorVerba: true, faturamentoDireto: true } },
      aditivos: { select: { numero: true, itens: { select: { id: true, categoria: true, descricao: true, valorVerba: true, faturamentoDireto: true } } } },
      receitas: { select: { valor: true, icmsPct: true, ipiPct: true, pisPct: true, cofinsPct: true, issPct: true, irrfPct: true, csllPct: true } },
      medicoes: { select: { valorBruto: true, etapa: true, status: true } },
    },
  });
  if (!op) return null;

  // ── ESTIMADO: os itens do contrato (base + aditivos) ─────────────────────────────────────
  const itensTodos = [
    ...op.itens.map((i) => ({ ...i, origem: "base" })),
    ...op.aditivos.flatMap((a) => a.itens.map((i) => ({ ...i, origem: `aditivo ${a.numero}` }))),
  ];
  const estimado = {};
  const itensPorCat = {};
  for (const it of itensTodos) {
    estimado[it.categoria] = (estimado[it.categoria] || 0) + (Number(it.valorVerba) || 0);
    (itensPorCat[it.categoria] ||= []).push({ descricao: it.descricao, valor: Number(it.valorVerba) || 0, origem: it.origem, fd: it.faturamentoDireto });
  }

  // ── REALIZADO: os pedidos que já consomem verba ──────────────────────────────────────────
  // Mesma regra do resto do portal: CRIADO conta; FD avulso conta já em PENDENTE_OMIE/ERRO
  // (a NF existe, a verba está comprometida); CANCELADO nunca conta.
  const pedidos = await prisma.pedidoOmie.findMany({
    where: {
      OR: [{ cotacao: { rm: { opId } } }, { opId }],
      NOT: { status: "CANCELADO" },
    },
    select: {
      id: true, codigoPedido: true, numeroPedido: true, total: true, status: true,
      criadoManualmente: true, categoriaItem: true, fornecedorNome: true, faturamentoDireto: true,
      cotacao: { select: { rm: { select: { numero: true, categoriasOP: true } } } },
    },
  });
  const consome = (p) => p.status === "CRIADO" || (p.criadoManualmente && (p.status === "PENDENTE_OMIE" || p.status === "ERRO"));
  const valendo = pedidos.filter(consome).map((p) => ({
    ...p,
    rmNumero: p.cotacao?.rm?.numero || null,
    categoriasOP: p.cotacao?.rm?.categoriasOP || [],
  }));

  const rmItens = await prisma.rMItem.findMany({
    where: { pedidoOmieId: { in: valendo.map((p) => p.id) } },
    select: {
      id: true, pedidoOmieId: true, qtd: true,
      opItem: { select: { categoria: true } },
      cotacaoItens: { select: { vencedor: true, precoUnit: true, qtdCotada: true, qtdProposta: true } },
    },
  });
  const { realizado, origem, naoAtribuido, pedidosSemFamilia } = ratearPedidos(valendo, rmItens, estimado);

  // ── FAMÍLIAS: previsto × realizado, lado a lado ──────────────────────────────────────────
  const familias = [...new Set([...Object.keys(estimado), ...Object.keys(realizado)])]
    .map((cat) => {
      const est = estimado[cat] || 0;
      const real = realizado[cat] || 0;
      return {
        categoria: cat,
        label: labelCategoria(cat),
        tipo: getCategoria(cat).tipo,
        estimado: est,
        realizado: real,
        saldo: est - real,
        pct: est > 0 ? (real / est) * 100 : null,
        // sem estimativa e com gasto = compra fora do escopo previsto; é o caso que mais interessa
        semEstimativa: est === 0 && real > 0,
        estourou: est > 0 && real > est,
        itens: itensPorCat[cat] || [],
        pedidos: origem[cat] || [],
      };
    })
    .sort((a, b) => b.estimado - a.estimado || b.realizado - a.realizado);

  const totalEstimado = familias.reduce((s, f) => s + f.estimado, 0);
  const totalRealizado = familias.reduce((s, f) => s + f.realizado, 0) + naoAtribuido;

  // ── RECEITA ──────────────────────────────────────────────────────────────────────────────
  const receitaBruta = op.receitas.reduce((s, r) => s + (r.valor || 0), 0);
  const impostos = op.receitas.reduce((s, r) => {
    const pct = (r.icmsPct || 0) + (r.ipiPct || 0) + (r.pisPct || 0) + (r.cofinsPct || 0) + (r.issPct || 0) + (r.irrfPct || 0) + (r.csllPct || 0);
    return s + (r.valor || 0) * (pct / 100);
  }, 0);
  // etapa 10/20 é romaneio futuro — saldo a faturar, não receita gerada
  const aindaNaoFaturada = (m) => m.etapa === "10" || m.etapa === "20" || /n[ãa]o faturad/i.test(m.status || "");
  const faturado = op.medicoes.filter((m) => !aindaNaoFaturada(m)).reduce((s, m) => s + (m.valorBruto || 0), 0);

  const contrato = op.valorTotalContrato ?? receitaBruta;
  const receita = {
    contrato,
    contratoExplicito: op.valorTotalContrato != null,
    bruta: receitaBruta,
    impostos,
    liquida: receitaBruta - impostos,
    faturado,
    aFaturar: Math.max(0, contrato - faturado),
    faturadoPct: contrato > 0 ? (faturado / contrato) * 100 : null,
  };

  const estudo = custosDoEstudo(op.estudoDados);

  // ── MARGEM: três cenários ────────────────────────────────────────────────────────────────
  // Só a do estudo é "previsão"; as outras duas medem o quanto a obra se afastou dela.
  const margem = {
    estudo: estudo?.margemEstudo ?? null,
    estudoPct: estudo?.margemEstudoPct ?? null,
    // com a verba ESTIMADA — o que a OP prometia no dia em que foi aberta
    prevista: receita.liquida - totalEstimado,
    previstaPct: receita.liquida > 0 ? (receita.liquida - totalEstimado) / receita.liquida : null,
    // com o que JÁ FOI COMPRADO + o saldo ainda por comprar
    corrente: receita.liquida - Math.max(totalEstimado, totalRealizado),
    correntePct: receita.liquida > 0 ? (receita.liquida - Math.max(totalEstimado, totalRealizado)) / receita.liquida : null,
  };

  // ── PONTOS PRA AUDITAR ───────────────────────────────────────────────────────────────────
  // Não são erros: são as perguntas que alguém faria olhando o quadro. Vale mais listá-las
  // aqui do que deixar quem audita descobrir sozinho.
  const alertas = [];
  if (naoAtribuido > 0) alertas.push({ nivel: "atencao", texto: `${pedidosSemFamilia.length} pedido(s) somando ${naoAtribuido.toFixed(2)} não se amarram a nenhuma família — sem item da OP na RM nem categoria no pedido.` });
  for (const f of familias.filter((x) => x.estourou)) alertas.push({ nivel: "alerta", texto: `${f.label}: comprado ${(f.pct).toFixed(0)}% da verba (${(f.realizado - f.estimado).toFixed(2)} acima).` });
  for (const f of familias.filter((x) => x.semEstimativa)) alertas.push({ nivel: "alerta", texto: `${f.label}: houve compra sem verba prevista no contrato.` });
  if (!estudo) alertas.push({ nivel: "info", texto: "OP sem planilha de estudo vinculada — não há custo do Comercial pra comparar." });
  if (!receitaBruta) alertas.push({ nivel: "info", texto: "Sem receitas cadastradas — a margem não pode ser calculada." });
  if (estudo && receitaBruta > 0 && Math.abs(estudo.venda - receitaBruta) > 1) {
    alertas.push({ nivel: "info", texto: `Receita da OP (${receitaBruta.toFixed(2)}) difere da venda do estudo (${estudo.venda.toFixed(2)}) — negociação depois do orçamento.` });
  }
  if (estudo && totalEstimado > 0 && Math.abs(estudo.custoDeCompra - totalEstimado) > 1) {
    alertas.push({ nivel: "info", texto: `Verba dos itens (${totalEstimado.toFixed(2)}) difere do custo de compra do estudo (${estudo.custoDeCompra.toFixed(2)}) — itens editados à mão depois do import.` });
  }

  return {
    op: { numero: op.numero, estudoArquivo: op.estudoArquivo?.nome || op.estudoArquivo || null },
    familias,
    totais: {
      estimado: totalEstimado,
      realizado: totalRealizado,
      saldo: totalEstimado - totalRealizado,
      pct: totalEstimado > 0 ? (totalRealizado / totalEstimado) * 100 : null,
      naoAtribuido,
      pedidosSemFamilia,
    },
    receita,
    estudo,
    margem,
    alertas,
  };
}
