"use client";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, downloadWorkbook,
} from "@/lib/excel-relatorio";

const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const fmtDataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
// Datas do Syneco são BRT gravadas como UTC-naïve → formata em UTC p/ mostrar a hora "de relógio".
const fmtHora = (h) => (h ? new Date(h).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "—");

/**
 * Botão "Relatório do dia" — peças feitas no dia num setor, dos apontamentos do
 * Syneco. Gera um Excel (padrão Torg). Reutilizável em qualquer aba de setor.
 * @param {string} setor - Nome do setor no Syneco (ex.: "Corte", "Montagem", "Solda"…)
 * @param {string} [codigoDoc] - Código ISO do relatório
 */
export default function BotaoRelatorioDia({ setor, codigoDoc = "REL-PRD-010" }) {
  const [data, setData] = useState(hojeBRT());
  const [loading, setLoading] = useState(false);

  async function gerar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/producao/relatorio-dia?setor=${encodeURIComponent(setor)}&data=${data}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erro ${res.status}`);
      if (!j.itens.length) {
        alert(`Nenhuma peça feita em ${fmtDataBR(data)} no setor ${setor}.`);
        return;
      }

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Peças feitas no dia — ${setor}`,
        subtitulo: fmtDataBR(data),
        kpis: [`${j.totais.itens} apontamento(s)  |  ${j.totais.un.toLocaleString("pt-BR")} un  |  ${Math.round(j.totais.kg).toLocaleString("pt-BR")} kg`],
        totalColunas: 7,
        nomePlanilha: setor,
        codigoDoc,
      });
      ws.columns = [{ width: 8 }, { width: 14 }, { width: 34 }, { width: 16 }, { width: 18 }, { width: 9 }, { width: 12 }];

      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Hora", "Obra", "Item / Peça", "Máquina", "Operador", "Qtd", "Peso (kg)"]);
      row++;
      for (const it of j.itens) {
        adicionarLinhaTabela(ws, row, [fmtHora(it.hora), it.obra, it.item, it.maquina, it.operador, it.un, Math.round(it.kg)], {
          alinhamento: { 5: "right", 6: "right" },
        });
        row++;
      }
      adicionarLinhaTotais(ws, row, ["", "", `TOTAL — ${j.totais.itens} item(ns)`, "", "", j.totais.un, Math.round(j.totais.kg)]);

      await downloadWorkbook(workbook, `Relatorio dia ${setor} ${data}.xlsx`);
    } catch (e) {
      alert("Falha ao gerar o relatório: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={data}
        max={hojeBRT()}
        onChange={(e) => setData(e.target.value)}
        title="Dia do relatório"
        className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-dark focus:ring-2 focus:ring-torg-blue/20 outline-none"
      />
      <button
        onClick={gerar}
        disabled={loading}
        title="Baixar Excel com as peças feitas neste dia (apontamentos do Syneco)"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
        Relatório do dia
      </button>
    </div>
  );
}
