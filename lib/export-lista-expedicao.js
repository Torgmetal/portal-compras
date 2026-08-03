// Export da Lista de Expedição no padrão das planilhas do portal
// ([[torg_excel_padrao]]). Usado na aba Engenharia e na consulta do Planejamento.
// Browser-side (excel-relatorio busca o logo e importa exceljs dinamicamente).

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// timeZone UTC: a data vem do serial do Excel (meia-noite UTC) — sem isso o
// fuso -03 joga a data um dia pra trás.
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/**
 * @param {object} p
 * @param {{numero,obra,cliente,refCliente}} p.op
 * @param {Array<{frente,pesoContratado,pesoExpedido,marcas:Array}>} p.frentes
 * @param {Array} [p.marcasFiltradas] só estas marcas (respeita o filtro da tela)
 * @param {string} [p.sufixo] texto extra no subtítulo (ex.: "filtro: pendentes")
 */
export async function exportarListaExpedicao({ op, frentes, marcasFiltradas, sufixo }) {
  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } = await import("@/lib/excel-relatorio");
  const { ordenarACNoFim } = await import("@/lib/marca-ac");

  const base = marcasFiltradas || frentes.flatMap((f) => f.marcas.map((m) => ({ ...m, frente: f.frente })));
  if (!base.length) throw new Error("Nenhuma marca para exportar.");
  const todas = ordenarACNoFim(base, (m) => m.marca); // itens AC (aço comercial) sempre no fim

  // Expedido por marca = quantidade dos romaneios emitidos; peso proporcional.
  const totQ = (m) => (Number(m.qte) > 0 ? Number(m.qte) : null);
  const expQ = (m) => Math.max(0, Number(m.expedidoQtd) || 0);
  const unitPeso = (m) => { const t = totQ(m); return t ? (m.pesoTotal || 0) / t : 0; };

  const contratado = frentes.reduce((s, f) => s + (f.pesoContratado || 0), 0);
  const expedido = todas.reduce((s, m) => s + unitPeso(m) * expQ(m), 0);
  const nFull = todas.filter((m) => { const t = totQ(m); return t != null && t > 0 && expQ(m) >= t; }).length;
  const nParcial = todas.filter((m) => { const t = totQ(m), e = expQ(m); return e > 0 && (t == null || e < t); }).length;
  const opNum = String(op?.numero || "").padStart(3, "0");

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `Lista de Expedição — OP-${opNum}`,
    subtitulo: [op?.obra, op?.cliente, op?.refCliente ? `Ref. ${op.refCliente}` : null, sufixo].filter(Boolean).join(" · "),
    kpis: [
      `${frentes.length} frente(s) · ${todas.length} marcas${marcasFiltradas ? " (filtradas)" : ""} · contratado ${fmtKg(contratado)} · expedido ${fmtKg(expedido)} · faltante ${fmtKg(Math.max(0, contratado - expedido))}`,
      `${nFull} marca(s) totalmente expedida(s) · ${nParcial} parcial(is), conforme os romaneios emitidos`,
    ],
    totalColunas: 11,
    nomePlanilha: "Lista de Expedição",
    codigoDoc: "REL-EXP-003",
  });

  ws.columns = [{ width: 14 }, { width: 20 }, { width: 30 }, { width: 8 }, { width: 13 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 13 }];
  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, ["Frente", "Marca", "Descrição", "Qtd", "Peso unit. (kg)", "Peso total (kg)", "Expedido", "Pendente", "Situação", "Romaneio", "Data expedida"]);
  row++;
  const primeira = row;
  for (const m of todas) {
    const tot = totQ(m), exp = expQ(m);
    const pend = tot != null ? Math.max(0, tot - exp) : null;
    const sit = tot != null && tot > 0 && exp >= tot ? "Expedida" : exp > 0 ? "Parcial" : "Pendente";
    adicionarLinhaTabela(ws, row, [
      m.frente, m.marca, m.descricao || "—", m.qte ?? "—",
      m.pesoUnit != null ? Number(m.pesoUnit.toFixed(2)) : "—",
      Number((m.pesoTotal || 0).toFixed(1)),
      exp, pend ?? "—", sit,
      m.romaneio || "—",
      m.dataExpedicao ? fmtD(m.dataExpedicao) : "—",
    ], {
      fillColor: sit === "Expedida" ? "E8F8E8" : sit === "Parcial" ? "FFF4E5" : undefined,
      alinhamento: { 3: "right", 4: "right", 5: "right", 6: "right", 7: "right", 8: "center", 9: "center", 10: "center" },
    });
    row++;
  }
  adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", { formula: `SUM(F${primeira}:F${row - 1})` }, { formula: `SUM(G${primeira}:G${row - 1})` }, { formula: `SUM(H${primeira}:H${row - 1})` }, "", "", ""]);

  await downloadWorkbook(workbook, `Lista_Expedicao_OP-${opNum}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
