"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, Filter,
  CheckCircle2, Clock, Circle, ListTodo, Bell, Send,
  GanttChart, AlertTriangle, Mail, User, Building2, CalendarClock, LayoutGrid, List,
} from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";

const SETORES = [
  "PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL",
  "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO",
];

const DEPT_LABEL = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem",
};
const DEPT_COR = {
  COMERCIAL: "bg-blue-50 text-blue-700 border-blue-200",
  ENGENHARIA: "bg-purple-50 text-purple-700 border-purple-200",
  SUPRIMENTOS: "bg-amber-50 text-amber-700 border-amber-200",
  FABRICACAO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EXPEDICAO: "bg-teal-50 text-teal-700 border-teal-200",
  MONTAGEM: "bg-orange-50 text-orange-700 border-orange-200",
};
const SETOR_LABEL = {
  PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP",
  EXPEDICAO: "Expedição", COMERCIAL: "Comercial", ENGENHARIA: "Engenharia",
  COMPRAS: "Compras", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro",
  RH: "Recursos Humanos", PLANEJAMENTO: "Planejamento",
};
const STATUS_LABEL = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em Andamento", CONCLUIDA: "Concluida", CANCELADA: "Cancelada" };
const PRIORIDADE_COR = {
  ALTA: "bg-red-50 text-red-700 border-red-200",
  MEDIA: "bg-amber-50 text-amber-700 border-amber-200",
  BAIXA: "bg-gray-50 text-torg-gray border-gray-200",
};
const STATUS_ICON = {
  PENDENTE: Circle,
  EM_ANDAMENTO: Clock,
  CONCLUIDA: CheckCircle2,
  CANCELADA: X,
};

// Colunas do kanban (status abertos + concluída)
const COLUNAS_KANBAN = [
  { key: "PENDENTE", label: "Pendente", cor: "bg-gray-100 text-torg-gray" },
  { key: "EM_ANDAMENTO", label: "Em andamento", cor: "bg-amber-50 text-amber-700" },
  { key: "CONCLUIDA", label: "Concluída", cor: "bg-emerald-50 text-emerald-700" },
];
const fmtPrazoCurto = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : null);
function ehAtrasada(t) {
  if (!t.dataPrevista || t.status === "CONCLUIDA" || t.status === "CANCELADA") return false;
  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  return new Date(t.dataPrevista) < hoje;
}
function ordenarPorPrazo(arr) {
  const ordem = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  return [...arr].sort((a, b) => {
    const pa = a.dataPrevista ? new Date(a.dataPrevista).getTime() : Infinity;
    const pb = b.dataPrevista ? new Date(b.dataPrevista).getTime() : Infinity;
    if (pa !== pb) return pa - pb;
    return (ordem[a.prioridade] ?? 1) - (ordem[b.prioridade] ?? 1);
  });
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

function getISOWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return {
    semana: 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7),
    ano: d.getFullYear(),
  };
}

