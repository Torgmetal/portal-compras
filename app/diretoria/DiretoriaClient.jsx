"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Lock, Loader2, AlertCircle, UserPlus, X, ShieldCheck, ArrowLeft,
  TrendingUp, TrendingDown, Wallet, Banknote, CalendarClock, Truck, RefreshCw,
} from "lucide-react";

const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtData = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

export default function DiretoriaClient({ isDono, userNome }) {
  // ── Financeiro ──────────────────────────────────────────────
  const [fin, setFin] = useState(null);
  const [loadingFin, setLoadingFin] = useState(true);
  const [erroFin, setErroFin] = useState("");

  const carregarFin = useCallback(async () => {
    setLoadingFin(true); setErroFin("");
    try {
      const r = await fetch("/api/diretoria/financeiro", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setFin(j);
    } catch (e) { setErroFin(e.message); } finally { setLoadingFin(false); }
  }, []);
  useEffect(() => { carregarFin(); }, [carregarFin]);

  // ── Gerenciar acesso (dono) ─────────────────────────────────
  const [dono, setDono] = useState(null);
  const [liberados, setLiberados] = useState([]);
  const [loadingAc, setLoadingAc] = useState(isDono);
  const [erroAc, setErroAc] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregarAcesso = useCallback(async () => {
    setLoadingAc(true); setErroAc("");
    try {
      const r = await fetch("/api/diretoria/acesso", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setDono(j.dono); setLiberados(j.liberados || []);
    } catch (e) { setErroAc(e.message); } finally { setLoadingAc(false); }
  }, []);
  useEffect(() => { if (isDono) carregarAcesso(); }, [isDono, carregarAcesso]);

  async function liberar(e) {
    e.preventDefault();
    const email = novoEmail.trim().toLowerCase();
    if (!email) return;
    setSalvando(true); setErroAc("");
    try {
      const r = await fetch("/api/diretoria/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao liberar");
      setNovoEmail(""); await carregarAcesso();
    } catch (e) { setErroAc(e.message); } finally { setSalvando(false); }
  }
  async function revogar(email) {
    if (!confirm(`Revogar o acesso de ${email} ao módulo Diretoria?`)) return;
    setSalvando(true); setErroAc("");
    try {
      const r = await fetch(`/api/diretoria/acesso?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao revogar");
      await carregarAcesso();
    } catch (e) { setErroAc(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="min-h-screen bg-torg-blue-50/30">
      <header className="bg-torg-dark text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Lock size={20} /></div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Diretoria</h1>
              <p className="text-[11px] text-white/70">Visão executiva · acesso restrito</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft size={14} /> Portal</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* ─── Resumo financeiro ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-torg-dark uppercase tracking-wide">Posição financeira</h2>
            <button onClick={carregarFin} disabled={loadingFin} className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1 disabled:opacity-50">
              <RefreshCw size={12} className={loadingFin ? "animate-spin" : ""} /> atualizar
            </button>
          </div>

          {erroFin ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={18} /> {erroFin}
              <button onClick={carregarFin} className="ml-auto text-xs underline">tentar de novo</button>
            </div>
          ) : loadingFin || !fin ? (
            <div className="text-center py-10 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando números…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiGrande titulo="A receber (em aberto)" valor={fin.aReceber.total} icon={Banknote} cor="emerald"
                  sub={`${fin.aReceber.qtd} título(s)`} alerta={fin.aReceber.vencido > 0 ? `${fmtR$(fin.aReceber.vencido)} vencido` : null} />
                <KpiGrande titulo="A pagar (em aberto)" valor={fin.aPagar.total} icon={Wallet} cor="rose"
                  sub={`${fin.aPagar.qtd} título(s)`} alerta={fin.aPagar.vencido > 0 ? `${fmtR$(fin.aPagar.vencido)} vencido` : null} />
                <KpiGrande titulo="Posição líquida" valor={fin.posicao} icon={fin.posicao >= 0 ? TrendingUp : TrendingDown}
                  cor={fin.posicao >= 0 ? "blue" : "rose"} sub="a receber − a pagar" />
              </div>

              {/* Aging */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Aging titulo="Contas a receber" dados={fin.aReceber} corVencer="emerald" />
                <Aging titulo="Contas a pagar" dados={fin.aPagar} corVencer="amber" />
              </div>
              {(fin.sync.pagar || fin.sync.receber) && (
                <p className="text-[10px] text-torg-gray mt-2">
                  Sincronizado do Omie · a pagar: {fmtData(fin.sync.pagar)} · a receber: {fmtData(fin.sync.receber)}
                </p>
              )}
            </>
          )}
        </section>

        {/* ─── Previsão de receita por entregas ─── */}
        {fin?.previsao && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> Previsão de receita por entregas</h2>
                <p className="text-[11px] text-torg-gray mt-0.5">Estimativa do que falta faturar da carteira em produção (contrato × % ainda não entregue, por peso).</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-torg-blue tabular-nums leading-none">{fmtR$(fin.previsao.aFaturar)}</p>
                <p className="text-[11px] text-torg-gray">a faturar · {fin.previsao.qtdObras} obras · carteira {fmtR$(fin.previsao.totalContrato)}</p>
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              {fin.previsao.ops.length === 0 ? (
                <p className="text-sm text-torg-gray text-center py-4">Nenhuma obra ativa com contrato lançado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-torg-gray">
                    <tr><th className="pb-2">OP</th><th className="pb-2">Cliente / Obra</th><th className="pb-2 text-right">Contrato</th><th className="pb-2 w-40">Entregue</th><th className="pb-2 text-right">A faturar</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {fin.previsao.ops.map((o) => (
                      <tr key={o.numero} className="hover:bg-gray-50/50">
                        <td className="py-1.5 font-semibold text-torg-dark whitespace-nowrap">{fmtOP(o.numero)}</td>
                        <td className="py-1.5 text-torg-gray truncate max-w-[220px]">{o.cliente}{o.obra ? ` · ${o.obra}` : ""}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtR$(o.contrato)}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-torg-blue" style={{ width: `${o.pctEntregue}%` }} />
                            </div>
                            <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{o.pctEntregue}%</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{fmtR$(o.aFaturar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ─── Gerenciar acesso (dono) ─── */}
        {isDono && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-torg-dark flex items-center gap-2"><ShieldCheck size={18} className="text-torg-blue" /> Gerenciar acesso</h2>
              <p className="text-[11px] text-torg-gray mt-0.5">Só você libera/revoga. Quem você adicionar passa a ver este módulo (pode precisar entrar de novo no sistema para o atalho aparecer no menu).</p>
            </div>
            <div className="p-5 space-y-4">
              {erroAc && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm"><AlertCircle size={16} /> {erroAc}</div>}
              <form onSubmit={liberar} className="flex items-end gap-2 flex-wrap">
                <label className="flex-1 min-w-[220px]">
                  <span className="block text-xs font-medium text-torg-gray mb-1">Liberar acesso para (e-mail)</span>
                  <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="fulano@torg.com.br"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
                </label>
                <button type="submit" disabled={salvando || !novoEmail.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50">
                  {salvando ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Liberar
                </button>
              </form>
              <div>
                <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-2">Quem tem acesso</p>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  <div className="flex items-center justify-between px-3 py-2 text-sm bg-gray-50/50">
                    <span className="text-torg-dark">{dono || "vitor@torg.com.br"}</span>
                    <span className="text-[10px] font-bold text-torg-blue bg-torg-blue-50 px-2 py-0.5 rounded-full">DONO</span>
                  </div>
                  {loadingAc ? (
                    <div className="px-3 py-4 text-center text-torg-gray text-sm"><Loader2 size={16} className="animate-spin inline" /> carregando…</div>
                  ) : liberados.length === 0 ? (
                    <div className="px-3 py-4 text-center text-torg-gray text-xs italic">Ninguém mais liberado — só você.</div>
                  ) : (
                    liberados.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-torg-dark truncate">{l.email}{l.nome ? <span className="text-torg-gray"> · {l.nome}</span> : null}</span>
                        <button onClick={() => revogar(l.email)} disabled={salvando} className="text-torg-gray hover:text-red-600 disabled:opacity-50" title="Revogar acesso"><X size={16} /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const CORES_KPI = {
  emerald: "bg-emerald-50 text-emerald-700",
  rose: "bg-rose-50 text-rose-700",
  blue: "bg-torg-blue-50 text-torg-blue",
};
function KpiGrande({ titulo, valor, icon: Icon, cor, sub, alerta }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-torg-gray">{titulo}</p>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${CORES_KPI[cor] || CORES_KPI.blue}`}><Icon size={15} /></span>
      </div>
      <p className="text-2xl font-extrabold text-torg-dark tabular-nums mt-2 leading-tight">{fmtR$(valor)}</p>
      {sub && <p className="text-[11px] text-torg-gray mt-0.5">{sub}</p>}
      {alerta && <p className="text-[11px] text-red-600 font-medium mt-0.5">{alerta}</p>}
    </div>
  );
}
function Aging({ titulo, dados, corVencer }) {
  const corV = corVencer === "amber" ? "text-amber-700" : "text-emerald-700";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-semibold text-torg-dark mb-2">{titulo}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-[10px] text-torg-gray uppercase">Vencido</p><p className="text-sm font-bold text-red-600 tabular-nums">{fmtR$(dados.vencido)}</p></div>
        <div><p className="text-[10px] text-torg-gray uppercase">Vence ≤30d</p><p className={`text-sm font-bold tabular-nums ${corV}`}>{fmtR$(dados.aVencer30)}</p></div>
        <div><p className="text-[10px] text-torg-gray uppercase">Total aberto</p><p className="text-sm font-bold text-torg-dark tabular-nums">{fmtR$(dados.total)}</p></div>
      </div>
    </div>
  );
}
