"use client";
import { useState, useEffect, useCallback } from "react";
import { Scissors, Download, Loader2, AlertCircle, RefreshCw, ChevronLeft, Inbox } from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

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

  function exportarCSV() {
    let linhas, nome;
    if (detalhe) {
      nome = `corte_${detalhe.obra}.csv`;
      linhas = [["Peça", "Descrição / Perfil", "Qte", "Peso (kg)", "Data do corte", "Máquina", "Operador"],
        ...detalhe.itens.map((i) => [i.peca, i.descricao, i.un, i.kg, fmtDataHora(i.data), i.maquina, i.operador])];
    } else {
      nome = "corte_resumo.csv";
      linhas = [["Obra", "Peças cortadas", "Peso (kg)", "Apontamentos", "Último corte"],
        ...obras.map((o) => [o.obra, o.pecas, o.kg, o.apontamentos, fmtData(o.ultima)])];
    }
    const csv = "﻿" + linhas.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nome;
    a.click();
  }

  const vazio = detalhe ? !detalhe.itens?.length : !obras.length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Scissors size={20} className="text-torg-blue" /> Relatório de Corte</h1>
          <p className="text-xs text-torg-gray mt-0.5">Rastreabilidade das peças cortadas por obra — data/hora, máquina e operador (apontamentos do Syneco).</p>
        </div>
        <button onClick={exportarCSV} disabled={loading || vazio}
          className="text-sm font-semibold text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 shrink-0">
          <Download size={15} /> Exportar
        </button>
      </div>

      {/* Filtros */}
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

      {loading ? (
        <div className="text-center py-16 text-torg-gray"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="text-center py-16"><AlertCircle size={22} className="mx-auto text-red-500 mb-2" /><p className="text-red-600 text-sm">{erro}</p>
          <button onClick={carregar} className="mt-3 text-sm text-torg-blue inline-flex items-center gap-1"><RefreshCw size={13} /> Tentar novamente</button></div>
      ) : vazio ? (
        <div className="text-center py-16 text-torg-gray"><Inbox size={28} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum corte apontado{(de || ate) ? " no período." : "."}</p></div>
      ) : detalhe ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <Kpi label="Obra" valor={detalhe.obra} />
            <Kpi label="Peças cortadas" valor={detalhe.totalUn.toLocaleString("pt-BR")} />
            <Kpi label="Peso cortado" valor={fmtKg(detalhe.totalKg)} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[13px] [&_td]:align-top">
              <thead className="bg-gray-50/60"><tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Peça</th>
                <th className="px-3 py-2 font-medium">Descrição / Perfil</th>
                <th className="px-3 py-2 font-medium text-right">Qte</th>
                <th className="px-3 py-2 font-medium text-right">Peso</th>
                <th className="px-3 py-2 font-medium">Data do corte</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Operador</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {detalhe.itens.map((i, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-mono font-medium text-torg-dark whitespace-nowrap">{i.peca}</td>
                    <td className="px-3 py-2 text-torg-gray">{i.descricao}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{i.un}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtKg(i.kg)}</td>
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
              <th className="px-3 py-2 font-medium text-right">Peças cortadas</th>
              <th className="px-3 py-2 font-medium text-right">Peso</th>
              <th className="px-3 py-2 font-medium text-right">Apontamentos</th>
              <th className="px-3 py-2 font-medium">Último corte</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {obras.map((o) => (
                <tr key={o.obra} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono font-semibold text-torg-dark">{o.obra}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.pecas.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKg(o.kg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{o.apontamentos}</td>
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

function Kpi({ label, valor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-torg-gray uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-torg-dark mt-0.5">{valor}</p>
    </div>
  );
}
