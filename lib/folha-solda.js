// ─── A PLANILHA DA SOLDA ──────────────────────────────────────────────────────
// Vitor (01/09/2026): "precisa apenas gerar a planilha para o líder e para cada bancada de solda".
//
// Uma folha de RESUMO na frente (o líder confere o que distribuiu de bater o olho) e uma folha por
// bancada atrás (ele destaca e entrega). Formato da folha do montador: retrato, fonte 13, uma
// bancada por página, cabeçalho repetido em toda folha.
//
// ⚠⚠ MORA NUMA LIB PORQUE TEM DOIS CHAMADORES. O painel gera a partir da repartição que acabou de
// calcular; a tela gera a partir do que JÁ ESTÁ GRAVADO nas bancadas. Vitor liberou 11 conjuntos e
// ficou sem a planilha — o botão que gravava limpava a seleção, o painel sumia e a folha ia junto.
// Com a lib, a tela consegue emitir depois, sem depender de haver seleção.
//
// ⚠ NÃO EMITE GRD. A GRD prova que o DESENHO desceu, e ele desceu na montagem com o R carimbado.
// Emitir de novo na solda criaria uma segunda GRD para a mesma marca — uma liberação que não
// aconteceu, dentro de um documento de auditoria.

const fmtDiaBR = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  const s = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${s} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};
// ⚠⚠ QUANTIDADE E PESO DO QUE FALTA. Vitor (01/09/2026): conjunto de 4 peças com 3 já soldadas
// saía na folha mandando soldar 4. Onde o chamador informa o pendente, é ele que vale.
const un1 = (x) => (x?.qtePendente != null ? Math.max(0, Number(x.qtePendente) || 0) : Math.max(1, Number(x?.qte) || 1));
const kg0 = (x) => (x?.pesoPendenteKg != null ? Number(x.pesoPendenteKg) || 0 : Number(x?.pesoTotalKg) || 0);
// ⚠ e o soldador precisa SABER que é sobra: sem isso ele lê "1" onde o desenho diz 4 e vai procurar
// as outras três.
const desc = (x) => {
  const q = Math.max(1, Number(x?.qte) || 1);
  const p = x?.qtePendente != null ? Number(x.qtePendente) : q;
  const base = x?.descricao || "";
  return p < q ? `${base}  (faltam ${p} de ${q})` : base;
};

/**
 * @param {{bancada: string, itens: any[], dias?: {dia: string, itens: any[]}[]}[]} grupos
 * @param {{subtitulo?: string, nomeArquivo?: string}} [opts]
 */
