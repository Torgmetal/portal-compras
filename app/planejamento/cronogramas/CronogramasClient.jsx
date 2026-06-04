"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Clock, CheckCircle2, AlertTriangle, Download, MessageSquarePlus,
  Send, X, Briefcase, Wrench, ShoppingCart, Factory, Truck, HardHat,
  GanttChart, Package, FileText, CircleDot, Mail, Calendar,
  History, FileDown, Milestone, Plus, Trash2, Weight, BarChart3,
  List, Link2, Unlink, RotateCcw, Lock,
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

// Ordem fixa dos departamentos — Comercial sempre primeiro
const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

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
  const [showNovoModal, setShowNovoModal] = useState(false);

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
    await recarregarDetail(id);
  };

  const recarregarDetail = async (id) => {
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
            Acompanhamento de cronogramas por OP e departamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNovoModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5"
          >
            <Plus size={14} /> Novo Cronograma
          </button>
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
          <p className="text-sm text-torg-gray mb-4">Nenhum cronograma criado ainda.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowNovoModal(true)}
              className="px-4 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Criar Cronograma
            </button>
            <button
              onClick={sincronizar}
              disabled={syncing}
              className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5"
            >
              <Download size={14} /> Importar do SharePoint
            </button>
          </div>
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
              onRefreshDetail={() => recarregarDetail(c.id)}
              onDeleted={() => { setExpandedId(null); setDetail(null); carregar(); }}
            />
          ))}
        </div>
      )}

      {showNovoModal && (
        <NovoCronogramaModal
          onClose={() => setShowNovoModal(false)}
          onCreated={(id) => {
            setShowNovoModal(false);
            carregar().then(() => expandir(id));
          }}
        />
      )}
    </div>
  );
}

