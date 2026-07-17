"use client";
import { useState, useEffect, useCallback } from "react";
import { Factory, Loader2, RefreshCw, AlertCircle, Target, Package, Info } from "lucide-react";

const PERIODOS = [
  { id: "mes", label: "Mês atual" },
  { id: "anterior", label: "Mês anterior" },
  { id: "trimestre", label: "Último trimestre" },
  { id: "ano", label: "Ano atual" },
  { id: "tudo", label: "Todo o período" },
];
const fmt = (d) => d.toISOString().split("T")[0];
function calcRange(id) {
  const h = new Date(); const a = h.getFullYear(); const m = h.getMonth();
  switch (id) {
    case "mes": return { de: fmt(new Date(a, m, 1)), ate: fmt(new Date(a, m + 1, 0)) };
    case "anterior": return { de: fmt(new Date(a, m - 1, 1)), ate: fmt(new Date(a, m, 0)) };
    case "trimestre": return { de: fmt(new Date(a, m - 2, 1)), ate: fmt(h) };
    case "ano": return { de: fmt(new Date(a, 0, 1)), ate: fmt(h) };
    case "tudo": return { de: "2020-01-01", ate: fmt(h) };
    default: return { de: fmt(new Date(a, m, 1)), ate: fmt(h) };
  }
}
const kg = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const corNota = (n) => (n == null ? "text-gray-400" : n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-500" : "text-red-500");
const barNota = (n) => (n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-amber-400" : "bg-red-400");

export default function ProducaoIndicadoresClient() {
  const [periodo, setPeriodo] = useState("mes");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback((p) => {
    setLoading(true); setErro("");
    const r = calcRange(p);
    fetch(`/api/producao/indicadores?de=${r.de}&ate=${r.ate}`).then((res) => res.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(periodo); }, [carregar, periodo]);

  const meta = dados?.metaPreparacao;
  const setores = dados?.producaoPorSetor || [];
  const maxKg = Math.max(1, ...setores.map((s) => s.kg));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><Factory className="text-green-600" /> Indicadores — Produção</h1>
          <p className="text-xs text-torg-gray mt-0.5">Meta de preparação e produção por setor, direto dos apontamentos do Syneco.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button onClick={() => carregar(periodo)} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100" title="Recarregar"><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-16 text-center text-red-600 text-sm">{erro}</div>
      ) : !dados ? null : (
        <>
          {/* Nota + Meta de preparação */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
              <span className="text-sm font-medium text-gray-500">Nota do Setor</span>
              <span className={`text-4xl font-bold ${corNota(dados.notaSetor?.nota)}`}>{dados.notaSetor?.nota != null ? dados.notaSetor.nota.toFixed(1) : "—"}</span>
              <span className="text-[11px] text-torg-gray mt-1">= atingimento da meta de preparação</span>
            </div>
            <div className="sm:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Target size={16} className="text-torg-blue" /><span className="text-sm font-semibold text-torg-dark">Meta de preparação (Corte)</span></div>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div><div className="text-xl font-bold text-torg-dark">{kg(meta?.kgDia)}</div><div className="text-[10px] text-torg-gray uppercase">kg/dia realizado</div></div>
                <div><div className="text-xl font-bold text-torg-gray">{kg(meta?.metaDiaKg)}</div><div className="text-[10px] text-torg-gray uppercase">meta kg/dia</div></div>
                <div><div className={`text-xl font-bold ${corNota(meta?.pct)}`}>{meta?.pct != null ? `${Math.round(meta.pct)}%` : "—"}</div><div className="text-[10px] text-torg-gray uppercase">atingimento</div></div>
              </div>
              {meta?.pct != null && <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barNota(meta.pct)}`} style={{ width: `${Math.min(100, meta.pct)}%` }} /></div>}
              <p className="text-[11px] text-torg-gray mt-2">Corte: {kg(meta?.realizadoKg)} kg realizados no período · meta {kg(meta?.metaKg)} kg ({meta?.diasUteis} dias úteis × {kg(meta?.metaDiaKg)} kg)</p>
            </div>
          </div>

          {/* Produção por setor */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><Package size={16} className="text-torg-blue" /><span className="text-sm font-semibold text-torg-dark">Produção por setor</span></div>
              <span className="text-sm text-torg-gray">Total: <b className="text-torg-dark">{kg(dados.totais?.kg)} kg</b> · {kg(dados.totais?.kgDia)} kg/dia</span>
            </div>
            <div className="space-y-3">
              {setores.map((s) => (
                <div key={s.setor}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="font-medium text-torg-dark">{s.label}</span>
                    <span className="text-torg-gray">{kg(s.kg)} kg · <span className="text-gray-400">{kg(s.kgDia)} kg/dia · {kg(s.un)} un · {s.apontamentos} apont.</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(s.kg / maxKg) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-torg-gray flex items-start gap-1.5"><Info size={13} className="mt-0.5 flex-shrink-0" /> Refugo/retrabalho e aderência ao PMP não entram na nota: o Syneco não preenche refugo e a meta do PMP é acumulada por OP (não é ritmo diário). A nota reflete o atingimento da meta de preparação de 6.000 kg/dia, base do ritmo da fábrica.</p>
        </>
      )}
    </div>
  );
}
