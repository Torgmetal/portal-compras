"use client";
import { useState, useEffect, useCallback } from "react";
import { Scissors, Download, Loader2, AlertCircle, RefreshCw, ChevronLeft, Inbox } from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, adicionarLegenda, downloadWorkbook, CORES } from "@/lib/excel-relatorio";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const SIT_COR = {
  Cortada: "bg-emerald-100 text-emerald-700",
  Parcial: "bg-amber-100 text-amber-700",
  Pendente: "bg-gray-100 text-gray-500",
};

export default function RelatorioCorteClient() {
  const [obras, setObras] = useState([]);
  const [obra, setObra] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const p = new URLSearchParams();
      if (obra) p.set("obra", obra);
      if (de) p.set("de", de);
      if (ate) p.set("ate", ate);
      const res = await fetch(`/api/pcp/relatorio-corte?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      if (obra) { setDetalhe(j); } else { setObras(j.obras || []); setDetalhe(null); }
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [obra, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  async function exportarExcel() {
    const periodo = de || ate ? ` · período ${de || "início"} a ${ate || "hoje"}` : "";
    const hoje = new Date().toISOString().split("T")[0];
    if (detalhe) {
      const headers = ["Peça", "Descrição / Perfil", "Programado", "Cortado", "Saldo", "Situação", "Data do corte", "Máquina", "Operador"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Relatorio de Corte — Obra ${detalhe.obra}`,
        subtitulo: `Pecas programadas e cortadas (Syneco)${periodo}`,
        kpis: [`Programado: ${detalhe.programadoUn} un  |  Cortado: ${detalhe.cortadoUn} un  |  Pecas cortadas: ${detalhe.cortadas}/${detalhe.total}  |  Pendentes: ${detalhe.pendentes}`],
        totalColunas: headers.length,
        nomePlanilha: `Corte ${detalhe.obra}`.slice(0, 31),
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 16 }, { width: 30 }, { width: 11 }, { width: 9 }, { width: 8 }, { width: 11 }, { width: 18 }, { width: 16 }, { width: 16 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      const first = row;
      for (const i of detalhe.itens) {
        const fill = i.situacao === "Cortada" ? CORES.LIGHT_GREEN : i.situacao === "Parcial" ? CORES.LIGHT_ORANGE : undefined;
        const corSit = i.situacao === "Cortada" ? "16A34A" : i.situacao === "Parcial" ? "EA580C" : "9CA3AF";
        adicionarLinhaTabela(ws, row, [i.peca, i.descricao, i.programado, i.cortado, i.saldo, i.situacao, fmtDataHora(i.data), i.maquina, i.operador], {
          fillColor: fill, fontColors: { 5: corSit },
          alinhamento: { 2: "right", 3: "right", 4: "right", 5: "center", 6: "center" },
        });
        row++;
      }
      const last = row - 1;
      adicionarLinhaTotais(ws, row, ["TOTAL", "", { formula: `SUM(C${first}:C${last})` }, { formula: `SUM(D${first}:D${last})` }, { formula: `SUM(E${first}:E${last})` }, "", "", "", ""]);
      row += 2;
      adicionarLegenda(ws, row, [{ cor: CORES.LIGHT_GREEN, label: "Verde = cortada" }, { cor: CORES.LIGHT_ORANGE, label: "Laranja = parcial" }, { cor: "FFFFFF", label: "Branco = pendente" }], headers.length);
      await downloadWorkbook(workbook, `Torg_Corte_${detalhe.obra}_${hoje}.xlsx`);
    } else {
      const headers = ["Obra", "Pecas", "Programado (un)", "Cortado (un)", "% cortado", "Peso cortado (kg)", "Ultimo corte"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Relatorio de Corte — Resumo por obra",
        subtitulo: `Apenas obras com lista (LPC) no portal${periodo}`,
        totalColunas: headers.length,
        nomePlanilha: "Corte (resumo)",
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 12 }, { width: 8 }, { width: 15 }, { width: 13 }, { width: 11 }, { width: 16 }, { width: 14 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      const first = row;
      for (const o of obras) {
        adicionarLinhaTabela(ws, row, [o.obra, o.pecas, o.programadoUn, o.cortadoUn, `${o.pct}%`, o.pesoCortado, fmtData(o.ultima)], {
          alinhamento: { 1: "right", 2: "right", 3: "right", 4: "center", 5: "right" },
        });
        row++;
      }
      const last = row - 1;
      adicionarLinhaTotais(ws, row, ["TOTAL", { formula: `SUM(B${first}:B${last})` }, { formula: `SUM(C${first}:C${last})` }, { formula: `SUM(D${first}:D${last})` }, "", { formula: `SUM(F${first}:F${last})` }, ""]);
      await downloadWorkbook(workbook, `Torg_Corte_Resumo_${hoje}.xlsx`);
    }
  }

  const vazio = detalhe ? !detalhe.itens?.length : !obras.length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Scissors size={20} className="text-torg-blue" /> Relatório de Corte</h1>
          <p className="text-xs text-torg-gray mt-0.5">Peças <strong>programadas</strong> e <strong>cortadas</strong> por obra — situação, data/hora, máquina e operador (Syneco).</p>
        </div>
        <button onClick={exportarExcel} disabled={loading || vazio}
          className="text-sm font-semibold text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 shrink-0">
          <Download size={15} /> Exportar
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4 bg-white border border-gray-100 rounded-xl shadow-sm p-3">
        <select value={obra} onChange={(e) => setObra(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">Todas as obras (resumo)</option>
          {obras.map((o) => <option key={o.obra} value={o.obra}>{o.obra}</option>)}
        </select>
        <label className="text-xs text-torg-gray flex items-center gap-1">De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg text-sm" /></label>
        <label className="text-xs text-torg-gray flex items-center gap-1">Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg text-sm" /></label>
        {(de || ate) && <button onClick={() => { setDe(""); setAte(""); }} className="text-xs text-torg-gray hover:text-torg-dark underline">limpar datas</button>}
        {obra && <button onClick={() => setObra("")} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 ml-auto"><ChevronLeft size={13} /> voltar ao resumo</button>}
      </div>
      {(de || ate) && <p className="text-[11px] text-torg-gray -mt-2 mb-3">Filtro de período mostra só o que foi <strong>cortado</strong> no intervalo (pendentes aparecem sem filtro de data).</p>}

      {loading ? (
        <div className="text-center py-16 text-torg-gray"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="text-center py-16"><AlertCircle size={22} className="mx-auto text-red-500 mb-2" /><p className="text-red-600 text-sm">{erro}</p>
          <button onClick={carregar} className="mt-3 text-sm text-torg-blue inline-flex items-center gap-1"><RefreshCw size={13} /> Tentar novamente</button></div>
      ) : vazio ? (
        <div className="text-center py-16 text-torg-gray"><Inbox size={28} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Nada encontrado{(de || ate) ? " no período." : "."}</p></div>
      ) : detalhe ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Kpi label="Programado" valor={`${detalhe.programadoUn.toLocaleString("pt-BR")} un`} />
            <Kpi label="Cortado" valor={`${detalhe.cortadoUn.toLocaleString("pt-BR")} un`} cor="text-emerald-700" />
            <Kpi label="Peças cortadas" valor={`${detalhe.cortadas} / ${detalhe.total}`} />
            <Kpi label="Pendentes" valor={detalhe.pendentes} cor="text-torg-gray" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[13px] [&_td]:align-top">
              <thead className="bg-gray-50/60"><tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Peça</th>
                <th className="px-3 py-2 font-medium">Descrição / Perfil</th>
                <th className="px-3 py-2 font-medium text-right">Prog.</th>
                <th className="px-3 py-2 font-medium text-right">Cort.</th>
                <th className="px-3 py-2 font-medium text-center">Situação</th>
                <th className="px-3 py-2 font-medium">Data do corte</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Operador</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {detalhe.itens.map((i, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-mono font-medium text-torg-dark whitespace-nowrap">{i.peca}</td>
                    <td className="px-3 py-2 text-torg-gray">{i.descricao}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{i.programado}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{i.cortado}</td>
                    <td className="px-3 py-2 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${SIT_COR[i.situacao] || ""}`}>{i.situacao}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap text-torg-dark">{fmtDataHora(i.data)}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{i.maquina}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{i.operador}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50/60"><tr className="text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Obra</th>
              <th className="px-3 py-2 font-medium text-right">Peças</th>
              <th className="px-3 py-2 font-medium text-right">Programado</th>
              <th className="px-3 py-2 font-medium text-right">Cortado</th>
              <th className="px-3 py-2 font-medium text-right">% cortado</th>
              <th className="px-3 py-2 font-medium text-right">Peso cortado</th>
              <th className="px-3 py-2 font-medium">Último corte</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {obras.map((o) => (
                <tr key={o.obra} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono font-semibold text-torg-dark">{o.obra}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{o.pecas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.programadoUn.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{o.cortadoUn.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{o.pct}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{fmtKg(o.pesoCortado)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-torg-gray">{fmtData(o.ultima)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setObra(o.obra)} className="text-[12px] text-torg-blue hover:text-torg-dark font-medium">ver peças →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor = "text-torg-dark" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-torg-gray uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${cor}`}>{valor}</p>
    </div>
  );
}
