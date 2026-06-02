"use client";
import { useState, useEffect, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, Filter,
  CheckCircle2, Clock, Circle, ListTodo,
} from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";

const SETORES = ["PRODUCAO", "PINTURA", "EXPEDICAO"];
const SETOR_LABEL = { PRODUCAO: "Producao", PINTURA: "Pintura", EXPEDICAO: "Expedicao" };
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
  const { semana: semanaInit, ano: anoInit } = getISOWeek();
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [semana, setSemana] = useState(semanaInit);
  const [ano, setAno] = useState(anoInit);
  const [filtroSetor, setFiltroSetor] = useState("");
  const [modalNova, setModalNova] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams({ semana, ano });
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
  }, [semana, ano, filtroSetor]);

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
          <p className="text-xs text-torg-gray mt-0.5">Acompanhamento por setor — Semana {semana}/{ano}</p>
        </div>
        <button
          onClick={() => setModalNova(true)}
          className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
        >
          <Plus size={14} /> Nova Tarefa
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-torg-gray">Semana:</label>
          <input type="number" value={semana} onChange={(e) => setSemana(+e.target.value)} min={1} max={53}
            className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center" />
          <span className="text-torg-gray">/</span>
          <input type="number" value={ano} onChange={(e) => setAno(+e.target.value)} min={2024}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center" />
        </div>
        <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
          <option value="">Todos setores</option>
          {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
        </select>
        <button onClick={() => { setSemana(semanaInit); setAno(anoInit); setFiltroSetor(""); }}
          className="text-xs text-torg-gray hover:text-torg-dark ml-auto">
          Semana atual
        </button>
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
                        <select
                          value={t.status}
                          onChange={(e) => atualizarStatus(t.id, e.target.value)}
                          className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white"
                        >
                          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
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

      {modalNova && (
        <ModalNovaTarefa
          semana={semana}
          ano={ano}
          onClose={() => setModalNova(false)}
          onCriada={(t) => { setTarefas((prev) => [t, ...prev]); setModalNova(false); }}
        />
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
