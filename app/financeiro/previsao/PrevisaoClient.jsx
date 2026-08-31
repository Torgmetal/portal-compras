"use client";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Loader2, AlertCircle, RefreshCw, Check } from "lucide-react";
import { numeroBR } from "@/lib/numero-br";

const fmtR$ = (n, dec = 0) => (n == null ? "—" : `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`);
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const fmtMes = (m) => {
  const [y, mo] = m.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mo) - 1]}/${y.slice(2)}`;
};
const STATUS_BADGE = {
  PENDENTE: "bg-slate-100 text-slate-600",
  CONFIRMADA: "bg-torg-blue-50 text-torg-blue",
  ALTERADA: "bg-amber-100 text-amber-700",
  ATRASADA: "bg-red-100 text-red-700",
  EMITIDA: "bg-emerald-100 text-emerald-700",
  CANCELADA: "bg-slate-100 text-slate-500 line-through",
};

export default function PrevisaoClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [edits, setEdits] = useState({});
  const [salvando, setSalvando] = useState(null);
  const [salvo, setSalvo] = useState(null);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/financeiro/previsao", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvarRsKg = async (op) => {
    const raw = edits[op.id];
    if (raw === undefined) return;
    const val = raw === "" ? null : numeroBR(raw, NaN);
    if (val != null && (Number.isNaN(val) || val < 0)) return;
    if ((op.valorFaturarPorKg ?? null) === (val ?? null)) return;
    setSalvando(op.id);
    try {
      const res = await fetch("/api/financeiro/previsao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId: op.id, valorFaturarPorKg: val }) });
      if (!res.ok) throw new Error();
      setSalvo(op.id); setTimeout(() => setSalvo((s) => (s === op.id ? null : s)), 1500);
      await carregar(true);
    } catch { setErro("Não foi possível salvar o R$/kg."); } finally { setSalvando(null); }
  };

  const cargas = dados?.cargas || [];
  const porMes = dados?.porMes || [];
  const ops = dados?.ops || [];
  const maxMes = Math.max(1, ...porMes.map((m) => m.valor));

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-torg-blue-50 p-2.5 rounded-xl"><TrendingUp size={24} className="text-torg-blue" /></div>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">Previsão de faturamento</h1>
            <p className="text-sm text-torg-gray">Por carga programada · valor = peso × R$/kg (ou nº de peças × R$/peça, quando o pedido é por peça) · vira real quando o romaneio sai</p>
          </div>
        </div>
        <button onClick={() => carregar(false)} className="p-2.5 rounded-xl bg-white border border-torg-blue-100 hover:border-torg-blue-300 text-torg-dark"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-torg-gray"><Loader2 size={40} className="animate-spin mb-3 text-torg-blue" /> <p>Carregando previsão…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-24 text-center"><AlertCircle size={40} className="text-red-500 mb-3" /><p className="text-red-600 mb-3">{erro}</p><button onClick={() => carregar(false)} className="text-sm bg-white border border-torg-blue-100 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button></div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-torg-blue-100 p-4">
              <div className="text-xs text-torg-gray font-medium">Total previsto</div>
              <div className="text-2xl font-extrabold text-torg-dark tabular-nums">{fmtR$(dados.totalPrevisto)}</div>
            </div>
            <div className="bg-white rounded-xl border border-torg-blue-100 p-4">
              <div className="text-xs text-torg-gray font-medium">Já com romaneio (real)</div>
              <div className="text-2xl font-extrabold text-emerald-600 tabular-nums">{fmtR$(dados.totalReal)}</div>
            </div>
            <div className="bg-white rounded-xl border border-torg-blue-100 p-4">
              <div className="text-xs text-torg-gray font-medium">Cargas em aberto</div>
              <div className="text-2xl font-extrabold text-torg-orange tabular-nums">{dados.nAberto}</div>
            </div>
          </div>

          {/* Fluxo por mês */}
          <div className="bg-white rounded-xl border border-torg-blue-100 p-5">
            <h2 className="font-bold text-torg-dark mb-4">Fluxo previsto por mês</h2>
            {porMes.length === 0 ? (
              <p className="text-sm text-torg-gray py-6 text-center">Nenhuma carga programada ainda. Programe as cargas em <b>Expedição → Programação de Cargas</b> e defina o R$/kg das obras abaixo — o fluxo aparece aqui.</p>
            ) : (
              <div className="space-y-2.5">
                {porMes.map((m) => (
                  <div key={m.mes} className="flex items-center gap-3">
                    <div className="w-16 text-sm font-semibold text-torg-dark capitalize shrink-0">{fmtMes(m.mes)}</div>
                    <div className="flex-1 h-7 bg-torg-blue-50 rounded-lg overflow-hidden relative">
                      <div className="h-full bg-torg-blue rounded-lg flex items-center" style={{ width: `${Math.max(3, (m.valor / maxMes) * 100)}%` }}>
                        {m.valorReal > 0 && <div className="h-full bg-emerald-500" style={{ width: `${(m.valorReal / Math.max(1, m.valor)) * 100}%` }} />}
                      </div>
                    </div>
                    <div className="w-32 text-right text-sm font-bold text-torg-dark tabular-nums shrink-0">{fmtR$(m.valor)}</div>
                    {m.nAberto > 0 && <div className="w-24 text-right text-[11px] text-torg-orange shrink-0">{m.nAberto} em aberto</div>}
                  </div>
                ))}
                <div className="flex gap-4 pt-2 text-[11px] text-torg-gray"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> real (romaneio)</span><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-torg-blue inline-block" /> estimado</span></div>
              </div>
            )}
          </div>

          {/* Cargas */}
          <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden">
            <h2 className="font-bold text-torg-dark p-5 pb-3">Cargas programadas ({cargas.length})</h2>
            {cargas.length === 0 ? (
              <p className="text-sm text-torg-gray px-5 pb-6">Nenhuma carga programada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-torg-gray uppercase border-y border-torg-blue-50 bg-torg-blue-50/40">
                      <th className="px-5 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">OP / Obra</th>
                      <th className="px-3 py-2 font-medium">Situação</th>
                      <th className="px-3 py-2 font-medium text-right">Peso / Peças</th>
                      <th className="px-3 py-2 font-medium text-right">R$ unit.</th>
                      <th className="px-5 py-2 font-medium text-right">Valor previsto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-torg-blue-50">
                    {cargas.map((c) => (
                      <tr key={c.id} className="hover:bg-torg-blue-50/30">
                        <td className="px-5 py-2.5 tabular-nums text-torg-dark whitespace-nowrap">{fmtData(c.data)}</td>
                        <td className="px-3 py-2.5"><span className="font-semibold text-torg-dark tabular-nums">OP-{c.opNumero || "?"}</span> <span className="text-torg-gray">{c.obra || ""}</span></td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[c.situacao] || STATUS_BADGE.PENDENTE}`}>{c.situacaoLabel}</span>
                          {c.dataOriginal && <span className="text-[10px] text-torg-gray-light ml-1.5">era {fmtData(c.dataOriginal)}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-torg-dark whitespace-nowrap">
                          {c.base === "peca" ? `${Number(c.nPecas || 0).toLocaleString("pt-BR")} pç` : fmtKg(c.peso)}
                          <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded ${c.fonte === "real" ? "bg-emerald-50 text-emerald-700" : "bg-torg-blue-50 text-torg-blue"}`}>{c.fonte === "real" ? "real" : "estim."}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-torg-gray whitespace-nowrap">
                          {c.base === "peca"
                            ? (c.rsPeca != null ? `${fmtR$(c.rsPeca, 2)}/pç` : "—")
                            : (c.rsKg != null ? `${fmtR$(c.rsKg, 2)}/kg` : "—")}
                        </td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          {c.valor != null ? <b className="text-torg-dark tabular-nums">{fmtR$(c.valor)}</b> : <span className="text-torg-orange text-xs font-semibold">em aberto</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Canceladas (registro, fora do total) */}
          {(dados.canceladas || []).length > 0 && (
            <div className="bg-white rounded-xl border border-torg-blue-100 p-5">
              <h2 className="font-bold text-torg-dark mb-1">Cargas canceladas <span className="text-torg-gray font-normal text-sm">— fora da previsão, mantidas por registro</span></h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {dados.canceladas.map((c) => (
                  <span key={c.id} className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                    <b className="tabular-nums">OP-{c.opNumero}</b> {c.obra || ""} · {fmtData(c.data)}{c.valor != null ? ` · ${fmtR$(c.valor)}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* R$/kg por obra (Comercial define) */}
          <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden">
            <div className="p-5 pb-3">
              <h2 className="font-bold text-torg-dark">R$/kg por obra <span className="text-torg-gray font-normal text-sm">— o Comercial define o valor a faturar por kg</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-torg-gray uppercase border-y border-torg-blue-50 bg-torg-blue-50/40">
                    <th className="px-5 py-2 font-medium">OP / Obra</th>
                    <th className="px-3 py-2 font-medium text-right">Contrato</th>
                    <th className="px-5 py-2 font-medium text-right w-48">R$/kg a faturar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-torg-blue-50">
                  {ops.map((op) => (
                    <tr key={op.id} className="hover:bg-torg-blue-50/30">
                      <td className="px-5 py-2"><span className="font-semibold text-torg-dark tabular-nums">OP-{op.numero}</span> <span className="text-torg-gray">{op.obra || ""}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-torg-gray whitespace-nowrap">{op.valorTotalContrato ? fmtR$(op.valorTotalContrato) : "—"}</td>
                      <td className="px-5 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray text-xs">R$</span>
                            <input
                              type="text" inputMode="decimal"
                              defaultValue={op.valorFaturarPorKg != null ? String(op.valorFaturarPorKg).replace(".", ",") : ""}
                              onChange={(e) => setEdits((p) => ({ ...p, [op.id]: e.target.value }))}
                              onBlur={() => salvarRsKg(op)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="—"
                              className="w-28 border border-torg-blue-100 rounded-lg pl-8 pr-2 py-1.5 text-sm text-right tabular-nums focus:border-torg-blue outline-none" />
                          </div>
                          <span className="w-4">
                            {salvando === op.id ? <Loader2 size={14} className="animate-spin text-torg-blue" /> : salvo === op.id ? <Check size={15} className="text-emerald-600" /> : null}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
