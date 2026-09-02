// Monta o workbook do MAPA DE COTAÇÃO da RM. Separado do componente (que só faz fetch + download)
// pelo mesmo motivo do Resumo FD: dá para gerar a planilha num script e conferir o layout sem
// abrir o portal. Padrão Torg (lib/excel-relatorio.js): cabeçalho ISO 9001, logo, cores da marca.
//
// ⚠⚠ A PLANILHA EXISTE PARA TIRAR UM VIÉS, não para repetir a tela. Vitor (02/09/2026): "mando que
// preciso de uma chapa de 4000, a Soufer não atende, porém o preço unitário dela pode ser melhor
// que do Thiago que vai atender os 4000, mas o preço por kg do Thiago acaba sendo maior e possa
// ser que eu acabe comprando com ele por algum viés".
//
// O viés nasce de comparar TOTAIS. Medido na RM T118-003: a FERALVAREZ somava R$ 290.681 contra
// R$ 654.745 da SOUFER — 55% "mais barata" — atendendo 12 de 30 itens e 37,7% do peso. Por quilo
// líquido a ordem se inverte: 7,49 contra 6,41. Total só é comparável entre propostas que cobrem
// a mesma coisa, e quase nunca cobrem.
import {
  criarRelatorioTorg,
  adicionarHeaderTabela,
  adicionarLinhaTabela,
  adicionarLinhaTotais,
  CORES,
} from "@/lib/excel-relatorio";

// avisos de peso: âmbar = ofertou MAIS que o pedido (sobra que você paga);
// vermelho = ofertou MENOS, sem estoque ou sem preço (falta que a obra sente)
const AMBAR = "FBF0DF", AMBAR_TXT = "9A5B08";
const VERM = "FBE9E9", VERM_TXT = "A32222";
const VERDE = "E3F4EE";               // melhor custo do necessário
const CINZA_PEDIDO = "3A5568";        // faixa do bloco "o que a RM pediu"

const COLS_POR_FORNECEDOR = 6;
const n2 = (v) => (v == null ? "" : Math.round(Number(v) * 100) / 100);
const kg0 = (v) => (v == null ? "" : Math.round(Number(v)));
const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/**
 * @param {object} d resposta de GET /api/compras/rm/[id]/mapa-cotacao
 * @returns {Promise<import("exceljs").Workbook>}
 */
