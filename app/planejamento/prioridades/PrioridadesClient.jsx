"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, Trophy, CalendarClock, Inbox, CheckCircle2, Lock, AlertTriangle, Truck, Columns3, LayoutGrid, ArrowLeft, RotateCw, Flag, ListOrdered, Maximize } from "lucide-react";

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

// ---- Modo "Por setor" (progresso em kg) ----
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;
// Cor de destaque (borda de topo) por setor, na ordem do fluxo.
const LANE_ACC = { CORTE: "#f59e0b", MONTAGEM: "#3b82f6", SOLDA: "#f97316", ACABAMENTO: "#14b8a6", JATO: "#0ea5e9", PINTURA: "#8b5cf6", EXPEDICAO: "#22c55e" };
function corCardSetor(op) {
  if (op.atrasoDias > 0) return { bar: "bg-red-500", pct: "text-red-300" };
  if (op.pct >= 80) return { bar: "bg-emerald-500", pct: "text-emerald-300" };
  if (op.pct > 0) return { bar: "bg-torg-blue", pct: "text-sky-300" };
  return { bar: "bg-slate-500", pct: "text-slate-400" };
}

// Setores como colunas/telas (slug amigável na URL ↔ key canônica ↔ rótulo).
const SETORES = [
  { slug: "preparacao", key: "CORTE", label: "Preparação" },
  { slug: "montagem", key: "MONTAGEM", label: "Montagem" },
  { slug: "solda", key: "SOLDA", label: "Solda" },
  { slug: "acabamento", key: "ACABAMENTO", label: "Acabamento" },
  { slug: "jato", key: "JATO", label: "Jato" },
  { slug: "pintura", key: "PINTURA", label: "Pintura" },
  { slug: "expedicao", key: "EXPEDICAO", label: "Expedição" },
];
const slugDoSetor = (key) => SETORES.find((s) => s.key === key)?.slug || null;
function normalizarTela(t) {
  if (!t) return null;
  const s = String(t).toLowerCase();
  if (s === "girar") return "girar";
  return SETORES.some((x) => x.slug === s) ? s : null;
}

export default function PrioridadesClient({ telaInicial = null }) {
  const [tela, setTela] = useState(() => normalizarTela(telaInicial));
  if (tela) return <TelaSetorUnico tela={tela} setTela={setTela} />;
  return <Hub setTela={setTela} />;
}

function Hub({ setTela }) {
  const [modo, setModo] = useState("setor");
  const [dados, setDados] = useState(null);
  const [dadosSetor, setDadosSetor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErro("");
    try {
      const url = modo === "setor" ? "/api/planejamento/prioridades-setor" : "/api/planejamento/prioridades";
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      if (modo === "setor") setDadosSetor(j); else setDados(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [modo]);

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
  const lanes = dadosSetor?.lanes || [];
  const temSetor = lanes.some((l) => l.ops.length);

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
              <p className="text-sm text-slate-300">{modo === "setor" ? "Cada setor com a sua fila · em kg · clique num setor pra abrir em tela cheia" : "Obras por etapa (Engenharia → Expedição) · ordenadas por urgência"}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center bg-white/10 rounded-xl p-1">
          <button onClick={() => setModo("setor")} className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${modo === "setor" ? "bg-white/20 text-white" : "text-slate-300 hover:text-white"}`}><Columns3 size={16} /> Por setor</button>
          <button onClick={() => setModo("obra")} className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${modo === "obra" ? "bg-white/20 text-white" : "text-slate-300 hover:text-white"}`}><LayoutGrid size={16} /> Por obra</button>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/planejamento/prioridades/marcar" className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-sm font-semibold inline-flex items-center gap-1.5"><Flag size={15} /> Marcar prioridades</Link>
          {modo === "obra" && atrasadas > 0 && (
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
      ) : modo === "setor" ? (
        <>
          {temSetor ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {lanes.map((l) => <LaneSetor key={l.setor} lane={l} onAbrir={() => setTela(slugDoSetor(l.setor))} />)}
            </div>
          ) : (
            <EmptyBox titulo="Nada pendente na fábrica" texto="Assim que as OPs tiverem lista (LE/LPC) e apontamento no Syneco, as filas de cada setor aparecem aqui — em kg, por urgência." />
          )}
          <AguardandoLista obras={dadosSetor?.aguardando} />
        </>
      ) : obras.length === 0 ? (
        <EmptyBox titulo="Nenhum cronograma ativo" texto="Crie/ative cronogramas em Planejamento → Cronogramas — as obras e etapas aparecem aqui automaticamente, por urgência." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {obras.map((o) => <ObraCard key={o.cronogramaId} obra={o} />)}
        </div>
      )}
    </div>
  );
}

