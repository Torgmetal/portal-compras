"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, TrendingUp, Package, Factory, ChevronDown, ChevronRight, Calendar } from "lucide-react";

const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

/**
 * Resumo mensal da Diretoria: por mês, o expedido de cada OP (peso da lista),
 * a receita gerada por obra e o custo do mês (matéria-prima + operacional).
 * Mais um ranking de obras pra avaliar qual tipo de obra vale a pena vender.
 * Rota /api/diretoria/resumo-mensal.
 */
export default function ResumoMensalDiretoria() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [abertos, setAbertos] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/resumo-mensal", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Ranking de obras = soma dos meses por OP (receita, matéria-prima, expedido).
  const ranking = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    for (const mes of data.meses) for (const o of mes.ops) {
      if (!m.has(o.numero)) m.set(o.numero, { numero: o.numero, obra: o.obra, expedidoKg: 0, receita: 0, material: 0 });
      const r = m.get(o.numero);
      r.expedidoKg += o.expedidoKg; r.receita += o.receita; r.material += o.material;
      if (!r.obra && o.obra) r.obra = o.obra;
    }
    return [...m.values()].sort((a, b) => b.receita - a.receita || b.expedidoKg - a.expedidoKg);
  }, [data]);

  if (loading) return <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Montando o resumo mensal…</div>;
  if (erro) return <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={carregar} className="ml-auto text-xs underline">tentar de novo</button></div>;
  if (!data) return null;

  const isOpen = (chave, idx) => abertos[chave] ?? idx === 0;
  const toggle = (chave, idx) => setAbertos((s) => ({ ...s, [chave]: !(s[chave] ?? idx === 0) }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-torg-dark flex items-center gap-2"><Calendar size={20} className="text-torg-blue" /> Resumo mensal</h2>
        <p className="text-[11px] text-torg-gray">Por mês: o expedido de cada obra (peso da lista de expedição), a receita gerada (medições faturadas) e o custo do mês (matéria-prima + operacional). Use pra avaliar que tipo de obra vale a pena vender.</p>
        {!data.omieOk && <p className="text-[11px] text-amber-700 mt-1">⚠ Não consegui o mapa de projetos do Omie agora — a matéria-prima por obra pode vir zerada nesta carga; os totais do mês estão certos.</p>}
      </div>

      {/* Ranking de obras */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={16} className="text-torg-blue" />
          <h3 className="text-sm font-semibold text-torg-dark">Comparativo de obras</h3>
          <span className="text-[11px] text-torg-gray">receita × matéria-prima acumuladas no período</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Obra</th>
                <th className="px-4 py-2 text-right font-medium">Expedido</th>
                <th className="px-4 py-2 text-right font-medium">Receita</th>
                <th className="px-4 py-2 text-right font-medium">Matéria-prima</th>
                <th className="px-4 py-2 text-right font-medium">Receita − MP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ranking.map((o) => {
                const contrib = o.receita - o.material;
                return (
                  <tr key={o.numero} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><span className="font-mono text-xs text-torg-blue">{fmtOP(o.numero)}</span> <span className="text-torg-dark">{o.obra}</span></td>
                    <td className="px-4 py-2 text-right tabular-nums text-torg-gray whitespace-nowrap">{o.expedidoKg > 0 ? fmtKg(o.expedidoKg) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-torg-dark whitespace-nowrap">{o.receita > 0 ? fmtR$(o.receita) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-torg-orange-700 whitespace-nowrap">{o.material > 0 ? fmtR$(o.material) : "—"}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap ${o.receita > 0 ? (contrib >= 0 ? "text-emerald-700" : "text-red-600") : "text-gray-300"}`}>{o.receita > 0 ? fmtR$(contrib) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2.5 text-[11px] text-torg-gray border-t border-gray-50">"Receita − MP" é margem de contribuição antes do custo operacional. A margem cheia (com transformação) fica na aba Financeiro de cada OP.</p>
      </div>

      {/* Por mês */}
      <div className="space-y-3">
        {data.meses.map((mes, idx) => {
          const aberto = isOpen(mes.chave, idx);
          const opsAtivas = mes.ops.filter((o) => o.expedidoKg > 0 || o.receita > 0 || o.material > 0);
          return (
            <div key={mes.chave} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button onClick={() => toggle(mes.chave, idx)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60 text-left">
                {aberto ? <ChevronDown size={16} className="text-torg-gray shrink-0" /> : <ChevronRight size={16} className="text-torg-gray shrink-0" />}
                <span className="text-sm font-semibold text-torg-dark capitalize w-24">{mes.label}</span>
                <div className="flex-1 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-[11px]">
                  <Tot label="Expedido" valor={fmtKg(mes.expedidoTotal)} cor="text-torg-gray" />
                  <Tot label="Receita" valor={fmtR$(mes.receitaTotal)} cor="text-torg-blue" />
                  <Tot label="Matéria-prima" valor={fmtR$(mes.materialTotal)} cor="text-torg-orange-700" />
                  <Tot label="Custo operac." valor={fmtR$(mes.custoTransf)} cor="text-torg-dark" />
                  <Tot label="Custo do mês" valor={fmtR$(mes.custoTotal)} cor="text-torg-dark" forte />
                </div>
              </button>
              {aberto && (
                <div className="border-t border-gray-100">
                  {opsAtivas.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-torg-gray">Sem expedição, receita ou matéria-prima por obra neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50/40 text-[11px] uppercase text-gray-500">
                          <tr>
                            <th className="px-5 py-2 text-left font-medium">Obra</th>
                            <th className="px-4 py-2 text-right font-medium">Expedido</th>
                            <th className="px-4 py-2 text-right font-medium">Receita gerada</th>
                            <th className="px-4 py-2 text-right font-medium">Matéria-prima</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {opsAtivas.map((o) => (
                            <tr key={o.numero} className="hover:bg-gray-50">
                              <td className="px-5 py-2"><span className="font-mono text-xs text-torg-blue">{fmtOP(o.numero)}</span> <span className="text-torg-dark">{o.obra}</span></td>
                              <td className="px-4 py-2 text-right tabular-nums text-torg-gray whitespace-nowrap">{o.expedidoKg > 0 ? fmtKg(o.expedidoKg) : "—"}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-torg-dark whitespace-nowrap">{o.receita > 0 ? fmtR$(o.receita) : "—"}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-torg-orange-700 whitespace-nowrap">{o.material > 0 ? fmtR$(o.material) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {mes.materialNaoAlocado > 1 && (
                    <p className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50/50 border-t border-gray-50 flex items-center gap-1.5">
                      <Package size={12} /> {fmtR$(mes.materialNaoAlocado)} de matéria-prima do mês sem obra vinculada (compra sem projeto no Omie) — não entra nas linhas acima.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tot({ label, valor, cor, forte }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-torg-gray">{label}</span>
      <span className={`tabular-nums ${forte ? "font-bold" : "font-medium"} ${cor}`}>{valor}</span>
    </span>
  );
}
