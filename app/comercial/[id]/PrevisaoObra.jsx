"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Target, Truck, Calendar, Info, Gauge } from "lucide-react";

const fmtR$ = (v) => (v == null ? "—" : Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtRkg = (v) => (v == null ? "—" : `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg`);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Previsão da obra: projeta o resultado final pelo avanço físico (kg expedido
 * da lista ÷ planejado) e pelo custo já incorrido, com break-even do que falta
 * e prazo no ritmo atual. Peso planejado é editável (a lista costuma estar
 * incompleta). Rota /api/comercial/op/[id]/previsao.
 */
export default function PrevisaoObra({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [peso, setPeso] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/previsao`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j); setPeso(j.planejadoKg || 0);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);

  const calc = useMemo(() => {
    if (!data) return null;
    const planejado = Number(peso) || data.planejadoKg || 0;
    const exp = data.expedidoKg || 0;
    const kgRestante = Math.max(0, planejado - exp);
    const avanco = planejado > 0 ? Math.min(exp / planejado, 1) : null;
    const rkg = data.rkgRealizado;
    const custoRestante = rkg != null ? kgRestante * rkg : null;
    const custoTotalProj = custoRestante != null ? data.custoIncorrido + custoRestante : null;
    const resultado = custoTotalProj != null && data.receitaTotal > 0 ? data.receitaTotal - custoTotalProj : null;
    const margemPct = resultado != null && data.receitaTotal > 0 ? (resultado / data.receitaTotal) * 100 : null;
    const breakEven = kgRestante > 0 && data.aFaturarOmie != null ? data.aFaturarOmie / kgRestante : null;
    const meses = data.ritmoMensal > 0 && kgRestante > 0 ? kgRestante / data.ritmoMensal : (kgRestante === 0 ? 0 : null);
    return { planejado, exp, kgRestante, avanco, rkg, custoRestante, custoTotalProj, resultado, margemPct, breakEven, meses };
  }, [data, peso]);

  if (loading) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
      <p className="text-sm text-torg-gray">Projetando a obra (busca o saldo a faturar no Omie — pode levar alguns segundos)…</p>
    </div>
  );
  if (erro) return (
    <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6"><div className="flex items-start gap-2 text-red-600 text-sm"><AlertCircle size={16} className="mt-0.5" /><div><p className="font-medium">Erro na previsão</p><p className="text-xs mt-1">{erro}</p><button onClick={carregar} className="text-xs underline mt-1">tentar de novo</button></div></div></div>
  );
  if (!data || !calc) return null;

  if (data.semLista) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2 mb-2"><Target size={16} className="text-torg-blue" /> Previsão da obra</h3>
      <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-sm"><Info size={15} className="mt-0.5 shrink-0" /><p>Sem lista de expedição nesta OP — sem o peso planejado não dá pra projetar o avanço. Importe a lista pra habilitar.</p></div>
    </div>
  );

  const restaVsBreak = calc.rkg != null && calc.breakEven != null ? (calc.rkg <= calc.breakEven) : null;
  // prazo x cronograma
  const agora = new Date();
  const fimProj = calc.meses != null ? new Date(agora.getFullYear(), agora.getMonth() + Math.round(calc.meses), 1) : null;
  const fimCron = data.op.dataFimPrevista ? new Date(data.op.dataFimPrevista) : null;
  const atrasa = fimProj && fimCron && fimProj > fimCron;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2"><Target size={18} className="text-torg-blue" /> Previsão da obra</h3>
        <p className="text-xs text-torg-gray mt-1">Projeta o resultado no fim pelo avanço físico e pelo custo já incorrido. Só transformação (material FD/verba fica fora).</p>
      </div>

      {/* Avanço físico + peso editável */}
      <div className="px-6 pt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-torg-gray">Avanço físico (expedido ÷ planejado)</span>
          <span className="font-semibold text-torg-dark tabular-nums">{calc.avanco != null ? `${(calc.avanco * 100).toFixed(0)}%` : "—"}</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${Math.min((calc.avanco || 0) * 100, 100)}%` }} />
        </div>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-torg-gray">
          <span>Expedido <span className="font-medium text-torg-dark tabular-nums">{fmtKg(calc.exp)}</span></span>
          <span className="inline-flex items-center gap-1">Planejado
            <input type="number" value={peso ?? ""} onChange={(e) => setPeso(e.target.value)} className="w-24 px-1.5 py-0.5 border border-gray-200 rounded text-right tabular-nums text-torg-dark focus:outline-none focus:ring-1 focus:ring-torg-blue" /> kg
          </span>
          {peso != data.planejadoKg && <button onClick={() => setPeso(data.planejadoKg)} className="text-torg-blue hover:underline">← lista ({fmtKg(data.planejadoKg)})</button>}
          <span>Resta <span className="font-medium text-torg-dark tabular-nums">{fmtKg(calc.kgRestante)}</span></span>
        </div>
        <p className="text-[10px] text-amber-700 mt-1.5">O planejado vem da lista de expedição atual. Se ainda faltam marcas a incluir, ajuste o peso acima — a projeção recalcula.</p>
      </div>

      {/* KPIs de resultado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border-y border-gray-100 mt-4">
        <Kpi label="Saldo a faturar" valor={fmtR$(data.aFaturarOmie)} sub={data.omieOk ? "do Omie" : "Omie indisp."} color="text-torg-blue" />
        <Kpi label="Custo restante" valor={fmtR$(calc.custoRestante)} sub={`${fmtRkg(calc.rkg)} realizado`} color="text-torg-orange-700" />
        <Kpi label="Custo total projetado" valor={fmtR$(calc.custoTotalProj)} sub={`incorrido ${fmtR$(data.custoIncorrido)}`} color="text-torg-dark" />
        <Kpi label="Resultado projetado" valor={fmtR$(calc.resultado)} sub={calc.margemPct != null ? `${calc.margemPct.toFixed(0)}% da receita` : null} color={calc.resultado == null ? "text-gray-300" : calc.resultado >= 0 ? "text-emerald-700" : "text-red-600"} />
      </div>

      <div className="p-6 space-y-3">
        {/* Break-even */}
        {calc.breakEven != null && (
          <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${restaVsBreak ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            <Gauge size={16} className="mt-0.5 shrink-0" />
            <p>
              O que falta pode custar até <span className="font-semibold">{fmtRkg(calc.breakEven)}</span> (saldo a faturar ÷ kg restante). Você está transformando a <span className="font-semibold">{fmtRkg(calc.rkg)}</span> — {restaVsBreak ? "o restante fecha no positivo." : "acima do teto: o restante tende a dar prejuízo."}
            </p>
          </div>
        )}
        {/* Prazo x cronograma */}
        {calc.meses != null && (
          <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${atrasa ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-torg-gray"}`}>
            {atrasa ? <Calendar size={16} className="mt-0.5 shrink-0" /> : <Truck size={16} className="mt-0.5 shrink-0" />}
            <p>
              No ritmo de <span className="font-semibold text-torg-dark">{fmtKg(data.ritmoMensal)}/mês</span>, faltam <span className="font-semibold text-torg-dark">{calc.meses <= 0 ? "0" : calc.meses.toFixed(1)} {calc.meses === 1 ? "mês" : "meses"}</span>{fimProj ? <> (≈ {MESES[fimProj.getMonth()]}/{fimProj.getFullYear()})</> : ""}.
              {fimCron && <> Cronograma prevê <span className="font-semibold text-torg-dark">{MESES[fimCron.getUTCMonth()]}/{fimCron.getUTCFullYear()}</span>{atrasa ? " — no ritmo atual, atrasa; e obra que arrasta consome mais custo/kg, comendo a margem." : "."}</>}
            </p>
          </div>
        )}
        {data.incompleto2025 && <p className="text-[11px] text-amber-700 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> Parte da produção é de 2025 (Syneco não capturava) — custo incorrido subestimado, resultado otimista.</p>}
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, color }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{valor}</p>
      {sub && <p className="text-[10px] text-torg-gray mt-1 tabular-nums">{sub}</p>}
    </div>
  );
}
