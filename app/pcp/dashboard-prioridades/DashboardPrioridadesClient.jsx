"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, Trophy, CalendarClock, Package, Target, CheckCircle2, Inbox } from "lucide-react";

const AUTO_REFRESH_MS = 60_000;

// Estado visual por situação (cores fortes, legíveis de longe na TV).
const SIT = {
  NO_PRAZO:  { label: "No prazo",  ring: "#22c55e", texto: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  APERTADO:  { label: "Apertado",  ring: "#f59e0b", texto: "text-amber-300",   chip: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  ATRASADO:  { label: "Atrasado",  ring: "#ef4444", texto: "text-red-300",     chip: "bg-red-500/15 text-red-300 border-red-500/30" },
  CONCLUIDO: { label: "Concluído", ring: "#10b981", texto: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  SEM_DATA:  { label: "Sem data",  ring: "#64748b", texto: "text-slate-300",   chip: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  SEM_DADOS: { label: "Sem dados", ring: "#64748b", texto: "text-slate-400",   chip: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
const numBR = (n) => Number(n || 0).toLocaleString("pt-BR");

export default function DashboardPrioridadesClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/pcp/dashboard-prioridades", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh silencioso + relógio
  useEffect(() => {
    const t1 = setInterval(() => carregar(true), AUTO_REFRESH_MS);
    const t2 = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregar]);

  // Fullscreen
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.();
  };

  const obras = dados?.obras || [];

  return (
    <div ref={rootRef} className="bg-torg-dark text-white rounded-2xl overflow-auto min-h-[80vh] p-6 print:hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-400/20 p-2.5 rounded-xl"><Trophy size={28} className="text-amber-300" /></div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Prioridades de Produção</h1>
            <p className="text-sm text-slate-300">Metas por obra — atualiza sozinho a cada minuto</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-xs text-slate-300 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
          </div>
          <button onClick={() => carregar(false)} title="Atualizar agora"
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white">{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-300">
          <Loader2 size={40} className="animate-spin mb-3" /> <p>Carregando prioridades…</p>
        </div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" />
          <p className="text-red-300 mb-3">{erro}</p>
          <button onClick={() => carregar(false)} className="text-sm text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : obras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center text-slate-300">
          <Inbox size={44} className="mb-3 opacity-50" />
          <p className="text-lg font-semibold text-white">Nenhuma prioridade marcada</p>
          <p className="text-sm mt-1 max-w-md">No <strong>Relatório de Produção</strong>, use a coluna <strong>Prioridade</strong> (＋ Priorizar) para marcar as obras e definir a data estimada. Elas aparecem aqui automaticamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {obras.map((o) => <ObraCard key={o.obra} obra={o} />)}
        </div>
      )}
    </div>
  );
}

function ObraCard({ obra }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-torg-dark bg-amber-300 rounded-full w-7 h-7 flex items-center justify-center shrink-0" title={`${obra.melhorOrdem}ª prioridade`}>{obra.melhorOrdem}º</span>
        <h2 className="text-2xl font-extrabold tracking-tight truncate" title={obra.obra}>{obra.obra}</h2>
      </div>
      <div className="space-y-4">
        {obra.itens.map((it) => <SetorBloco key={it.setor} it={it} />)}
      </div>
    </div>
  );
}

function SetorBloco({ it }) {
  const sit = SIT[it.situacao] || SIT.SEM_DADOS;
  return (
    <div className="flex items-center gap-4">
      <Ring pct={it.pct} cor={sit.ring} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-200">{it.setorNome}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${sit.chip}`}>{sit.label}</span>
          {!it.obraInteira && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300 font-semibold">★ {it.qtdPecasEscopo} peça{it.qtdPecasEscopo === 1 ? "" : "s"}</span>
          )}
        </div>
        <p className="text-lg font-bold text-white leading-tight mt-0.5">
          {numBR(it.pecasConcluidas)} <span className="text-slate-400 font-normal">/ {numBR(it.pecasTotal)} peças</span>
        </p>

        {/* Linha de meta / prazo */}
        {it.situacao === "CONCLUIDO" ? (
          <p className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5 mt-1"><CheckCircle2 size={15} /> Concluído</p>
        ) : it.situacao === "SEM_DADOS" ? (
          <p className="text-sm text-slate-400 mt-1">Sem programação no Syneco</p>
        ) : it.situacao === "SEM_DATA" ? (
          <p className="text-sm text-slate-300 flex items-center gap-1.5 mt-1"><CalendarClock size={15} /> Defina a data estimada</p>
        ) : it.situacao === "ATRASADO" ? (
          <div className="mt-1">
            <p className="text-sm font-bold text-red-300 flex items-center gap-1.5"><CalendarClock size={15} /> Prazo vencido ({fmtData(it.dataEstimada)})</p>
            <p className="text-sm text-slate-300">Faltam <strong className="text-white">{numBR(it.restantes)}</strong> peças</p>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-4">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wide flex items-center gap-1"><Target size={12} /> Meta/dia</p>
              <p className={`text-2xl font-extrabold leading-none ${sit.texto}`}>{numBR(it.pecasPorDia)}<span className="text-sm font-normal text-slate-400"> pç</span></p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wide flex items-center gap-1"><CalendarClock size={12} /> Prazo</p>
              <p className="text-base font-bold text-white leading-none">{fmtData(it.dataEstimada)}</p>
              <p className="text-[11px] text-slate-400">{it.diasRestantes} dia{it.diasRestantes === 1 ? "" : "s"} útil{it.diasRestantes === 1 ? "" : "eis"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Anel de progresso (SVG) com % no centro.
function Ring({ pct, cor }) {
  const r = 34, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(pct, 0), 100) / 100);
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={cor} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold tabular-nums text-white">{pct}%</span>
      </div>
    </div>
  );
}
