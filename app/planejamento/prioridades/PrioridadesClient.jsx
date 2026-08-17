"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, CalendarClock, Inbox, CheckCircle2, Lock, AlertTriangle, Truck, Columns3, LayoutGrid, ArrowLeft, RotateCw, Flag, ListOrdered, Maximize, X, Plus, Trash2 } from "lucide-react";
import DespachoPanel from "@/app/pcp/dashboard-prioridades/DespachoPanel";

const AUTO_REFRESH_MS = 60_000;

const SETOR_LABEL = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem",
};
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;

function sitSetor(s) {
  if (s.concluida) return "CONCLUIDO";
  if (s.bloqueada) return "HOLD";
  if (s.atrasoDias > 0) return "ATRASADO";
  if (!s.entrega) return "SEM_DATA";
  return "ANDAMENTO";
}
// Cores no tema claro-Torg.
const COR = {
  CONCLUIDO: { barra: "bg-emerald-500", texto: "text-emerald-600" },
  ANDAMENTO: { barra: "bg-torg-blue", texto: "text-torg-blue" },
  ATRASADO: { barra: "bg-red-500", texto: "text-red-600" },
  HOLD: { barra: "bg-slate-400", texto: "text-slate-500" },
  SEM_DATA: { barra: "bg-slate-300", texto: "text-slate-500" },
};
function corBarra(op) {
  if (op.atrasoDias > 0) return { bar: "bg-red-500", pct: "text-red-600" };
  if (op.pct >= 80) return { bar: "bg-emerald-500", pct: "text-emerald-600" };
  if (op.pct > 0) return { bar: "bg-torg-blue", pct: "text-torg-blue" };
  return { bar: "bg-slate-300", pct: "text-slate-400" };
}
// Acento sutil por setor (filete), na ordem do fluxo.
const LANE_ACC = { CORTE: "#F4801F", MONTAGEM: "#006EAB", SOLDA: "#D26713", ACABAMENTO: "#0E9488", JATO: "#0284C7", PINTURA: "#7C3AED", EXPEDICAO: "#16A34A" };

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

