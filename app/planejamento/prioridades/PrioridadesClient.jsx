"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, Trophy, CalendarClock, Inbox, CheckCircle2, Lock, AlertTriangle } from "lucide-react";

const AUTO_REFRESH_MS = 60_000;

const SETOR_LABEL = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem",
};
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

function sitSetor(s) {
  if (s.concluida) return "CONCLUIDO";
  if (s.bloqueada) return "HOLD";
  if (s.atrasoDias > 0) return "ATRASADO";
  if (!s.entrega) return "SEM_DATA";
  return "ANDAMENTO";
}
const COR = {
  CONCLUIDO: { barra: "bg-emerald-500", texto: "text-emerald-300", pill: "bg-emerald-500/15 text-emerald-300" },
  ANDAMENTO: { barra: "bg-torg-blue", texto: "text-sky-300", pill: "bg-sky-500/15 text-sky-300" },
  ATRASADO: { barra: "bg-red-500", texto: "text-red-300", pill: "bg-red-500/15 text-red-300" },
  HOLD: { barra: "bg-slate-400", texto: "text-slate-300", pill: "bg-slate-500/20 text-slate-300" },
  SEM_DATA: { barra: "bg-slate-500", texto: "text-slate-400", pill: "bg-slate-500/15 text-slate-400" },
};

export default function PrioridadesClient() {
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
      const res = await fetch("/api/planejamento/prioridades", { cache: "no-store" });
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
  useEffect(() => {
    const t1 = setInterval(() => carregar(true), AUTO_REFRESH_MS);
    const t2 = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregar]);
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
  const atrasadas = obras.filter((o) => o.atrasoMax > 0).length;

  return (
    <div ref={rootRef} className="bg-torg-dark text-white rounded-2xl overflow-auto min-h-[80vh] p-6 print:hidden">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9 sm:h-10 w-auto" />
          <div className="h-9 w-px bg-white/15" />
          <div className="flex items-center gap-3">
            <div className="bg-amber-400/20 p-2.5 rounded-xl"><Trophy size={28} className="text-amber-300" /></div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Prioridades — Planejamento</h1>
              <p className="text-sm text-slate-300">Obras por etapa (Engenharia → Expedição) · ordenadas por urgência · atualiza sozinho</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {atrasadas > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-300 font-semibold text-sm flex items-center gap-1.5"><AlertTriangle size={16} /> {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>
          )}
          <div className="text-right leading-tight">
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-xs text-slate-300 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
          </div>
          <button onClick={() => carregar(false)} title="Atualizar agora" className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white">{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-300"><Loader2 size={40} className="animate-spin mb-3" /> <p>Carregando prioridades…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" /><p className="text-red-300 mb-3">{erro}</p>
          <button onClick={() => carregar(false)} className="text-sm text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : obras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center text-slate-300">
          <Inbox size={44} className="mb-3 opacity-50" />
          <p className="text-lg font-semibold text-white">Nenhum cronograma ativo</p>
          <p className="text-sm mt-1 max-w-md">Crie/ative cronogramas em <strong>Planejamento → Cronogramas</strong> — as obras e etapas aparecem aqui automaticamente, por urgência.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {obras.map((o) => <ObraCard key={o.cronogramaId} obra={o} />)}
        </div>
      )}
    </div>
  );
}

function ObraCard({ obra }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="text-sm font-bold text-torg-dark bg-amber-300 rounded-full w-8 h-8 flex items-center justify-center shrink-0" title={`${obra.ordem}ª prioridade`}>{obra.ordem}º</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight truncate" title={obra.obra}>{obra.obra}</h2>
          <p className="text-[11px] text-slate-400 truncate">OP-{obra.opNumero}{obra.cliente ? ` · ${obra.cliente}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-extrabold tabular-nums leading-none">{obra.pctGeral}%</p>
          {obra.atrasoMax > 0 && <p className="text-[11px] font-bold text-red-300 mt-0.5">⚠ {obra.atrasoMax}d atraso</p>}
        </div>
      </div>
      <div className="space-y-2">
        {obra.setores.map((s) => <SetorLinha key={s.setor} s={s} />)}
      </div>
    </div>
  );
}

function SetorLinha({ s }) {
  const sit = sitSetor(s);
  const cor = COR[sit] || COR.SEM_DATA;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold uppercase tracking-wide text-slate-200 w-[92px] shrink-0">{SETOR_LABEL[s.setor] || s.setor}</span>
        <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${Math.min(100, s.pct)}%`, transition: "width .6s ease" }} />
        </div>
        <span className={`text-[13px] font-bold tabular-nums w-9 text-right ${cor.texto}`}>{s.pct}%</span>
        <span className="w-[74px] text-right text-[12px] shrink-0">
          {s.concluida ? (
            <span className="text-emerald-300 inline-flex items-center gap-0.5 justify-end"><CheckCircle2 size={12} /> ok</span>
          ) : s.bloqueada ? (
            <span className="text-slate-300 inline-flex items-center gap-0.5 justify-end"><Lock size={11} /> hold</span>
          ) : s.atrasoDias > 0 ? (
            <span className="text-red-300 font-bold inline-flex items-center gap-0.5 justify-end"><AlertTriangle size={11} /> {s.atrasoDias}d</span>
          ) : (
            <span className="text-slate-300 inline-flex items-center gap-0.5 justify-end"><CalendarClock size={11} /> {fmtData(s.entrega)}</span>
          )}
        </span>
      </div>
      {/* Fabricação: sub-etapas (separada) ou dias de execução (unificada) */}
      {s.setor === "FABRICACAO" && s.subEtapas && (
        <div className="flex flex-wrap gap-1 mt-1 ml-[100px]">
          {s.subEtapas.map((e, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-300 border border-white/10">
              {e.nome} <span className="text-slate-400">{e.pct}%{e.entrega ? ` · ${fmtData(e.entrega)}` : ""}</span>
            </span>
          ))}
        </div>
      )}
      {s.setor === "FABRICACAO" && s.unificada && !s.concluida && (
        <p className="text-[10px] text-slate-400 mt-0.5 ml-[100px]">Unificada · ~{s.duracaoFab || "?"} dia{s.duracaoFab === 1 ? "" : "s"} de execução na produção</p>
      )}
    </div>
  );
}