export default function TarefasClient() {
  const [aba, setAba] = useState("semanais"); // "semanais" | "cronograma"
  const [vista, setVista] = useState("kanban"); // "kanban" | "lista"
  const { semana: semanaInit, ano: anoInit } = getISOWeek();
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [semana, setSemana] = useState(semanaInit);
  const [ano, setAno] = useState(anoInit);
  const [todasSemanas, setTodasSemanas] = useState(true); // default: mostra TODAS as tarefas (não precisa lembrar a semana)
  const [filtroSetor, setFiltroSetor] = useState("");
  const [filtroOp, setFiltroOp] = useState("");
  const [modalNova, setModalNova] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [avisarTarefa, setAvisarTarefa] = useState(null);
  const [lembreteTarefa, setLembreteTarefa] = useState(null);

  function showToast(msg, tipo = "sucesso") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroOp.trim()) params.set("op", filtroOp.trim());
      else if (!todasSemanas) { params.set("semana", semana); params.set("ano", ano); }
      if (filtroSetor) params.set("setor", filtroSetor);
      const res = await fetch(`/api/planejamento/tarefas?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setTarefas(data.tarefas);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [semana, ano, filtroSetor, filtroOp, todasSemanas]);

  useEffect(() => { carregar(); }, [carregar]);

  async function atualizarStatus(id, status) {
    try {
      const res = await fetch(`/api/planejamento/tarefas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro");
      const { tarefa } = await res.json();
      setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, ...tarefa } : t)));
    } catch (e) {
      alert("Erro: " + e.message);
    }
  }

  async function deletar(id) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/tarefas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro");
      setTarefas((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Tarefas</h2>
          <p className="text-xs text-torg-gray mt-0.5">
            {aba === "semanais"
              ? (filtroOp.trim() ? `Tarefas da OP-${filtroOp.trim().padStart(3, "0")} — todas as semanas` : todasSemanas ? "Acompanhamento por setor — todas as semanas" : `Acompanhamento por setor — Semana ${semana}/${ano}`)
              : aba === "cronograma" ? "Atividades dos cronogramas ativos"
              : "Compras atrasadas e itens para cobrança dos setores"}
          </p>
        </div>
        {aba === "semanais" && (
          <button
            onClick={() => setModalNova(true)}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
          >
            <Plus size={14} /> Nova Tarefa
          </button>
        )}
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setAba("semanais")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            aba === "semanais" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <ListTodo size={13} /> Semanais
        </button>
        <button
          onClick={() => setAba("cronograma")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            aba === "cronograma" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <GanttChart size={13} /> Cronograma
        </button>
        <button
          onClick={() => setAba("cobranca")}
          className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            aba === "cobranca" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <AlertTriangle size={13} /> Cobrança
        </button>
      </div>

      {aba === "cronograma" && (
        <AtividadesCronograma showToast={showToast} />
      )}

      {aba === "cobranca" && (
        <AbaCobranca showToast={showToast} />
      )}

      {aba === "semanais" && (
      <>
      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <label className="text-[10px] text-torg-gray inline-flex items-center gap-1 cursor-pointer select-none" title="Mostra todas as tarefas, sem filtrar por semana">
          <input type="checkbox" checked={todasSemanas} onChange={(e) => setTodasSemanas(e.target.checked)} disabled={!!filtroOp.trim()} className="accent-torg-blue" />
          Todas as semanas
        </label>
        <div className={`flex items-center gap-1 ${(filtroOp.trim() || todasSemanas) ? "opacity-40" : ""}`} title={filtroOp.trim() ? "Filtrando por OP — semana ignorada" : todasSemanas ? "Desmarque \"Todas as semanas\" para filtrar" : ""}>
          <label className="text-[10px] text-torg-gray">Semana:</label>
          <input type="number" value={semana} onChange={(e) => setSemana(+e.target.value)} min={1} max={53} disabled={!!filtroOp.trim() || todasSemanas}
            className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center disabled:bg-gray-50" />
          <span className="text-torg-gray">/</span>
          <input type="number" value={ano} onChange={(e) => setAno(+e.target.value)} min={2024} disabled={!!filtroOp.trim() || todasSemanas}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center disabled:bg-gray-50" />
        </div>
        <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
          <option value="">Todos setores</option>
          {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
        </select>
        <input value={filtroOp} onChange={(e) => setFiltroOp(e.target.value.replace(/[^\dA-Za-z]/g, ""))} placeholder="Filtrar por OP (ex: 84)"
          className="w-36 px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:border-torg-blue outline-none" />
        <button onClick={() => { setSemana(semanaInit); setAno(anoInit); setFiltroSetor(""); setFiltroOp(""); }}
          className="text-xs text-torg-gray hover:text-torg-dark ml-auto">
          Limpar
        </button>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setVista("kanban")} title="Kanban"
            className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 ${vista === "kanban" ? "bg-white shadow-sm text-torg-blue font-semibold" : "text-torg-gray hover:text-torg-dark"}`}>
            <LayoutGrid size={12} /> Kanban
          </button>
          <button onClick={() => setVista("lista")} title="Lista"
            className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 ${vista === "lista" ? "bg-white shadow-sm text-torg-blue font-semibold" : "text-torg-gray hover:text-torg-dark"}`}>
            <List size={12} /> Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-torg-blue" size={24} />
        </div>
      ) : erro ? (
        <div className="text-center py-10">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline mt-2 flex items-center gap-1 mx-auto">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : tarefas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <ListTodo size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma tarefa para esta semana.</p>
          <button onClick={() => setModalNova(true)} className="text-sm text-torg-blue hover:underline mt-2">
            Criar primeira tarefa
          </button>
        </div>
      ) : vista === "kanban" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {COLUNAS_KANBAN.map((col) => {
            const doStatus = ordenarPorPrazo(tarefas.filter((t) => t.status === col.key));
            const atrasadasCol = doStatus.filter(ehAtrasada).length;
            return (
              <div key={col.key} className="bg-gray-50/60 rounded-xl border border-gray-100 p-2 min-h-[120px]">
                <div className="flex items-center justify-between px-1 py-1.5">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${col.cor}`}>{col.label}</span>
                  <span className="text-[11px] text-torg-gray">{doStatus.length}{col.key !== "CONCLUIDA" && atrasadasCol > 0 ? ` · ${atrasadasCol} atras.` : ""}</span>
                </div>
                <div className="space-y-2 mt-1">
                  {doStatus.length === 0 && <p className="text-[11px] text-torg-gray/60 italic px-2 py-4 text-center">vazio</p>}
                  {doStatus.map((t) => {
                    const atras = ehAtrasada(t);
                    const prazo = fmtPrazoCurto(t.dataPrevista);
                    return (
                      <div key={t.id} className={`bg-white rounded-lg border p-2.5 shadow-sm ${atras ? "border-red-200" : "border-gray-100"}`}>
                        <p className={`text-[13px] font-medium ${t.status === "CONCLUIDA" ? "line-through text-torg-gray" : "text-torg-dark"}`}>{t.titulo}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[9px] font-semibold text-torg-gray uppercase tracking-wide">{SETOR_LABEL[t.setor] || t.setor}</span>
                          {t.opNumero && <span className="text-[10px] text-torg-blue font-mono">{fmtOP(t.opNumero)}</span>}
                          <span className={`px-1.5 py-0 text-[9px] font-semibold rounded border ${PRIORIDADE_COR[t.prioridade]}`}>{t.prioridade}</span>
                          {t.doCliente && <span className="px-1.5 py-0 text-[9px] font-semibold rounded border bg-orange-50 text-torg-orange border-orange-200 inline-flex items-center gap-0.5"><Building2 size={9} /> CLIENTE</span>}
                        </div>
                        {(prazo || t.responsavel) && (
                          <div className="flex items-center gap-2 mt-1.5">
                            {prazo && <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${atras ? "text-red-600" : "text-torg-gray"}`}><CalendarClock size={11} /> {prazo}{atras ? " · atrasada" : ""}</span>}
                            {t.responsavel && <span className="text-[10px] text-torg-gray truncate">{t.responsavel}</span>}
                          </div>
                        )}
                        {t.doCliente && (t.clienteRespostaEm
                          ? <p className="text-[10px] text-emerald-600 mt-1.5">📨 {t.clienteResposta || "Cliente respondeu"}</p>
                          : t.clienteAvisadoEm
                            ? <p className="text-[10px] text-torg-orange mt-1.5">⏳ aguardando resposta do cliente…</p>
                            : null)}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                          <select value={t.status} onChange={(e) => atualizarStatus(t.id, e.target.value)} className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white flex-1">
                            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          {t.doCliente && <button onClick={() => setAvisarTarefa(t)} className="text-gray-300 hover:text-torg-orange p-0.5" title="Avisar/cobrar cliente por e-mail"><Building2 size={12} /></button>}
                          <button onClick={() => setLembreteTarefa(t)} className="text-gray-300 hover:text-torg-blue p-0.5" title="Enviar lembrete / escolher destinatários"><Bell size={12} /></button>
                          <button onClick={() => setConfirmDelete(t)} className="text-gray-300 hover:text-red-500 p-0.5" title="Excluir"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {SETORES.map((setor) => {
            const doSetor = tarefas.filter((t) => t.setor === setor);
            if (doSetor.length === 0 && filtroSetor) return null;
            if (doSetor.length === 0) return null;
            return (
              <div key={setor}>
                <h4 className="text-xs font-semibold text-torg-dark uppercase tracking-wide mb-2 mt-3">{SETOR_LABEL[setor]}</h4>
                <div className="space-y-1">
                  {doSetor.map((t) => {
                    const Icon = STATUS_ICON[t.status] || Circle;
                    return (
                      <div key={t.id} className={`bg-white rounded-lg border border-gray-100 px-4 py-3 flex items-center gap-3 ${
                        t.status === "CONCLUIDA" ? "opacity-60" : ""
                      }`}>
                        <button
                          onClick={() => atualizarStatus(t.id, t.status === "CONCLUIDA" ? "PENDENTE" : t.status === "PENDENTE" ? "EM_ANDAMENTO" : "CONCLUIDA")}
                          className={`flex-shrink-0 ${
                            t.status === "CONCLUIDA" ? "text-emerald-500" : t.status === "EM_ANDAMENTO" ? "text-amber-500" : "text-gray-300 hover:text-torg-blue"
                          }`}
                          title={`Status: ${STATUS_LABEL[t.status]}`}
                        >
                          <Icon size={18} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${t.status === "CONCLUIDA" ? "line-through text-torg-gray" : "text-torg-dark"}`}>
                            {t.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {t.opNumero && <span className="text-[10px] text-torg-blue font-mono">{fmtOP(t.opNumero)}</span>}
                            {t.responsavel && <span className="text-[10px] text-torg-gray">{t.responsavel}</span>}
                            {t.observacao && <span className="text-[10px] text-torg-gray italic truncate max-w-[200px]">{t.observacao}</span>}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${PRIORIDADE_COR[t.prioridade]}`}>
                          {t.prioridade}
                        </span>
                        {t.doCliente && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-orange-50 text-torg-orange border-orange-200 inline-flex items-center gap-0.5" title={t.clienteRespostaEm ? t.clienteResposta : t.clienteAvisadoEm ? "aguardando resposta do cliente" : "tarefa do cliente"}><Building2 size={10} /> {t.clienteRespostaEm ? "respondeu" : "cliente"}</span>}
                        {t.doCliente && <button onClick={() => setAvisarTarefa(t)} className="text-gray-300 hover:text-torg-orange p-1" title="Avisar/cobrar cliente por e-mail"><Building2 size={13} /></button>}
                        <select
                          value={t.status}
                          onChange={(e) => atualizarStatus(t.id, e.target.value)}
                          className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white"
                        >
                          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button
                          onClick={() => setLembreteTarefa(t)}
                          className="text-gray-300 hover:text-torg-blue p-1"
                          title="Enviar lembrete / escolher destinatários"
                        >
                          <Bell size={13} />
                        </button>
                        <button onClick={() => setConfirmDelete(t)} className="text-gray-300 hover:text-red-500 p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {modalNova && (
        <ModalNovaTarefa
          semana={semana}
          ano={ano}
          onClose={() => setModalNova(false)}
          onCriada={(t) => { setTarefas((prev) => [t, ...prev]); setModalNova(false); }}
        />
      )}

      {avisarTarefa && (
        <ModalAvisarCliente
          tarefa={avisarTarefa}
          onClose={() => setAvisarTarefa(null)}
          onEnviado={(msg) => { setAvisarTarefa(null); showToast(msg, "sucesso"); carregar(); }}
          onErro={(msg) => showToast(msg, "erro")}
        />
      )}

      {lembreteTarefa && (
        <ModalLembrete
          tarefa={lembreteTarefa}
          onClose={() => setLembreteTarefa(null)}
          onEnviado={(msg) => { setLembreteTarefa(null); showToast(msg, "sucesso"); carregar(); }}
          onErro={(msg) => showToast(msg, "erro")}
        />
      )}

      {/* Toast de lembrete */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.tipo === "sucesso" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.tipo === "sucesso" ? <Send size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deletar(confirmDelete?.id)}
        titulo="Excluir tarefa?"
        mensagem={`A tarefa "${confirmDelete?.titulo}" sera removida permanentemente.`}
        labelConfirmar="Excluir"
        variant="destrutivo"
        loading={deleting}
      />
    </div>
  );
}

function ModalNovaTarefa({ semana, ano, onClose, onCriada }) {
  const [form, setForm] = useState({
    titulo: "", descricao: "", opNumero: "", setor: "PRODUCAO",
    prioridade: "MEDIA", responsavel: "", observacao: "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return setErro("Titulo obrigatorio");
    setSaving(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          semanaIso: semana,
          ano,
          opNumero: form.opNumero || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onCriada(data.tarefa);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={salvar} className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2">
            <Plus size={16} className="text-torg-blue" /> Nova Tarefa — Semana {semana}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded">{erro}</p>}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Titulo *</label>
            <input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Finalizar preparacao OP 64" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Setor</label>
              <select value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
              <input type="text" value={form.opNumero} onChange={(e) => setForm({ ...form, opNumero: e.target.value.toUpperCase() })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: 64" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Prioridade</label>
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAIXA">Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Responsavel</label>
              <input type="text" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Nome" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observacao</label>
            <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" rows={2} placeholder="Detalhes..." />
          </div>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Salvando..." : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal: avisar/cobrar o cliente por e-mail (resposta de 1 clique) ──────────
function ModalAvisarCliente({ tarefa, onClose, onEnviado, onErro }) {
  const [email, setEmail] = useState(tarefa.clienteEmail || "");
  const [tipo, setTipo] = useState(tarefa.status === "CONCLUIDA" ? "CONFIRMACAO" : "COBRANCA");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!email.includes("@")) { onErro("Informe um e-mail de cliente válido."); return; }
    setEnviando(true);
    try {
      const res = await fetch(`/api/planejamento/tarefas/${tarefa.id}/avisar-cliente`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteEmail: email, tipo, mensagem: mensagem.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Erro ao enviar");
      onEnviado(`E-mail enviado ao cliente (${data.email})`);
    } catch (e) { onErro(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Mail size={15} className="text-torg-orange" /> Avisar cliente</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-torg-dark">{tarefa.titulo}</p>
            {tarefa.opNumero && <p className="text-[11px] text-torg-blue font-mono mt-0.5">{fmtOP(tarefa.opNumero)}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">E-mail do cliente</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Motivo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
              <option value="COBRANCA">Cobrar / lembrar da data</option>
              <option value="CONFIRMACAO">Pedir confirmação de conclusão</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Mensagem (opcional)</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} placeholder="Ex.: Precisamos disso para liberar a produção…" className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <p className="text-[11px] text-torg-gray">O cliente recebe botões de 1 clique (Já concluí / Informar nova data). A resposta volta para esta tarefa e avisa o Planejamento — sem login.</p>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando || !email.includes("@")} className="px-4 py-1.5 bg-torg-orange text-white text-sm rounded-lg hover:opacity-90 font-medium flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {enviando ? "Enviando..." : "Enviar ao cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: enviar lembrete escolhendo destinatários (setor + cliente) ─────────
function ModalLembrete({ tarefa, onClose, onEnviado, onErro }) {
  const [areas, setAreas] = useState([]);        // contatos fixos agrupados por área
  const [avulsos, setAvulsos] = useState([]);    // e-mails digitados à mão
  const [cliente, setCliente] = useState(null);  // contato do cliente já cadastrado
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState([]);
  const [avulso, setAvulso] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [incluirCliente, setIncluirCliente] = useState(false);
  const [clienteEmail, setClienteEmail] = useState(tarefa.clienteEmail || "");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`/api/planejamento/tarefas/${tarefa.id}/lembrete`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const as = j?.areas || [];
        setAreas(as);
        setCliente(j?.cliente || null);
        // pré-marca os contatos da área do setor da tarefa
        const pre = as.find((a) => a.area === j?.areaPreMarcada);
        setSel(pre ? pre.contatos.map((c) => c.email) : []);
        setClienteEmail((prev) => prev || j?.cliente?.email || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tarefa.id]);

  const toggle = (email) => setSel((s) => (s.includes(email) ? s.filter((e) => e !== email) : [...s, email]));
  const conhecido = (email) => areas.some((a) => a.contatos.some((c) => c.email === email)) || avulsos.some((a) => a.email === email);
  const addAvulso = () => {
    const e = avulso.trim().toLowerCase();
    if (!emailValido(e)) return;
    if (!sel.includes(e)) setSel((s) => [...s, e]);
    if (!conhecido(e)) setAvulsos((a) => [...a, { nome: "", email: e }]);
    setAvulso("");
  };

  async function enviar() {
    const emails = [...new Set(sel)];
    const comCliente = incluirCliente && emailValido(clienteEmail);
    if (emails.length === 0 && !comCliente) { onErro("Escolha ao menos um destinatário."); return; }
    setEnviando(true);
    try {
      const partes = [];
      if (emails.length) {
        const r = await fetch(`/api/planejamento/tarefas/${tarefa.id}/lembrete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails, mensagem: mensagem.trim() || undefined }) });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "Erro ao enviar lembrete");
        partes.push(`${j.enviados} interno(s)`);
      }
      if (comCliente) {
        const r = await fetch(`/api/planejamento/tarefas/${tarefa.id}/avisar-cliente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteEmail: clienteEmail.trim(), mensagem: mensagem.trim() || undefined }) });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || "Erro ao avisar cliente");
        partes.push("cliente");
      }
      onEnviado(`Enviado para ${partes.join(" + ")}`);
    } catch (e) { onErro(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Bell size={15} className="text-torg-blue" /> Enviar lembrete</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-torg-dark">{tarefa.titulo}</p>
            <p className="text-[11px] text-torg-gray mt-0.5">{SETOR_LABEL[tarefa.setor] || tarefa.setor}{tarefa.opNumero ? ` · ${fmtOP(tarefa.opNumero)}` : ""}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-1.5">Quem recebe <span className="text-torg-gray font-normal">— o setor da tarefa já vem marcado</span></label>
            {loading ? (
              <p className="text-[12px] text-torg-gray flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando contatos…</p>
            ) : (
              <div className="space-y-2.5">
                {areas.map((a) => (
                  <div key={a.area}>
                    <p className="text-[10px] font-semibold text-torg-gray uppercase tracking-wide mb-1">{a.area}</p>
                    <div className="space-y-1">
                      {a.contatos.map((c) => (
                        <label key={c.email} className="flex items-center gap-1.5 text-[12px] text-torg-dark cursor-pointer">
                          <input type="checkbox" checked={sel.includes(c.email)} onChange={() => toggle(c.email)} className="accent-torg-blue" />
                          {c.nome} <span className="text-torg-gray">{c.email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {avulsos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Avulsos</p>
                    <div className="space-y-1">
                      {avulsos.map((c) => (
                        <label key={c.email} className="flex items-center gap-1.5 text-[12px] text-torg-dark cursor-pointer">
                          <input type="checkbox" checked={sel.includes(c.email)} onChange={() => toggle(c.email)} className="accent-torg-blue" />
                          <span className="text-torg-gray">{c.email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <input value={avulso} onChange={(e) => setAvulso(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAvulso(); } }} placeholder="adicionar e-mail avulso" className="flex-1 text-[12px] border border-gray-300 rounded-lg px-2 py-1.5" />
              <button type="button" onClick={addAvulso} disabled={!avulso.includes("@")} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark disabled:opacity-40">adicionar</button>
            </div>
          </div>

          {(tarefa.doCliente || cliente) && (
            <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-3">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-torg-orange cursor-pointer">
                <input type="checkbox" checked={incluirCliente} onChange={(e) => setIncluirCliente(e.target.checked)} className="accent-torg-orange" />
                <Building2 size={13} /> Também avisar o cliente{cliente?.nome ? ` — ${cliente.nome}` : ""}
              </label>
              {incluirCliente && (
                <>
                  <input value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} placeholder="e-mail do cliente" className="w-full mt-2 text-[12px] border border-gray-300 rounded-lg px-2 py-1.5" />
                  <p className="text-[10px] text-torg-gray mt-1">{cliente?.email ? "E-mail já cadastrado na OP — dá pra editar." : "O cliente recebe um e-mail com botões de 1 clique (Já concluí / Informar nova data)."}</p>
                </>
              )}
            </div>
          )}

          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} placeholder="Mensagem (opcional)" className="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-1.5" />
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Cobrança — compras atrasadas + marcos de produção + entregas ────
const SIT_BADGE = {
  ATRASADO: "bg-red-100 text-red-700",
  PROXIMO: "bg-amber-100 text-amber-700",
};
function AbaCobranca({ showToast }) {
  const [compras, setCompras] = useState([]);
  const [semAcessoCompras, setSemAcessoCompras] = useState(false);
  const [marcos, setMarcos] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/compras/cronograma").then((r) => (r.status === 401 || r.status === 403 ? { _sem: true } : r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/planejamento/cobranca").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([c, cob]) => {
      if (c?._sem) setSemAcessoCompras(true);
      else if (c?.success) setCompras((c.data || []).filter((i) => i.statusEntrega === "ATRASADO").sort((a, b) => new Date(a.prazoEntrega) - new Date(b.prazoEntrega)));
      if (cob) { setMarcos(cob.marcos || []); setEntregas(cob.entregas || []); }
    }).finally(() => setLoading(false));
  }, []);

  const diasAtraso = (prazo) => Math.max(0, Math.floor((Date.now() - new Date(prazo)) / 86400000));
  const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

  async function cobrarSetor(dept) {
    const label = DEPT_LABEL[dept] || dept;
    if (!confirm(`Enviar cobrança dos marcos de ${label} por e-mail ao setor?`)) return;
    setCobrando(dept);
    try {
      const r = await fetch("/api/planejamento/cobranca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departamento: dept }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao cobrar");
      showToast?.(`Cobrança de ${label} enviada — ${j.marcos} marco(s) para ${j.enviados} pessoa(s)`, "sucesso");
    } catch (e) { showToast?.(e.message, "erro"); } finally { setCobrando(""); }
  }

  // Marcos agrupados por setor
  const marcosPorDept = {};
  for (const m of marcos) { const d = m.departamento || "SEM_SETOR"; (marcosPorDept[d] ||= []).push(m); }
  const depts = Object.keys(marcosPorDept).sort();

  if (loading) return <div className="p-8 text-center text-torg-gray text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> carregando cobrança…</div>;

  return (
    <div className="space-y-4">
      {/* Compras atrasadas */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <AlertTriangle size={15} className="text-red-500" />
          <h3 className="text-sm font-semibold text-torg-dark">Compras atrasadas</h3>
          {!semAcessoCompras && <span className="text-[11px] text-torg-gray">({compras.length})</span>}
          <span className="text-[11px] text-torg-gray ml-auto">material comprado com entrega vencida — cobre o Compras / abra a RM</span>
        </div>
        {semAcessoCompras ? (
          <div className="p-6 text-center text-torg-gray text-[12px]">Disponível para ADM e Compras.</div>
        ) : compras.length === 0 ? (
          <div className="p-6 text-center text-torg-gray text-[12px] flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Nenhuma compra atrasada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/60 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">OP</th>
                  <th className="text-left px-3 py-2 font-medium">Material</th>
                  <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">RM</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Prazo</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Atraso</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {compras.map((c) => (
                  <tr key={c.id} className="hover:bg-red-50/30 align-middle">
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{fmtOP(c.opNumero)}</td>
                    <td className="px-3 py-2 text-torg-dark max-w-[240px] truncate" title={c.descricao || ""}>{c.descricao || "—"}</td>
                    <td className="px-3 py-2 text-torg-gray max-w-[160px] truncate" title={c.fornecedor || ""}>{c.fornecedor || "—"}</td>
                    <td className="px-3 py-2 font-mono text-torg-gray whitespace-nowrap">{c.rmNumero}</td>
                    <td className="px-3 py-2 text-right text-torg-gray whitespace-nowrap">{fmtData(c.prazoEntrega)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[10px]">{diasAtraso(c.prazoEntrega)}d</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><a href={`/compras/rm/${c.rmId}`} className="text-torg-blue hover:text-torg-dark font-medium">Abrir RM →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Marcos de produção — cobrança por setor */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <CalendarClock size={15} className="text-torg-blue" />
          <h3 className="text-sm font-semibold text-torg-dark">Marcos de produção</h3>
          <span className="text-[11px] text-torg-gray">({marcos.length})</span>
          <span className="text-[11px] text-torg-gray ml-auto">datas-chave do cronograma atrasadas ou próximas — cobre o setor responsável</span>
        </div>
        {marcos.length === 0 ? (
          <div className="p-6 text-center text-torg-gray text-[12px] flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Nenhum marco atrasado ou próximo.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {depts.map((dept) => (
              <div key={dept} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-torg-dark">{DEPT_LABEL[dept] || "Sem setor"} <span className="text-torg-gray font-normal">({marcosPorDept[dept].length})</span></span>
                  {dept !== "SEM_SETOR" && (
                    <button onClick={() => cobrarSetor(dept)} disabled={cobrando === dept} className="text-[11px] font-medium text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2.5 py-1 inline-flex items-center gap-1 disabled:opacity-50">
                      {cobrando === dept ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Cobrar {DEPT_LABEL[dept]}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {marcosPorDept[dept].map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-[12px]">
                      <span className={`px-1.5 py-0.5 rounded-full font-semibold text-[10px] whitespace-nowrap ${SIT_BADGE[m.situacao] || "bg-gray-100 text-torg-gray"}`}>{m.situacao === "ATRASADO" ? `${diasAtraso(m.data)}d` : "próximo"}</span>
                      {m.opNumero && <span className="font-mono font-semibold text-torg-blue whitespace-nowrap">{fmtOP(m.opNumero)}</span>}
                      <span className="text-torg-dark truncate" title={m.nome}>{m.nome}</span>
                      <span className="text-torg-gray whitespace-nowrap ml-auto">{fmtData(m.data)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Entregas programadas */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <CalendarClock size={15} className="text-torg-orange" />
          <h3 className="text-sm font-semibold text-torg-dark">Entregas programadas</h3>
          <span className="text-[11px] text-torg-gray">({entregas.length})</span>
          <span className="text-[11px] text-torg-gray ml-auto">cargas planejadas ainda não expedidas — atrasadas ou próximas</span>
        </div>
        {entregas.length === 0 ? (
          <div className="p-6 text-center text-torg-gray text-[12px] flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Nenhuma entrega atrasada ou próxima.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/60 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Situação</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">OP</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Itens</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Data prevista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entregas.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50 align-middle">
                    <td className="px-3 py-2 whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded-full font-semibold text-[10px] ${SIT_BADGE[e.situacao] || "bg-gray-100 text-torg-gray"}`}>{e.situacao === "ATRASADO" ? `${diasAtraso(e.data)}d atrás` : "próxima"}</span></td>
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{e.opNumero ? fmtOP(e.opNumero) : "—"}</td>
                    <td className="px-3 py-2 text-torg-dark max-w-[220px] truncate" title={e.cliente || ""}>{e.cliente || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{e.itens}</td>
                    <td className="px-3 py-2 text-right text-torg-gray whitespace-nowrap">{fmtData(e.data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Aba Cronograma ──────────────────────────────────────
const DEPTOS = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

function AtividadesCronograma({ showToast }) {
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState(""); // "" | "atrasada" | "no_prazo" | "concluida"
  const [filtroOp, setFiltroOp] = useState("");
  const [notificarAtiv, setNotificarAtiv] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroDepto) params.set("departamento", filtroDepto);
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroOp.trim()) params.set("op", filtroOp.trim());
      const res = await fetch(`/api/planejamento/cronogramas/atividades?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setAtividades(data.atividades || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtroDepto, filtroStatus, filtroOp]);

  useEffect(() => { carregar(); }, [carregar]);

  const fmtData = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  const atrasadas = atividades.filter((a) => a.atrasada).length;
  const concluidas = atividades.filter((a) => a.concluida).length;
  const emAndamento = atividades.length - atrasadas - concluidas;

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <select value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
          <option value="">Todos departamentos</option>
          {DEPTOS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d]}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
          <option value="">Todos status</option>
          <option value="atrasada">Atrasadas</option>
          <option value="no_prazo">No prazo</option>
          <option value="concluida">Concluídas</option>
        </select>
        <input
          type="text"
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          placeholder="Filtrar por OP..."
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white w-32"
        />
        <button onClick={() => { setFiltroDepto(""); setFiltroStatus(""); setFiltroOp(""); }}
          className="text-xs text-torg-gray hover:text-torg-dark ml-auto">
          Limpar
        </button>
        <button onClick={carregar} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* KPIs rápidos */}
      {!loading && atividades.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-torg-gray">{atividades.length} atividades</span>
          {atrasadas > 0 && (
            <button onClick={() => setFiltroStatus("atrasada")}
              className="px-2.5 py-1 bg-red-50 text-red-600 text-[11px] font-semibold rounded-full flex items-center gap-1 border border-red-200 hover:bg-red-100">
              <AlertTriangle size={11} /> {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}
            </button>
          )}
          {emAndamento > 0 && (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-medium rounded-full border border-amber-200">
              {emAndamento} em andamento
            </span>
          )}
          {concluidas > 0 && (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-full border border-emerald-200">
              {concluidas} concluída{concluidas > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-torg-blue" size={24} />
        </div>
      ) : erro ? (
        <div className="text-center py-10">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline mt-2 flex items-center gap-1 mx-auto">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : atividades.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <GanttChart size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma atividade encontrada.</p>
          <p className="text-xs text-torg-gray mt-1">Ajuste os filtros ou crie tarefas nos cronogramas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">OP</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">Atividade</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Depto</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Prazo</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">%</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Status</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {atividades.map((a) => (
                <tr key={a.id} className={`hover:bg-gray-50/50 transition-colors ${a.concluida ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-bold text-torg-blue font-mono">{fmtOP(a.opNumero)}</span>
                    {a.opCliente && <p className="text-[10px] text-torg-gray truncate max-w-[120px]">{a.opCliente}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className={`text-xs font-medium ${a.concluida ? "line-through text-torg-gray" : "text-torg-dark"}`}>{a.nome}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${DEPT_COR[a.departamento] || "bg-gray-50 text-torg-gray border-gray-200"}`}>
                      {DEPT_LABEL[a.departamento] || a.departamento}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-xs text-torg-dark">{fmtData(a.dataFimPrevista)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-bold ${
                      a.concluida ? "text-emerald-600" : a.atrasada ? "text-red-600" : "text-torg-dark"
                    }`}>
                      {a.percentualRealizado}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {a.concluida ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full">
                        <CheckCircle2 size={10} /> OK
                      </span>
                    ) : a.atrasada ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full">
                        <AlertTriangle size={10} /> {a.diasAtraso}d
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-full">
                        <Clock size={10} /> No prazo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {!a.concluida && (
                      <button
                        onClick={() => setNotificarAtiv(a)}
                        className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100 transition-colors"
                        title="Notificar por e-mail"
                      >
                        <Mail size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notificarAtiv && (
        <ModalNotificar
          atividade={notificarAtiv}
          onClose={() => setNotificarAtiv(null)}
          onEnviado={(msg) => { setNotificarAtiv(null); showToast(msg, "sucesso"); }}
          onErro={(msg) => showToast(msg, "erro")}
        />
      )}
    </>
  );
}

// ─── Modal para escolher emails e notificar ──────────────
function ModalNotificar({ atividade, onClose, onEnviado, onErro }) {
  const [sugeridos, setSugeridos] = useState([]);
  const [loadingSugeridos, setLoadingSugeridos] = useState(true);
  const [selecionados, setSelecionados] = useState([]);
  const [emailExtra, setEmailExtra] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setLoadingSugeridos(true);
    fetch(`/api/planejamento/cronogramas/tarefas/${atividade.id}/notificar`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sugeridos) {
          setSugeridos(data.sugeridos);
          setSelecionados(data.sugeridos.map((s) => s.email));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSugeridos(false));
  }, [atividade.id]);

  function toggleEmail(email) {
    setSelecionados((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  function adicionarExtra() {
    const e = emailExtra.trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (!selecionados.includes(e)) setSelecionados((prev) => [...prev, e]);
    if (!sugeridos.find((s) => s.email === e)) {
      setSugeridos((prev) => [...prev, { email: e, nome: e, origem: "manual" }]);
    }
    setEmailExtra("");
  }

  async function enviar() {
    if (selecionados.length === 0) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${atividade.id}/notificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: selecionados, mensagem: mensagem.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      onEnviado(`Notificação enviada para ${data.enviados} destinatário(s)`);
    } catch (e) {
      onErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const a = atividade;
  const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
            <Mail size={15} className="text-torg-blue" /> Notificar Atividade
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Resumo da atividade */}
        <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-torg-blue font-mono">{fmtOP(a.opNumero)}</span>
            {a.opCliente && <span className="text-[10px] text-torg-gray">({a.opCliente})</span>}
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded border ${DEPT_COR[a.departamento] || "bg-gray-50 text-torg-gray border-gray-200"}`}>
              {DEPT_LABEL[a.departamento] || a.departamento}
            </span>
          </div>
          <p className="text-sm font-medium text-torg-dark">{a.nome}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-torg-gray">
            <span>Prazo: {fmtData(a.dataFimPrevista)}</span>
            <span>Realizado: {a.percentualRealizado}%</span>
            {a.atrasada && <span className="text-red-600 font-semibold">{a.diasAtraso}d de atraso</span>}
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Destinatários */}
          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-2">Destinatários</label>
            {loadingSugeridos ? (
              <div className="flex items-center gap-2 text-xs text-torg-gray py-2">
                <Loader2 size={12} className="animate-spin" /> Buscando e-mails sugeridos...
              </div>
            ) : (
              <div className="space-y-1.5">
                {sugeridos.map((s) => (
                  <label key={s.email} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selecionados.includes(s.email)}
                      onChange={() => toggleEmail(s.email)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {s.origem === "cliente" ? (
                        <Building2 size={12} className="text-amber-600 shrink-0" />
                      ) : s.origem === "manual" ? (
                        <Mail size={12} className="text-torg-gray shrink-0" />
                      ) : (
                        <User size={12} className="text-torg-blue shrink-0" />
                      )}
                      <span className="text-xs text-torg-dark font-medium truncate">{s.nome}</span>
                      <span className="text-[10px] text-torg-gray truncate">{s.email}</span>
                    </div>
                    {s.origem === "cliente" && (
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">Cliente</span>
                    )}
                  </label>
                ))}
                {sugeridos.length === 0 && (
                  <p className="text-xs text-torg-gray italic py-1">Nenhum e-mail sugerido para este departamento.</p>
                )}
              </div>
            )}

            {/* Adicionar email manual */}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="email"
                value={emailExtra}
                onChange={(e) => setEmailExtra(e.target.value)}
                placeholder="Adicionar outro e-mail..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarExtra())}
              />
              <button
                onClick={adicionarExtra}
                disabled={!emailExtra.includes("@")}
                className="px-3 py-1.5 text-xs text-torg-blue border border-torg-blue/30 rounded-lg hover:bg-torg-blue-50 disabled:opacity-40"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Mensagem opcional */}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Mensagem (opcional)</label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              rows={2}
              placeholder="Ex: Favor priorizar esta atividade..."
            />
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[10px] text-torg-gray">{selecionados.length} destinatário(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || selecionados.length === 0}
              className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
