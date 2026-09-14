"use client";
// Lado do navegador: pede a lista e baixa a planilha no padrão das planilhas Torg (lib/excel-relatorio).
const DATA_BR = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * @param {{ opId?: string|null, setor?: string|null, nome?: string }} p
 * @returns {Promise<{linhas:number, pecas:number}>}  o que foi para a planilha
 */
export async function baixarPlanilhaApontamentosSyneco({ opId = null, setor = null, nome = "" } = {}) {
  const qs = new URLSearchParams(); if (opId) qs.set("opId", opId); if (setor) qs.set("setor", setor);
  const r = await fetch(`/api/producao/apontamentos-syneco?${qs}`), j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error || "Não consegui montar a lista.");
  const headers = ["Obra (Syneco)", "OP", "Setor (Syneco)", "Marca", "Descrição", "Perfil", "Qtd da marca", "No portal", "No Syneco", "A lançar", "Peso a lançar (kg)", "Baixado por", "Baixado em"];
  const linhas = j.linhas.map((l) => [l.obraSyneco || "", l.opNumero || "", l.setorSyneco, l.marca, l.descricao || "", l.perfil || "", l.qte, l.noPortal, l.noSyneco, l.aLancar, l.pesoALancarKg, l.baixadoPor || "", DATA_BR(l.baixadoEm)]);
  const { criarExcelTabular } = await import("@/lib/excel-tabular");
  const { downloadWorkbook } = await import("@/lib/excel-relatorio");
  const wb = await criarExcelTabular({
    titulo: "Apontamentos para lançar no Syneco",
    subtitulo: `${nome ? nome + " · " : ""}${j.total.pecas} peça(s) em ${j.total.linhas} marca(s) · gerado em ${DATA_BR(j.geradoEm)} — o portal deu baixa, o Syneco ainda não tem`,
    abas: [{ nome: "A lançar", headers, linhas, larguras: [14, 8, 14, 16, 30, 16, 12, 10, 10, 10, 16, 20, 16] }],
  });
  const dia = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  await downloadWorkbook(wb, `apontamentos-syneco${nome ? "-" + nome.replace(/[^\w-]+/g, "_") : ""}-${dia}.xlsx`);
  return j.total;
}
