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
  const linhas = j.linhas.map((l) => [l.obraSyneco || "—", l.opNumero || "", l.setorSyneco, l.marca, l.descricao || "", l.perfil || "", l.qte, l.noPortal, l.noSyneco, l.aLancar, l.pesoALancarKg, l.baixadoPor || "", DATA_BR(l.baixadoEm)]);
  const { criarExcelTabular } = await import("@/lib/excel-tabular");
  const { downloadWorkbook } = await import("@/lib/excel-relatorio");
  // ⚠ SEGUNDA ABA: o furo que o próprio Syneco denuncia — peça apontada à frente prova que passou
  // pelos setores de trás. Vitor (17/09/2026): "se a peça estava apontada na pintura já indicava que
  // tinha que dar baixa nos setores anteriores". É outra origem, então é outra aba: a primeira parte
  // da baixa do portal, esta parte do apontamento do Syneco.
  const atras = j.etapaAnterior || { linhas: [], total: { linhas: 0, pecas: 0, kg: 0, marcas: 0 } };
  const headersAtras = ["Setor a lançar", "Obra (Syneco)", "OP", "Marca", "Descrição", "Apontado hoje", "A lançar", "Peso a lançar (kg)", "Prova (apontamento à frente)"];
  const linhasAtras = atras.linhas.map((l) => [l.setorSyneco, l.obraSyneco || "—", l.opNumero || "", l.marca, l.descricao || "", l.apontado, l.aLancar, l.pesoALancarKg, l.prova]);

  const wb = await criarExcelTabular({
    titulo: "Apontamentos para lançar no Syneco",
    subtitulo: `${nome ? nome + " · " : ""}${j.total.pecas} peça(s) em ${j.total.linhas} marca(s) · gerado em ${DATA_BR(j.geradoEm)} — aba 1: baixa feita pelo setor no portal · aba 2: ${atras.total.linhas} lançamento(s) que o apontamento à frente já prova`,
    abas: [
      { nome: "Baixa do portal", headers, linhas, larguras: [14, 8, 14, 16, 30, 16, 12, 10, 10, 10, 16, 20, 16] },
      { nome: "Setores anteriores", headers: headersAtras, linhas: linhasAtras, larguras: [15, 14, 8, 18, 30, 14, 10, 16, 30] },
    ],
  });
  const dia = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  await downloadWorkbook(wb, `apontamentos-syneco${nome ? "-" + nome.replace(/[^\w-]+/g, "_") : ""}-${dia}.xlsx`);
  return { ...j.total, etapaAnterior: atras.total };
}
