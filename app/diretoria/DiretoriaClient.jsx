"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Lock, Loader2, AlertCircle, UserPlus, X, ShieldCheck, ArrowLeft,
  TrendingUp, TrendingDown, Wallet, Banknote, Truck, RefreshCw,
  AlertTriangle, Flame, Search, ArrowDownRight, ArrowUpRight,
} from "lucide-react";

const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDia = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }) : "—");
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

const ABAS_BASE = [
  { id: "ruptura", label: "Pontos de ruptura" },
  { id: "resumo", label: "Resumo" },
  { id: "pagar", label: "A pagar" },
  { id: "receber", label: "A receber" },
];

export default function DiretoriaClient({ isDono, userNome }) {
  const [aba, setAba] = useState("ruptura");
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
            <button onClick={carregarFin} disabled={loadingFin} className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={13} className={loadingFin ? "animate-spin" : ""} /> atualizar
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
        {erroFin && (aba === "ruptura" || aba === "resumo") ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle size={18} /> {erroFin}
            <button onClick={carregarFin} className="ml-auto text-xs underline">tentar de novo</button>
          </div>
        ) : (loadingFin || !fin) && (aba === "ruptura" || aba === "resumo") ? (
          <div className="text-center py-16 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando números…</div>
        ) : null}

        {/* ════════ PONTOS DE RUPTURA ════════ */}
        {aba === "ruptura" && fin && <Ruptura fin={fin} />}

        {/* ════════ RESUMO ════════ */}
        {aba === "resumo" && fin && <Resumo fin={fin} />}

        {/* ════════ A PAGAR / A RECEBER ════════ */}
        {(aba === "pagar" || aba === "receber") && (
          <div className="space-y-6">
            {aba === "receber" && fin?.previsao && (
              <ReceberProjetado faturadoAberto={fin.aReceber.total} previsao={fin.previsao} />
            )}
            <ContasView tipo={aba} data={listas[aba]} loading={loadingLista} erro={erroLista} onRetry={() => carregarLista(aba)} />
          </div>
        )}

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
function Ruptura({ fin }) {
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

/* ─────────────────────── previsão / a receber projetado ─────────────────────── */
function PrevisaoReceita({ previsao }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> A receber projetado — carteira ativa</h2>
          <p className="text-[11px] text-torg-gray mt-0.5">Saldo a faturar das OPs ativas: receita lançada menos o que já foi medido/faturado no Omie (mesma base do Comercial).</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-torg-blue tabular-nums leading-none">{fmtR$(previsao.aFaturar)}</p>
          <p className="text-[11px] text-torg-gray">a faturar · {previsao.qtdObras} obras · carteira {fmtR$(previsao.receitaTotal)} · já faturado {fmtR$(previsao.faturado)}</p>
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
        <KpiGrande titulo="A faturar (carteira ativa)" valor={previsao?.aFaturar} icon={Truck} cor="blue" sub={`saldo a medir · ${previsao?.qtdObras || 0} obras`} />
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
