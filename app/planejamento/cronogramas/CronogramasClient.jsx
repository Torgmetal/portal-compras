"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Clock, CheckCircle2, AlertTriangle, Download, MessageSquarePlus,
  Send, X, Briefcase, Wrench, ShoppingCart, Factory, Truck, HardHat,
  GanttChart, Package, FileText, CircleDot, Mail, Calendar,
  History, FileDown, Milestone,
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
  const [settingBase, setSettingBase] = useState(false);

  const definirDataBase = async () => {
    const hoje = new Date().toISOString().split("T")[0];
    const input = prompt("Data base do cronograma (AAAA-MM-DD):", hoje);
    if (!input) return;
    const d = new Date(input + "T12:00:00Z");
    if (isNaN(d.getTime())) return alert("Data inválida");
    setSettingBase(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase: d.toISOString() }),
      });
      if (!res.ok) throw new Error("Erro ao definir data base");
      onRefreshDetail();
    } catch (e) {
      alert(e.message);
    } finally {
      setSettingBase(false);
    }
  };

  const tabs = [
    { key: "cronograma", label: "Cronograma", icon: GanttChart },
    { key: "suprimentos", label: "RMs / Pedidos / NFs", icon: Package },
    { key: "historico", label: "Linha de Controle", icon: History },
  ];

  return (
    <div className="border-t border-gray-100">
      {/* Data Base badge */}
      {detail && (
        <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Milestone size={13} className="text-torg-blue" />
              <span className="text-xs font-medium text-torg-dark">Data Base:</span>
              {detail.dataBase ? (
                <span className="text-xs font-bold text-torg-blue">{new Date(detail.dataBase).toLocaleDateString("pt-BR")}</span>
              ) : (
                <span className="text-xs text-torg-gray italic">Não definida</span>
              )}
            </div>
            <button
              onClick={definirDataBase}
              disabled={settingBase}
              className="px-2 py-0.5 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue/20 rounded hover:bg-torg-blue-100 disabled:opacity-50"
            >
              {settingBase ? "..." : detail.dataBase ? "Redefinir" : "Definir"}
            </button>
          </div>
          <button
            onClick={() => exportarGanttPDF(detail)}
            className="px-3 py-1 text-[10px] font-medium text-white bg-torg-blue rounded-lg hover:bg-torg-blue-700 flex items-center gap-1.5"
          >
            <FileDown size={12} /> Exportar Gantt (PDF)
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-gray-100">
        <div className="flex">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-torg-blue text-torg-blue"
                    : "border-transparent text-torg-gray hover:text-torg-dark"
                }`}
              >
                <Icon size={13} /> {t.label}
                {t.key === "historico" && detail?.revisoes?.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-torg-gray text-[9px] rounded-full font-bold">{detail.revisoes.length}</span>
                )}
              </button>
            );
          })}
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

      {tab === "historico" && detail && (
        <HistoricoTab revisoes={detail.revisoes || []} />
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
            {t.dataFimBase && t.dataFimPrevista && new Date(t.dataFimPrevista) > new Date(t.dataFimBase) && (
              <span className="ml-1 text-red-500 font-semibold" title={`Baseline: ${fmtData(t.dataFimBase)}`}>
                ▲{Math.ceil((new Date(t.dataFimPrevista) - new Date(t.dataFimBase)) / 86400000)}d
              </span>
            )}
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

function HistoricoTab({ revisoes }) {
  if (revisoes.length === 0) {
    return (
      <div className="py-8 text-center">
        <History size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma alteração registrada.</p>
        <p className="text-xs text-torg-gray mt-1">Defina a data base para iniciar o controle de revisões.</p>
      </div>
    );
  }

  const TIPO_BADGE = {
    BASELINE_DEFINIDA: { label: "Baseline", color: "bg-torg-blue-50 text-torg-blue" },
    TAREFA_ALTERADA: { label: "Tarefa", color: "bg-amber-50 text-amber-700" },
    SYNC_SHAREPOINT: { label: "Sync", color: "bg-purple-50 text-purple-700" },
    DATA_ALTERADA: { label: "Data", color: "bg-emerald-50 text-emerald-700" },
  };

  return (
    <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
      {revisoes.map((r) => {
        const badge = TIPO_BADGE[r.tipo] || TIPO_BADGE.TAREFA_ALTERADA;
        return (
          <div key={r.id} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50">
            <div className="mt-0.5">
              <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${badge.color}`}>{badge.label}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-torg-dark">{r.descricao}</p>
              <p className="text-[10px] text-torg-gray mt-0.5">
                {r.createdBy?.name} · {new Date(r.createdAt).toLocaleDateString("pt-BR")} às{" "}
                {new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Exportar Gantt como PDF ──────────────────────────────────
function exportarGanttPDF(detail) {
  const tarefas = (detail.tarefas || []).filter((t) => t.outlineLevel > 0 && t.departamento);
  if (tarefas.length === 0) return alert("Nenhuma tarefa para exportar.");

  // Calcula range de datas
  let minDate = Infinity, maxDate = -Infinity;
  for (const t of tarefas) {
    if (t.dataInicioPrevista) minDate = Math.min(minDate, new Date(t.dataInicioPrevista).getTime());
    if (t.dataFimPrevista) maxDate = Math.max(maxDate, new Date(t.dataFimPrevista).getTime());
    if (t.dataInicioBase) minDate = Math.min(minDate, new Date(t.dataInicioBase).getTime());
    if (t.dataFimBase) maxDate = Math.max(maxDate, new Date(t.dataFimBase).getTime());
  }
  if (!isFinite(minDate) || !isFinite(maxDate)) return alert("Tarefas sem datas definidas.");

  // Padding 7 dias
  minDate -= 7 * 86400000;
  maxDate += 7 * 86400000;
  const totalDays = Math.ceil((maxDate - minDate) / 86400000);

  // Config
  const rowHeight = 22;
  const headerHeight = 80;
  const labelWidth = 280;
  const dayWidth = Math.max(3, Math.min(12, 900 / totalDays));
  const chartWidth = totalDays * dayWidth;
  const totalWidth = labelWidth + chartWidth + 40;
  const totalHeight = headerHeight + tarefas.length * rowHeight + 60;

  // Abre janela de impressao
  const win = window.open("", "_blank", `width=${Math.min(totalWidth + 40, 1400)},height=${Math.min(totalHeight + 100, 900)}`);
  if (!win) return alert("Popup bloqueado — permita popups para gerar o PDF.");

  const deptColors = {
    COMERCIAL: "#2563eb", ENGENHARIA: "#7c3aed", SUPRIMENTOS: "#d97706",
    FABRICACAO: "#059669", EXPEDICAO: "#0d9488", MONTAGEM: "#ea580c",
  };

  // Gera meses
  const months = [];
  const d0 = new Date(minDate);
  let cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
  while (cur.getTime() < maxDate) {
    const start = Math.max(0, (cur.getTime() - minDate) / 86400000);
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = Math.min(totalDays, (next.getTime() - minDate) / 86400000);
    months.push({
      label: cur.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
      left: start * dayWidth,
      width: (end - start) * dayWidth,
    });
    cur = next;
  }

  // Data base line
  const dataBaseLine = detail.dataBase ? ((new Date(detail.dataBase).getTime() - minDate) / 86400000) * dayWidth : null;

  // HTML
  let rowsHtml = "";
  for (let i = 0; i < tarefas.length; i++) {
    const t = tarefas[i];
    const indent = Math.max(0, t.outlineLevel - 1) * 12;
    const isSummary = t.isSummary;
    const pct = t.percentualRealizado;
    const bg = i % 2 === 0 ? "#fff" : "#f8fafc";

    // Barra baseline
    let baselineBar = "";
    if (t.dataInicioBase && t.dataFimBase) {
      const bStart = ((new Date(t.dataInicioBase).getTime() - minDate) / 86400000) * dayWidth;
      const bWidth = Math.max(2, ((new Date(t.dataFimBase).getTime() - new Date(t.dataInicioBase).getTime()) / 86400000) * dayWidth);
      baselineBar = `<div style="position:absolute;top:3px;left:${bStart}px;width:${bWidth}px;height:6px;background:#cbd5e1;border-radius:2px;"></div>`;
    }

    // Barra atual
    let currentBar = "";
    if (t.dataInicioPrevista && t.dataFimPrevista) {
      const cStart = ((new Date(t.dataInicioPrevista).getTime() - minDate) / 86400000) * dayWidth;
      const cWidth = Math.max(2, ((new Date(t.dataFimPrevista).getTime() - new Date(t.dataInicioPrevista).getTime()) / 86400000) * dayWidth);
      const color = deptColors[t.departamento] || "#6b7280";
      const fillWidth = Math.round(cWidth * pct / 100);
      currentBar = `<div style="position:absolute;top:${t.dataInicioBase ? 11 : 5}px;left:${cStart}px;width:${cWidth}px;height:${isSummary ? 8 : 10}px;background:${color}22;border:1px solid ${color};border-radius:3px;overflow:hidden;">` +
        `<div style="width:${fillWidth}px;height:100%;background:${color};"></div></div>`;
    }

    const nome = isSummary ? `<b>${t.nome}</b>` : t.nome;
    rowsHtml += `<div style="display:flex;height:${rowHeight}px;border-bottom:1px solid #f1f5f9;background:${bg};">` +
      `<div style="width:${labelWidth}px;padding:3px 8px 3px ${8 + indent}px;display:flex;align-items:center;gap:6px;flex-shrink:0;overflow:hidden;">` +
        `<span style="font-size:10px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nome}</span>` +
        `<span style="font-size:9px;color:${pct >= 100 ? '#059669' : pct > 0 ? '#006EAB' : '#94a3b8'};font-weight:bold;flex-shrink:0;">${pct}%</span>` +
      `</div>` +
      `<div style="flex:1;position:relative;min-width:${chartWidth}px;">${baselineBar}${currentBar}</div>` +
    `</div>`;
  }

  // Monta meses header
  let monthsHtml = months.map((m) => `<div style="position:absolute;left:${m.left}px;width:${m.width}px;text-align:center;font-size:9px;color:#64748b;border-left:1px solid #e2e8f0;padding:2px 0;">${m.label}</div>`).join("");

  // Data base indicator
  let dataBaseIndicator = "";
  if (dataBaseLine !== null) {
    dataBaseIndicator = `<div style="position:absolute;left:${dataBaseLine}px;top:0;bottom:0;width:2px;background:#006EAB;z-index:5;"></div>` +
      `<div style="position:absolute;left:${dataBaseLine - 20}px;top:-18px;font-size:8px;color:#006EAB;font-weight:bold;width:42px;text-align:center;">DB</div>`;
  }

  const html = `<!DOCTYPE html><html><head><title>Gantt — ${detail.titulo || detail.opNumero}</title>
<style>
  @page { size: landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
</style></head><body>
<div class="no-print" style="text-align:right;margin-bottom:12px;">
  <button onclick="window.print()" style="padding:8px 20px;background:#006EAB;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">🖨 Imprimir / Salvar PDF</button>
</div>
<div style="margin-bottom:12px;">
  <div style="display:flex;align-items:center;gap:12px;">
    <h1 style="font-size:18px;color:#002945;margin:0;">${detail.opNumero} — ${detail.titulo || ""}</h1>
  </div>
  <div style="display:flex;gap:16px;margin-top:4px;">
    <span style="font-size:11px;color:#576D7E;">Período: ${detail.dataInicio ? new Date(detail.dataInicio).toLocaleDateString("pt-BR") : "—"} a ${detail.dataFim ? new Date(detail.dataFim).toLocaleDateString("pt-BR") : "—"}</span>
    ${detail.dataBase ? `<span style="font-size:11px;color:#006EAB;font-weight:bold;">Data Base: ${new Date(detail.dataBase).toLocaleDateString("pt-BR")}</span>` : ""}
    ${detail.op?.cliente ? `<span style="font-size:11px;color:#576D7E;">Cliente: ${detail.op.cliente}</span>` : ""}
  </div>
  <div style="display:flex;gap:12px;margin-top:6px;">
    <span style="display:flex;align-items:center;gap:4px;font-size:9px;color:#64748b;"><span style="width:16px;height:6px;background:#cbd5e1;border-radius:2px;display:inline-block;"></span> Baseline</span>
    <span style="display:flex;align-items:center;gap:4px;font-size:9px;color:#64748b;"><span style="width:16px;height:8px;background:#006EAB44;border:1px solid #006EAB;border-radius:2px;display:inline-block;"></span> Atual</span>
    ${dataBaseLine !== null ? '<span style="display:flex;align-items:center;gap:4px;font-size:9px;color:#006EAB;"><span style="width:2px;height:12px;background:#006EAB;display:inline-block;"></span> Data Base</span>' : ""}
  </div>
</div>
<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;">
  <div style="min-width:${totalWidth}px;">
    <div style="display:flex;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
      <div style="width:${labelWidth}px;padding:6px 8px;font-size:10px;font-weight:bold;color:#334155;flex-shrink:0;">Tarefa</div>
      <div style="flex:1;position:relative;min-width:${chartWidth}px;height:24px;">${monthsHtml}</div>
    </div>
    <div style="position:relative;">
      ${rowsHtml}
      <div style="position:absolute;left:${labelWidth}px;top:0;bottom:0;right:0;">${dataBaseIndicator}</div>
    </div>
  </div>
</div>
<div style="margin-top:12px;text-align:right;font-size:9px;color:#94a3b8;">
  Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — Torg Metal
</div>
</body></html>`;

  win.document.write(html);
  win.document.close();
}

function fmtQtd(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function fmtPeso(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