function EmptyBox({ titulo, texto }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center text-slate-300">
      <Inbox size={44} className="mb-3 opacity-50" />
      <p className="text-lg font-semibold text-white">{titulo}</p>
      <p className="text-sm mt-1 max-w-md">{texto}</p>
    </div>
  );
}

function LaneSetor({ lane, onAbrir }) {
  const acc = LANE_ACC[lane.setor] || "#64748b";
  return (
    <div className="min-w-[248px] max-w-[248px] bg-white/[0.03] border border-white/10 rounded-xl p-3 flex flex-col gap-2" style={{ borderTopColor: acc, borderTopWidth: 3 }}>
      <button onClick={onAbrir} className="text-left group" title={`Abrir ${lane.label} em tela cheia`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-white truncate group-hover:underline">{lane.label}</span>
          <span className="text-[10px] text-slate-400 shrink-0 inline-flex items-center gap-1">{lane.ops.length} OP{lane.ops.length !== 1 ? "s" : ""} <Maximize size={11} className="opacity-50 group-hover:opacity-100" /></span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">fila {fmtKg(lane.filaKg)}{lane.setor === "CORTE" ? " · meta 6.000 kg/dia" : ""}</div>
      </button>
      {lane.ops.length ? (
        lane.ops.map((op, i) => <OpCardSetor key={`${op.opNumero}-${i}`} op={op} />)
      ) : (
        <div className="text-[11px] text-slate-500 py-8 text-center">nada pendente</div>
      )}
    </div>
  );
}

function OpCardSetor({ op }) {
  const cor = corCardSetor(op);
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-torg-dark bg-amber-300 rounded-full w-5 h-5 flex items-center justify-center shrink-0">{op.ordem}º</span>
        <span className="text-base font-extrabold tabular-nums text-white">OP-{op.opNumero}</span>
        <span className="ml-auto text-[10px] whitespace-nowrap">
          {op.atrasoDias > 0 ? (
            <span className="text-red-300 font-bold inline-flex items-center gap-0.5"><AlertTriangle size={10} /> {op.atrasoDias}d</span>
          ) : op.entrega ? (
            <span className="text-slate-300 inline-flex items-center gap-0.5"><CalendarClock size={10} /> {fmtData(op.entrega)}</span>
          ) : null}
        </span>
      </div>
      <div className="text-[10px] text-slate-400 truncate mt-0.5 ml-[26px]" title={op.obra}>{op.obra}</div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1.5">
        <div className={`h-full rounded-full ${cor.bar}`} style={{ width: `${Math.min(100, op.pct)}%`, transition: "width .6s ease" }} />
      </div>
      <div className="flex justify-between items-baseline mt-1">
        <span className="text-[10px] text-slate-300 tabular-nums">{fmtKg(op.feitoKg)} / {fmtKg(op.totalKg)}</span>
        <span className={`text-xs font-bold ${cor.pct}`}>{op.pct}%</span>
      </div>
    </div>
  );
}

// ---- Tela de UM setor só (TV do chão de fábrica) ----
const ROTATE_MS = 20_000;