export async function gerarFolhaSolda(grupos, opts = {}) {
  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais,
          downloadWorkbook, CORES } = await import("@/lib/excel-relatorio");

  const usaveis = (grupos || []).filter((g) => (g.itens || []).length);
  if (!usaveis.length) throw new Error("Nenhum conjunto para a planilha.");

  const todos = usaveis.flatMap((g) => g.itens);
  const ops = [...new Set(todos.map((c) => c.opNumero || c.op?.numero).filter(Boolean))];
  // ⚠ coluna OP só quando o lote mistura obras: com uma só ela é redundante e rouba a largura da
  // descrição, que é o que o soldador lê de longe.
  const varias = ops.length > 1;
  const nCols = varias ? 7 : 6;

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Ordem de Solda",
    subtitulo: opts.subtitulo || `${ops.map((o) => `OP ${o}`).join(", ")}`,
    kpis: [], totalColunas: nCols, nomePlanilha: "Ordem de solda", codigoDoc: "REL-PRD-012",
  });
  // ⚠⚠ RETRATO COM 6 COLUNAS, PAISAGEM COM 7. A folha existe para ser lida em pé, de longe, com
  // fonte 13 — e `fitToWidth: 1` encolhe a página inteira para caber na largura. Com a coluna da OP
  // a mais, o retrato só cabia reduzindo a ~80%, o que devolvia a letra ao tamanho de antes e
  // matava o motivo da folha existir. Deitada, os mesmos 13pt saem em tamanho real.
  ws.pageSetup.orientation = varias ? "landscape" : "portrait";
  ws.pageSetup.printTitlesRow = `1:${linhaInicio}`;
  // ⚠⚠ AS DUAS TABELAS DIVIDEM AS MESMAS LARGURAS. Vitor (01/09/2026): "as planilhas dos soldadores
  // continua igual" — e a foto mostrou "Conjuntos" saindo como "Conjun".
  //
  // A folha do líder (Bancada · Conjuntos · Pecas · Peso · Dias) e a folha do soldador (Dia · OP ·
  // Marca · Descricao · Qte · Peso · Feito) são tabelas DIFERENTES na MESMA aba — e uma aba só tem
  // um jogo de larguras. A coluna 2 media 9 para caber "OP" e cortava "Conjuntos"; a 1 media 12
  // para "Dia" e apertava "SOLDA 2".
  //
  // Cada coluna passa a ter o MAIOR dos dois usos. E "Quando" saiu do resumo: o intervalo de datas
  // pedia 24 de largura na coluna do Peso, e essas datas já estão em cada folha de bancada — pagar
  // o dobro da largura para repetir informação era o pior dos dois mundos.
  const larg = (a, b) => ({ width: Math.max(a, b) });
  ws.columns = varias
    // ⚠ marca cabe em 16 ("71811869", "T97A118"); os 3 que sobram vão para a descrição, que é onde
    // o texto realmente estoura — "ESTRUTURA 01 H3000  (faltam 1 de 4)" pede 36.
    ? [larg(12, 14), larg(9, 10), larg(16, 8), larg(38, 12), larg(8, 7), { width: 12 }, { width: 11 }]
    // ⚠⚠ LARGURA APERTADA NO RETRATO, e por um motivo que não é estético. `fitToPage`/`fitToWidth: 1`
    // encolhe a página inteira para caber na largura do papel: com 111 de largura em A4 retrato
    // (~88 úteis) a folha saía a 79%, e a fonte 13 chegava ao papel como 10 — exatamente o tamanho
    // que a folha existe para não ter. Cortando o que sobrava (a marca cabe em 12, "71811869"), a
    // largura cai para 91 e a escala vai a ~97%: o 13 sai 13.
    : [larg(11, 14), larg(12, 10), larg(36, 8), larg(11, 12), larg(11, 7), { width: 10 }];

  const grande = (linha) => { for (let c = 1; c <= nCols; c++) ws.getCell(linha, c).font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFF" } }; ws.getRow(linha).height = 30; };

  // ── folha do líder ──
  let row = linhaInicio;
  const cabResumo = ["Bancada", "Conjuntos", "Pecas", "Peso (kg)", "Dias", ""].slice(0, nCols);
  adicionarHeaderTabela(ws, row, cabResumo); grande(row); row++;
  let sN = 0, sUn = 0, sKg = 0;
  for (const g of usaveis) {
    const u = g.itens.reduce((s, x) => s + un1(x), 0), k = g.itens.reduce((s, x) => s + kg0(x), 0);
    sN += g.itens.length; sUn += u; sKg += k;
    const dias = g.dias || [];
    adicionarLinhaTabela(ws, row, [g.bancada, g.itens.length, u, Math.round(k), dias.length || "", ""].slice(0, nCols),
      { fontSize: 13, rowHeight: 26, alinhamento: { 1: "center", 2: "center", 3: "center", 4: "center" } });
    row++;
  }
  adicionarLinhaTotais(ws, row, ["TOTAL", sN, sUn, Math.round(sKg), "", ""].slice(0, nCols),
    { fontSize: 13, rowHeight: 28, alinhamento: { 1: "center", 2: "center", 3: "center", 4: "center" } });
  row += 2;
  ws.getRow(row - 1).addPageBreak();

  // ── uma folha por bancada ──
  adicionarHeaderTabela(ws, row, varias
    ? ["Dia", "OP", "Marca", "Descricao", "Qte", "Peso (kg)", "Feito"]
    : ["Dia", "Marca", "Descricao", "Qte", "Peso (kg)", "Feito"]);
  grande(row); row++;

  for (const [iB, g] of usaveis.entries()) {
    // com dias, cada item leva o SEU dia; sem dias (vindo do que já está gravado), a coluna fica vazia
    const itens = g.dias?.length
      ? g.dias.flatMap((d) => d.itens.map((it) => ({ ...it, _dia: d.dia })))
      : g.itens.map((it) => ({ ...it, _dia: null }));
    const u = itens.reduce((s, x) => s + un1(x), 0), k = itens.reduce((s, x) => s + kg0(x), 0);

    ws.mergeCells(row, 1, row, nCols);
    const cab = ws.getCell(row, 1);
    cab.value = `${g.bancada}      ${u} peca(s)      ${Math.round(k).toLocaleString("pt-BR")} kg`;
    cab.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFF" } };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.TORG_BLUE } };
    cab.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(row).height = 34;
    row++;

    const centro = varias ? { 0: "center", 1: "center", 4: "center", 5: "center", 6: "center" }
                          : { 0: "center", 3: "center", 4: "center", 5: "center" };
    for (const it of itens) {
      adicionarLinhaTabela(ws, row, varias
        ? [fmtDiaBR(it._dia), it.opNumero || it.op?.numero || "", it.marca, desc(it), un1(it), Math.round(kg0(it)), ""]
        : [fmtDiaBR(it._dia), it.marca, desc(it), un1(it), Math.round(kg0(it)), ""],
        { fontSize: 13, rowHeight: 26, alinhamento: centro });
      row++;
    }
    adicionarLinhaTotais(ws, row, varias
      ? ["", "", `${itens.length} conjunto(s)`, "", u, Math.round(k), ""]
      : ["", `${itens.length} conjunto(s)`, "", u, Math.round(k), ""],
      { fontSize: 13, rowHeight: 28, alinhamento: centro });
    row += 2;
    if (iB < usaveis.length - 1) ws.getRow(row - 1).addPageBreak();
  }

  await downloadWorkbook(workbook, opts.nomeArquivo || `Ordem de solda - ${ops.join("-")}.xlsx`);
}
