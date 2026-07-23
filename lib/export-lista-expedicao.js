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

  const todas = marcasFiltradas || frentes.flatMap((f) => f.marcas.map((m) => ({ ...m, frente: f.frente })));
  if (!todas.length) throw new Error("Nenhuma marca para exportar.");

  const contratado = frentes.reduce((s, f) => s + (f.pesoContratado || 0), 0);
  const expedido = frentes.reduce((s, f) => s + (f.pesoExpedido || 0), 0);
  const nExp = todas.filter((m) => m.expedido === true).length;
  const opNum = String(op?.numero || "").padStart(3, "0");

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `Lista de Expedição — OP-${opNum}`,
    subtitulo: [op?.obra, op?.cliente, op?.refCliente ? `Ref. ${op.refCliente}` : null, sufixo].filter(Boolean).join(" · "),
    kpis: [
      `${frentes.length} frente(s) · ${todas.length} marcas${marcasFiltradas ? " (filtradas)" : ""} · contratado ${fmtKg(contratado)} · expedido ${fmtKg(expedido)} · faltante ${fmtKg(Math.max(0, contratado - expedido))}`,
      `${nExp} marca(s) já expedida(s) conforme os romaneios emitidos`,
    ],
    totalColunas: 9,
    nomePlanilha: "Lista de Expedição",
    codigoDoc: "REL-EXP-003",
  });

  ws.columns = [{ width: 14 }, { width: 20 }, { width: 32 }, { width: 9 }, { width: 14 }, { width: 15 }, { width: 11 }, { width: 12 }, { width: 14 }];
  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, ["Frente", "Marca", "Descrição", "Qtd", "Peso unit. (kg)", "Peso total (kg)", "Expedido", "Romaneio", "Data expedida"]);
  row++;
  const primeira = row;
  for (const m of todas) {
    adicionarLinhaTabela(ws, row, [
      m.frente, m.marca, m.descricao || "—", m.qte ?? "—",
      m.pesoUnit != null ? Number(m.pesoUnit.toFixed(2)) : "—",
      Number((m.pesoTotal || 0).toFixed(1)),
      m.expedido === true ? "SIM" : m.expedido === false ? "não" : "—",
      m.romaneio || "—",
      m.dataExpedicao ? fmtD(m.dataExpedicao) : "—",
    ], {
      fillColor: m.expedido === true ? "E8F8E8" : undefined,
      alinhamento: { 3: "right", 4: "right", 5: "right", 6: "center", 7: "center", 8: "center" },
    });
    row++;
  }
  adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", { formula: `SUM(F${primeira}:F${row - 1})` }, "", "", ""]);

  await downloadWorkbook(workbook, `Lista_Expedicao_OP-${opNum}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