function TelaSetorUnico({ tela, setTela }) {
  const girar = tela === "girar";
  const [rotIdx, setRotIdx] = useState(0);
  const setorAtual = girar ? SETORES[rotIdx % SETORES.length] : SETORES.find((s) => s.slug === tela) || SETORES[0];
  const slug = setorAtual.slug;

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
      const res = await fetch(`/api/planejamento/prioridades-setor/${slug}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { if (!silent) setLoading(false); }
  }, [slug]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t1 = setInterval(() => carregar(true), 60_000);
    const t2 = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregar]);
  useEffect(() => {
    if (!girar) return;
    const r = setInterval(() => setRotIdx((i) => (i + 1) % SETORES.length), ROTATE_MS);
    return () => clearInterval(r);
  }, [girar]);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.();
  };

  const acc = LANE_ACC[setorAtual.key] || "#64748b";
  const ops = dados?.ops || [];
  const resumo = dados?.resumo || [];
  const mediaPct = ops.length ? Math.round(ops.reduce((a, o) => a + o.pct, 0) / ops.length) : 0;
  const entregaProx = ops.map((o) => o.entrega).filter(Boolean).sort()[0];

  return (
    <div ref={rootRef} className="bg-torg-dark text-white rounded-2xl overflow-auto min-h-[80vh] p-6 print:hidden">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setTela(null)} title="Voltar à visão geral" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 shrink-0"><ArrowLeft size={18} /></button>
          <div className="w-2.5 h-10 rounded shrink-0" style={{ backgroundColor: acc }} />
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight truncate">{setorAtual.label}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setTela(girar ? slug : "girar")} className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 ${girar ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-slate-200 hover:bg-white/20"}`} title={girar ? "Parar rotação" : "Girar entre os setores (a cada 20s)"}>
            <RotateCw size={15} className={girar ? "animate-spin" : ""} /> {girar ? "girando" : "girar"}
          </button>
          <div className="text-right leading-tight">
            <p className="text-2xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-xs text-slate-300 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</p>
          </div>
          <button onClick={() => carregar(false)} title="Atualizar agora" className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20">{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>

      {/* abas de setor */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {SETORES.map((s) => {
          const r = resumo.find((x) => x.setor === s.key);
          const ativo = s.slug === slug;
          return (
            <button key={s.slug} onClick={() => setTela(s.slug)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap inline-flex items-center gap-2 border transition-colors ${ativo ? "font-bold text-white" : "text-slate-300 bg-white/5 border-white/10 hover:bg-white/10"}`}
              style={ativo ? { backgroundColor: `${acc}33`, borderColor: acc } : undefined}>
              {s.label}{r && r.nOps > 0 ? <span className="text-[10px] opacity-70 tabular-nums">{r.nOps}</span> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-300"><Loader2 size={40} className="animate-spin mb-3" /> <p>Carregando {setorAtual.label}…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <AlertCircle size={40} className="text-red-400 mb-3" /><p className="text-red-300 mb-3">{erro}</p>
          <button onClick={() => carregar(false)} className="text-sm text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : ops.length === 0 ? (
        <EmptyBox titulo={`Nada pendente em ${setorAtual.label}`} texto="Nenhuma OP com peça pendente nesse setor agora." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <KPI label="Fila do setor" valor={fmtKg(dados.filaKg)} />
            <KPI label="OPs na fila" valor={ops.length} />
            <KPI label="Progresso médio" valor={`${mediaPct}%`} cor="text-sky-300" />
            <KPI label="Entrega mais próxima" valor={entregaProx ? fmtData(entregaProx) : "—"} cor="text-amber-200" />
          </div>
          {setorAtual.key === "CORTE" && <p className="text-xs text-slate-400 mb-4">meta 6.000 kg/dia</p>}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${setorAtual.key === "CORTE" ? "" : "mt-4"}`}>
            {ops.map((op) => <OpCardDetalhe key={op.opNumero} op={op} />)}
          </div>
        </>
      )}
      <AguardandoLista obras={dados?.aguardando} />
    </div>
  );
}

function AguardandoLista({ obras }) {
  if (!obras || !obras.length) return null;
  return (
    <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
      <div className="flex items-center gap-2 text-amber-200 text-sm font-semibold mb-2">
        <AlertTriangle size={15} /> {obras.length} obra{obras.length > 1 ? "s" : ""} com cronograma aguardando lista (LE/LPC)
      </div>
      <div className="flex flex-wrap gap-2">
        {obras.map((o) => (
          <span key={o.opNumero} className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-slate-200">
            <b className="tabular-nums">OP-{o.opNumero}</b> <span className="text-slate-400">{o.obra}</span>{o.entrega ? <span className="text-amber-200/80"> · {fmtData(o.entrega)}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function KPI({ label, valor, cor }) {
  return (
    <div className="bg-white/5 rounded-xl px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${cor || "text-white"}`}>{valor}</div>
    </div>
  );
}

function PecaChip({ p, prioridade }) {
  return (
    <span className={`text-[13px] font-semibold px-2 py-0.5 rounded-md tabular-nums border ${prioridade ? "bg-red-500/[0.18] border-red-400/40 text-red-100" : "bg-white/[0.06] border-white/10 text-slate-200"}`}>
      {p.marca} <span className="text-slate-400 font-normal">{fmtKg(p.kgPend)}</span>
    </span>
  );
}

function OpCardDetalhe({ op }) {
  const cor = corCardSetor(op);
  const seqShow = op.sequencia.slice(0, 12);
  const restamSeq = (op.qtdPecas - op.qtdPrioritarias) - seqShow.length;
  const restamPrio = op.qtdPrioritarias - op.prioritarias.length;
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-sm font-bold text-torg-dark bg-amber-300 rounded-full w-8 h-8 flex items-center justify-center shrink-0">{op.ordem}º</span>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-extrabold tabular-nums leading-none">OP-{op.opNumero}</div>
          <div className="text-xs text-slate-400 truncate mt-1" title={op.obra}>{op.obra}{op.cliente ? ` · ${op.cliente}` : ""}</div>
        </div>
        <div className="text-right shrink-0">
          {op.atrasoDias > 0 ? (
            <div className="text-xs font-bold text-red-300 inline-flex items-center gap-0.5" title={op.doSetor ? "Data do setor vencida" : "Entrega da obra vencida (setor sem data)"}><AlertTriangle size={12} /> {op.atrasoDias}d</div>
          ) : op.entrega ? (
            <div className={`text-xs font-semibold inline-flex items-center gap-0.5 ${op.doSetor ? "text-amber-200" : "text-slate-300"}`} title={op.doSetor ? "Data do setor" : "Sem data do setor — usando a entrega da obra"}>
              <CalendarClock size={12} /> {fmtData(op.entrega)}{!op.doSetor && <span className="text-[9px] text-slate-500 ml-0.5">obra</span>}
            </div>
          ) : null}
          <div className={`text-2xl font-extrabold tabular-nums leading-none mt-1 ${cor.pct}`}>{op.pct}%</div>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full rounded-full ${cor.bar}`} style={{ width: `${Math.min(100, op.pct)}%`, transition: "width .6s ease" }} /></div>
      <div className="flex justify-between mt-1.5 mb-3 text-xs">
        <span className="text-slate-300 tabular-nums">{fmtKg(op.feitoKg)} / {fmtKg(op.totalKg)}</span>
        <span className="text-slate-400">falta <b className="text-red-300">{fmtKg(op.pendenteKg)}</b> · {op.qtdPecas} peças</span>
      </div>

      <div className="mb-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-red-300 mb-1.5 flex items-center gap-1.5"><Flag size={12} /> Prioritárias{op.qtdPrioritarias > 0 ? <span className="text-slate-400 font-normal normal-case">({op.qtdPrioritarias})</span> : null}</div>
        {op.prioritarias.length ? (
          <div className="flex flex-wrap gap-1.5">
            {op.prioritarias.map((p, i) => <PecaChip key={i} p={p} prioridade />)}
            {restamPrio > 0 && <span className="text-[11px] text-slate-500 self-center">+{restamPrio}</span>}
          </div>
        ) : <div className="text-xs text-slate-500 italic">nenhuma peça marcada como prioritária</div>}
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5 flex items-center gap-1.5"><ListOrdered size={12} /> Peças pendentes</div>
        <div className="flex flex-wrap gap-1.5">
          {seqShow.map((p, i) => <PecaChip key={i} p={p} />)}
          {restamSeq > 0 && <span className="text-[11px] text-slate-500 self-center">+{restamSeq} peças</span>}
          {seqShow.length === 0 && <span className="text-xs text-slate-500 italic">—</span>}
        </div>
      </div>
    </div>
  );
}

function ObraCard({ obra }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="text-sm font-bold text-torg-dark bg-amber-300 rounded-full w-8 h-8 flex items-center justify-center shrink-0" title={`${obra.ordem}ª prioridade`}>{obra.ordem}º</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight tabular-nums leading-none">OP-{obra.opNumero}</h2>
          <p className="text-[12px] text-slate-300 truncate mt-1" title={obra.obra}>{obra.obra}{obra.cliente ? ` · ${obra.cliente}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-extrabold tabular-nums leading-none">{obra.pctGeral}%</p>
          {obra.atrasoMax > 0 && <p className="text-[11px] font-bold text-red-300 mt-0.5">⚠ {obra.atrasoMax}d atraso</p>}
        </div>
      </div>
      <div className="space-y-2.5">
        {obra.setores.map((s) => <SetorLinha key={s.setor} s={s} />)}
      </div>
    </div>
  );
}

function SetorLinha({ s }) {
  const sit = sitSetor(s);
  const cor = COR[sit] || COR.SEM_DATA;
  // Fabricação e Expedição são as etapas que definem a entrega ao cliente:
  // a data ganha destaque (caixa própria, fonte grande) e aparece mesmo em atraso.
  const entregaDestaque = (s.setor === "FABRICACAO" || s.setor === "EXPEDICAO") && !s.concluida && !s.bloqueada && !!s.entrega;
  return (
    <div>
      {/* Linha 1: rótulo do setor + % e status (sem disputar espaço com a barra) */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[13px] font-bold uppercase tracking-wide text-slate-200 truncate">{SETOR_LABEL[s.setor] || s.setor}</span>
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <span className={`text-sm font-bold tabular-nums ${cor.texto}`}>{s.pct}%</span>
          {s.concluida ? (
            <span className="text-[12px] text-emerald-300 inline-flex items-center gap-0.5"><CheckCircle2 size={12} /> ok</span>
          ) : s.bloqueada ? (
            <span className="text-[12px] text-slate-300 inline-flex items-center gap-0.5"><Lock size={11} /> hold</span>
          ) : entregaDestaque ? (
            <span className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md border ${s.atrasoDias > 0 ? "bg-red-500/20 border-red-400/40 text-red-200" : "bg-amber-400/15 border-amber-400/30 text-amber-200"}`}>
              <Truck size={12} className="self-center opacity-90" />
              <span className="text-[10px] uppercase tracking-wide opacity-80">entrega</span>
              <span className="text-[15px] font-extrabold tabular-nums leading-none">{fmtData(s.entrega)}</span>
              {s.atrasoDias > 0 && <span className="text-[11px] font-bold">· {s.atrasoDias}d</span>}
            </span>
          ) : s.atrasoDias > 0 ? (
            <span className="text-[12px] text-red-300 font-bold inline-flex items-center gap-0.5"><AlertTriangle size={11} /> {s.atrasoDias}d atraso</span>
          ) : (
            <span className="text-[12px] text-slate-300 inline-flex items-center gap-0.5"><CalendarClock size={11} /> {fmtData(s.entrega)}</span>
          )}
        </div>
      </div>
      {/* Linha 2: barra de progresso em LARGURA CHEIA (não cobre mais nada) */}
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${Math.min(100, s.pct)}%`, transition: "width .6s ease" }} />
      </div>
      {/* Fabricação: sub-etapas (separada) ou dias de execução (unificada) */}
      {s.setor === "FABRICACAO" && s.subEtapas && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {s.subEtapas.map((e, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-slate-300 border border-white/10 whitespace-nowrap">
              {e.nome} <span className="text-slate-400">{e.pct}%{e.entrega ? ` · ${fmtData(e.entrega)}` : ""}</span>
            </span>
          ))}
        </div>
      )}
      {s.setor === "FABRICACAO" && s.unificada && !s.concluida && (
        <p className="text-[10px] text-slate-400 mt-1">Unificada · ~{s.duracaoFab || "?"} dia{s.duracaoFab === 1 ? "" : "s"} de execução na produção</p>
      )}
    </div>
  );
}
