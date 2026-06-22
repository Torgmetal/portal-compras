"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import Link from "next/link";
import {
  Lock, Loader2, AlertCircle, UserPlus, X, ShieldCheck, ArrowLeft,
  TrendingUp, TrendingDown, Wallet, Banknote, Truck, RefreshCw,
  AlertTriangle, Flame, Search, ArrowDownRight, ArrowUpRight,
  CalendarClock, Zap, Clock, Pencil, CheckCircle2, ExternalLink, ChevronDown, Download, Target,
} from "lucide-react";

const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDia = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }) : "—");
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

const ABAS_BASE = [
  { id: "resumo", label: "Resumo" },
  { id: "dre", label: "DRE Alvo × Real" },
  { id: "receber", label: "A receber" },
  { id: "pagar", label: "A pagar" },
  { id: "conferencia", label: "Conferência" },
  { id: "cortar", label: "Onde cortar" },
  { id: "previsao", label: "Previsão de faturamento" },
];
const ABAS_FIN = ["resumo", "cortar"]; // dependem do fetch /financeiro

export default function DiretoriaClient({ isDono, userNome }) {
  const [aba, setAba] = useState("resumo");
  const abas = isDono ? [...ABAS_BASE, { id: "acesso", label: "Acesso" }] : ABAS_BASE;

  // ── Financeiro (resumo + ruptura) ───────────────────────────
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

  // Sincroniza Contas a Pagar + a Receber do Omie (botão "sincronizar" + rede de
  // segurança: se o dado estiver com mais de 12h ao abrir, atualiza sozinho 1x).
  const [sincronizando, setSincronizando] = useState(false);
  const autoSyncFeito = useRef(false);
  const sincronizarFin = useCallback(async () => {
    setSincronizando(true);
    try { await fetch("/api/diretoria/sincronizar", { method: "POST" }); }
    catch { /* silencioso */ }
    finally { await carregarFin(); setSincronizando(false); }
  }, [carregarFin]);
  useEffect(() => {
    if (!fin || autoSyncFeito.current) return;
    const ts = [fin.sync?.pagar, fin.sync?.receber].filter(Boolean).map((d) => new Date(d).getTime());
    const horas = ts.length ? (Date.now() - Math.min(...ts)) / 3600000 : 999;
    if (horas > 12) { autoSyncFeito.current = true; sincronizarFin(); }
  }, [fin, sincronizarFin]);

  // ── Listas detalhadas (lazy por aba) ────────────────────────
  const [listas, setListas] = useState({});
  const [loadingLista, setLoadingLista] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const carregarLista = useCallback(async (tipo) => {
    setLoadingLista(true); setErroLista("");
    try {
      const r = await fetch(`/api/diretoria/contas?tipo=${tipo}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setListas((p) => ({ ...p, [tipo]: j }));
    } catch (e) { setErroLista(e.message); } finally { setLoadingLista(false); }
  }, []);
  useEffect(() => {
    if ((aba === "pagar" || aba === "receber") && !listas[aba]) carregarLista(aba);
  }, [aba, listas, carregarLista]);

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
          <div className="flex items-center gap-4">
            {fin?.sync?.receber && (
              <span className="text-[10px] text-white/55 hidden sm:inline" title={`Omie — a pagar: ${fmtDataHora(fin.sync.pagar)} · a receber: ${fmtDataHora(fin.sync.receber)}`}>
                Omie: {fmtDataHora(fin.sync.receber)}
              </span>
            )}
            <button onClick={sincronizarFin} disabled={sincronizando || loadingFin} className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={13} className={sincronizando || loadingFin ? "animate-spin" : ""} /> {sincronizando ? "sincronizando…" : "sincronizar Omie"}
            </button>
            <Link href="/" className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft size={14} /> Portal</Link>
          </div>
        </div>
        {/* Abas */}
        <div className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                aba === a.id ? "border-white text-white" : "border-transparent text-white/60 hover:text-white/90"
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {erroFin && ABAS_FIN.includes(aba) ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle size={18} /> {erroFin}
            <button onClick={carregarFin} className="ml-auto text-xs underline">tentar de novo</button>
          </div>
        ) : (loadingFin || !fin) && ABAS_FIN.includes(aba) ? (
          <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando números…</div>
        ) : null}

        {/* ════════ PONTOS DE RUPTURA — oculto por ora (a pedido do Vitor; reativar adicionando em ABAS_BASE) ════════ */}
        {/* {aba === "ruptura" && fin && <Ruptura fin={fin} onRefresh={carregarFin} />} */}

        {/* ════════ ONDE CORTAR ════════ */}
        {aba === "cortar" && fin && <OndeCortar categorias={fin.categoriasPagar} totalPagar={fin.aPagar.total} />}

        {/* ════════ DRE ALVO × REALIZADO ════════ */}
        {aba === "dre" && <DreAlvo />}

        {/* ════════ RESUMO ════════ */}
        {aba === "resumo" && fin && <Resumo fin={fin} />}

        {/* ════════ A PAGAR / A RECEBER ════════ */}
        {(aba === "pagar" || aba === "receber") && (
          <div className="space-y-6">
            {aba === "receber" && <SaldoContratos faturadoAberto={fin?.aReceber?.total} />}
            <ContasView tipo={aba} data={listas[aba]} loading={loadingLista} erro={erroLista} onRetry={() => carregarLista(aba)} />
          </div>
        )}

        {/* ════════ CONFERÊNCIA DE LANÇAMENTOS ════════ */}
        {aba === "conferencia" && <Conferencia />}

        {/* ════════ PREVISÃO DE FATURAMENTO ════════ */}
        {aba === "previsao" && <PrevisaoFaturamento />}

        {/* ════════ ACESSO ════════ */}
        {aba === "acesso" && isDono && (
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

/* ─────────────────────── PONTOS DE RUPTURA ─────────────────────── */
function Ruptura({ fin, onRefresh }) {
  const { ruptura, previsao } = fin;
  return (
    <div className="space-y-6">
      {/* Leitura crítica */}
      <section>
        <h2 className="text-sm font-bold text-torg-dark uppercase tracking-wide mb-3 flex items-center gap-2">
          <Flame size={16} className="text-red-600" /> Leitura crítica
        </h2>
        {ruptura.flags.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm">
            Nenhum ponto de ruptura relevante detectado no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {ruptura.flags.map((f, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm border ${
                f.sev === "alta" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {f.sev === "alta" ? <Flame size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
                <span>{f.texto}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Gap de caixa por janela */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-torg-dark">Gap de caixa por janela</h2>
          <p className="text-[11px] text-torg-gray mt-0.5">Acumulado a pagar × a receber até cada prazo (inclui vencidos). O a receber considera só títulos já faturados — a carteira a faturar está no Resumo.</p>
        </div>
        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ruptura.janelas.map((j) => {
            const neg = j.gap < 0;
            return (
              <div key={j.dias} className={`rounded-xl border p-4 ${neg ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/40"}`}>
                <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Próximos {j.dias} dias</p>
                <p className={`text-xl font-extrabold tabular-nums mt-1 leading-tight ${neg ? "text-red-700" : "text-emerald-700"}`}>
                  {neg ? "−" : "+"}{fmtR$(Math.abs(j.gap))}
                </p>
                <div className="mt-2 space-y-0.5 text-[11px] text-torg-gray">
                  <p className="flex items-center justify-between"><span className="inline-flex items-center gap-1"><ArrowUpRight size={11} className="text-emerald-600" />receber</span><span className="tabular-nums">{fmtR$(j.receber)}</span></p>
                  <p className="flex items-center justify-between"><span className="inline-flex items-center gap-1"><ArrowDownRight size={11} className="text-rose-600" />pagar</span><span className="tabular-nums">{fmtR$(j.pagar)}</span></p>
                </div>
              </div>
            );
          })}
        </div>
        {(ruptura.cobertura != null || previsao?.aFaturar > 0) && (
          <div className="px-5 pb-5 space-y-1.5">
            {ruptura.cobertura != null && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-torg-gray">Cobertura (a receber faturado ÷ a pagar em aberto):</span>
                <span className={`font-bold tabular-nums ${ruptura.cobertura < 30 ? "text-red-700" : ruptura.cobertura < 100 ? "text-amber-700" : "text-emerald-700"}`}>{ruptura.cobertura}%</span>
              </div>
            )}
            {previsao?.aFaturar > 0 && (
              <p className="text-[11px] text-torg-gray">
                Fora do gap: <span className="font-semibold text-emerald-700">{fmtR$(previsao.aFaturar)}</span> a faturar da carteira ativa (sem data definida) — entra no caixa conforme as medições/entregas avançam. Detalhe na aba <span className="font-medium text-torg-dark">A receber</span>.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Fluxo de caixa diário */}
      <FluxoDiario fluxo={ruptura.fluxoDiario} fluxoNaturezas={ruptura.fluxoNaturezas} fluxoVencido={ruptura.fluxoVencido}
        saldoInicial={ruptura.saldoInicial} saldoAtualizadoEm={ruptura.saldoAtualizadoEm} onRefresh={onRefresh} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Concentração de credores */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-torg-dark">Concentração — maiores credores</h2>
            <p className="text-[11px] text-torg-gray mt-0.5">Quem mais pesa no a pagar em aberto.</p>
          </div>
          <div className="p-5 space-y-2.5">
            {ruptura.topCredores.length === 0 ? <p className="text-sm text-torg-gray text-center py-3">Sem dados.</p> : ruptura.topCredores.map((c, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm gap-3">
                  <span className="text-torg-dark truncate flex-1" title={c.nome}>{c.nome}</span>
                  <span className="tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(c.valor)}</span>
                  <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{c.pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, c.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Maiores títulos a pagar (30d) */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-torg-dark">Maiores títulos a vencer (≤30 dias)</h2>
            <p className="text-[11px] text-torg-gray mt-0.5">Compromissos de maior valor no curto prazo. Inclui vencidos.</p>
          </div>
          <div className="p-5 overflow-x-auto">
            {ruptura.topTitulosPagar.length === 0 ? <p className="text-sm text-torg-gray text-center py-3">Sem dados.</p> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {ruptura.topTitulosPagar.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-2">
                        <p className="text-torg-dark truncate max-w-[180px]" title={t.nome}>{t.nome}</p>
                        <p className="text-[11px] text-torg-gray">{t.doc || "—"}</p>
                      </td>
                      <td className="py-1.5 text-center whitespace-nowrap">
                        <span className={`text-[11px] tabular-nums ${t.vencido ? "text-red-600 font-semibold" : "text-torg-gray"}`}>{fmtDia(t.venc)}{t.vencido ? " ⚠" : ""}</span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(t.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────── RESUMO ─────────────────────── */
function Resumo({ fin }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-bold text-torg-dark uppercase tracking-wide mb-3">Posição financeira</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiGrande titulo="A receber (em aberto)" valor={fin.aReceber.total} icon={Banknote} cor="emerald"
            sub={`${fin.aReceber.qtd} título(s)`} alerta={fin.aReceber.vencido > 0 ? `${fmtR$(fin.aReceber.vencido)} vencido` : null} />
          <KpiGrande titulo="A pagar (em aberto)" valor={fin.aPagar.total} icon={Wallet} cor="rose"
            sub={`${fin.aPagar.qtd} título(s)`} alerta={fin.aPagar.vencido > 0 ? `${fmtR$(fin.aPagar.vencido)} vencido` : null} />
          <KpiGrande titulo="Posição líquida" valor={fin.posicao} icon={fin.posicao >= 0 ? TrendingUp : TrendingDown}
            cor={fin.posicao >= 0 ? "blue" : "rose"} sub="a receber − a pagar (faturado)" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Aging titulo="Contas a receber" dados={fin.aReceber} corVencer="emerald" />
          <Aging titulo="Contas a pagar" dados={fin.aPagar} corVencer="amber" />
        </div>
        {(fin.sync.pagar || fin.sync.receber) && (
          <p className="text-[10px] text-torg-gray mt-2">Sincronizado do Omie · a pagar: {fmtDataHora(fin.sync.pagar)} · a receber: {fmtDataHora(fin.sync.receber)}</p>
        )}
      </section>

      {fin.previsao && <PrevisaoReceita previsao={fin.previsao} />}
    </div>
  );
}

/* ─────────────────────── A PAGAR / A RECEBER ─────────────────────── */
function ContasView({ tipo, data, loading, erro, onRetry }) {
  const [busca, setBusca] = useState("");
  const [soVencidos, setSoVencidos] = useState(false);
  const LIMITE = 500;

  const filtrados = useMemo(() => {
    if (!data?.itens) return [];
    const q = busca.trim().toLowerCase();
    return data.itens.filter((i) => {
      if (soVencidos && !i.vencido) return false;
      if (!q) return true;
      return (i.nome || "").toLowerCase().includes(q) || (i.doc || "").toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q);
    });
  }, [data, busca, soVencidos]);

  const totalFiltrado = useMemo(() => filtrados.reduce((s, i) => s + i.saldo, 0), [filtrados]);
  const ehPagar = tipo === "pagar";

  if (loading) return <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando títulos…</div>;
  if (erro) return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
      <AlertCircle size={18} /> {erro}<button onClick={onRetry} className="ml-auto text-xs underline">tentar de novo</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-torg-dark">{ehPagar ? "Contas a pagar" : "Títulos já faturados (em aberto)"}</h2>
          <p className="text-[11px] text-torg-gray">{data.qtd} título(s) em aberto · total {fmtR$(data.total)}{ehPagar ? "" : " · aguardando recebimento"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSoVencidos((v) => !v)}
            className={`text-xs px-3 py-2 rounded-lg border font-medium ${soVencidos ? "bg-red-600 text-white border-red-600" : "bg-white text-torg-gray border-gray-200 hover:border-red-300"}`}>
            Só vencidos
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={ehPagar ? "fornecedor, doc…" : "cliente, doc…"}
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none w-56" />
          </div>
        </div>
      </div>

      {(busca || soVencidos) && (
        <p className="text-xs text-torg-gray">{filtrados.length} resultado(s) · total filtrado <span className="font-semibold text-torg-dark">{fmtR$(totalFiltrado)}</span></p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 text-left text-[11px] uppercase tracking-wide text-torg-gray">
            <tr>
              <th className="px-4 py-2.5">{ehPagar ? "Fornecedor" : "Cliente"}</th>
              <th className="px-4 py-2.5">Documento</th>
              <th className="px-4 py-2.5">Categoria</th>
              <th className="px-4 py-2.5 text-center">Vencimento</th>
              <th className="px-4 py-2.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-torg-gray text-sm">Nenhum título encontrado.</td></tr>
            ) : filtrados.slice(0, LIMITE).map((i) => (
              <tr key={i.id} className={`hover:bg-gray-50/50 ${i.vencido ? "bg-red-50/30" : ""}`}>
                <td className="px-4 py-2 text-torg-dark max-w-[260px] truncate" title={i.nome}>{i.nome}</td>
                <td className="px-4 py-2 text-torg-gray whitespace-nowrap">{i.doc || "—"}</td>
                <td className="px-4 py-2 text-torg-gray max-w-[160px] truncate" title={i.categoria}>{i.categoria || "—"}</td>
                <td className="px-4 py-2 text-center whitespace-nowrap">
                  <span className={i.vencido ? "text-red-600 font-semibold" : "text-torg-gray"}>{fmtDia(i.vencimento)}{i.vencido ? " ⚠" : ""}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(i.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrados.length > LIMITE && (
        <p className="text-xs text-torg-gray text-center">Mostrando os {LIMITE} primeiros (ordenados por vencimento) de {filtrados.length}. Use a busca para refinar.</p>
      )}
    </div>
  );
}

/* ─────────────────────── conferência / rastreabilidade de lançamentos ─────────────────────── */
const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";
const omieModuloUrl = (tipo) => `https://app.omie.com.br/gestao/${OMIE_TENANT}/#${tipo === "receber" ? "VEN" : "COM"}`;
const FLAG_COR = {
  "sem categoria": "bg-amber-50 text-amber-700 border-amber-200",
  "sem NF": "bg-orange-50 text-orange-700 border-orange-200",
  "sem vínculo": "bg-red-50 text-red-700 border-red-200",
  "detalhe pendente": "bg-gray-100 text-gray-600 border-gray-200",
  "possível duplicado": "bg-rose-50 text-rose-700 border-rose-200",
  "alterado após sync": "bg-purple-50 text-purple-700 border-purple-200",
};

function Conferencia() {
  const [tipo, setTipo] = useState("pagar");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("atencao");
  const [busca, setBusca] = useState("");
  const [mesVenc, setMesVenc] = useState("todos");
  const [expand, setExpand] = useState(null);
  const [salvandoId, setSalvandoId] = useState(null);
  const [exportando, setExportando] = useState(false);
  const LIMITE = 400;

  const carregar = useCallback(async (t) => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/diretoria/conferencia?tipo=${t}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(tipo); }, [tipo, carregar]);

  async function marcar(item, situacao) {
    setSalvandoId(item.id);
    const limpar = item.situacao === situacao;
    try {
      const resp = limpar
        ? await fetch(`/api/diretoria/conferencia?tipo=${tipo}&lancamentoId=${encodeURIComponent(item.id)}`, { method: "DELETE" })
        : await fetch("/api/diretoria/conferencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, lancamentoId: item.id, situacao }) });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || "Erro");
      setData((d) => ({ ...d, itens: d.itens.map((i) => (i.id === item.id ? { ...i, situacao: limpar ? null : situacao } : i)) }));
    } catch (e) { alert(e.message); } finally { setSalvandoId(null); }
  }

  async function exportar() {
    if (!data?.itens?.length) return;
    setExportando(true);
    try {
      const xl = await import("@/lib/excel-relatorio");
      const headers = ["Situação", "Código Omie", tipo === "receber" ? "Cliente" : "Fornecedor", "Categoria", "Cód. cat", "Tipo doc", "Nº doc", "NF", "Chave NFe", tipo === "receber" ? "Pedido/OS" : "Pedido compra", "Conta corrente", "Emissão", "Vencimento", "Status Omie", "Detalhe", "Sincronizado", "Alterado Omie", "Sinais", "Valor", "Saldo"];
      const { workbook, sheet: ws, linhaInicio } = await xl.criarRelatorioTorg({
        titulo: `Conferência de lançamentos — ${tipo === "receber" ? "A Receber" : "A Pagar"}`,
        nomePlanilha: tipo === "receber" ? "A Receber" : "A Pagar",
        totalColunas: headers.length, codigoDoc: "REL-DIR-002",
      });
      let row = linhaInicio;
      xl.adicionarHeaderTabela(ws, row, headers); row++;
      const alin = { 18: "right", 19: "right" };
      const exp = lista; // exporta o recorte atual (mês + filtro + busca)
      for (const i of exp) {
        xl.adicionarLinhaTabela(ws, row, [
          i.situacao === "CONFERIDO" ? "Conferido" : i.situacao === "SUSPEITO" ? "Suspeito" : "",
          i.id, i.nome, i.categoriaNome || "", i.categoriaCodigo || "", i.tipoDoc || "",
          i.numeroDocumento || "", i.numeroDocFiscal || "", i.chaveNfe || "", i.numeroPedido || "",
          i.contaCorrenteId || "", fmtDia(i.emissao), fmtDia(i.venc), i.status || "",
          i.detalheCarregado ? "sim" : "não", fmtDataHora(i.syncedAt), fmtDataHora(i.dataAlteracaoOmie),
          i.flags.join(", "), Number(i.valor || 0), Number(i.saldo || 0),
        ], { alinhamento: alin });
        row++;
      }
      xl.adicionarLinhaTotais(ws, row, ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", `TOTAL — ${exp.length} título(s)`, "", Number(exp.reduce((s, i) => s + (i.saldo || 0), 0))]);
      const hojeStr = new Date().toLocaleDateString("en-CA");
      const sufixoMes = mesVenc !== "todos" ? ` venc ${mesVenc}` : "";
      await xl.downloadWorkbook(workbook, `Conferencia ${tipo === "receber" ? "a receber" : "a pagar"}${sufixoMes} ${hojeStr}.xlsx`);
    } catch (e) { alert("Erro ao exportar: " + e.message); } finally { setExportando(false); }
  }

  const { lista, cont, meses, totalMes } = useMemo(() => {
    const itens = data?.itens || [];
    const GRAVES = ["possível duplicado", "sem vínculo", "sem categoria", "alterado após sync"];
    const ehGrave = (i) => i.flags.some((f) => GRAVES.includes(f));
    // meses de vencimento presentes (p/ o seletor)
    const meses = [...new Set(itens.map((i) => (i.venc || "").slice(0, 7)).filter(Boolean))].sort();
    // base = recorte do mês de vencimento escolhido
    const base = mesVenc === "todos" ? itens : itens.filter((i) => (i.venc || "").slice(0, 7) === mesVenc);
    const cont = {
      conferidos: base.filter((i) => i.situacao === "CONFERIDO").length,
      suspeitos: base.filter((i) => i.situacao === "SUSPEITO").length,
      atencao: base.filter((i) => ehGrave(i) && i.situacao !== "CONFERIDO").length,
    };
    const q = busca.trim().toLowerCase();
    const lista = base.filter((i) => {
      if (filtro === "atencao" && !(ehGrave(i) && i.situacao !== "CONFERIDO")) return false;
      if (filtro === "suspeitos" && i.situacao !== "SUSPEITO") return false;
      if (filtro === "conferidos" && i.situacao !== "CONFERIDO") return false;
      if (!q) return true;
      return [i.nome, i.id, i.numeroDocFiscal, i.numeroDocumento, i.categoriaNome].some((s) => (s || "").toLowerCase().includes(q));
    });
    const totalMes = base.reduce((s, i) => s + (i.saldo || 0), 0);
    return { lista, cont, meses, totalMes };
  }, [data, filtro, busca, mesVenc]);

  if (loading) return <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando lançamentos…</div>;
  if (erro) return <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => carregar(tipo)} className="ml-auto text-xs underline">tentar de novo</button></div>;
  if (!data) return null;
  const { resumo } = data;

  const FiltroBtn = ({ id, label, n }) => (
    <button onClick={() => setFiltro(id)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${filtro === id ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue/40"}`}>
      {label}{n != null ? ` (${n})` : ""}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-torg-dark">Conferência de lançamentos</h2>
          <p className="text-[11px] text-torg-gray">Rastreabilidade título a título: origem no Omie, NF, pedido e datas. Marque conferido ✓ ou suspeito ⚠ pra construir a trilha de auditoria.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => { setTipo("pagar"); setExpand(null); }} className={`px-3 py-2 ${tipo === "pagar" ? "bg-torg-blue text-white" : "bg-white text-torg-gray"}`}>A pagar</button>
          <button onClick={() => { setTipo("receber"); setExpand(null); }} className={`px-3 py-2 ${tipo === "receber" ? "bg-torg-blue text-white" : "bg-white text-torg-gray"}`}>A receber</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniCard titulo="Em aberto" valor={fmtR$(resumo.saldoTotal)} sub={`${resumo.total} títulos`} />
        <MiniCard titulo="Com sinalização" valor={fmtR$(resumo.saldoComFlag)} sub={`${resumo.comFlag} títulos`} cor="amber" />
        <MiniCard titulo="Conferidos" valor={String(cont.conferidos)} sub="marcados ✓" cor="emerald" />
        <MiniCard titulo="Suspeitos" valor={String(cont.suspeitos)} sub="marcados ⚠" cor="rose" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <FiltroBtn id="atencao" label="Precisam atenção" n={cont.atencao} />
          <FiltroBtn id="suspeitos" label="Suspeitos" n={cont.suspeitos} />
          <FiltroBtn id="conferidos" label="Conferidos" n={cont.conferidos} />
          <FiltroBtn id="todos" label="Todos" n={resumo.total} />
        </div>
        <div className="flex items-center gap-2">
          <select value={mesVenc} onChange={(e) => setMesVenc(e.target.value)} title="Filtrar por mês de vencimento"
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-torg-blue bg-white text-torg-dark">
            <option value="todos">Todos os meses</option>
            {meses.map((m) => <option key={m} value={m}>vence {labelMes(m)}</option>)}
          </select>
          <button onClick={exportar} disabled={exportando} title="Exportar os lançamentos do recorte atual com a trilha e os sinais (Excel com filtro)"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50">
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Exportar Excel
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, fornecedor, NF…" className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none w-56" />
          </div>
        </div>
      </div>

      {mesVenc !== "todos" && (
        <p className="text-xs text-torg-gray">Vencendo em <b className="text-torg-dark">{labelMes(mesVenc)}</b>: {lista.length} título(s) no filtro · total do mês <b className="text-torg-dark">{fmtR$(totalMes)}</b></p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 text-left text-[11px] uppercase tracking-wide text-torg-gray">
            <tr>
              <th className="px-3 py-2.5">Conferir</th>
              <th className="px-3 py-2.5">{tipo === "receber" ? "Cliente" : "Fornecedor"} / origem</th>
              <th className="px-3 py-2.5">Categoria</th>
              <th className="px-3 py-2.5 text-center">Vencimento</th>
              <th className="px-3 py-2.5 text-right">Saldo</th>
              <th className="px-3 py-2.5">Sinais</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-torg-gray text-sm">Nenhum lançamento neste filtro.</td></tr>
            ) : lista.slice(0, LIMITE).map((i) => (
              <Fragment key={i.id}>
                <tr className={`hover:bg-gray-50/50 ${i.situacao === "SUSPEITO" ? "bg-rose-50/40" : i.situacao === "CONFERIDO" ? "bg-emerald-50/30" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => marcar(i, "CONFERIDO")} disabled={salvandoId === i.id} title="Marcar conferido"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center border ${i.situacao === "CONFERIDO" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-torg-gray border-gray-200 hover:border-emerald-400"}`}><CheckCircle2 size={15} /></button>
                      <button onClick={() => marcar(i, "SUSPEITO")} disabled={salvandoId === i.id} title="Marcar suspeito"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center border ${i.situacao === "SUSPEITO" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-torg-gray border-gray-200 hover:border-rose-400"}`}><AlertTriangle size={15} /></button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-torg-dark font-medium truncate max-w-[220px]" title={i.nome}>{i.nome}</p>
                    <p className="text-[10px] text-torg-gray font-mono">Omie #{i.id}{i.numeroDocFiscal ? ` · NF ${i.numeroDocFiscal}` : ""}</p>
                  </td>
                  <td className="px-3 py-2 text-torg-gray max-w-[150px] truncate" title={i.categoriaNome}>{i.categoriaNome || <span className="text-amber-600">sem categoria</span>}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap"><span className={i.vencido ? "text-red-600 font-semibold" : "text-torg-gray"}>{fmtDia(i.venc)}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(i.saldo)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {i.flags.map((f) => <span key={f} className={`text-[9px] px-1.5 py-0.5 rounded border ${FLAG_COR[f] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{f}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setExpand(expand === i.id ? null : i.id)} className="text-torg-gray hover:text-torg-blue"><ChevronDown size={16} className={`transition-transform ${expand === i.id ? "rotate-180" : ""}`} /></button>
                  </td>
                </tr>
                {expand === i.id && (
                  <tr className="bg-gray-50/40">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5 text-[11px]">
                        <Trace l="Código Omie" v={i.id} mono />
                        <Trace l="Cód. parceiro" v={i.codParceiro} mono />
                        <Trace l="Tipo doc" v={i.tipoDoc} />
                        <Trace l="Nº documento" v={i.numeroDocumento} />
                        <Trace l="NF (doc fiscal)" v={i.numeroDocFiscal} />
                        <Trace l="Chave NFe" v={i.chaveNfe} mono />
                        <Trace l={tipo === "receber" ? "Pedido / OS" : "Pedido compra"} v={i.numeroPedido} />
                        <Trace l="Conta corrente" v={i.contaCorrenteId} mono />
                        <Trace l="Emissão" v={fmtDia(i.emissao)} />
                        <Trace l="Vencimento" v={fmtDia(i.venc)} />
                        <Trace l="Status Omie" v={i.status} />
                        <Trace l="Categoria (cód.)" v={i.categoriaCodigo} />
                        <Trace l="Detalhe carregado" v={i.detalheCarregado ? "sim" : "não"} />
                        <Trace l="Sincronizado em" v={fmtDataHora(i.syncedAt)} />
                        <Trace l="Alterado no Omie" v={fmtDataHora(i.dataAlteracaoOmie)} />
                        <Trace l="Valor total" v={fmtR$(i.valor)} />
                      </div>
                      {i.observacao && <p className="text-[11px] text-torg-gray mt-2"><b>Obs Omie:</b> {i.observacao}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <a href={omieModuloUrl(tipo)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><ExternalLink size={11} /> abrir módulo no Omie</a>
                        {i.situacao && <span className="text-[10px] text-torg-gray">{i.situacao === "CONFERIDO" ? "✓ conferido" : "⚠ suspeito"} por {i.conferenciaPor || "—"}</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {lista.length > LIMITE && <p className="text-xs text-torg-gray text-center">Mostrando {LIMITE} de {lista.length}. Refine com a busca ou filtros.</p>}
    </div>
  );
}

function MiniCard({ titulo, valor, sub, cor }) {
  const c = cor === "amber" ? "text-amber-700" : cor === "emerald" ? "text-emerald-700" : cor === "rose" ? "text-rose-700" : "text-torg-dark";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <p className="text-[11px] text-torg-gray">{titulo}</p>
      <p className={`text-lg font-extrabold tabular-nums leading-tight ${c}`}>{valor}</p>
      {sub && <p className="text-[10px] text-torg-gray">{sub}</p>}
    </div>
  );
}
function Trace({ l, v, mono }) {
  return (
    <div>
      <span className="text-torg-gray">{l}: </span>
      <span className={`text-torg-dark ${mono ? "font-mono break-all" : ""}`}>{v && String(v).trim() ? v : "—"}</span>
    </div>
  );
}

/* ─────────────────────── DRE Alvo × Realizado ─────────────────────── */
function DreAlvo() {
  const [meses, setMeses] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (m) => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/diretoria/dre${m ? `?meses=${m}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j); setMeses(j.meses);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(null); }, [carregar]);

  if (loading && !data) return <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Montando DRE…</div>;
  if (erro) return <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => carregar(meses)} className="ml-auto text-xs underline">tentar de novo</button></div>;
  if (!data) return null;

  const periodoLabel = `jan–${MESES_ABREV[data.meses - 1]}/${String(data.ano).slice(2)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-torg-dark flex items-center gap-2"><Target size={20} className="text-torg-blue" /> DRE Alvo × Realizado · {data.ano}</h2>
          <p className="text-[11px] text-torg-gray">Alvo gerencial (definido no início do ano), proporcional ao período. Realizado por competência (data de emissão): receita = faturamento; custos/despesas = a pagar por categoria.</p>
        </div>
        <label className="text-xs text-torg-gray flex items-center gap-2 shrink-0">
          Acumulado até
          <select value={data.meses} onChange={(e) => carregar(Number(e.target.value))} disabled={loading}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-torg-blue disabled:opacity-50">
            {MESES_ABREV.map((m, i) => <option key={i} value={i + 1}>{m}/{String(data.ano).slice(2)}</option>)}
          </select>
        </label>
      </div>

      {data.naoClassificado > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span><b>{fmtR$(data.naoClassificado)}</b> de gastos <b>sem categoria/não mapeados</b> entraram como custo no Resultado Final (linha "Não classificado"). O realizado fica mais preciso conforme esses lançamentos forem categorizados no Omie.</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 text-left text-[11px] uppercase tracking-wide text-torg-gray">
            <tr>
              <th className="px-4 py-2.5">Linha (DRE)</th>
              <th className="px-4 py-2.5 text-right">Alvo · {periodoLabel}</th>
              <th className="px-4 py-2.5 text-right">Realizado</th>
              <th className="px-4 py-2.5 text-right">Δ</th>
              <th className="px-4 py-2.5 text-right">Atingido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.linhas.map((l, i) => {
              const sub = l.kind === "subtotal" || l.kind === "resultado" || l.kind === "grupoHeader";
              const delta = l.real - l.alvo;
              const pct = l.alvo > 0 ? Math.round((l.real / l.alvo) * 100) : null;
              const bom = l.sentido === "receita" ? l.real >= l.alvo : l.real <= l.alvo;
              return (
                <tr key={i} className={`${sub ? "bg-gray-50/40 font-semibold" : ""} ${l.kind === "resultado" ? "border-t-2 border-torg-dark/20" : ""} ${l.kind === "naoclass" ? "bg-amber-50/40" : ""}`}>
                  <td className={`px-4 py-2 ${l.nivel === 0 ? "text-torg-dark" : "text-torg-gray pl-8"}`}>{l.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-torg-gray">{l.alvo ? fmtR$(l.alvo) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-torg-dark">{fmtR$(l.real)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${bom ? "text-emerald-700" : "text-red-600"}`}>{delta >= 0 ? "+" : ""}{fmtR$(delta)}</td>
                  <td className="px-4 py-2 text-right">
                    {pct != null ? <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${bom ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{pct}%</span> : <span className="text-torg-gray">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-torg-gray">Δ e % na ótica de cada linha: em receita/resultado, realizado acima do alvo é bom (verde); em custos/despesas, acima do alvo é estouro (vermelho). v1 — mapeamento por prefixo de categoria do Omie; valide e me diga ajustes.</p>
    </div>
  );
}

/* ─────────────────────── fluxo de caixa diário (ruptura) ─────────────────────── */
function FluxoDiario({ fluxo, fluxoNaturezas, fluxoVencido, saldoInicial, saldoAtualizadoEm, onRefresh }) {
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState(String(saldoInicial ?? 0));
  const [salvandoSaldo, setSalvandoSaldo] = useState(false);
  const [incluirFin, setIncluirFin] = useState(true);
  const [incluirInv, setIncluirInv] = useState(true);

  async function salvarSaldo() {
    const v = Number(String(saldoInput).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(v)) { alert("Valor inválido"); return; }
    setSalvandoSaldo(true);
    try {
      const r = await fetch("/api/diretoria/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saldoCaixa: v }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setEditandoSaldo(false);
      onRefresh?.();
    } catch (e) { alert(e.message); } finally { setSalvandoSaldo(false); }
  }

  const hojeK = new Date().toISOString().slice(0, 10);
  const nat = fluxoNaturezas || { operacional: 0, financeiro: 0, investimento: 0 };

  // Recalcula o saldo projetado conforme os toggles de natureza
  const { rows, pior, piorDiaCalc } = useMemo(() => {
    let acc = saldoInicial || 0, p = saldoInicial || 0, pd = null;
    const rows = (fluxo || []).map((e) => {
      const pagar = e.pagarOper + (incluirFin ? e.pagarFin : 0) + (incluirInv ? e.pagarInv : 0);
      const liquido = e.receberFat + e.receberPrev - pagar;
      acc += liquido;
      if (acc < p) { p = acc; pd = e.dia; }
      return { dia: e.dia, pagar, receberFat: e.receberFat, receberPrev: e.receberPrev, liquido, saldo: acc };
    });
    return { rows, pior: p, piorDiaCalc: pd };
  }, [fluxo, incluirFin, incluirInv, saldoInicial]);

  // Vencidos em aberto (fora da projeção diária), respeitando os toggles
  const v = fluxoVencido || { pagarOper: 0, pagarFin: 0, pagarInv: 0, receberFat: 0, receberPrev: 0 };
  const vencPagar = v.pagarOper + (incluirFin ? v.pagarFin : 0) + (incluirInv ? v.pagarInv : 0);
  const vencReceber = (v.receberFat || 0) + (v.receberPrev || 0);
  const temVencido = vencPagar > 0.5 || vencReceber > 0.5;

  const saldoBox = (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-torg-gray">Saldo em caixa hoje:</span>
      {editandoSaldo ? (
        <>
          <input value={saldoInput} onChange={(e) => setSaldoInput(e.target.value)} autoFocus
            className="w-32 px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-torg-blue tabular-nums" placeholder="-90000" />
          <button onClick={salvarSaldo} disabled={salvandoSaldo} className="text-[11px] text-white bg-torg-blue px-2 py-1 rounded disabled:opacity-50">salvar</button>
          <button onClick={() => { setEditandoSaldo(false); setSaldoInput(String(saldoInicial ?? 0)); }} className="text-[11px] text-torg-gray hover:underline">cancelar</button>
        </>
      ) : (
        <>
          <span className={`font-bold tabular-nums ${(saldoInicial || 0) < 0 ? "text-red-700" : "text-torg-dark"}`}>{fmtR$(saldoInicial)}</span>
          <button onClick={() => { setSaldoInput(String(saldoInicial ?? 0)); setEditandoSaldo(true); }} title="Editar saldo" className="text-torg-gray hover:text-torg-blue"><Pencil size={12} /></button>
        </>
      )}
    </div>
  );

  const chips = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-torg-gray">No fluxo:</span>
      <span className="text-[11px] px-2 py-1 rounded bg-gray-100 text-torg-dark">Operacional {fmtR$(nat.operacional)}</span>
      <button onClick={() => setIncluirFin((v) => !v)} title="Incluir/excluir do fluxo"
        className={`text-[11px] px-2 py-1 rounded border transition-colors ${incluirFin ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-gray-200 text-torg-gray line-through"}`}>
        {incluirFin ? "✓" : "✕"} Dívida/financ. {fmtR$(nat.financeiro)}
      </button>
      <button onClick={() => setIncluirInv((v) => !v)} title="Incluir/excluir do fluxo"
        className={`text-[11px] px-2 py-1 rounded border transition-colors ${incluirInv ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-gray-200 text-torg-gray line-through"}`}>
        {incluirInv ? "✓" : "✕"} Investimento {fmtR$(nat.investimento)}
      </button>
    </div>
  );

  if (!fluxo?.length) return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
      <h2 className="font-semibold text-torg-dark">Fluxo de caixa diário · próximos 60 dias</h2>
      {saldoBox}
      <p className="text-sm text-torg-gray">Sem movimentos nos próximos 60 dias.</p>
    </section>
  );
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 space-y-2.5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-torg-dark">Fluxo de caixa diário · próximos 60 dias</h2>
            <p className="text-[11px] text-torg-gray mt-0.5">A pagar (saída) × recebimentos faturados e previsões (entrada), por dia. O <b>saldo projetado</b> parte do caixa de hoje. Tire a dívida/investimento abaixo pra ver o aperto só do operacional. <b>Vencidos ficam em aberto</b>, fora desta projeção.</p>
          </div>
          {pior < 0 && (
            <div className="text-right shrink-0">
              <p className="text-[11px] text-torg-gray">Pior saldo projetado</p>
              <p className="text-lg font-extrabold text-red-700 tabular-nums leading-none">{fmtR$(pior)}</p>
              <p className="text-[10px] text-torg-gray">{piorDiaCalc ? `por volta de ${fmtDia(piorDiaCalc)}` : ""}</p>
            </div>
          )}
        </div>
        {saldoBox}
        {chips}
      </div>
      {temVencido && (
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between gap-3 flex-wrap text-sm">
          <span className="text-amber-800 font-medium inline-flex items-center gap-1.5"><AlertTriangle size={15} /> Vencido em aberto <span className="text-[11px] font-normal text-amber-700/80">(já passou do vencimento — fora da projeção diária)</span></span>
          <div className="flex items-center gap-4 text-[12px] tabular-nums">
            <span className="text-torg-gray">a pagar <b className="text-rose-700">{fmtR$(vencPagar)}</b></span>
            <span className="text-torg-gray">a receber <b className="text-emerald-700">{fmtR$(vencReceber)}</b></span>
            <span className="text-torg-gray">líquido <b className={vencReceber - vencPagar < 0 ? "text-red-700" : "text-emerald-700"}>{fmtR$(vencReceber - vencPagar)}</b></span>
          </div>
        </div>
      )}
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 text-left text-[11px] uppercase tracking-wide text-torg-gray sticky top-0">
            <tr>
              <th className="px-4 py-2">Dia</th>
              <th className="px-4 py-2 text-right">A pagar</th>
              <th className="px-4 py-2 text-right">Receb. faturado</th>
              <th className="px-4 py-2 text-right">Receb. previsto</th>
              <th className="px-4 py-2 text-right">Líquido</th>
              <th className="px-4 py-2 text-right">Saldo projetado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((f) => (
              <tr key={f.dia} className="hover:bg-gray-50/50">
                <td className="px-4 py-1.5 whitespace-nowrap text-torg-dark">{fmtDia(f.dia)}{f.dia === hojeK ? <span className="text-[10px] text-torg-gray"> (hoje)</span> : null}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-rose-600">{f.pagar > 0 ? fmtR$(f.pagar) : "—"}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700">{f.receberFat > 0 ? fmtR$(f.receberFat) : "—"}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-torg-blue">{f.receberPrev > 0 ? fmtR$(f.receberPrev) : "—"}</td>
                <td className={`px-4 py-1.5 text-right tabular-nums font-medium ${f.liquido < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmtR$(f.liquido)}</td>
                <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${f.saldo < 0 ? "text-red-700 bg-red-50/50" : "text-torg-dark"}`}>{fmtR$(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────── previsão de faturamento (linha do tempo) ─────────────────────── */
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const labelMes = (k) => { const [y, m] = (k || "").split("-"); return m ? `${MESES_ABREV[+m - 1]}/${y.slice(2)}` : k; };

function PrevisaoFaturamento() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/previsao-faturamento", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Edição manual da data de faturamento por OP
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState("");
  const [editObs, setEditObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  function abrirEdicao(o) {
    setEditId(o.opId);
    setEditData((o.dataFaturamento || "").slice(0, 10));
    setEditObs(o.observacao || "");
  }
  async function salvarData() {
    if (!editData) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/diretoria/previsao-faturamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId: editId, dataFaturamento: editData, observacao: editObs || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setEditId(null); await carregar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }
  async function limparData(opId) {
    setSalvando(true);
    try {
      const r = await fetch(`/api/diretoria/previsao-faturamento?opId=${encodeURIComponent(opId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao limpar");
      setEditId(null); await carregar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  if (loading) return <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Calculando previsão…</div>;
  if (erro) return <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={carregar} className="ml-auto text-xs underline">tentar de novo</button></div>;
  if (!data) return null;

  const maxFat = Math.max(1, ...data.faturamentoMes.map((m) => m.valor));
  const maxRec = Math.max(1, ...data.recebimentoMes.map((m) => m.valor));
  const hojeMes = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-torg-dark flex items-center gap-2"><CalendarClock size={20} className="text-torg-blue" /> Previsão de faturamento</h2>
        <p className="text-[11px] text-torg-gray">Saldo a faturar (líquido) datado pela entrega de cada OP (cronograma vigente › prazo da OP) e pelo prazo de pagamento do cliente. Use pra decidir o que antecipar.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiGrande titulo="A faturar (carteira ativa)" valor={data.totalSaldo} icon={Truck} cor="blue" sub={`${data.qtd} obras · líquido de impostos`} />
        <KpiGrande titulo="Faturamento atrasado" valor={data.totalAtrasado} icon={Clock} cor={data.totalAtrasado > 0 ? "rose" : "emerald"} sub="data de entrega já passou" />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-torg-gray">Antecipáveis</p>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600"><Zap size={15} /></span>
          </div>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums mt-2 leading-tight">{data.qtdAntecipavel}</p>
          <p className="text-[11px] text-torg-gray mt-0.5">obras prontas antes da data prevista</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SerieMensal titulo="Faturamento previsto / mês" serie={data.faturamentoMes} max={maxFat} hojeMes={hojeMes} cor="bg-torg-blue" />
        <SerieMensal titulo="Recebimento previsto / mês" serie={data.recebimentoMes} max={maxRec} hojeMes={hojeMes} cor="bg-emerald-500" legenda="já com o prazo de pagamento do cliente" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 text-left text-[11px] uppercase tracking-wide text-torg-gray">
            <tr>
              <th className="px-4 py-2.5">OP / Cliente</th>
              <th className="px-4 py-2.5 w-40">Produção</th>
              <th className="px-4 py-2.5 text-center">Faturar em</th>
              <th className="px-4 py-2.5 text-center">Receber em</th>
              <th className="px-4 py-2.5 text-right">A faturar (líq.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.ops.map((o) => (
              <tr key={o.numero} className="hover:bg-gray-50/50 align-top">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-torg-dark">{fmtOP(o.numero)} <span className="font-normal text-torg-gray">· {o.cliente}{o.obra ? ` · ${o.obra}` : ""}</span></p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {o.atrasado && <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">entrega atrasada</span>}
                    {o.antecipavel && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><Zap size={9} />antecipável</span>}
                    {o.eventos.length > 0 && <span className="text-[10px] text-torg-gray">{o.eventos.length} evento(s)</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {o.pctProducao == null ? <span className="text-[11px] text-torg-gray">sem peças</span> : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-torg-blue" style={{ width: `${o.pctProducao}%` }} />
                      </div>
                      <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{o.pctProducao}%</span>
                    </div>
                  )}
                  {o.pctPronto > 0 && <p className="text-[10px] text-emerald-600 mt-0.5">{o.pctPronto}% pronto/pintado</p>}
                </td>
                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                  {editId === o.opId ? (
                    <div className="flex flex-col items-center gap-1">
                      <input type="date" value={editData} onChange={(e) => setEditData(e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-torg-blue" />
                      <input value={editObs} onChange={(e) => setEditObs(e.target.value)} placeholder="motivo (opcional)"
                        className="text-[11px] border border-gray-200 rounded px-2 py-0.5 outline-none focus:border-torg-blue w-36" />
                      <div className="flex items-center gap-2">
                        <button onClick={salvarData} disabled={salvando || !editData} className="text-[11px] text-white bg-torg-blue px-2 py-0.5 rounded disabled:opacity-50">salvar</button>
                        <button onClick={() => setEditId(null)} className="text-[11px] text-torg-gray hover:underline">cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="inline-flex flex-col items-center">
                      <span className={`tabular-nums inline-flex items-center gap-1 ${o.atrasado ? "text-red-600 font-semibold" : "text-torg-dark"}`}>
                        {fmtDia(o.dataFaturamento)}
                        <button onClick={() => abrirEdicao(o)} title="Editar data" className="text-torg-gray hover:text-torg-blue"><Pencil size={11} /></button>
                      </span>
                      {o.manual ? (
                        <button onClick={() => limparData(o.opId)} disabled={salvando} title="Voltar ao automático" className="text-[10px] text-amber-600 hover:underline">
                          manual · auto: {fmtDia(o.dataFaturamentoAuto)}
                        </button>
                      ) : (
                        <span className="text-[10px] text-torg-gray">{o.base}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                  <p className="tabular-nums text-torg-dark">{fmtDia(o.dataRecebimento)}</p>
                  <p className="text-[10px] text-torg-gray">{o.prazoDias}d{o.prazoEstimado ? " (estim.)" : ""}</p>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(o.saldoLiq)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-torg-gray">A data vem do cronograma vigente (ajusta sozinha quando o cronograma muda). Clique no lápis pra fixar uma data manual — ela passa a valer até você voltar pro automático. O saldo é datado na entrega; fracionar por evento parcial fica pra um próximo passo.</p>
    </div>
  );
}

function SerieMensal({ titulo, serie, max, hojeMes, cor, legenda }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-torg-dark text-sm">{titulo}</h3>
        {legenda && <p className="text-[11px] text-torg-gray mt-0.5">{legenda}</p>}
      </div>
      <div className="p-5 space-y-2.5">
        {serie.length === 0 ? <p className="text-sm text-torg-gray text-center py-3">Sem dados.</p> : serie.map((m) => (
          <div key={m.mes}>
            <div className="flex items-center justify-between text-sm gap-3">
              <span className={`tabular-nums ${m.mes < hojeMes ? "text-red-600 font-medium" : "text-torg-dark"}`}>{labelMes(m.mes)}{m.mes < hojeMes ? " ⚠" : ""}</span>
              <span className="tabular-nums font-medium text-torg-dark">{fmtR$(m.valor)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
              <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.round((m.valor / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── onde cortar (a pagar por categoria) ─────────────────────── */
function OndeCortar({ categorias, totalPagar }) {
  const [n, setN] = useState(15);
  if (!categorias?.length) return <p className="text-sm text-torg-gray text-center py-16">Sem dados de categorias.</p>;
  const max = categorias[0].valor || 1;
  const semCat = categorias.find((c) => c.nome === "(sem categoria)");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-torg-dark">Onde cortar — a pagar por categoria</h2>
        <p className="text-[11px] text-torg-gray">{categorias.length} categorias · total em aberto {fmtR$(totalPagar)}. Maiores blocos primeiro; em vermelho a parcela já vencida de cada um.</p>
      </div>
      {semCat && semCat.pct >= 8 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span><b>{fmtR$(semCat.valor)} ({semCat.pct}%)</b> está <b>sem categoria</b> no Omie — categorizar esse bloco é o primeiro passo pra enxergar o que dá pra cortar.</span>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {categorias.slice(0, n).map((c, i) => (
          <div key={i} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-torg-dark font-medium truncate flex-1" title={c.nome}>{c.nome}</span>
              <span className="text-[11px] text-torg-gray whitespace-nowrap hidden sm:inline">{c.qtd} tít.</span>
              {c.vencido > 0 && <span className="text-[11px] text-red-600 whitespace-nowrap">{fmtR$(c.vencido)} venc.</span>}
              <span className="tabular-nums font-semibold text-torg-dark whitespace-nowrap w-28 text-right">{fmtR$(c.valor)}</span>
              <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{c.pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.round((c.valor / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {categorias.length > n && (
        <button onClick={() => setN(categorias.length)} className="text-xs text-torg-blue hover:underline">ver todas as {categorias.length} categorias →</button>
      )}
    </div>
  );
}

/* ─────────────────────── saldo de contratos Omie (venda+serviço) — A receber ─────────────────────── */
function SaldoContratos({ faturadoAberto }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async (forcar) => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/diretoria/saldo-contratos${forcar ? "?forcar=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(false); }, [carregar]);

  const aFaturar = data?.totalAFaturar || 0;
  const total = (faturadoAberto || 0) + aFaturar;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiGrande titulo="Faturado em aberto" valor={faturadoAberto} icon={Banknote} cor="emerald" sub="títulos já emitidos (Contas a Receber)" />
        <KpiGrande titulo="A faturar — contratos Omie" valor={aFaturar} icon={Truck} cor="blue" sub="saldo de medições: venda + serviço" />
        <KpiGrande titulo="A receber potencial" valor={total} icon={TrendingUp} cor="blue" sub="faturado + saldo de contratos" />
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> Saldo de contratos no Omie (venda + serviço)</h2>
            <p className="text-[11px] text-torg-gray mt-0.5">O que ainda há para faturar das medições em aberto — pedidos de venda e ordens de serviço.{data?.atualizadoEm ? ` Atualizado ${fmtDataHora(data.atualizadoEm)}.` : ""}{data?.obrasComAtraso ? ` ${data.obrasComAtraso} obra(s) com previsão atrasada.` : ""}{data?.doCache ? " (cache)" : ""}</p>
          </div>
          <button onClick={() => carregar(true)} disabled={loading} className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> atualizar do Omie
          </button>
        </div>
        <div className="p-5">
          {loading && !data ? (
            <div className="text-center py-8 text-torg-gray text-sm"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Consultando o Omie…</div>
          ) : erro ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => carregar(false)} className="ml-auto text-xs underline">tentar de novo</button></div>
          ) : !data?.obras?.length ? (
            <p className="text-sm text-torg-gray text-center py-4">Nenhum contrato em aberto no Omie.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-torg-gray">
                  <tr><th className="pb-2">OP / Obra</th><th className="pb-2">Tipo</th><th className="pb-2 text-right">Contratado</th><th className="pb-2 w-36">Faturado</th><th className="pb-2 text-right">A faturar</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.obras.map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="py-1.5 max-w-[260px] truncate" title={o.projeto}>
                        {o.numeroOp ? <span className="font-semibold text-torg-dark">{fmtOP(o.numeroOp)} </span> : null}<span className="text-torg-gray">{o.projeto}</span>
                        {o.atrasado && <span className="ml-1 text-[10px] text-red-600 whitespace-nowrap">⚠ atrasada</span>}
                      </td>
                      <td className="py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${o.tipo === "Serviço" ? "bg-purple-50 text-purple-700" : o.tipo === "Venda+Serviço" ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700"}`}>{o.tipo}</span></td>
                      <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtR$(o.total)}</td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${o.pctFaturado}%` }} /></div>
                          <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{o.pctFaturado}%</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-torg-dark whitespace-nowrap">{fmtR$(o.aFaturar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────── previsão / a receber projetado ─────────────────────── */
function PrevisaoReceita({ previsao }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> A receber projetado — carteira ativa</h2>
          <p className="text-[11px] text-torg-gray mt-0.5">Saldo a faturar das OPs ativas, <b>líquido de impostos</b> e <b>sem os faturamentos projetados</b> do Omie (pedidos "Não Faturado"). Base de medições, igual ao Comercial.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-torg-blue tabular-nums leading-none">{fmtR$(previsao.aFaturar)}</p>
          <p className="text-[11px] text-torg-gray">a faturar líquido · {previsao.qtdObras} obras · receita líq. {fmtR$(previsao.receitaTotal)} · já faturado {fmtR$(previsao.faturado)}</p>
          {previsao.projetadoExcluido > 0 && (
            <p className="text-[10px] text-amber-600 mt-0.5">{fmtR$(previsao.projetadoExcluido)} em pedidos projetados do Omie foram descartados</p>
          )}
        </div>
      </div>
      <div className="p-5 overflow-x-auto">
        {previsao.ops.length === 0 ? (
          <p className="text-sm text-torg-gray text-center py-4">Nenhuma obra ativa com receita lançada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-torg-gray">
              <tr><th className="pb-2">OP</th><th className="pb-2">Cliente / Obra</th><th className="pb-2 text-right">Receita</th><th className="pb-2 w-40">Faturado</th><th className="pb-2 text-right">A faturar</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {previsao.ops.map((o) => (
                <tr key={o.numero} className="hover:bg-gray-50/50">
                  <td className="py-1.5 font-semibold text-torg-dark whitespace-nowrap">{fmtOP(o.numero)}</td>
                  <td className="py-1.5 text-torg-gray truncate max-w-[220px]">{o.cliente}{o.obra ? ` · ${o.obra}` : ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtR$(o.receita)}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${o.pctFaturado}%` }} />
                      </div>
                      <span className="text-[11px] text-torg-gray tabular-nums w-9 text-right">{o.pctFaturado}%</span>
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
  );
}

function ReceberProjetado({ faturadoAberto, previsao }) {
  const total = (faturadoAberto || 0) + (previsao?.aFaturar || 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiGrande titulo="Faturado em aberto" valor={faturadoAberto} icon={Banknote} cor="emerald" sub="títulos já emitidos, aguardando recebimento" />
        <KpiGrande titulo="A faturar (carteira ativa)" valor={previsao?.aFaturar} icon={Truck} cor="blue" sub={`líquido de impostos · ${previsao?.qtdObras || 0} obras`} />
        <KpiGrande titulo="A receber potencial" valor={total} icon={TrendingUp} cor="blue" sub="faturado + projetado" />
      </div>
      {previsao && <PrevisaoReceita previsao={previsao} />}
    </div>
  );
}

/* ─────────────────────── componentes compartilhados ─────────────────────── */
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