function NovoCronogramaModal({ onClose, onCreated }) {
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [opSelecionada, setOpSelecionada] = useState("");
  const [titulo, setTitulo] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [usarTemplate, setUsarTemplate] = useState(false);
  const [opManual, setOpManual] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/planejamento/cronogramas/manual")
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar OPs");
        return r.json();
      })
      .then((d) => setOps(d.ops || []))
      .catch(() => setOps([]))
      .finally(() => setLoadingOps(false));
  }, []);

  const opNum = opSelecionada || opManual.trim().toUpperCase();

  const criar = async () => {
    if (!opNum) return setErro("Selecione ou digite o número da OP");
    if (!titulo.trim()) return setErro("Informe o título / nome da obra");
    setSaving(true);
    setErro("");
    try {
      const body = {
        opNumero: opNum.startsWith("T") ? opNum : `T${opNum}`,
        titulo: titulo.trim(),
        usarTemplate,
      };
      if (dataInicio) body.dataInicio = new Date(dataInicio + "T12:00:00Z").toISOString();
      if (dataFim) body.dataFim = new Date(dataFim + "T12:00:00Z").toISOString();

      const res = await fetch("/api/planejamento/cronogramas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar");
      onCreated(data.cronograma.id);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Auto-preencher título quando seleciona OP
  const handleSelectOP = (val) => {
    setOpSelecionada(val);
    setOpManual("");
    if (val) {
      const op = ops.find((o) => o.numero === val);
      if (op && !titulo) setTitulo(op.obra || op.cliente || "");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GanttChart size={18} className="text-torg-blue" />
            <h3 className="text-sm font-bold text-torg-dark">Novo Cronograma</h3>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* OP */}
          <div>
            <label className="text-xs font-medium text-torg-dark mb-1 block">Ordem de Produção *</label>
            {loadingOps ? (
              <div className="flex items-center gap-2 text-xs text-torg-gray py-2">
                <Loader2 size={12} className="animate-spin" /> Carregando OPs...
              </div>
            ) : ops.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={opSelecionada}
                  onChange={(e) => handleSelectOP(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:border-torg-blue focus:ring-1 focus:ring-torg-blue outline-none"
                >
                  <option value="">Selecione uma OP...</option>
                  {ops.map((op) => (
                    <option key={op.id} value={op.numero}>
                      {op.numero} — {op.cliente} {op.obra ? `(${op.obra})` : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-torg-gray">ou digite:</span>
                  <input
                    value={opManual}
                    onChange={(e) => { setOpManual(e.target.value); setOpSelecionada(""); }}
                    placeholder="Ex: T001 ou 001"
                    className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded"
                  />
                </div>
              </div>
            ) : (
              <input
                value={opManual}
                onChange={(e) => setOpManual(e.target.value)}
                placeholder="Número da OP (ex: T001 ou 001)"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            )}
          </div>

          {/* Título */}
          <div>
            <label className="text-xs font-medium text-torg-dark mb-1 block">Título / Nome da Obra *</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Galpão Industrial ABC Ltda"
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue outline-none"
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">Data Fim Prevista</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          {/* Template */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
            <input
              type="checkbox"
              checked={usarTemplate}
              onChange={(e) => setUsarTemplate(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              id="usar-template"
            />
            <label htmlFor="usar-template" className="cursor-pointer">
              <span className="text-xs font-medium text-torg-dark">Usar template padrão Torg</span>
              <p className="text-[10px] text-torg-gray mt-0.5">
                Cria automaticamente os departamentos (Comercial, Engenharia, Suprimentos, Fabricação, Expedição, Montagem) com tarefas padrão. Você pode editar, adicionar ou remover depois.
              </p>
            </label>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
              <AlertCircle size={12} /> {erro}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs text-torg-gray hover:text-torg-dark font-medium">
            Cancelar
          </button>
          <button
            onClick={criar}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {saving ? "Criando..." : "Criar Cronograma"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CronogramaCard({ cronograma, expanded, onToggle, detail, loadingDetail, onRefreshDetail, onDeleted }) {
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
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function CronogramaExpandido({ detail, loadingDetail, onRefreshDetail, cronogramaId, onDeleted }) {
  const [tab, setTab] = useState("cronograma");
  const [settingBase, setSettingBase] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const excluirCronograma = async () => {
    if (!confirm("Tem certeza que deseja excluir este cronograma? Todas as tarefas e registros serão perdidos.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao excluir");
      }
      onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const tabs = [
    { key: "cronograma", label: "Cronograma", icon: GanttChart },
    { key: "producao", label: "Produção / Peso", icon: Weight },
    { key: "suprimentos", label: "RMs / Pedidos / NFs", icon: Package },
    { key: "historico", label: "Linha de Controle", icon: History },
  ];

  return (
    <div className="border-t border-gray-100">
      {/* Data Base badge + ações */}
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
            {detail.dataBase && (
              <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                Datas do cronograma travadas
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportarGanttPDF(detail)}
              className="px-3 py-1 text-[10px] font-medium text-white bg-torg-blue rounded-lg hover:bg-torg-blue-700 flex items-center gap-1.5"
            >
              <FileDown size={12} /> Exportar Gantt (PDF)
            </button>
            <button
              onClick={excluirCronograma}
              disabled={deleting}
              className="px-3 py-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Excluir
            </button>
          </div>
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

      {tab === "producao" && (
        <ProducaoTab cronogramaId={cronogramaId} />
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
  const [addingGlobal, setAddingGlobal] = useState(false);
  const [newDept, setNewDept] = useState("FABRICACAO");
  const [newName, setNewName] = useState("");
  const [newInicio, setNewInicio] = useState("");
  const [newFim, setNewFim] = useState("");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [showImportPeso, setShowImportPeso] = useState(false);
  const [viewMode, setViewMode] = useState("lista"); // "lista" | "gantt"
  const [recalculando, setRecalculando] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);

  const now = new Date();
  const tarefas = detail.tarefas || [];

  const recalcular = async () => {
    setRecalculando(true);
    setRecalcMsg(null);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/recalcular`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao recalcular");
      setRecalcMsg({ ok: true, msg: data.message });
      if (data.alteracoes > 0) onRefresh();
    } catch (e) {
      setRecalcMsg({ ok: false, msg: e.message });
    } finally {
      setRecalculando(false);
    }
  };

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

  const hasTarefas = Object.keys(byDept).length > 0;

  const adicionarTarefaGlobal = async () => {
    if (!newName.trim()) return;
    setSavingGlobal(true);
    try {
      const body = { nome: newName.trim(), departamento: newDept, outlineLevel: 2, isSummary: false };
      if (newInicio) body.dataInicioPrevista = new Date(newInicio + "T12:00:00Z").toISOString();
      if (newFim) body.dataFimPrevista = new Date(newFim + "T12:00:00Z").toISOString();
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/tarefas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao adicionar");
      setNewName("");
      setNewInicio("");
      setNewFim("");
      onRefresh();
    } catch {
      // keep form open
    } finally {
      setSavingGlobal(false);
    }
  };

  // Verifica se alguma tarefa ja tem peso
  const temPeso = tarefas.some((t) => t.qtdePlanejada > 0);

  // Conta tarefas com antecessoras
  const temAntecessoras = tarefas.some((t) => t.antecessoraIds?.length > 0);

  return (
    <div className="divide-y divide-gray-50">
      {/* Barra de controles: Peso + View toggle + Recalcular */}
      {hasTarefas && (
        <div className="px-4 py-2.5 bg-gray-50/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Weight size={13} className="text-torg-blue" />
              <span className="text-xs text-torg-gray">
                {temPeso ? "Peso importado" : "Sem peso"}
              </span>
            </div>
            <button
              onClick={() => setShowImportPeso(true)}
              className="px-3 py-1.5 text-[10px] font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5"
            >
              <Download size={11} /> {temPeso ? "Atualizar Pesos" : "Importar Peso"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Recalcular datas */}
            <button
              onClick={recalcular}
              disabled={recalculando}
              className="px-3 py-1.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 disabled:opacity-50"
              title="Recalcula datas das tarefas baseado nas antecessoras. Tarefas atrasadas empurram as sucessoras."
            >
              {recalculando ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Recalcular Datas
            </button>
            {/* Toggle lista / gantt */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("lista")}
                className={`px-2.5 py-1.5 text-[10px] font-medium flex items-center gap-1 transition-colors ${
                  viewMode === "lista" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"
                }`}
              >
                <List size={11} /> Lista
              </button>
              <button
                onClick={() => setViewMode("gantt")}
                className={`px-2.5 py-1.5 text-[10px] font-medium flex items-center gap-1 transition-colors ${
                  viewMode === "gantt" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"
                }`}
              >
                <GanttChart size={11} /> Gantt
              </button>
            </div>
          </div>
        </div>
      )}

      {recalcMsg && (
        <div className={`px-4 py-2 text-xs flex items-center gap-1.5 ${recalcMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {recalcMsg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {recalcMsg.msg}
          <button onClick={() => setRecalcMsg(null)} className="ml-auto p-0.5 hover:opacity-70"><X size={10} /></button>
        </div>
      )}

      {viewMode === "gantt" && hasTarefas ? (
        <GanttInline tarefas={tarefas} detail={detail} />
      ) : (
        <>
          {DEPT_ORDER.filter((d) => byDept[d]).map((dept) => {
            const { summary, tasks } = byDept[dept];
            return <DeptSection key={dept} dept={dept} summary={summary} tasks={tasks} now={now} onRefresh={onRefresh} cronogramaId={cronogramaId} allTarefas={tarefas} />;
          })}
          {/* Departamentos fora da ordem padrao (se houver) */}
          {Object.keys(byDept).filter((d) => !DEPT_ORDER.includes(d)).map((dept) => {
            const { summary, tasks } = byDept[dept];
            return <DeptSection key={dept} dept={dept} summary={summary} tasks={tasks} now={now} onRefresh={onRefresh} cronogramaId={cronogramaId} allTarefas={tarefas} />;
          })}
        </>
      )}

      {!hasTarefas && !addingGlobal && (
        <div className="py-8 text-center">
          <GanttChart size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray mb-1">Cronograma vazio.</p>
          <p className="text-xs text-torg-gray mb-4">Adicione as tarefas de cada departamento.</p>
          <button
            onClick={() => setAddingGlobal(true)}
            className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Adicionar Tarefa
          </button>
        </div>
      )}

      {/* Botão global de adicionar tarefa (sempre visível quando já tem tarefas) */}
      <div className="px-4 py-3">
        {!addingGlobal ? (
          <button
            onClick={() => setAddingGlobal(true)}
            className="flex items-center gap-1.5 text-xs text-torg-blue hover:text-torg-blue-700 font-medium py-1"
          >
            <Plus size={13} /> Adicionar tarefa
          </button>
        ) : (
          <div className="rounded-lg border border-torg-blue/20 bg-torg-blue-50/20 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <select
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white"
              >
                {Object.entries(DEPT_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da tarefa..."
                className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) adicionarTarefaGlobal();
                  if (e.key === "Escape") setAddingGlobal(false);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-torg-gray">Início:</span>
                <input type="date" value={newInicio} onChange={(e) => setNewInicio(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-torg-gray">Fim:</span>
                <input type="date" value={newFim} onChange={(e) => setNewFim(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={() => setAddingGlobal(false)} className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark">
                  Cancelar
                </button>
                <button
                  onClick={adicionarTarefaGlobal}
                  disabled={savingGlobal || !newName.trim()}
                  className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium"
                >
                  {savingGlobal ? "..." : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showImportPeso && (
        <ImportarPesoModal
          cronogramaId={cronogramaId}
          onClose={() => setShowImportPeso(false)}
          onImported={() => { setShowImportPeso(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function ImportarPesoModal({ cronogramaId, onClose, onImported }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);
  const [distribuicao, setDistribuicao] = useState({});

  useEffect(() => {
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/importar-peso`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar dados");
        return r.json();
      })
      .then((d) => {
        setData(d);
        // Pre-preenche com sugestão
        const dist = {};
        for (const s of d.sugestao) {
          dist[s.tarefaId] = {
            qtdePlanejada: s.pesoAtual > 0 ? s.pesoAtual : s.pesoSugerido,
            qtdeRealizada: s.pesoRealizado,
            nome: s.nome,
            departamento: s.departamento,
            sugerido: s.pesoSugerido,
          };
        }
        setDistribuicao(dist);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [cronogramaId]);

  const aplicar = async () => {
    const items = Object.entries(distribuicao)
      .filter(([, v]) => v.qtdePlanejada > 0)
      .map(([tarefaId, v]) => ({
        tarefaId,
        qtdePlanejada: v.qtdePlanejada,
        qtdeRealizada: v.qtdeRealizada || 0,
      }));

    if (items.length === 0) return setErro("Nenhuma tarefa com peso para importar");

    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/importar-peso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribuicao: items }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao importar");
      onImported();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  const aplicarSugestao = () => {
    if (!data) return;
    const dist = {};
    for (const s of data.sugestao) {
      dist[s.tarefaId] = {
        qtdePlanejada: s.pesoSugerido,
        qtdeRealizada: s.pesoRealizado,
        nome: s.nome,
        departamento: s.departamento,
        sugerido: s.pesoSugerido,
      };
    }
    setDistribuicao(dist);
  };

  const updatePeso = (tarefaId, campo, valor) => {
    setDistribuicao((prev) => ({
      ...prev,
      [tarefaId]: { ...prev[tarefaId], [campo]: valor },
    }));
  };

  const fmtK = (v) => {
    if (!v) return "0 kg";
    if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
    return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Weight size={18} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-torg-dark">Importar Peso da OP</h3>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-torg-blue" />
            <span className="ml-2 text-sm text-torg-gray">Carregando peças da OP...</span>
          </div>
        ) : erro && !data ? (
          <div className="py-8 text-center text-sm text-red-600">{erro}</div>
        ) : data && data.pesoTotal === 0 ? (
          <div className="py-8 text-center">
            <Weight size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">Nenhuma peça encontrada para a OP {data.opNumero}.</p>
            <p className="text-xs text-torg-gray mt-1">Importe a lista de peças/conjuntos na aba de Produção primeiro.</p>
          </div>
        ) : data ? (
          <>
            <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 shrink-0">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Peso Total OP</p>
                  <p className="text-sm font-bold text-torg-dark">{fmtK(data.pesoTotal)}</p>
                  <p className="text-[9px] text-torg-gray">{data.totalPecas} peças</p>
                </div>
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Produzido (Syneco)</p>
                  <p className="text-sm font-bold text-emerald-600">{fmtK(data.pesoProduzidoTotal)}</p>
                  <p className="text-[9px] text-torg-gray">
                    {data.pesoTotal > 0 ? `${(data.pesoProduzidoTotal / data.pesoTotal * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Expedido</p>
                  <p className="text-sm font-bold text-teal-600">{fmtK(data.pesoExpedido)}</p>
                  <p className="text-[9px] text-torg-gray">
                    {data.pesoTotal > 0 ? `${(data.pesoExpedido / data.pesoTotal * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={aplicarSugestao}
                    className="px-3 py-1.5 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue/20 rounded-lg hover:bg-torg-blue-100"
                  >
                    Preencher sugestão automática
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="text-[10px] text-torg-gray mb-3">
                Defina o peso planejado (kg) para cada tarefa. Tarefas de Fabricação e Expedição recebem sugestão automática baseada no peso total da OP.
                O percentual será calculado automaticamente: realizado / planejado.
              </p>

              <div className="space-y-1">
                {data.sugestao.map((s) => {
                  const d = distribuicao[s.tarefaId] || {};
                  const Icon = DEPT_ICONS[s.departamento] || Factory;
                  const colors = DEPT_COLORS[s.departamento] || "text-gray-600 bg-gray-50";
                  const pct = d.qtdePlanejada > 0 ? Math.min(100, Math.round((d.qtdeRealizada || 0) / d.qtdePlanejada * 100)) : 0;

                  return (
                    <div key={s.tarefaId} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                      <Icon size={12} className={colors.split(" ")[0]} />
                      <span className="text-xs text-torg-dark font-medium flex-1 min-w-0 truncate">{s.nome}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors}`}>
                        {DEPT_LABEL[s.departamento]}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-torg-gray">Plan:</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={d.qtdePlanejada || ""}
                          onChange={(e) => updatePeso(s.tarefaId, "qtdePlanejada", parseFloat(e.target.value) || 0)}
                          className="w-20 text-[10px] px-1.5 py-1 border border-gray-200 rounded text-right"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-torg-gray">kg</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-torg-gray">Real:</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={d.qtdeRealizada || ""}
                          onChange={(e) => updatePeso(s.tarefaId, "qtdeRealizada", parseFloat(e.target.value) || 0)}
                          className="w-20 text-[10px] px-1.5 py-1 border border-gray-200 rounded text-right"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-torg-gray">kg</span>
                      </div>
                      <span className={`text-[10px] font-bold w-10 text-right ${pct >= 100 ? "text-emerald-600" : pct > 0 ? "text-torg-blue" : "text-torg-gray"}`}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {data.sugestao.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs text-torg-gray">Nenhuma tarefa disponível para atribuir peso.</p>
                  <p className="text-[10px] text-torg-gray mt-1">Adicione tarefas ao cronograma primeiro (Fabricação, Expedição, etc.).</p>
                </div>
              )}
            </div>

            {erro && (
              <div className="mx-5 mb-2 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle size={12} /> {erro}
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
              <p className="text-[10px] text-torg-gray">
                {Object.values(distribuicao).filter((v) => v.qtdePlanejada > 0).length} tarefas com peso atribuído
              </p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-torg-gray hover:text-torg-dark font-medium">
                  Cancelar
                </button>
                <button
                  onClick={aplicar}
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {saving ? "Importando..." : "Aplicar Pesos"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DeptSection({ dept, summary, tasks, now, onRefresh, cronogramaId, allTarefas }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [cobrResult, setCobrResult] = useState(null);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskInicio, setNewTaskInicio] = useState("");
  const [newTaskFim, setNewTaskFim] = useState("");
  const [savingTask, setSavingTask] = useState(false);
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
            <TarefaRow key={t.id} tarefa={t} now={now} onRefresh={onRefresh} allTarefas={allTarefas} />
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-torg-gray italic py-2">Nenhuma tarefa neste departamento.</p>
          )}

          {/* Adicionar tarefa */}
          {!addingTask ? (
            <button
              onClick={() => setAddingTask(true)}
              className="flex items-center gap-1 text-[10px] text-torg-gray hover:text-torg-blue py-1 px-2 rounded hover:bg-gray-50 transition-colors"
            >
              <Plus size={10} /> Adicionar tarefa
            </button>
          ) : (
            <div className="rounded-lg border border-torg-blue/30 bg-torg-blue-50/30 p-2.5 space-y-2">
              <input
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="Nome da tarefa..."
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskName.trim()) adicionarTarefa();
                  if (e.key === "Escape") { setAddingTask(false); setNewTaskName(""); setNewTaskInicio(""); setNewTaskFim(""); }
                }}
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-torg-gray">Início:</span>
                  <input type="date" value={newTaskInicio} onChange={(e) => setNewTaskInicio(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-torg-gray">Fim:</span>
                  <input type="date" value={newTaskFim} onChange={(e) => setNewTaskFim(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => { setAddingTask(false); setNewTaskName(""); setNewTaskInicio(""); setNewTaskFim(""); }}
                    className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={adicionarTarefa}
                    disabled={savingTask || !newTaskName.trim()}
                    className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {savingTask ? "..." : "Adicionar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  async function adicionarTarefa() {
    if (!newTaskName.trim()) return;
    setSavingTask(true);
    try {
      const body = {
        nome: newTaskName.trim(),
        departamento: dept,
        outlineLevel: 2,
        isSummary: false,
      };
      if (newTaskInicio) body.dataInicioPrevista = new Date(newTaskInicio + "T12:00:00Z").toISOString();
      if (newTaskFim) body.dataFimPrevista = new Date(newTaskFim + "T12:00:00Z").toISOString();

      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/tarefas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao adicionar");
      setAddingTask(false);
      setNewTaskName("");
      setNewTaskInicio("");
      setNewTaskFim("");
      onRefresh();
    } catch {
      // keep form open
    } finally {
      setSavingTask(false);
    }
  }
}

function TarefaRow({ tarefa, now, onRefresh, allTarefas }) {
  const [editing, setEditing] = useState(false);
  const [editNome, setEditNome] = useState(tarefa.nome);
  const [pct, setPct] = useState(tarefa.percentualRealizado);
  const [obs, setObs] = useState(tarefa.observacao || "");
  const [dataExec, setDataExec] = useState(tarefa.dataRealizacao ? new Date(tarefa.dataRealizacao).toISOString().split("T")[0] : "");
  const [justificativa, setJustificativa] = useState("");
  const [pesoPlan, setPesoPlan] = useState(tarefa.qtdePlanejada || 0);
  const [pesoReal, setPesoReal] = useState(tarefa.qtdeRealizada || 0);
  const [antecessoraIds, setAntecessoraIds] = useState(tarefa.antecessoraIds || []);
  const [saving, setSaving] = useState(false);
  const [showReg, setShowReg] = useState(false);
  const [regText, setRegText] = useState("");
  const [sendingReg, setSendingReg] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const t = tarefa;
  const atrasada = t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100;
  const concluida = t.percentualRealizado >= 100;
  const indent = Math.max(0, t.outlineLevel - 2);

  // Verifica se esta tarefa esta bloqueada (tem antecessora nao concluida)
  const antecessorasIncompletas = (t.antecessoraIds || []).filter((aid) => {
    const ant = (allTarefas || []).find((x) => x.id === aid);
    return ant && ant.percentualRealizado < 100;
  });
  const bloqueada = antecessorasIncompletas.length > 0 && !concluida;

  const salvar = async () => {
    setSaving(true);
    try {
      const body = {
        percentualRealizado: pct,
        observacao: obs || null,
        dataRealizacao: dataExec ? new Date(dataExec + "T12:00:00Z").toISOString() : null,
      };
      if (editNome !== t.nome) body.nome = editNome;
      if (justificativa.trim()) body.justificativa = justificativa.trim();
      if (pesoPlan !== t.qtdePlanejada) body.qtdePlanejada = pesoPlan;
      if (pesoReal !== t.qtdeRealizada) body.qtdeRealizada = pesoReal;
      // Antecessoras — sempre envia pra garantir persistencia
      body.antecessoraIds = antecessoraIds;
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao salvar: ${err.error || "Erro desconhecido"}`);
        return;
      }
      setEditing(false);
      setJustificativa("");
      onRefresh();
    } catch (e) {
      alert("Erro de conexão ao salvar.");
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

  const excluirTarefa = async () => {
    if (!confirm(`Excluir a tarefa "${t.nome}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      onRefresh();
    } catch {
      // keep row
    } finally {
      setDeleting(false);
    }
  };

  const cancelarEdicao = () => {
    setEditing(false);
    setEditNome(t.nome);
    setPct(t.percentualRealizado);
    setObs(t.observacao || "");
    setDataExec(t.dataRealizacao ? new Date(t.dataRealizacao).toISOString().split("T")[0] : "");
    setJustificativa("");
    setPesoPlan(t.qtdePlanejada || 0);
    setPesoReal(t.qtdeRealizada || 0);
    setAntecessoraIds(t.antecessoraIds || []);
  };

  return (
    <div className={`group rounded-lg border ${bloqueada ? "border-amber-200 bg-amber-50/20" : atrasada ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-white"} p-2.5`} style={{ marginLeft: `${indent * 16}px` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {concluida ? (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          ) : bloqueada ? (
            <Lock size={14} className="text-amber-500 shrink-0" />
          ) : atrasada ? (
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
          ) : (
            <Clock size={14} className="text-torg-gray shrink-0" />
          )}
          {editing ? (
            <input
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              className="text-xs font-medium px-1.5 py-0.5 border border-torg-blue/30 rounded bg-white flex-1 min-w-0 outline-none focus:border-torg-blue"
            />
          ) : (
            <span className={`text-xs font-medium truncate ${concluida ? "text-torg-gray line-through" : "text-torg-dark"}`}>
              {t.nome}
            </span>
          )}
          {t.isSummary && <span className="text-[9px] text-torg-gray bg-gray-100 px-1 rounded">grupo</span>}
          {!editing && bloqueada && (
            <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 font-semibold" title={`Aguardando: ${antecessorasIncompletas.map((aid) => { const ant = (allTarefas || []).find((x) => x.id === aid); return ant?.nome || "?"; }).join(", ")}`}>
              <Lock size={8} /> Bloqueada
            </span>
          )}
          {!editing && t.antecessoraIds?.length > 0 && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ${bloqueada ? "text-amber-600 bg-amber-50" : "text-purple-600 bg-purple-50"}`} title={`Depende de: ${t.antecessoraIds.map((aid) => { const ant = (allTarefas || []).find((x) => x.id === aid); return ant?.nome || aid.slice(0, 6); }).join(", ")}`}>
              <Link2 size={8} /> {t.antecessoraIds.length} antecessora{t.antecessoraIds.length > 1 ? "s" : ""}
            </span>
          )}
          {t.dataRealizacao && !editing && (
            <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
              <CheckCircle2 size={9} /> {new Date(t.dataRealizacao).toLocaleDateString("pt-BR")}
            </span>
          )}
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
          <button
            onClick={excluirTarefa}
            disabled={deleting}
            className="p-0.5 text-torg-gray hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Excluir tarefa"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 bg-gray-50/50 rounded-lg p-2.5 border border-gray-100">
          <div className="flex items-center gap-2">
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação..."
              className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar size={11} className="text-torg-gray" />
              <span className="text-[10px] text-torg-gray whitespace-nowrap">Data executado:</span>
              <input
                type="date"
                value={dataExec}
                onChange={(e) => setDataExec(e.target.value)}
                className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white"
              />
            </div>
            {dataExec && (
              <button onClick={() => setDataExec("")} className="text-[9px] text-red-400 hover:text-red-600">limpar</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Weight size={11} className="text-torg-gray" />
              <span className="text-[10px] text-torg-gray whitespace-nowrap">Peso plan.:</span>
              <input
                type="number"
                min={0}
                step={100}
                value={pesoPlan || ""}
                onChange={(e) => setPesoPlan(parseFloat(e.target.value) || 0)}
                className="w-20 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-right"
                placeholder="0"
              />
              <span className="text-[9px] text-torg-gray">kg</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-torg-gray whitespace-nowrap">Realizado:</span>
              <input
                type="number"
                min={0}
                step={100}
                value={pesoReal || ""}
                onChange={(e) => setPesoReal(parseFloat(e.target.value) || 0)}
                className="w-20 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-right"
                placeholder="0"
              />
              <span className="text-[9px] text-torg-gray">kg</span>
            </div>
          </div>
          {/* Antecessoras */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Link2 size={11} className="text-purple-500" />
              <span className="text-[10px] text-torg-gray font-medium">Antecessoras (depende de):</span>
            </div>
            {antecessoraIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {antecessoraIds.map((aid) => {
                  const ant = (allTarefas || []).find((x) => x.id === aid);
                  return (
                    <span key={aid} className="inline-flex items-center gap-1 text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                      {ant?.nome || aid.slice(0, 8)}
                      <button onClick={() => setAntecessoraIds((prev) => prev.filter((x) => x !== aid))} className="hover:text-red-500">
                        <X size={8} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !antecessoraIds.includes(e.target.value)) {
                  setAntecessoraIds((prev) => [...prev, e.target.value]);
                }
                e.target.value = "";
              }}
              className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white w-full max-w-xs"
            >
              <option value="">+ Adicionar antecessora...</option>
              {(allTarefas || [])
                .filter((x) => x.id !== t.id && !x.isSummary && x.outlineLevel > 1 && !antecessoraIds.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {DEPT_LABEL[x.departamento] || x.departamento} — {x.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Justificativa / motivo da alteração..."
              className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded bg-white"
              onKeyDown={(e) => e.key === "Enter" && salvar()}
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={cancelarEdicao} className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark">
              Cancelar
            </button>
            <button onClick={salvar} disabled={saving} className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
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
        <div className="mt-1.5 ml-5 flex items-center gap-2">
          <Weight size={10} className="text-torg-gray shrink-0" />
          <div className="flex-1 max-w-[200px]">
            <div className="flex items-center justify-between text-[9px] text-torg-gray mb-0.5">
              <span>{fmtKg(t.qtdeRealizada)} / {fmtKg(t.qtdePlanejada)}</span>
              <span className="font-bold">{t.qtdePlanejada > 0 ? Math.min(100, Math.round(t.qtdeRealizada / t.qtdePlanejada * 100)) : 0}%</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{ width: `${Math.min(100, t.qtdePlanejada > 0 ? (t.qtdeRealizada / t.qtdePlanejada * 100) : 0)}%` }}
              />
            </div>
          </div>
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

const SETOR_LABEL = {
  PENDENTE: "Estoque", CORTE: "Preparação", MONTAGEM: "Montagem",
  SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

const SETOR_COLOR = {
  PENDENTE: "bg-gray-100 text-gray-600",
  CORTE: "bg-amber-100 text-amber-700",
  MONTAGEM: "bg-blue-100 text-blue-700",
  SOLDA: "bg-orange-100 text-orange-700",
  ACABAMENTO: "bg-purple-100 text-purple-700",
  JATO: "bg-cyan-100 text-cyan-700",
  PINTURA: "bg-emerald-100 text-emerald-700",
  EXPEDIDO: "bg-green-100 text-green-700",
};

const SETOR_ORDER = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

const fmtKg = (v) => {
  if (!v) return "0 kg";
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

function ProducaoTab({ cronogramaId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/peso`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar dados de produção");
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
        <span className="ml-2 text-sm text-torg-gray">Carregando dados de produção...</span>
      </div>
    );
  }

  if (erro) {
    return <div className="py-6 text-center text-sm text-red-600">{erro}</div>;
  }

  if (!data || data.pesoTotal === 0) {
    return (
      <div className="py-8 text-center">
        <Weight size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma peça cadastrada para esta OP.</p>
        <p className="text-xs text-torg-gray mt-1">Importe a lista de peças/conjuntos para acompanhar o peso.</p>
      </div>
    );
  }

  const { pesoTotal, pesoProduzidoMes, pesoExpedido, pesoRomaneio, porStatus, porSetorMes, porEtapa, totalPecas, totalQte, romaneiosRecentes, progressoGeral } = data;

  // Ordena status conforme fluxo de produção
  const statusEntries = SETOR_ORDER
    .filter((s) => porStatus[s])
    .map((s) => [s, porStatus[s]]);

  return (
    <div className="p-4 space-y-5">
      {/* KPIs de peso */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Weight size={13} className="text-torg-blue" />
            <span className="text-[10px] text-torg-gray">Peso Total</span>
          </div>
          <p className="text-sm font-bold text-torg-blue mt-0.5">{fmtKg(pesoTotal)}</p>
          <p className="text-[9px] text-torg-gray">{totalPecas} peças · {totalQte} un</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Factory size={13} className="text-emerald-600" />
            <span className="text-[10px] text-torg-gray">Produzido (Syneco)</span>
          </div>
          <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmtKg(pesoProduzidoMes)}</p>
          <p className="text-[9px] text-torg-gray">
            {pesoTotal > 0 ? `${(pesoProduzidoMes / pesoTotal * 100).toFixed(1)}% do total` : "—"}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Truck size={13} className="text-teal-600" />
            <span className="text-[10px] text-torg-gray">Expedido</span>
          </div>
          <p className="text-sm font-bold text-teal-600 mt-0.5">{fmtKg(pesoExpedido)}</p>
          <p className="text-[9px] text-torg-gray">{progressoGeral}% do total</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-amber-600" />
            <span className="text-[10px] text-torg-gray">Embarcado (Romaneio)</span>
          </div>
          <p className="text-sm font-bold text-amber-600 mt-0.5">{fmtKg(pesoRomaneio)}</p>
          <p className="text-[9px] text-torg-gray">{romaneiosRecentes?.length || 0} romaneios</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-500" />
            <span className="text-[10px] text-torg-gray">Pendente</span>
          </div>
          <p className="text-sm font-bold text-red-500 mt-0.5">{fmtKg(pesoTotal - pesoExpedido)}</p>
          <p className="text-[9px] text-torg-gray">
            {pesoTotal > 0 ? `${((pesoTotal - pesoExpedido) / pesoTotal * 100).toFixed(1)}% restante` : "—"}
          </p>
        </div>
      </div>

      {/* Barra de progresso visual */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h4 className="text-xs font-semibold text-torg-dark mb-3 flex items-center gap-1.5">
          <BarChart3 size={13} className="text-torg-blue" />
          Progresso por Etapa do Cronograma
        </h4>
        <div className="space-y-3">
          {/* FABRICACAO */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Factory size={12} className="text-emerald-600" />
                <span className="text-xs font-medium text-torg-dark">Fabricação</span>
                <span className="text-[9px] text-torg-gray">(Syneco)</span>
              </div>
              <span className="text-xs font-bold text-emerald-600">{porEtapa.FABRICACAO.percentual}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(porEtapa.FABRICACAO.percentual, 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-torg-gray mt-0.5">
              {fmtKg(porEtapa.FABRICACAO.pesoRealizado)} produzido de {fmtKg(porEtapa.FABRICACAO.pesoReferencia)}
            </p>
          </div>
          {/* EXPEDICAO */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Truck size={12} className="text-teal-600" />
                <span className="text-xs font-medium text-torg-dark">Expedição</span>
                <span className="text-[9px] text-torg-gray">(PecaConjunto + Romaneio)</span>
              </div>
              <span className="text-xs font-bold text-teal-600">{porEtapa.EXPEDICAO.percentual}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${Math.min(porEtapa.EXPEDICAO.percentual, 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-torg-gray mt-0.5">
              {fmtKg(porEtapa.EXPEDICAO.pesoRealizado)} expedido de {fmtKg(porEtapa.EXPEDICAO.pesoReferencia)}
              {pesoRomaneio > 0 ? ` · ${fmtKg(porEtapa.EXPEDICAO.pesoEmbarcado)} embarcado` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Distribuição por status (fluxo de produção) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h4 className="text-xs font-semibold text-torg-dark mb-3">Distribuição por Etapa (PecaConjunto)</h4>
        {statusEntries.length === 0 ? (
          <p className="text-xs text-torg-gray italic">Sem dados.</p>
        ) : (
          <>
            {/* Barra empilhada */}
            <div className="flex h-5 rounded-full overflow-hidden mb-3">
              {statusEntries.map(([status, info]) => {
                const pct = pesoTotal > 0 ? (info.peso / pesoTotal) * 100 : 0;
                if (pct < 0.5) return null;
                const colors = {
                  PENDENTE: "bg-gray-300", CORTE: "bg-amber-400", MONTAGEM: "bg-blue-400",
                  SOLDA: "bg-orange-400", ACABAMENTO: "bg-purple-400", JATO: "bg-cyan-400",
                  PINTURA: "bg-emerald-400", EXPEDIDO: "bg-green-500",
                };
                return (
                  <div
                    key={status}
                    className={`${colors[status] || "bg-gray-300"} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${SETOR_LABEL[status] || status}: ${fmtKg(info.peso)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            {/* Legenda e detalhes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {statusEntries.map(([status, info]) => (
                <div key={status} className={`px-2 py-1.5 rounded-lg text-xs ${SETOR_COLOR[status] || "bg-gray-100 text-gray-600"}`}>
                  <span className="font-semibold">{SETOR_LABEL[status] || status}</span>
                  <div className="text-[10px] font-bold mt-0.5">{fmtKg(info.peso)}</div>
                  <div className="text-[9px] opacity-70">{info.qte} un · {info.count} peças</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Produção Syneco por Setor */}
      {Object.keys(porSetorMes).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h4 className="text-xs font-semibold text-torg-dark mb-3">Produção Syneco por Setor (MesOrdem)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/60 text-torg-gray">
                  <th className="text-left px-2 py-1.5 font-medium">Setor</th>
                  <th className="text-right px-2 py-1.5 font-medium">Planejado</th>
                  <th className="text-right px-2 py-1.5 font-medium">Produzido</th>
                  <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                  <th className="text-right px-2 py-1.5 font-medium">Ordens</th>
                  <th className="text-left px-2 py-1.5 font-medium">Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(porSetorMes).sort((a, b) => b[1].pesoProduzido - a[1].pesoProduzido).map(([setor, info]) => {
                  const pct = info.pesoPlanejado > 0 ? Math.round((info.pesoProduzido / info.pesoPlanejado) * 100) : 0;
                  return (
                    <tr key={setor} className="hover:bg-gray-50/50">
                      <td className="px-2 py-1.5 font-medium text-torg-dark">{setor}</td>
                      <td className="px-2 py-1.5 text-right text-torg-gray">{fmtKg(info.pesoPlanejado)}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-emerald-600">{fmtKg(info.pesoProduzido)}</td>
                      <td className="px-2 py-1.5 text-right text-amber-600">{fmtKg(info.saldoRestante)}</td>
                      <td className="px-2 py-1.5 text-right text-torg-gray">{info.ordens}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Romaneios recentes */}
      {romaneiosRecentes?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h4 className="text-xs font-semibold text-torg-dark mb-2">Últimos Romaneios</h4>
          <div className="space-y-1">
            {romaneiosRecentes.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 text-xs">
                <div className="flex items-center gap-2">
                  <Truck size={11} className="text-teal-500" />
                  <span className="font-mono text-torg-blue font-medium">{r.numero}</span>
                  <span className="text-torg-gray">{new Date(r.data).toLocaleDateString("pt-BR")}</span>
                </div>
                <span className="font-bold text-teal-600">{fmtKg(r.pesoRealKg)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gantt Inline ──────────────────────────────────────────────────
function GanttInline({ tarefas, detail }) {
  // Ordena por DEPT_ORDER (Comercial primeiro) e dentro do dept por uidMpp
  const allTasks = tarefas
    .filter((t) => t.outlineLevel > 0 && t.departamento && !t.isSummary)
    .sort((a, b) => {
      const ia = DEPT_ORDER.indexOf(a.departamento);
      const ib = DEPT_ORDER.indexOf(b.departamento);
      const oa = ia >= 0 ? ia : 99;
      const ob = ib >= 0 ? ib : 99;
      if (oa !== ob) return oa - ob;
      return (a.uidMpp || 0) - (b.uidMpp || 0);
    });
  if (allTasks.length === 0) {
    return (
      <div className="py-8 text-center">
        <GanttChart size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma tarefa com datas para exibir.</p>
      </div>
    );
  }

  // Range de datas
  let minDate = Infinity, maxDate = -Infinity;
  for (const t of allTasks) {
    if (t.dataInicioPrevista) minDate = Math.min(minDate, new Date(t.dataInicioPrevista).getTime());
    if (t.dataFimPrevista) maxDate = Math.max(maxDate, new Date(t.dataFimPrevista).getTime());
    if (t.dataInicioBase) minDate = Math.min(minDate, new Date(t.dataInicioBase).getTime());
    if (t.dataFimBase) maxDate = Math.max(maxDate, new Date(t.dataFimBase).getTime());
  }
  if (!isFinite(minDate) || !isFinite(maxDate)) {
    return <div className="py-6 text-center text-xs text-torg-gray">Tarefas sem datas definidas.</div>;
  }

  // Padding 7 dias
  minDate -= 7 * 86400000;
  maxDate += 7 * 86400000;
  const totalDays = Math.ceil((maxDate - minDate) / 86400000);
  const dayWidth = Math.max(2, Math.min(10, 700 / totalDays));
  const chartWidth = totalDays * dayWidth;
  const rowH = 32;
  const nameColW = 220;

  const now = Date.now();
  const todayPos = ((now - minDate) / 86400000) * dayWidth;

  // Meses
  const months = [];
  const d0 = new Date(minDate);
  let cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
  while (cur.getTime() < maxDate) {
    const start = Math.max(0, (cur.getTime() - minDate) / 86400000);
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = Math.min(totalDays, (next.getTime() - minDate) / 86400000);
    months.push({
      label: cur.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      left: start * dayWidth,
      width: (end - start) * dayWidth,
    });
    cur = next;
  }

  // Mapa de task index pra desenhar setas
  const taskIdx = new Map(allTasks.map((t, i) => [t.id, i]));

  const deptColors = {
    COMERCIAL: "#2563eb",
    ENGENHARIA: "#7c3aed",
    SUPRIMENTOS: "#d97706",
    FABRICACAO: "#059669",
    EXPEDICAO: "#0d9488",
    MONTAGEM: "#ea580c",
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: nameColW + chartWidth + 40 }} className="relative">
        {/* Header meses */}
        <div className="flex" style={{ height: 24 }}>
          <div style={{ width: nameColW, flexShrink: 0 }} className="bg-gray-50 border-b border-gray-200 px-2 flex items-center">
            <span className="text-[9px] font-semibold text-torg-gray uppercase">Tarefa</span>
          </div>
          <div className="relative flex-1 bg-gray-50 border-b border-gray-200" style={{ minWidth: chartWidth }}>
            {months.map((m, i) => (
              <div
                key={i}
                className="absolute text-[8px] font-semibold text-gray-500 border-l border-gray-200 flex items-center justify-center capitalize"
                style={{ left: m.left, width: m.width, height: 24 }}
              >
                {m.width > 30 ? m.label : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {allTasks.map((t, idx) => {
          const color = deptColors[t.departamento] || "#6b7280";
          const isLate = t.dataFimPrevista && new Date(t.dataFimPrevista) < new Date() && t.percentualRealizado < 100;
          const isDone = t.percentualRealizado >= 100;
          const hasAnt = t.antecessoraIds?.length > 0;

          // Bloqueada = tem antecessora nao concluida
          const isBlocked = hasAnt && !isDone && (t.antecessoraIds || []).some((aid) => {
            const ant = allTasks.find((x) => x.id === aid);
            return ant && ant.percentualRealizado < 100;
          });

          // Bar position
          let barLeft = 0, barWidth = 0;
          if (t.dataInicioPrevista && t.dataFimPrevista) {
            barLeft = ((new Date(t.dataInicioPrevista).getTime() - minDate) / 86400000) * dayWidth;
            barWidth = Math.max(4, ((new Date(t.dataFimPrevista).getTime() - new Date(t.dataInicioPrevista).getTime()) / 86400000) * dayWidth);
          }

          // Baseline bar
          let baseLeft = 0, baseWidth = 0;
          if (t.dataInicioBase && t.dataFimBase) {
            baseLeft = ((new Date(t.dataInicioBase).getTime() - minDate) / 86400000) * dayWidth;
            baseWidth = Math.max(4, ((new Date(t.dataFimBase).getTime() - new Date(t.dataInicioBase).getTime()) / 86400000) * dayWidth);
          }

          const fillWidth = barWidth * (t.percentualRealizado / 100);
          const barColor = isBlocked ? "#d97706" : isLate ? "#dc2626" : color;

          return (
            <div
              key={t.id}
              className={`flex border-b ${isBlocked ? "bg-amber-50/30" : isLate ? "bg-red-50/30" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
              style={{ height: rowH }}
            >
              {/* Nome */}
              <div
                style={{ width: nameColW, flexShrink: 0 }}
                className="px-2 flex items-center gap-1.5 overflow-hidden"
              >
                {isDone ? (
                  <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                ) : isBlocked ? (
                  <Lock size={10} className="text-amber-500 shrink-0" />
                ) : isLate ? (
                  <AlertTriangle size={10} className="text-red-500 shrink-0" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                )}
                <span className={`text-[10px] truncate ${isDone ? "text-torg-gray line-through" : isBlocked ? "text-amber-700" : "text-torg-dark"}`} title={t.nome}>
                  {t.nome}
                </span>
                {isBlocked && <span className="text-[7px] text-amber-600 font-bold shrink-0">BLOQ</span>}
                {hasAnt && !isBlocked && <Link2 size={8} className="text-purple-400 shrink-0" />}
                <span className={`text-[9px] font-bold ml-auto shrink-0 ${isDone ? "text-emerald-600" : isBlocked ? "text-amber-600" : isLate ? "text-red-600" : "text-torg-gray"}`}>
                  {t.percentualRealizado}%
                </span>
              </div>

              {/* Chart area */}
              <div className="relative flex-1" style={{ minWidth: chartWidth }}>
                {/* Month grid lines */}
                {months.map((m, mi) => (
                  <div key={mi} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: m.left }} />
                ))}

                {/* Today line */}
                {todayPos > 0 && todayPos < chartWidth && (
                  <div className="absolute top-0 bottom-0 bg-orange-400 z-10" style={{ left: todayPos, width: 1.5, opacity: 0.5 }} />
                )}

                {/* Baseline bar */}
                {baseWidth > 0 && (
                  <div
                    className="absolute rounded-sm"
                    style={{
                      left: baseLeft, width: baseWidth,
                      top: 4, height: 6,
                      background: "#94a3b8", opacity: 0.3,
                    }}
                  />
                )}

                {/* Current bar */}
                {barWidth > 0 && (
                  <div
                    className="absolute rounded overflow-hidden"
                    style={{
                      left: barLeft, width: barWidth,
                      top: baseWidth > 0 ? 12 : 8, height: 14,
                      background: isBlocked ? `repeating-linear-gradient(45deg, ${barColor}10, ${barColor}10 3px, ${barColor}25 3px, ${barColor}25 6px)` : `${barColor}15`,
                      border: `1.5px solid ${barColor}`,
                      borderStyle: isBlocked ? "dashed" : "solid",
                    }}
                  >
                    <div
                      style={{ width: fillWidth, height: "100%", background: barColor, opacity: 0.7, borderRadius: "2px 0 0 2px" }}
                    />
                  </div>
                )}

                {/* Dependency arrows — solid line from predecessor end to this task start */}
                {hasAnt && t.dataInicioPrevista && (t.antecessoraIds || []).map((antId) => {
                  const antIdx = taskIdx.get(antId);
                  if (antIdx === undefined) return null;
                  const ant = allTasks[antIdx];
                  if (!ant || !ant.dataFimPrevista) return null;
                  const antEnd = ((new Date(ant.dataFimPrevista).getTime() - minDate) / 86400000) * dayWidth;
                  const thisStart = barLeft;
                  const fromY = (antIdx - idx) * rowH;
                  const antDone = ant.percentualRealizado >= 100;
                  const lineColor = antDone ? "#10b981" : "#d97706";
                  return (
                    <svg
                      key={antId}
                      className="absolute pointer-events-none z-20"
                      style={{ left: 0, top: 0, width: chartWidth, height: rowH, overflow: "visible" }}
                    >
                      <path
                        d={`M ${antEnd} ${fromY + rowH / 2} L ${antEnd + 8} ${fromY + rowH / 2} L ${antEnd + 8} ${rowH / 2} L ${thisStart} ${rowH / 2}`}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={antDone ? "1.2" : "1.8"}
                        strokeDasharray={antDone ? "none" : "4,3"}
                        opacity="0.7"
                      />
                      <polygon
                        points={`${thisStart},${rowH / 2} ${thisStart - 6},${rowH / 2 - 3.5} ${thisStart - 6},${rowH / 2 + 3.5}`}
                        fill={lineColor}
                        opacity="0.7"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legenda */}
        <div className="px-3 py-2 bg-gray-50/40 border-t border-gray-100 flex items-center gap-4 flex-wrap">
          {Object.entries(deptColors).filter(([d]) => allTasks.some((t) => t.departamento === d)).map(([d, c]) => (
            <span key={d} className="flex items-center gap-1 text-[9px] text-torg-gray">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
              {DEPT_LABEL[d]}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[9px] text-torg-gray">
            <div className="w-3 h-1.5 rounded-sm bg-gray-400 opacity-40" /> Baseline
          </span>
          <span className="flex items-center gap-1 text-[9px] text-orange-500">
            <div className="w-0.5 h-3 bg-orange-400" /> Hoje
          </span>
          <span className="flex items-center gap-1 text-[9px] text-amber-600">
            <Lock size={8} /> Bloqueada
          </span>
          <span className="flex items-center gap-1 text-[9px] text-emerald-500">
            <svg width="16" height="8"><line x1="0" y1="4" x2="12" y2="4" stroke="#10b981" strokeWidth="1.2" /><polygon points="12,4 8,2 8,6" fill="#10b981" /></svg>
            Concluída
          </span>
          <span className="flex items-center gap-1 text-[9px] text-amber-500">
            <svg width="16" height="8"><line x1="0" y1="4" x2="12" y2="4" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3,2" /><polygon points="12,4 8,2 8,6" fill="#d97706" /></svg>
            Aguardando
          </span>
        </div>
      </div>
    </div>
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

  // Padding 10 dias
  minDate -= 10 * 86400000;
  maxDate += 10 * 86400000;
  const totalDays = Math.ceil((maxDate - minDate) / 86400000);

  const deptColors = {
    COMERCIAL: { bar: "#2563eb", bg: "#dbeafe", text: "#1e40af", label: "Comercial" },
    ENGENHARIA: { bar: "#7c3aed", bg: "#ede9fe", text: "#5b21b6", label: "Engenharia" },
    SUPRIMENTOS: { bar: "#d97706", bg: "#fef3c7", text: "#92400e", label: "Suprimentos" },
    FABRICACAO: { bar: "#059669", bg: "#d1fae5", text: "#065f46", label: "Fabricação" },
    EXPEDICAO: { bar: "#0d9488", bg: "#ccfbf1", text: "#134e4a", label: "Expedição" },
    MONTAGEM: { bar: "#ea580c", bg: "#ffedd5", text: "#9a3412", label: "Montagem" },
  };

  // Config
  const rowHeight = 28;
  const labelWidth = 320;
  const pctWidth = 40;
  const datesWidth = 110;
  const tableLeft = labelWidth + pctWidth + datesWidth;
  const dayWidth = Math.max(3, Math.min(14, 960 / totalDays));
  const chartWidth = totalDays * dayWidth;
  const totalWidth = tableLeft + chartWidth + 20;

  // Abre janela de impressao
  const win = window.open("", "_blank", `width=${Math.min(totalWidth + 60, 1500)},height=900`);
  if (!win) return alert("Popup bloqueado — permita popups para gerar o PDF.");

  // Gera meses
  const months = [];
  const d0 = new Date(minDate);
  let cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
  while (cur.getTime() < maxDate) {
    const start = Math.max(0, (cur.getTime() - minDate) / 86400000);
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = Math.min(totalDays, (next.getTime() - minDate) / 86400000);
    months.push({
      label: cur.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", ""),
      left: start * dayWidth,
      width: (end - start) * dayWidth,
    });
    cur = next;
  }

  // Hoje line
  const todayPos = ((Date.now() - minDate) / 86400000) * dayWidth;
  // Data base line
  const dataBaseLine = detail.dataBase ? ((new Date(detail.dataBase).getTime() - minDate) / 86400000) * dayWidth : null;

  // Agrupa tarefas por departamento
  const byDeptPdf = {};
  for (const t of tarefas) {
    if (!byDeptPdf[t.departamento]) byDeptPdf[t.departamento] = [];
    byDeptPdf[t.departamento].push(t);
  }

  // Ordena departamentos: Comercial sempre primeiro, depois ordem fixa
  const deptOrderPdf = [
    ...DEPT_ORDER.filter((d) => byDeptPdf[d]),
    ...Object.keys(byDeptPdf).filter((d) => !DEPT_ORDER.includes(d)),
  ];

  // HTML dos rows com separadores de departamento
  let rowsHtml = "";
  let rowIdx = 0;
  for (const dept of deptOrderPdf) {
    const tasks = byDeptPdf[dept];
    const dc = deptColors[dept] || { bar: "#6b7280", bg: "#f3f4f6", text: "#374151", label: dept };
    // Header do departamento
    rowsHtml += `<div style="display:flex;height:32px;background:${dc.bg};border-bottom:2px solid ${dc.bar};">` +
      `<div style="width:${tableLeft}px;padding:6px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0;">` +
        `<div style="width:4px;height:18px;background:${dc.bar};border-radius:2px;"></div>` +
        `<span style="font-size:11px;font-weight:700;color:${dc.text};letter-spacing:0.3px;text-transform:uppercase;">${dc.label}</span>` +
      `</div>` +
      `<div style="flex:1;min-width:${chartWidth}px;"></div>` +
    `</div>`;

    for (const t of tasks) {
      if (t.isSummary && t.outlineLevel === 1) continue; // Skip dept summary, we have header
      const indent = Math.max(0, t.outlineLevel - 2) * 16;
      const isSummary = t.isSummary;
      const pct = t.percentualRealizado;
      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
      const isLate = t.dataFimPrevista && new Date(t.dataFimPrevista) < new Date() && pct < 100;

      // Datas formatadas
      const fmtD = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
      const dateStr = `${fmtD(t.dataInicioPrevista)} - ${fmtD(t.dataFimPrevista)}`;

      // Barra baseline
      let baselineBar = "";
      if (t.dataInicioBase && t.dataFimBase) {
        const bStart = ((new Date(t.dataInicioBase).getTime() - minDate) / 86400000) * dayWidth;
        const bWidth = Math.max(4, ((new Date(t.dataFimBase).getTime() - new Date(t.dataInicioBase).getTime()) / 86400000) * dayWidth);
        baselineBar = `<div style="position:absolute;top:4px;left:${bStart}px;width:${bWidth}px;height:7px;background:#94a3b8;border-radius:3px;opacity:0.35;"></div>`;
      }

      // Barra atual
      let currentBar = "";
      if (t.dataInicioPrevista && t.dataFimPrevista) {
        const cStart = ((new Date(t.dataInicioPrevista).getTime() - minDate) / 86400000) * dayWidth;
        const cWidth = Math.max(4, ((new Date(t.dataFimPrevista).getTime() - new Date(t.dataInicioPrevista).getTime()) / 86400000) * dayWidth);
        const fillWidth = Math.round(cWidth * pct / 100);
        const barColor = isLate ? "#dc2626" : dc.bar;
        const barBg = isLate ? "#fecaca" : `${dc.bar}20`;
        const yPos = t.dataInicioBase ? 13 : 7;
        const barH = isSummary ? 6 : 12;

        if (isSummary) {
          // Diamante summary
          currentBar = `<div style="position:absolute;top:${yPos}px;left:${cStart}px;width:${cWidth}px;height:${barH}px;">` +
            `<div style="position:absolute;left:0;top:0;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${barColor};"></div>` +
            `<div style="position:absolute;left:5px;right:5px;top:0;height:3px;background:${barColor};"></div>` +
            `<div style="position:absolute;right:0;top:0;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${barColor};"></div>` +
          `</div>`;
        } else {
          currentBar = `<div style="position:absolute;top:${yPos}px;left:${cStart}px;width:${cWidth}px;height:${barH}px;background:${barBg};border:1.5px solid ${barColor};border-radius:4px;overflow:hidden;">` +
            `<div style="width:${fillWidth}px;height:100%;background:${barColor};opacity:0.85;border-radius:2px 0 0 2px;"></div>` +
          `</div>`;
          // Pct label ao lado da barra
          if (pct > 0) {
            currentBar += `<div style="position:absolute;top:${yPos + 1}px;left:${cStart + cWidth + 4}px;font-size:8px;font-weight:700;color:${barColor};white-space:nowrap;">${pct}%</div>`;
          }
        }
      }

      // Realização badge
      const realBadge = t.dataRealizacao ? `<span style="color:#059669;font-weight:600;"> ✓</span>` : "";
      // Dependencia badge
      const depBadge = (t.antecessoraIds?.length > 0)
        ? `<span style="color:#7c3aed;font-size:8px;font-weight:600;margin-left:2px;">🔗${t.antecessoraIds.length}</span>`
        : "";

      const nome = isSummary ? `<b style="color:${dc.text};">${t.nome}</b>` : t.nome;
      rowsHtml += `<div style="display:flex;height:${rowHeight}px;border-bottom:1px solid #f1f5f9;background:${bg};align-items:center;">` +
        // Nome
        `<div style="width:${labelWidth}px;padding:0 8px 0 ${12 + indent}px;display:flex;align-items:center;gap:4px;flex-shrink:0;overflow:hidden;">` +
          `<span style="font-size:10.5px;color:${isLate ? '#dc2626' : '#334155'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isSummary ? '' : 'font-weight:400;'}">${nome}${realBadge}${depBadge}</span>` +
        `</div>` +
        // Percentual
        `<div style="width:${pctWidth}px;text-align:center;flex-shrink:0;">` +
          `<span style="font-size:9px;font-weight:700;color:${pct >= 100 ? '#059669' : isLate ? '#dc2626' : pct > 0 ? '#006EAB' : '#94a3b8'};padding:1px 4px;background:${pct >= 100 ? '#d1fae5' : isLate ? '#fee2e2' : pct > 0 ? '#dbeafe' : '#f3f4f6'};border-radius:3px;">${pct}%</span>` +
        `</div>` +
        // Datas
        `<div style="width:${datesWidth}px;text-align:center;flex-shrink:0;">` +
          `<span style="font-size:8.5px;color:#64748b;font-family:monospace;">${dateStr}</span>` +
        `</div>` +
        // Chart area
        `<div style="flex:1;position:relative;min-width:${chartWidth}px;height:${rowHeight}px;">${baselineBar}${currentBar}</div>` +
      `</div>`;
      rowIdx++;
    }
  }

  // Meses header
  let monthsHtml = months.map((m) =>
    `<div style="position:absolute;left:${m.left}px;width:${m.width}px;text-align:center;font-size:9px;font-weight:600;color:#475569;border-left:1px solid #cbd5e1;height:100%;display:flex;align-items:center;justify-content:center;text-transform:capitalize;">${m.label}</div>`
  ).join("");

  // Month grid lines (nas rows)
  let gridLines = months.map((m) =>
    `<div style="position:absolute;left:${m.left}px;top:0;bottom:0;width:1px;background:#f1f5f9;"></div>`
  ).join("");

  // Today line
  const todayLine = (todayPos > 0 && todayPos < chartWidth)
    ? `<div style="position:absolute;left:${todayPos}px;top:0;bottom:0;width:2px;background:#f97316;z-index:6;opacity:0.7;"></div>` +
      `<div style="position:absolute;left:${todayPos - 14}px;top:-16px;font-size:7px;color:#f97316;font-weight:700;width:30px;text-align:center;">HOJE</div>`
    : "";

  // Data base indicator
  let dataBaseIndicator = "";
  if (dataBaseLine !== null) {
    dataBaseIndicator = `<div style="position:absolute;left:${dataBaseLine}px;top:0;bottom:0;width:2px;background:#006EAB;z-index:5;"></div>` +
      `<div style="position:absolute;left:${dataBaseLine - 8}px;top:-16px;font-size:7px;color:#006EAB;font-weight:700;width:18px;text-align:center;">DB</div>`;
  }

  // Legenda departamentos
  const deptLegend = Object.entries(deptColors).filter(([d]) => byDeptPdf[d]).map(([, dc]) =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:14px;font-size:9px;color:#475569;"><span style="width:10px;height:10px;background:${dc.bar};border-radius:2px;display:inline-block;"></span>${dc.label}</span>`
  ).join("");

  // Progresso geral
  const totalTarefas = tarefas.filter(t => !t.isSummary).length;
  const concluidas = tarefas.filter(t => !t.isSummary && t.percentualRealizado >= 100).length;
  const atrasadas = tarefas.filter(t => !t.isSummary && t.dataFimPrevista && new Date(t.dataFimPrevista) < new Date() && t.percentualRealizado < 100).length;
  const mediaProgresso = totalTarefas > 0 ? Math.round(tarefas.filter(t => !t.isSummary).reduce((s, t) => s + t.percentualRealizado, 0) / totalTarefas) : 0;

  // Dados da OP
  const op = detail.op || {};
  const fmtCNPJ = (c) => {
    if (!c) return "";
    const d = c.replace(/\D/g, "");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return c;
  };
  const localObra = [op.clienteCidade, op.clienteUF].filter(Boolean).join("/");
  const enderecoCompleto = [op.clienteEndereco, localObra, op.clienteCep].filter(Boolean).join(" — ");

  const html = `<!DOCTYPE html><html><head><title>Cronograma Gantt — ${detail.opNumero || detail.titulo}</title>
<style>
  @page { size: landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: #fff; color: #1e293b; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
  .info-label { font-size:10px; color:#64748b; font-weight:400; }
  .info-value { font-size:10px; color:#002945; font-weight:600; }
</style></head><body>

<!-- Print button -->
<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:100;display:flex;gap:8px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#006EAB;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,110,171,0.3);">Imprimir / Salvar PDF</button>
</div>

<!-- Header -->
<div style="margin-bottom:16px;">
  <!-- Top bar: logo + title + KPIs -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #002945;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="/torg-logo.png" alt="Torg Metal" style="height:48px;object-fit:contain;" onerror="this.style.display='none'" />
      <div>
        <h1 style="font-size:20px;color:#002945;font-weight:800;letter-spacing:-0.3px;">Cronograma de Produção</h1>
        <div style="font-size:10px;color:#64748b;margin-top:1px;">Acompanhamento de progresso por departamento</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:6px 14px;border-radius:6px;text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#059669;line-height:1;">${concluidas}<span style="font-size:10px;color:#6b7280;font-weight:400;">/${totalTarefas}</span></div>
        <div style="font-size:7px;color:#065f46;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Concluídas</div>
      </div>
      ${atrasadas > 0 ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:6px 14px;border-radius:6px;text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#dc2626;line-height:1;">${atrasadas}</div>
        <div style="font-size:7px;color:#991b1b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Atrasadas</div>
      </div>` : ""}
      <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:6px 14px;border-radius:6px;text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#006EAB;line-height:1;">${mediaProgresso}%</div>
        <div style="font-size:7px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Progresso</div>
      </div>
    </div>
  </div>

  <!-- Info grid: dados da obra -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
    <!-- Linha 1 -->
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;background:#f8fafc;">
      <span class="info-label">Ordem de Produção</span><br/>
      <span class="info-value" style="font-size:13px;font-weight:800;color:#006EAB;">${detail.opNumero || "—"}</span>
    </div>
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;background:#f8fafc;">
      <span class="info-label">Obra / Descrição</span><br/>
      <span class="info-value">${detail.titulo || op.obra || "—"}</span>
      ${op.descricao ? `<span style="font-size:9px;color:#94a3b8;margin-left:6px;">${op.descricao}</span>` : ""}
    </div>
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
      <span class="info-label">Status OP</span><br/>
      <span class="info-value">${op.status === "ABERTA" ? "Em andamento" : op.status === "CONCLUIDA" ? "Concluída" : op.status || "—"}</span>
    </div>
    <!-- Linha 2 -->
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <span class="info-label">Cliente</span><br/>
      <span class="info-value">${op.cliente || "—"}</span>
      ${op.clienteRazaoSocial && op.clienteRazaoSocial !== op.cliente ? `<br/><span style="font-size:9px;color:#94a3b8;">${op.clienteRazaoSocial}</span>` : ""}
    </div>
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <span class="info-label">CNPJ</span><br/>
      <span class="info-value" style="font-family:monospace;">${fmtCNPJ(op.clienteCnpj) || "—"}</span>
    </div>
    <div style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">
      <span class="info-label">Contato</span><br/>
      <span class="info-value">${op.clienteContato || "—"}</span>
      ${op.clienteTelefone ? `<span style="font-size:9px;color:#64748b;margin-left:4px;">(${op.clienteTelefone})</span>` : ""}
    </div>
    <!-- Linha 3 -->
    <div style="padding:6px 12px;border-right:1px solid #e2e8f0;">
      <span class="info-label">Período do Cronograma</span><br/>
      <span class="info-value">${detail.dataInicio ? new Date(detail.dataInicio).toLocaleDateString("pt-BR") : "—"} a ${detail.dataFim ? new Date(detail.dataFim).toLocaleDateString("pt-BR") : "—"}</span>
    </div>
    <div style="padding:6px 12px;border-right:1px solid #e2e8f0;">
      <span class="info-label">Data Base (Baseline)</span><br/>
      <span class="info-value" style="color:#006EAB;">${detail.dataBase ? new Date(detail.dataBase).toLocaleDateString("pt-BR") : "Não definida"}</span>
    </div>
    <div style="padding:6px 12px;">
      <span class="info-label">Local da Obra</span><br/>
      <span class="info-value">${enderecoCompleto || localObra || "—"}</span>
    </div>
  </div>
</div>

<!-- Legenda -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
  <div>${deptLegend}</div>
  <div style="display:flex;align-items:center;gap:14px;">
    <span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#64748b;"><span style="width:14px;height:5px;background:#94a3b8;border-radius:2px;display:inline-block;opacity:0.5;"></span> Baseline</span>
    <span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#f97316;"><span style="width:2px;height:10px;background:#f97316;display:inline-block;opacity:0.7;"></span> Hoje</span>
    ${dataBaseLine !== null ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#006EAB;"><span style="width:2px;height:10px;background:#006EAB;display:inline-block;"></span> Data Base</span>` : ""}
  </div>
</div>

<!-- Gantt Chart -->
<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <div style="min-width:${totalWidth}px;">
    <!-- Table header -->
    <div style="display:flex;background:#002945;color:#fff;height:30px;align-items:center;">
      <div style="width:${labelWidth}px;padding:0 12px;font-size:10px;font-weight:600;flex-shrink:0;letter-spacing:0.3px;">TAREFA</div>
      <div style="width:${pctWidth}px;text-align:center;font-size:10px;font-weight:600;flex-shrink:0;">%</div>
      <div style="width:${datesWidth}px;text-align:center;font-size:10px;font-weight:600;flex-shrink:0;">PERÍODO</div>
      <div style="flex:1;position:relative;min-width:${chartWidth}px;height:30px;">${monthsHtml}</div>
    </div>
    <!-- Rows -->
    <div style="position:relative;">
      ${rowsHtml}
      <!-- Grid lines overlay -->
      <div style="position:absolute;left:${tableLeft}px;top:0;bottom:0;right:0;pointer-events:none;">
        ${gridLines}
        ${todayLine}
        ${dataBaseIndicator}
      </div>
    </div>
  </div>
</div>

<!-- Footer -->
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:10px;border-top:2px solid #002945;">
  <div style="display:flex;align-items:center;gap:10px;">
    <img src="/torg-logo.png" alt="Torg Metal" style="height:26px;object-fit:contain;" onerror="this.style.display='none'" />
    <span style="font-size:10px;color:#002945;font-weight:600;">Torg Metal</span>
  </div>
  <div style="font-size:10px;color:#64748b;">
    Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · <strong>${detail.opNumero || ""}</strong>
  </div>
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
