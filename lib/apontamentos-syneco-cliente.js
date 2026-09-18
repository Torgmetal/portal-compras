"use client";
// Lado do navegador: pede a lista e baixa a planilha no padrão das planilhas Torg
// (lib/excel-relatorio). As ABAS são montadas por lib/apontamentos-syneco-planilha (pura, testada).
const DATA_BR = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * @param {{ opId?: string|null, setor?: string|null, nome?: string }} p
 * @returns {Promise<{linhas:number, pecas:number, etapaAnterior:object}>}  o que foi para a planilha
 */
export async function baixarPlanilhaApontamentosSyneco({ opId = null, setor = null, nome = "" } = {}) {
  const qs = new URLSearchParams(); if (opId) qs.set("opId", opId); if (setor) qs.set("setor", setor);
  const r = await fetch(`/api/producao/apontamentos-syneco?${qs}`), j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error || "Não consegui montar a lista.");
  const atras = j.etapaAnterior || { linhas: [], total: { linhas: 0, pecas: 0, kg: 0, marcas: 0 } };

  const { planilhaApontamentos } = await import("@/lib/apontamentos-syneco-planilha");
  const { criarExcelTabular } = await import("@/lib/excel-tabular");
  const { downloadWorkbook } = await import("@/lib/excel-relatorio");
  const wb = await criarExcelTabular(planilhaApontamentos({
    portal: j.linhas || [], atras: atras.linhas || [], nome, geradoEm: DATA_BR(j.geradoEm),
  }));
  const dia = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  await downloadWorkbook(wb, `apontamentos-syneco${nome ? "-" + nome.replace(/[^\w-]+/g, "_") : ""}-${dia}.xlsx`);
  return { ...j.total, etapaAnterior: atras.total };
}
