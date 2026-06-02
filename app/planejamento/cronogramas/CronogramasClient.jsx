"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Clock, CheckCircle2, AlertTriangle, Download, MessageSquarePlus,
  Send, X, Briefcase, Wrench, ShoppingCart, Factory, Truck, HardHat,
  GanttChart, Package, FileText, CircleDot, Mail,
} from "lucide-react";

const DEPT_ICONS = {
  COMERCIAL: Briefcase,
  ENGENHARIA: Wrench,
  SUPRIMENTOS: ShoppingCart,
  FABRICACAO: Factory,
  EXPEDICAO: Truck,
  MONTAGEM: HardHat,
};

const DEPT_COLORS = {
  COMERCIAL: "text-blue-600 bg-blue-50 border-blue-200",
  ENGENHARIA: "text-purple-600 bg-purple-50 border-purple-200",
  SUPRIMENTOS: "text-amber-600 bg-amber-50 border-amber-200",
  FABRICACAO: "text-emerald-600 bg-emerald-50 border-emerald-200",
  EXPEDICAO: "text-teal-600 bg-teal-50 border-teal-200",
  MONTAGEM: "text-orange-600 bg-orange-50 border-orange-200",
};

const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

export default function CronogramasClient() {
  const [cronogramas, setCronogramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [erro, setErro] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/cronogramas");
      if (!res.ok) throw new Error("Erro ao carregar");
      setCronogramas(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/planejamento/cronogramas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao sincronizar");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const expandir = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar detalhe");
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-torg-blue" size={28} />
        <span className="ml-3 text-torg-gray">Carregando cronogramas...</span>
      </div>
    );
  }

  if (erro && cronogramas.length === 0) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-2" />
        <p className="text-sm text-red-600 mb-3">{erro}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline flex items-center gap-1 mx-auto">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Cronogramas</h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Acompanhamento de cronogramas do MS Project por OP e departamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {syncing ? "Sincronizando..." : "Sincronizar SharePoint"}
          </button>
          <button onClick={carregar} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg">
          {erro}
        </div>
      )}

      {cronogramas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <GanttChart size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray mb-4">Nenhum cronograma importado ainda.</p>
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5"
          >
            <Download size={14} /> Importar do SharePoint
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cronogramas.map((c) => (
            <CronogramaCard
              key={c.id}
              cronograma={c}
              expanded={expandedId === c.id}
              onToggle={() => expandir(c.id)}
              detail={expandedId === c.id ? detail : null}
              loadingDetail={expandedId === c.id && loadingDetail}
              onRefreshDetail={() => expandir(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CronogramaCard({ cronograma, expanded, onToggle, detail, loadingDetail, onRefreshDetail }) {
  const c = cronograma;
  const now = new Date();
  const diasRestantes = c.dataFim
    ? Math.ceil((new Date(c.dataFim) - now) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={16} className="text-torg-gray" /> : <ChevronRight size={16} className="text-torg-gray" />}
          <span className="text-sm font-bold text-torg-blue font-mono">{fmtOP(c.opNumero)}</span>
          <span className="text-sm text-torg-dark font-medium truncate max-w-xs">{c.titulo}</span>
          {c.op && <span className="text-xs text-torg-gray">({c.op.cliente})</span>}
        </div>
        <div className="flex items-center gap-2">
          {c.atrasados > 0 && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> {c.atrasados} atrasado{c.atrasados > 1 ? "s" : ""}
            </span>
          )}
          {diasRestantes !== null && (
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1 ${
              diasRestantes < 0 ? "bg-red-50 text-red-600"
              : diasRestantes <= 14 ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-torg-gray"
            }`}>
              <Clock size={10} />
              {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
            </span>
          )}
          <span className="text-[10px] text-torg-gray">
            {fmtData(c.dataInicio)} — {fmtData(c.dataFim)}
          </span>
        </div>
      </button>

      {/* Department summary pills */}
      {!expanded && c.deptSummary?.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {c.deptSummary.map((d, i) => {
            const Icon = DEPT_ICONS[d.departamento] || Factory;
            return (
              <span
                key={i}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-full border flex items-center gap-1 ${
                  d.atrasado ? "bg-red-50 text-red-600 border-red-200" : (DEPT_COLORS[d.departamento] || "bg-gray-50 text-torg-gray border-gray-200")
                }`}
              >
                <Icon size={10} />
                {DEPT_LABEL[d.departamento] || d.nome}
                <span className="font-bold">{d.percentual}%</span>
              </span>
            );
          })}
        </div>
      )}

      {expanded && (
        <CronogramaExpandido
          detail={detail}
          loadingDetail={loadingDetail}
          onRefreshDetail={onRefreshDetail}
          cronogramaId={c.id}
        />
      )}
    </div>
  );
}

