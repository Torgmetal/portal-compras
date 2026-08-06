// Export client-side da planilha "Faltantes por setor" (matriz peça × setor), padrão Torg.
// Usado na aba Produção do detalhe da OP e na aba Produção/Peso do cronograma.
// `pecas` = itens da API /api/comercial/op/[id]/producao (cada um com .setor atual e .tipoPeca).
//
// ROTA por tipo (regra do Vitor): o CROQUI (P) só passa pelo CORTE — depois vira conjunto na
// montagem; o CONJUNTO segue MONTAGEM→SOLDA→ACABAMENTO→JATO→PINTURA (não passa pelo corte, que é
// dos croquis); a AVULSA (solo) é cortada e pula montagem/solda (corte→acabamento→jato→pintura).
// Nas etapas fora da rota da peça a célula fica "—" (N/A).
const ETAPA_L = { PENDENTE: "Não iniciada", CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido" };
const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const SETORES_FAB = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

const tipoLabel = (t) => (t === "CROQUI" ? "Croqui" : t === "CONJUNTO" ? "Conjunto" : "Avulsa");
const rotaDaPeca = (t) =>
  t === "CROQUI" ? ["CORTE"]
    : t === "CONJUNTO" ? ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"]
      : ["CORTE", "ACABAMENTO", "JATO", "PINTURA"]; // avulsa/solo pula montagem e solda

export async function exportarFaltantesPorSetor({ pecas, pesoTotal, temSyneco, opNumero, obra, cliente, refCliente }) {
  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } = await import("@/lib/excel-relatorio");
  if (!pecas?.length) throw new Error("Nada para exportar.");
  const opNum = String(opNumero || "").padStart(3, "0");
  const idx = (s) => ORDEM.indexOf(s);
  const faltaNo = (p, setor) => idx(p.setor) < idx(setor); // ainda não passou por esse setor
  const naRota = (p, setor) => rotaDaPeca(p.tipoPeca).includes(setor);
  // total faltando por setor: só as peças cuja ROTA inclui o setor.
  const resumoFalta = SETORES_FAB.map((s) => { const f = pecas.filter((p) => naRota(p, s) && faltaNo(p, s)); return { setor: s, qtd: f.length, kg: f.reduce((x, p) => x + (p.pesoTotal || 0), 0) }; });
  const kpi = resumoFalta.map((r) => `${ETAPA_L[r.setor]}: ${r.qtd} (${Math.round(r.kg).toLocaleString("pt-BR")}kg)`).join(" · ");

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `Peças faltantes por setor — OP-${opNum}`,
    subtitulo: [obra, cliente, refCliente ? `Ref. ${refCliente}` : null].filter(Boolean).join(" · "),
    kpis: [`${pecas.length} peças · ${fmtKg(pesoTotal)}`, `Faltam — ${kpi}`, temSyneco ? null : "⚠ Sem apontamento do Syneco nesta OP — não reflete a produção real."].filter(Boolean),
    totalColunas: 5 + SETORES_FAB.length + 1,
    nomePlanilha: "Faltantes por setor",
    codigoDoc: "REL-PRD-006",
  });
  ws.columns = [{ width: 20 }, { width: 30 }, { width: 11 }, { width: 8 }, { width: 13 }, ...SETORES_FAB.map(() => ({ width: 12 })), { width: 14 }];
  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, ["Marca", "Descrição", "Tipo", "Qtd", "Peso (kg)", ...SETORES_FAB.map((s) => ETAPA_L[s]), "Situação"]);
  row++;
  const primeira = row;
  const alinCentro = Object.fromEntries([[3, "right"], [4, "right"], [5 + SETORES_FAB.length, "center"]].concat(SETORES_FAB.map((_, i) => [5 + i, "center"])).concat([[2, "center"]]));
  for (const p of pecas) {
    adicionarLinhaTabela(ws, row, [
      p.marca, p.descricao || "—", tipoLabel(p.tipoPeca), p.qte ?? "—", Number((p.pesoTotal || 0).toFixed(2)),
      ...SETORES_FAB.map((s) => (!naRota(p, s) ? "—" : faltaNo(p, s) ? "Falta" : "OK")),
      ETAPA_L[p.setor] || ETAPA_L.PENDENTE,
    ], { alinhamento: alinCentro });
    row++;
  }
  adicionarLinhaTotais(ws, row, ["Faltam (peças)", "", "", "", "", ...resumoFalta.map((r) => r.qtd), ""]);
  row++;
  adicionarLinhaTotais(ws, row, ["Faltam (kg)", "", "", "", "", ...resumoFalta.map((r) => Math.round(r.kg)), ""]);
  await downloadWorkbook(workbook, `Faltantes-por-setor_OP-${opNum}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