// Marca + relógio no cabeçalho navy (reaproveitado nas duas telas).
function MarcaTorg({ children }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {children}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/torg-logo-white.png" alt="Torg Metal" className="h-8 sm:h-9 w-auto shrink-0" />
      <div className="w-px h-6 bg-white/20 hidden sm:block" />
      <span className="text-sm text-torg-blue-200 font-medium hidden sm:block">Prioridades de produção</span>
    </div>
  );
}
function Relogio({ agora, curto }) {
  return (
    <div className="text-right leading-tight text-white">
      <p className="text-xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      <p className="text-[11px] text-torg-blue-200 capitalize">{agora.toLocaleDateString("pt-BR", curto ? { weekday: "short", day: "2-digit", month: "short" } : { weekday: "long", day: "2-digit", month: "long" })}</p>
    </div>
  );
}
const btnNavy = "p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors";

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
  const [gerenciarOps, setGerenciarOps] = useState(false);
  const [despOp, setDespOp] = useState(null); // OP aberta no painel de despacho
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
    <div ref={rootRef} className="bg-[#F3F6F9] text-torg-dark rounded-2xl overflow-hidden min-h-[80vh] print:hidden">
      <div className="bg-torg-dark px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        <MarcaTorg />
        <div className="flex items-center bg-white/10 rounded-xl p-1">
          <button onClick={() => setModo("setor")} className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${modo === "setor" ? "bg-white text-torg-dark" : "text-torg-blue-100 hover:text-white"}`}><Columns3 size={16} /> Por setor</button>
          <button onClick={() => setModo("obra")} className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${modo === "obra" ? "bg-white text-torg-dark" : "text-torg-blue-100 hover:text-white"}`}><LayoutGrid size={16} /> Por obra</button>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/planejamento/prioridades/marcar" className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Flag size={15} /> Marcar prioridades</Link>
          <button onClick={() => setGerenciarOps(true)} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Plus size={15} /> OPs manuais</button>
          <Relogio agora={agora} />
          <button onClick={() => carregar(false)} title="Atualizar agora" className={btnNavy}><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className={btnNavy}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="h-1 w-11 rounded bg-torg-orange mb-2.5" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-torg-dark leading-none">Prioridades{modo === "setor" ? " por setor" : " por obra"}</h1>
            <p className="text-sm text-torg-gray mt-1.5">{modo === "setor" ? "Cada setor com a sua fila, em kg · clique no setor para abrir em tela cheia" : "Obras por etapa, ordenadas por urgência"}</p>
          </div>
          {modo === "obra" && atrasadas > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold text-sm inline-flex items-center gap-1.5 border border-red-100"><AlertTriangle size={16} /> {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>
          )}
        </div>

        {loading ? (
          <Carregando texto="Carregando prioridades…" />
        ) : erro ? (
          <ErroBox erro={erro} onRetry={() => carregar(false)} />
        ) : modo === "setor" ? (
          <>
            {temSetor ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {lanes.map((l) => <LaneSetor key={l.setor} lane={l} onAbrir={() => setTela(slugDoSetor(l.setor))} />)}
              </div>
            ) : (
              <EmptyBox titulo="Nada pendente na fábrica" texto="Assim que as OPs tiverem lista (LE/LPC) e apontamento no Syneco, as filas de cada setor aparecem aqui — em kg, por urgência." />
            )}
          </>
        ) : obras.length === 0 ? (
          <EmptyBox titulo="Nenhum cronograma ativo" texto="Crie/ative cronogramas em Planejamento → Cronogramas — as obras e etapas aparecem aqui automaticamente." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {obras.map((o) => <ObraCard key={o.cronogramaId} obra={o} onDespachar={() => setDespOp(o.opNumero)} />)}
          </div>
        )}
      </div>
      <GerenciarOpsManuais open={gerenciarOps} onClose={() => setGerenciarOps(false)} onChange={() => carregar(false)} />
      {despOp && <DespachoPanel obra={String(despOp)} onClose={() => setDespOp(null)} />}
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

  const acc = LANE_ACC[setorAtual.key] || "#006EAB";
  const ops = dados?.ops || [];
  const resumo = dados?.resumo || [];

  return (
    <div ref={rootRef} className="bg-[#F3F6F9] text-torg-dark rounded-2xl overflow-hidden min-h-[80vh] print:hidden">
      <div className="bg-torg-dark px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        <MarcaTorg>
          <button onClick={() => setTela(null)} title="Voltar à visão geral" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0"><ArrowLeft size={18} /></button>
        </MarcaTorg>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setTela(girar ? slug : "girar")} className={`px-3 py-1.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${girar ? "bg-torg-orange text-white" : "bg-white/10 text-white hover:bg-white/20"}`} title={girar ? "Parar rotação" : "Girar entre os setores (a cada 20s)"}>
            <RotateCw size={15} className={girar ? "animate-spin" : ""} /> {girar ? "girando" : "girar"}
          </button>
          <Relogio agora={agora} curto />
          <button onClick={() => carregar(false)} title="Atualizar agora" className={btnNavy}><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={toggleFullscreen} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} className={btnNavy}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>

      <div className="p-6">
        {/* título do setor */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="h-1 w-11 rounded mb-2.5" style={{ backgroundColor: acc }} />
            <h1 className="text-3xl sm:text-4xl font-extrabold text-torg-dark leading-none">{setorAtual.label}</h1>
          </div>
          <div className="text-sm text-torg-gray">
            na fila <b className="text-torg-dark text-lg">{fmtKg(dados?.filaKg)}</b> · {ops.length} OP{ops.length !== 1 ? "s" : ""}
            {setorAtual.key === "CORTE" && <span className="text-torg-gray-light"> · meta 6.000 kg/dia</span>}
          </div>
        </div>

        {/* abas de setor */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {SETORES.map((s) => {
            const r = resumo.find((x) => x.setor === s.key);
            const ativo = s.slug === slug;
            return (
              <button key={s.slug} onClick={() => setTela(s.slug)}
                className={`px-3.5 py-1.5 rounded-lg text-sm whitespace-nowrap inline-flex items-center gap-2 border transition-colors ${ativo ? "bg-torg-blue text-white border-torg-blue font-bold" : "bg-white text-torg-gray border-torg-blue-100 hover:border-torg-blue-300"}`}>
                {s.label}{r && r.nOps > 0 ? <span className={`text-[10px] tabular-nums ${ativo ? "text-torg-blue-100" : "text-torg-gray-light"}`}>{r.nOps}</span> : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Carregando texto={`Carregando ${setorAtual.label}…`} />
        ) : erro ? (
          <ErroBox erro={erro} onRetry={() => carregar(false)} />
        ) : ops.length === 0 ? (
          <EmptyBox titulo={`Nada pendente em ${setorAtual.label}`} texto="Nenhuma OP com peça pendente nesse setor agora." />
        ) : (
          <div className="flex flex-col gap-3">
            {ops.map((op) => <LinhaOp key={op.opNumero} op={op} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// Linha de OP no tema claro-Torg — leve, direta (posição · OP · barra · % · falta),
// com uma linha discreta de peças (prioritárias em laranja, próximas em cinza).
function LinhaOp({ op }) {
  // Corte sem detalhamento (sem croqui) → linha de ALERTA, sem barra/peças.
  if (op.estado === "SEM_LISTA") {
    return (
      <div className="bg-red-50 rounded-xl px-5 py-4 border border-red-200 shadow-[0_1px_3px_rgba(0,41,69,0.07)]">
        <div className="flex items-center gap-4 flex-wrap">
          <AlertTriangle size={26} className="text-red-500 shrink-0" />
          <div className="min-w-[150px]">
            <div className="text-[26px] font-extrabold text-torg-dark leading-none tabular-nums">OP-{op.opNumero}</div>
            <div className="text-[13px] text-torg-gray truncate max-w-[280px]" title={op.obra}>{op.obra}</div>
          </div>
          <div className="flex-1 text-[15px] font-bold text-red-600">⚠ sem lista de corte — importar LE/LPC</div>
          {op.entrega && (
            <span className="text-[13px] text-red-600 inline-flex items-center gap-1"><CalendarClock size={13} /> {fmtData(op.entrega)}</span>
          )}
        </div>
      </div>
    );
  }
  const semProg = op.estado === "SEM_PROGRAMACAO";
  const cor = semProg && !(op.atrasoDias > 0) ? { bar: "bg-amber-400", pct: "text-amber-600" } : corBarra(op);
  const prio = op.prioritarias || [];
  const seq = (op.sequencia || []).slice(0, 4);
  const restam = (op.qtdPecas - op.qtdPrioritarias) - seq.length;
  return (
    <div className={`rounded-xl px-5 py-4 shadow-[0_1px_3px_rgba(0,41,69,0.07)] ${semProg ? "bg-amber-50 border border-amber-200" : "bg-white"}`}>
      <div className="flex items-center gap-5 flex-wrap">
        <div className={`text-2xl font-extrabold w-9 shrink-0 ${op.ordem === 1 ? "text-torg-orange" : "text-torg-gray-light"}`}>{op.ordem}º</div>
        <div className="min-w-[150px]">
          <div className="text-[26px] font-extrabold text-torg-dark leading-none tabular-nums">OP-{op.opNumero}</div>
          <div className="text-[13px] text-torg-gray truncate max-w-[240px]" title={op.obra}>{op.obra}</div>
        </div>
        <div className="flex-1 min-w-[190px]">
          {semProg && <div className="text-[12px] font-semibold text-amber-600 mb-1 inline-flex items-center gap-1"><CalendarClock size={12} /> falta programar o corte no cronograma</div>}
          <div className="h-[11px] rounded-full bg-torg-blue-50 overflow-hidden"><div className={`h-full rounded-full ${cor.bar}`} style={{ width: `${Math.min(100, op.pct)}%`, transition: "width .6s ease" }} /></div>
          <div className="flex items-center justify-between text-[13px] text-torg-gray mt-1.5">
            <span>falta <b className="text-torg-dark">{fmtKg(op.pendenteKg)}</b> · {op.qtdPecas} peças</span>
            {op.atrasoDias > 0 ? (
              <span className="text-red-600 font-semibold inline-flex items-center gap-1"><AlertTriangle size={13} /> {op.atrasoDias}d atraso</span>
            ) : op.entrega ? (
              <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {fmtData(op.entrega)}{!op.doSetor && <span className="text-[10px] text-torg-gray-light">obra</span>}</span>
            ) : null}
          </div>
        </div>
        <div className={`text-[34px] font-extrabold tabular-nums text-right min-w-[74px] ${cor.pct}`}>{op.pct}%</div>
      </div>

      {(prio.length > 0 || seq.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-torg-blue-50 text-[13px]">
          {prio.length > 0 && (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <Flag size={13} className="text-torg-orange" />
              <span className="text-torg-orange font-semibold uppercase text-[11px] tracking-wide">Prioritárias:</span>
              {prio.slice(0, 4).map((p, i) => <b key={i} className="text-torg-dark tabular-nums">{p.marca}</b>)}
              {op.qtdPrioritarias > 4 && <span className="text-torg-gray-light">+{op.qtdPrioritarias - 4}</span>}
            </span>
          )}
          {seq.length > 0 && (
            <span className="inline-flex items-center gap-1.5 flex-wrap text-torg-gray">
              <ListOrdered size={13} className="text-torg-gray-light" />
              <span className="uppercase text-[11px] tracking-wide text-torg-gray-light">Próximas:</span>
              {seq.map((p, i) => <span key={i} className="tabular-nums">{p.marca}</span>)}
              {restam > 0 && <span className="text-torg-gray-light">+{restam} peças</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LaneSetor({ lane, onAbrir }) {
  const acc = LANE_ACC[lane.setor] || "#006EAB";
  const nAlerta = lane.ops.filter((o) => o.estado === "SEM_LISTA").length;
  const nFila = lane.ops.length - nAlerta;
  return (
    <div className="min-w-[250px] max-w-[250px] bg-white rounded-xl border border-torg-blue-100 shadow-[0_1px_3px_rgba(0,41,69,0.06)] p-3 flex flex-col gap-2" style={{ borderTopColor: acc, borderTopWidth: 3 }}>
      <button onClick={onAbrir} className="text-left group" title={`Abrir ${lane.label} em tela cheia`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold uppercase tracking-wide text-torg-dark truncate group-hover:text-torg-blue">{lane.label}</span>
          <span className="text-[11px] text-torg-gray-light shrink-0 inline-flex items-center gap-1">{nFila} OP{nFila !== 1 ? "s" : ""} <Maximize size={11} className="opacity-40 group-hover:opacity-100" /></span>
        </div>
        <div className="text-[11px] text-torg-gray mt-0.5">
          fila {fmtKg(lane.filaKg)}{lane.setor === "CORTE" ? " · meta 6.000 kg/dia" : ""}
          {nAlerta > 0 && <span className="text-red-600 font-semibold"> · {nAlerta} sem lista</span>}
        </div>
      </button>
      {lane.ops.length ? (
        lane.ops.map((op, i) => <OpMini key={`${op.opNumero}-${i}`} op={op} />)
      ) : (
        <div className="text-[12px] text-torg-gray-light py-8 text-center">nada pendente</div>
      )}
    </div>
  );
}

function OpMini({ op }) {
  // Corte sem detalhamento (sem croqui) → cartão de ALERTA, sem barra.
  if (op.estado === "SEM_LISTA") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-red-500 shrink-0" />
          <span className="text-base font-extrabold tabular-nums text-torg-dark">OP-{op.opNumero}</span>
          {op.entrega && (
            <span className="ml-auto text-[11px] whitespace-nowrap inline-flex items-center gap-0.5 text-red-600">
              <CalendarClock size={10} /> {fmtData(op.entrega)}
            </span>
          )}
        </div>
        <div className="text-[11px] text-torg-gray truncate mt-0.5 ml-[22px]" title={op.obra}>{op.obra}</div>
        <div className="text-[11px] font-semibold text-red-600 mt-1 ml-[22px]">⚠ sem lista de corte</div>
      </div>
    );
  }
  const semProg = op.estado === "SEM_PROGRAMACAO";
  const cor = semProg && !(op.atrasoDias > 0) ? { bar: "bg-amber-400", pct: "text-amber-600" } : corBarra(op);
  return (
    <div className={`rounded-lg p-2.5 border ${semProg ? "bg-amber-50 border-amber-200" : "bg-[#F7F9FB] border-torg-blue-50"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] font-extrabold w-5 shrink-0 ${op.ordem === 1 ? "text-torg-orange" : "text-torg-gray-light"}`}>{op.ordem}º</span>
        <span className="text-base font-extrabold tabular-nums text-torg-dark">OP-{op.opNumero}</span>
        <span className="ml-auto text-[11px] whitespace-nowrap">
          {op.atrasoDias > 0 ? (
            <span className="text-red-600 font-semibold inline-flex items-center gap-0.5"><AlertTriangle size={10} /> {op.atrasoDias}d</span>
          ) : op.entrega ? (
            <span className="text-torg-gray inline-flex items-center gap-0.5"><CalendarClock size={10} /> {fmtData(op.entrega)}</span>
          ) : null}
        </span>
      </div>
      <div className="text-[11px] text-torg-gray truncate mt-0.5 ml-[26px]" title={op.obra}>{op.obra}</div>
      {semProg && <div className="text-[10px] font-semibold text-amber-600 mt-1 ml-[26px] inline-flex items-center gap-1"><CalendarClock size={10} /> falta programar o corte</div>}
      <div className="h-1.5 rounded-full bg-torg-blue-50 overflow-hidden mt-1.5">
        <div className={`h-full rounded-full ${cor.bar}`} style={{ width: `${Math.min(100, op.pct)}%`, transition: "width .6s ease" }} />
      </div>
      <div className="flex justify-between items-baseline mt-1">
        <span className="text-[11px] text-torg-gray tabular-nums">{fmtKg(op.pendenteKg)} falta</span>
        <span className={`text-sm font-bold ${cor.pct}`}>{op.pct}%</span>
      </div>
    </div>
  );
}

function ObraCard({ obra, onDespachar }) {
  return (
    <div onClick={onDespachar} title="Clique para despachar as peças em aberto desta OP"
      className="bg-white rounded-xl border border-torg-blue-100 shadow-[0_1px_3px_rgba(0,41,69,0.06)] p-5 flex flex-col gap-3 cursor-pointer hover:border-torg-blue-300 hover:shadow-md transition">
      <div className="flex items-start gap-2.5">
        <span className={`text-sm font-extrabold w-8 shrink-0 pt-0.5 ${obra.ordem === 1 ? "text-torg-orange" : "text-torg-gray-light"}`}>{obra.ordem}º</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight tabular-nums leading-none text-torg-dark">OP-{obra.opNumero}</h2>
          <p className="text-[13px] text-torg-gray truncate mt-1" title={obra.obra}>{obra.obra}{obra.cliente ? ` · ${obra.cliente}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-extrabold tabular-nums leading-none text-torg-dark">{obra.pctGeral}%</p>
          {obra.atrasoMax > 0 && <p className="text-[11px] font-bold text-red-600 mt-0.5">⚠ {obra.atrasoMax}d atraso</p>}
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
  const entregaDestaque = (s.setor === "FABRICACAO" || s.setor === "EXPEDICAO") && !s.concluida && !s.bloqueada && !!s.entrega;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[13px] font-bold uppercase tracking-wide text-torg-gray truncate">{SETOR_LABEL[s.setor] || s.setor}</span>
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <span className={`text-sm font-bold tabular-nums ${cor.texto}`}>{s.pct}%</span>
          {s.concluida ? (
            <span className="text-[12px] text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 size={12} /> ok</span>
          ) : s.bloqueada ? (
            <span className="text-[12px] text-slate-500 inline-flex items-center gap-0.5"><Lock size={11} /> hold</span>
          ) : entregaDestaque ? (
            <span className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md border ${s.atrasoDias > 0 ? "bg-red-50 border-red-200 text-red-600" : "bg-torg-orange-50 border-torg-orange-200 text-torg-orange-700"}`}>
              <Truck size={12} className="self-center opacity-90" />
              <span className="text-[10px] uppercase tracking-wide opacity-80">entrega</span>
              <span className="text-[15px] font-extrabold tabular-nums leading-none">{fmtData(s.entrega)}</span>
              {s.atrasoDias > 0 && <span className="text-[11px] font-bold">· {s.atrasoDias}d</span>}
            </span>
          ) : s.atrasoDias > 0 ? (
            <span className="text-[12px] text-red-600 font-bold inline-flex items-center gap-0.5"><AlertTriangle size={11} /> {s.atrasoDias}d atraso</span>
          ) : (
            <span className="text-[12px] text-torg-gray inline-flex items-center gap-0.5"><CalendarClock size={11} /> {fmtData(s.entrega)}</span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-torg-blue-50 overflow-hidden">
        <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${Math.min(100, s.pct)}%`, transition: "width .6s ease" }} />
      </div>
      {s.setor === "FABRICACAO" && s.subEtapas && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {s.subEtapas.map((e, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-gray border border-torg-blue-100 whitespace-nowrap">
              {e.nome} <span className="text-torg-gray-light">{e.pct}%{e.entrega ? ` · ${fmtData(e.entrega)}` : ""}</span>
            </span>
          ))}
        </div>
      )}
      {s.setor === "FABRICACAO" && s.unificada && !s.concluida && (
        <p className="text-[10px] text-torg-gray-light mt-1">Unificada · ~{s.duracaoFab || "?"} dia{s.duracaoFab === 1 ? "" : "s"} de execução na produção</p>
      )}
    </div>
  );
}

function Carregando({ texto }) {
  return <div className="flex flex-col items-center justify-center py-32 text-torg-gray"><Loader2 size={40} className="animate-spin mb-3 text-torg-blue" /> <p>{texto}</p></div>;
}
function ErroBox({ erro, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <AlertCircle size={40} className="text-red-500 mb-3" /><p className="text-red-600 mb-3">{erro}</p>
      <button onClick={onRetry} className="text-sm text-torg-dark bg-white border border-torg-blue-100 hover:border-torg-blue-300 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
    </div>
  );
}
function EmptyBox({ titulo, texto }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center text-torg-gray">
      <Inbox size={44} className="mb-3 text-torg-blue-200" />
      <p className="text-lg font-semibold text-torg-dark">{titulo}</p>
      <p className="text-sm mt-1 max-w-md">{texto}</p>
    </div>
  );
}

function GerenciarOpsManuais({ open, onClose, onChange }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/planejamento/prioridade-op-manual", { cache: "no-store" });
      const j = await r.json();
      setDados(r.ok ? j : { fixadas: [], disponiveis: [] });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) { setSel(""); carregar(); } }, [open, carregar]);

  if (!open) return null;
  const fixadas = dados?.fixadas || [];
  const disponiveis = dados?.disponiveis || [];

  const add = async () => {
    const op = disponiveis.find((o) => o.opNumero === sel);
    if (!op) return;
    setBusy(true);
    try {
      await fetch("/api/planejamento/prioridade-op-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opNumero: op.opNumero, opId: op.opId }) });
      setSel(""); await carregar(); onChange?.();
    } finally { setBusy(false); }
  };
  const remover = async (opNumero) => {
    setBusy(true);
    try {
      await fetch(`/api/planejamento/prioridade-op-manual?opNumero=${encodeURIComponent(opNumero)}`, { method: "DELETE" });
      await carregar(); onChange?.();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-torg-dark/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg text-torg-dark" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-torg-blue-50">
          <h3 className="font-bold text-lg">OPs manuais na TV</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-torg-blue-50"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-torg-gray">Fixe OPs que têm lista (peças) mas não abriram cronograma — as rápidas. Elas entram nas filas por setor pelo peso.</p>
          <div className="flex gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="flex-1 border border-torg-blue-100 rounded-lg px-3 py-2 text-sm">
              <option value="">{loading ? "carregando…" : `Escolher OP… (${disponiveis.length} disponíveis)`}</option>
              {disponiveis.map((o) => <option key={o.opNumero} value={o.opNumero}>OP-{o.opNumero} — {o.obra || "—"}</option>)}
            </select>
            <button onClick={add} disabled={!sel || busy} className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"><Plus size={15} /> Fixar</button>
          </div>
          <div>
            <div className="text-xs font-medium text-torg-gray mb-1.5">Fixadas ({fixadas.length})</div>
            {fixadas.length === 0 ? (
              <div className="text-sm text-torg-gray-light italic py-2">nenhuma OP fixada</div>
            ) : (
              <ul className="divide-y divide-torg-blue-50 border border-torg-blue-50 rounded-lg max-h-64 overflow-y-auto">
                {fixadas.map((o) => (
                  <li key={o.opNumero} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums">OP-{o.opNumero}</span>
                    <span className="text-torg-gray truncate flex-1">{o.obra || "—"}</span>
                    {!o.temPecas && <span className="text-[10px] text-torg-orange-700 shrink-0">sem peças</span>}
                    <button onClick={() => remover(o.opNumero)} disabled={busy} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 shrink-0"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