function CronogramaExpandido({ detail, loadingDetail, onRefreshDetail, cronogramaId }) {
  const [tab, setTab] = useState("cronograma");

  return (
    <div className="border-t border-gray-100">
      <div className="flex items-center justify-between border-b border-gray-100">
        <div className="flex">
        <button
          onClick={() => setTab("cronograma")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === "cronograma"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <GanttChart size={13} /> Cronograma
        </button>
        <button
          onClick={() => setTab("suprimentos")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === "suprimentos"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <Package size={13} /> RMs / Pedidos / NFs
        </button>
        </div>
      </div>

      {tab === "cronograma" && (
        loadingDetail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-torg-blue" />
            <span className="ml-2 text-sm text-torg-gray">Carregando tarefas...</span>
          </div>
        ) : detail ? (
          <CronogramaDetail detail={detail} onRefresh={onRefreshDetail} cronogramaId={cronogramaId} />
        ) : (
          <div className="py-6 text-center text-sm text-torg-gray">Erro ao carregar detalhe.</div>
        )
      )}

      {tab === "suprimentos" && (
        <SuprimentosTab cronogramaId={cronogramaId} />
      )}
    </div>
  );
}

function CronogramaDetail({ detail, onRefresh, cronogramaId }) {
  const now = new Date();
  const tarefas = detail.tarefas || [];

  const byDept = {};

  for (const t of tarefas) {
    if (t.outlineLevel === 0 || !t.departamento) continue;
    if (!byDept[t.departamento]) byDept[t.departamento] = { summary: null, tasks: [] };
    if (t.outlineLevel === 1 && t.isSummary) {
      byDept[t.departamento].summary = t;
    } else {
      byDept[t.departamento].tasks.push(t);
    }
  }

  return (
    <div className="divide-y divide-gray-50">
      {Object.entries(byDept).map(([dept, { summary, tasks }]) => (
        <DeptSection key={dept} dept={dept} summary={summary} tasks={tasks} now={now} onRefresh={onRefresh} cronogramaId={cronogramaId} />
      ))}
    </div>
  );
}

function DeptSection({ dept, summary, tasks, now, onRefresh, cronogramaId }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [cobrResult, setCobrResult] = useState(null);
  const Icon = DEPT_ICONS[dept] || Factory;
  const colors = DEPT_COLORS[dept] || "text-gray-600 bg-gray-50 border-gray-200";
  const atrasadas = tasks.filter((t) => !t.isSummary && t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100);

  const cobrarDept = async (e) => {
    e.stopPropagation();
    if (!confirm(`Enviar e-mail de cobrança para ${DEPT_LABEL[dept] || dept}? (${atrasadas.length} tarefa${atrasadas.length > 1 ? "s" : ""} atrasada${atrasadas.length > 1 ? "s" : ""})`)) return;
    setCobrando(true);
    setCobrResult(null);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/notificar-atrasos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departamento: dept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao notificar");
      const r = data.resultados?.[0];
      setCobrResult(r?.enviado ? { ok: true, msg: `Enviado para ${r.destinatarios} pessoa(s)` } : { ok: false, msg: r?.motivo || data.motivo || "Não enviado" });
    } catch (err) {
      setCobrResult({ ok: false, msg: err.message });
    } finally {
      setCobrando(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 min-w-0">
          {collapsed ? <ChevronRight size={14} className="text-torg-gray" /> : <ChevronDown size={14} className="text-torg-gray" />}
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${colors}`}>
            <Icon size={12} /> {DEPT_LABEL[dept] || dept}
          </span>
          {summary && (
            <span className="text-xs text-torg-gray">
              {fmtData(summary.dataInicioPrevista)} — {fmtData(summary.dataFimPrevista)}
            </span>
          )}
          {atrasadas.length > 0 && (
            <span className="text-[10px] text-red-600 font-semibold">{atrasadas.length} atrasada{atrasadas.length > 1 ? "s" : ""}</span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {atrasadas.length > 0 && (
            <button
              onClick={cobrarDept}
              disabled={cobrando}
              className="px-2.5 py-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1 disabled:opacity-50 transition-colors"
              title={`Cobrar ${DEPT_LABEL[dept] || dept} por e-mail`}
            >
              {cobrando ? <Loader2 size={10} className="animate-spin" /> : <Mail size={10} />}
              Cobrar
            </button>
          )}
          {summary && (
            <span className={`text-xs font-bold ${summary.percentualRealizado >= 100 ? "text-emerald-600" : summary.percentualRealizado > 0 ? "text-torg-blue" : "text-torg-gray"}`}>
              {summary.percentualRealizado}%
            </span>
          )}
        </div>
      </div>

      {cobrResult && (
        <div className={`ml-6 mb-2 px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 ${cobrResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {cobrResult.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {cobrResult.msg}
          <button onClick={() => setCobrResult(null)} className="ml-auto p-0.5 hover:opacity-70"><X size={10} /></button>
        </div>
      )}

      {!collapsed && (
        <div className="ml-6 space-y-1">
          {tasks.map((t) => (
            <TarefaRow key={t.id} tarefa={t} now={now} onRefresh={onRefresh} />
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-torg-gray italic py-2">Nenhuma tarefa neste departamento.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TarefaRow({ tarefa, now, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(tarefa.percentualRealizado);
  const [obs, setObs] = useState(tarefa.observacao || "");
  const [saving, setSaving] = useState(false);
  const [showReg, setShowReg] = useState(false);
  const [regText, setRegText] = useState("");
  const [sendingReg, setSendingReg] = useState(false);

  const t = tarefa;
  const atrasada = t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100;
  const concluida = t.percentualRealizado >= 100;
  const indent = Math.max(0, t.outlineLevel - 2);

  const salvar = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          percentualRealizado: pct,
          observacao: obs || null,
          dataRealizacao: pct >= 100 ? new Date().toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Erro");
      setEditing(false);
      onRefresh();
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  };

  const enviarRegistro = async () => {
    if (!regText.trim()) return;
    setSendingReg(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}/registros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: regText.trim() }),
      });
      if (!res.ok) throw new Error("Erro");
      setRegText("");
      setShowReg(false);
      onRefresh();
    } catch {
      // keep open
    } finally {
      setSendingReg(false);
    }
  };

  return (
    <div className={`rounded-lg border ${atrasada ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-white"} p-2.5`} style={{ marginLeft: `${indent * 16}px` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {concluida ? (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          ) : atrasada ? (
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
          ) : (
            <Clock size={14} className="text-torg-gray shrink-0" />
          )}
          <span className={`text-xs font-medium truncate ${concluida ? "text-torg-gray line-through" : "text-torg-dark"}`}>
            {t.nome}
          </span>
          {t.isSummary && <span className="text-[9px] text-torg-gray bg-gray-100 px-1 rounded">grupo</span>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-torg-gray whitespace-nowrap">
            {fmtData(t.dataInicioPrevista)} — {fmtData(t.dataFimPrevista)}
          </span>

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                concluida ? "bg-emerald-100 text-emerald-700"
                : atrasada ? "bg-red-100 text-red-700"
                : pct > 0 ? "bg-torg-blue-50 text-torg-blue"
                : "bg-gray-100 text-torg-gray"
              } hover:opacity-80 cursor-pointer`}
            >
              {pct}%
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-12 text-[10px] px-1 py-0.5 border border-gray-200 rounded text-center"
              />
              <span className="text-[10px] text-torg-gray">%</span>
            </div>
          )}

          <button
            onClick={() => setShowReg(!showReg)}
            className="p-0.5 text-torg-gray hover:text-torg-blue rounded"
            title="Adicionar registro"
          >
            <MessageSquarePlus size={12} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observacao..."
            className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded"
          />
          <button onClick={salvar} disabled={saving} className="px-2 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50">
            {saving ? "..." : "Salvar"}
          </button>
          <button onClick={() => { setEditing(false); setPct(t.percentualRealizado); setObs(t.observacao || ""); }} className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark">
            Cancelar
          </button>
        </div>
      )}

      {t.observacao && !editing && (
        <p className="text-[10px] text-torg-gray mt-1 ml-5 italic">{t.observacao}</p>
      )}

      {showReg && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={regText}
            onChange={(e) => setRegText(e.target.value)}
            placeholder="O que aconteceu..."
            className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded"
            onKeyDown={(e) => e.key === "Enter" && enviarRegistro()}
          />
          <button onClick={enviarRegistro} disabled={sendingReg || !regText.trim()} className="p-1 text-torg-blue hover:text-torg-blue-700 disabled:opacity-50">
            <Send size={12} />
          </button>
          <button onClick={() => { setShowReg(false); setRegText(""); }} className="p-1 text-torg-gray hover:text-torg-dark">
            <X size={12} />
          </button>
        </div>
      )}

      {t.registros?.length > 0 && (
        <div className="mt-1.5 ml-5 space-y-0.5">
          {t.registros.map((r) => (
            <p key={r.id} className="text-[9px] text-torg-gray">
              <span className="font-medium">{r.createdBy?.name}</span>{" "}
              <span className="opacity-70">({new Date(r.createdAt).toLocaleDateString("pt-BR")})</span>:{" "}
              {r.descricao}
            </p>
          ))}
        </div>
      )}

      {t.qtdePlanejada > 0 && (
        <div className="mt-1 ml-5 text-[9px] text-torg-gray">
          Qtde: {t.qtdeRealizada.toLocaleString("pt-BR")} / {t.qtdePlanejada.toLocaleString("pt-BR")}
          {t.qtdePlanejada > 1 && ` kg`}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL = {
  PENDENTE: { label: "Pendente", color: "bg-gray-100 text-gray-600" },
  EM_COTACAO: { label: "Em cotação", color: "bg-amber-100 text-amber-700" },
  COTADO: { label: "Cotado", color: "bg-blue-100 text-blue-700" },
  PEDIDO_GERADO: { label: "Pedido gerado", color: "bg-emerald-100 text-emerald-700" },
};

function SuprimentosTab({ cronogramaId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/suprimentos`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar");
        return r.json();
      })
      .then(setData)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [cronogramaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-torg-blue" />
        <span className="ml-2 text-sm text-torg-gray">Carregando suprimentos...</span>
      </div>
    );
  }

  if (erro) {
    return <div className="py-6 text-center text-sm text-red-600">{erro}</div>;
  }

  if (!data?.opVinculada) {
    return (
      <div className="py-8 text-center">
        <Package size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">OP não vinculada a este cronograma.</p>
        <p className="text-xs text-torg-gray mt-1">Sincronize o SharePoint para vincular automaticamente.</p>
      </div>
    );
  }

  if (data.data.length === 0) {
    return (
      <div className="py-8 text-center">
        <Package size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma RM encontrada para esta OP.</p>
      </div>
    );
  }

  const items = data.data.filter((d) => {
    if (filtro === "todos") return true;
    if (filtro === "pendente") return d.qtdPedida === 0;
    if (filtro === "pedido") return d.qtdPedida > 0 && !d.recebido;
    if (filtro === "recebido") return d.recebido;
    return true;
  });

  const totais = data.pesoTotais;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <KpiCard label="Itens RM" value={data.totalItens} icon={FileText} color="text-torg-blue" />
        <KpiCard label="Com pedido" value={data.totalComPedido} icon={ShoppingCart} color="text-amber-600" />
        <KpiCard label="Recebidos" value={data.totalRecebido} icon={CheckCircle2} color="text-emerald-600" />
        <KpiCard label="A comprar" value={`${fmtPeso(totais.aComprar)} kg`} icon={AlertTriangle} color="text-red-600" />
        <KpiCard label="A receber" value={`${fmtPeso(totais.aReceber)} kg`} icon={Clock} color="text-amber-600" />
      </div>

      <div className="flex gap-1.5">
        {[
          { key: "todos", label: "Todos" },
          { key: "pendente", label: "Sem pedido" },
          { key: "pedido", label: "Aguardando entrega" },
          { key: "recebido", label: "Recebidos" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
              filtro === f.key
                ? "bg-torg-blue text-white border-torg-blue"
                : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50/60 text-torg-gray">
              <th className="text-left px-2 py-1.5 font-medium">RM</th>
              <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
              <th className="text-right px-2 py-1.5 font-medium">Solicitado</th>
              <th className="text-right px-2 py-1.5 font-medium">Pedido</th>
              <th className="text-right px-2 py-1.5 font-medium">Recebido</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium">Fornecedor</th>
              <th className="text-left px-2 py-1.5 font-medium">Pedido Nº</th>
              <th className="text-left px-2 py-1.5 font-medium">NF</th>
              <th className="text-left px-2 py-1.5 font-medium">Prazo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <SuprimentoRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-xs text-torg-gray italic py-4 text-center">Nenhum item neste filtro.</p>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={color} />
        <span className="text-[10px] text-torg-gray">{label}</span>
      </div>
      <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function SuprimentoRow({ item }) {
  const st = STATUS_LABEL[item.status] || STATUS_LABEL.PENDENTE;
  const atrasado = item.prazoEntrega && new Date(item.prazoEntrega) < new Date() && !item.recebido;

  return (
    <tr className={`${item.recebido ? "bg-emerald-50/30" : atrasado ? "bg-red-50/30" : ""} hover:bg-gray-50/50`}>
      <td className="px-2 py-1.5 font-mono text-torg-blue whitespace-nowrap">{item.rmNumero}</td>
      <td className="px-2 py-1.5 max-w-xs truncate" title={item.descricao}>{item.descricao}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtQtd(item.qtdSolicitada)} {item.unidade}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        {item.qtdPedida > 0 ? `${fmtQtd(item.qtdPedida)} ${item.unidade}` : <span className="text-red-500">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        {item.qtdRecebida > 0 ? (
          <span className={item.recebido ? "text-emerald-600 font-medium" : "text-amber-600"}>
            {fmtQtd(item.qtdRecebida)} {item.unidade}
          </span>
        ) : "—"}
      </td>
      <td className="px-2 py-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${st.color}`}>{st.label}</span>
      </td>
      <td className="px-2 py-1.5 truncate max-w-[120px]" title={item.fornecedor}>{item.fornecedor || "—"}</td>
      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{item.numeroPedido || "—"}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">{item.nfs?.length > 0 ? item.nfs.join(", ") : "—"}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        {item.prazoEntrega ? (
          <span className={atrasado ? "text-red-600 font-medium" : ""}>
            {fmtData(item.prazoEntrega)}
          </span>
        ) : "—"}
      </td>
    </tr>
  );
}

function fmtQtd(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function fmtPeso(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