export async function montarMapaCotacaoWorkbook(d) {
  const forn = d.fornecedores || [];
  const itens = d.itens || [];
  const nCols = 5 + forn.length * COLS_POR_FORNECEDOR;

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Mapa de Cotação",
    subtitulo: [`${d.rm.numero}`, d.rm.op && `OP ${d.rm.op}`, d.rm.cliente, d.rm.obra]
      .filter(Boolean).join(" · "),
    kpis: [], totalColunas: nCols, nomePlanilha: "Mapa de cotacao", codigoDoc: "REL-COM-004",
  });
  ws.pageSetup.orientation = "landscape";
  // ⚠ as duas faixas de cabeçalho se repetem em toda folha: com 30 itens e 3 fornecedores a
  // tabela vira duas páginas, e a segunda sem cabeçalho é uma grade de números sem dono.
  ws.pageSetup.printTitlesRow = `1:${linhaInicio + 2}`;
  ws.columns = [
    { width: 5 }, { width: 38 }, { width: 7 }, { width: 6 }, { width: 10 },
    ...forn.flatMap(() => [{ width: 11 }, { width: 8 }, { width: 9 }, { width: 12 }, { width: 12 }, { width: 26 }]),
  ];

  // ── faixa 1: de quem é cada bloco, com o histórico de entrega junto ──
  let row = linhaInicio;
  ws.mergeCells(row, 1, row, 5);
  const cabPed = ws.getCell(row, 1);
  cabPed.value = "O QUE A RM PEDIU";
  cabPed.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  cabPed.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_PEDIDO } };
  cabPed.alignment = { horizontal: "center", vertical: "middle" };

  forn.forEach((f, i) => {
    const c0 = 6 + i * COLS_POR_FORNECEDOR;
    ws.mergeCells(row, c0, row, c0 + COLS_POR_FORNECEDOR - 1);
    const cel = ws.getCell(row, c0);
    const h = f.historico;
    const linha1 = [f.nome, f.prazoPagamento && `pgto ${f.prazoPagamento}`,
      f.numeroProposta && `proposta ${f.numeroProposta}`, f.anexos ? `${f.anexos} anexo(s)` : null]
      .filter(Boolean).join("   ·   ");
    const linha2 = h?.entregues
      ? `entregas: ${h.noPrazo} de ${h.entregues} no prazo${h.atrasoMedio != null ? ` · atraso médio ${h.atrasoMedio} d` : ""}`
      : "sem histórico de entrega";
    cel.value = `${linha1}\n${linha2}`;
    cel.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.TORG_BLUE } };
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(row).height = 30;
  row++;

  adicionarHeaderTabela(ws, row, ["Item", "Descrição", "Compr.", "Qtd", "Peso (kg)",
    ...forn.flatMap(() => ["Peso of. (kg)", "R$/kg", "R$/kg líq.", "Custo do necessário", "Diferença", "Observação / prazo"])]);
  row++;

  const soma = forn.map(() => ({ itens: 0, semEstoque: 0, kgOf: 0, kgAtendido: 0, necessario: 0, compra: 0, mais: 0, menos: 0, comDif: 0 }));
  let kgTotal = 0;

  for (const it of itens) {
    kgTotal += it.pesoKg;
    const vals = [it.ordem, it.descricao, it.comprimento || "—", it.qtd, kg0(it.pesoKg)];

    // ⚠ o melhor é pelo CUSTO DO NECESSÁRIO (líquido), não pelo total da linha: quando o
    // fornecedor oferta peso maior, o total dele sobe sem que ele tenha ficado mais caro.
    const validas = it.celulas.map((c, i) => ({ c, i })).filter((x) => x.c.estado === "ok" && x.c.custoNecessario > 0);
    const melhor = validas.length ? validas.reduce((a, b) => (b.c.custoNecessario < a.c.custoNecessario ? b : a)) : null;

    it.celulas.forEach((c, i) => {
      const s = soma[i];
      if (c.estado !== "ok") {
        if (c.estado === "sem estoque") s.semEstoque++;
        vals.push("", "", "", "", c.estado, c.observacao || "");
        return;
      }
      s.itens++; s.kgOf += c.kgOfertado; s.kgAtendido += c.kgPedido;
      s.necessario += c.custoNecessario; s.compra += c.valorCompra;
      if (c.diferencaKg > 0) { s.mais += c.diferencaKg; s.comDif++; }
      else if (c.diferencaKg < 0) { s.menos += -c.diferencaKg; s.comDif++; }
      vals.push(kg0(c.kgOfertado), n2(c.rkgBruto), n2(c.rkgLiquido), kg0(c.custoNecessario),
        c.diferencaKg > 0 ? `+${kg0(c.diferencaKg)} kg` : c.diferencaKg < 0 ? `${kg0(c.diferencaKg)} kg` : "igual",
        [c.prazoEntrega && `entrega ${fmtD(c.prazoEntrega)}`, c.observacao].filter(Boolean).join(" · "));
    });

    adicionarLinhaTabela(ws, row, vals, { fontSize: 9, rowHeight: 17,
      alinhamento: { 0: "center", 2: "center", 3: "center", 4: "right" } });

    // verde nas colunas do PREÇO; as cores do peso ficam com as colunas do peso, para os dois
    // avisos não disputarem a mesma célula (um responde "é o mais barato?", o outro "é o que pedi?")
    if (melhor) {
      for (const cc of [8, 9].map((n) => n + melhor.i * COLS_POR_FORNECEDOR)) {
        ws.getCell(row, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      }
    }
    it.celulas.forEach((c, i) => {
      const cPeso = 6 + i * COLS_POR_FORNECEDOR, cDif = 10 + i * COLS_POR_FORNECEDOR;
      if (c.estado !== "ok") {
        ws.getCell(row, cDif).font = { name: "Arial", size: 9, italic: true, color: { argb: VERM_TXT } };
        return;
      }
      if (!c.diferencaKg) return;
      const bg = c.diferencaKg > 0 ? AMBAR : VERM;
      const tx = c.diferencaKg > 0 ? AMBAR_TXT : VERM_TXT;
      for (const cc of [cPeso, cDif]) {
        ws.getCell(row, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        ws.getCell(row, cc).font = { name: "Arial", size: 9, bold: true, color: { argb: tx } };
      }
    });
    row++;
  }

  adicionarLinhaTotais(ws, row, ["", `${itens.length} item(ns)`, "", "", kg0(kgTotal),
    ...soma.flatMap((s) => [kg0(s.kgOf), "", s.kgAtendido > 0 ? n2(s.necessario / s.kgAtendido) : "",
      kg0(s.necessario),
      s.mais || s.menos ? `${s.mais ? `+${kg0(s.mais)}` : ""}${s.menos ? ` −${kg0(s.menos)}` : ""} kg` : "igual", ""])],
    { fontSize: 9, rowHeight: 20, alinhamento: { 4: "right" } });
  row += 1;

  ws.mergeCells(row, 1, row, nCols);
  const leg = ws.getCell(row, 1);
  leg.value = "Legenda:   verde = melhor custo do necessário (líquido, já com crédito de ICMS)   ·   âmbar = fornecedor ofertou peso MAIOR que o pedido (a sobra entra na compra)   ·   vermelho = ofertou peso MENOR, sem estoque ou sem preço"
    + "\nR$/kg = valor da nota (bruto + IPI) ÷ peso pedido   ·   R$/kg líq. = custo Torg após o crédito de ICMS   ·   Custo do necessário = R$/kg líq. × o peso que a obra precisa (é por ele que os fornecedores se comparam)";
  leg.font = { name: "Arial", size: 8, italic: true, color: { argb: "576D7E" } };
  leg.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(row).height = 28;
  row += 2;

  // ── resumo por fornecedor: é aqui que a cobertura aparece ──
  adicionarHeaderTabela(ws, row, ["Fornecedor", "Atende", "Sem estoque", "Itens c/ peso dif.",
    "Peso necessário (kg)", "Peso a comprar (kg)", "Sobra (kg)", "R$/kg líq.", "Custo do necessário",
    "Valor da compra", "Entregas no prazo", "Atraso médio", "Prazo pgto", "Proposta", "Anexos",
    ...Array(Math.max(0, nCols - 15)).fill("")].slice(0, nCols));
  row++;

  forn.forEach((f, i) => {
    const s = soma[i], h = f.historico;
    adicionarLinhaTabela(ws, row, [f.nome, `${s.itens} de ${itens.length}`, s.semEstoque || "—",
      s.comDif || "—", kg0(s.kgAtendido), kg0(s.kgOf), s.mais ? `+${kg0(s.mais)}` : "—",
      s.kgAtendido > 0 ? n2(s.necessario / s.kgAtendido) : "—", kg0(s.necessario), kg0(s.compra),
      h?.entregues ? `${h.noPrazo} de ${h.entregues}` : "—",
      h?.atrasoMedio != null ? `${h.atrasoMedio} d` : "—",
      f.prazoPagamento || "—", f.numeroProposta || "—", f.anexos || "—",
      ...Array(Math.max(0, nCols - 15)).fill("")].slice(0, nCols),
      { fontSize: 9, rowHeight: 18,
        alinhamento: { 1: "center", 2: "center", 3: "center", 4: "right", 5: "right", 6: "center",
                       7: "right", 8: "right", 9: "right", 10: "center", 11: "center", 14: "center" } });
    if (s.comDif) for (const cc of [4, 6, 7]) ws.getCell(row, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBAR } };
    // ⚠ pinta a pontualidade abaixo de 50%, mas NÃO veta: o próprio número está sob suspeita
    // (ver a ressalva na rota) e o aviso embaixo explica isso a quem lê a folha impressa.
    if (h?.entregues && h.noPrazo / h.entregues < 0.5) {
      for (const cc of [11, 12]) ws.getCell(row, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERM } };
    }
    row++;
  });
  row += 1;

  ws.mergeCells(row, 1, row, nCols);
  const avisoHist = ws.getCell(row, 1);
  avisoHist.value = "Entregas no prazo: comparação entre a data prometida e a real dos pedidos anteriores deste fornecedor. Serve para planejar, não para vetar — o prazo previsto costuma ser gravado como a data que pedimos e nem sempre é renegociado.";
  avisoHist.font = { name: "Arial", size: 8, italic: true, color: { argb: "576D7E" } };
  avisoHist.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(row).height = 18;
  row += 2;

  // ── ressalvas escritas por cada fornecedor: é onde vêm "frete FOB", "sujeito a estoque" ──
  const comObs = forn.filter((f) => f.observacao);
  if (comObs.length) {
    ws.mergeCells(row, 1, row, nCols);
    const t = ws.getCell(row, 1);
    t.value = "OBSERVAÇÕES DA PROPOSTA";
    t.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_PEDIDO } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(row).height = 18;
    row++;
    for (const f of comObs) {
      ws.mergeCells(row, 1, row, nCols);
      const c = ws.getCell(row, 1);
      c.value = `${f.nome}: ${f.observacao}`;
      c.font = { name: "Arial", size: 8.5, color: { argb: "3A5568" } };
      c.alignment = { wrapText: true, vertical: "top", indent: 1 };
      ws.getRow(row).height = Math.min(46, 16 + Math.floor(f.observacao.length / 160) * 12);
      row++;
    }
  }

  return workbook;
}
