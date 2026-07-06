"use client";
import { useState, useEffect } from "react";
import {
  Briefcase, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, Clock, CheckCircle2, XCircle, Users, AlertTriangle,
  ArrowRight, Calendar, Filter,
} from "lucide-react";

const STATUS_LABELS = {
  SOLICITADA: { label: "Solicitada", cor: "bg-blue-100 text-blue-800" },
  APROVADA: { label: "Aprovada", cor: "bg-amber-100 text-amber-800" },
  EM_RECRUTAMENTO: { label: "Em Recrutamento", cor: "bg-purple-100 text-purple-800" },
  PREENCHIDA: { label: "Preenchida", cor: "bg-emerald-100 text-emerald-800" },
  CANCELADA: { label: "Cancelada", cor: "bg-red-100 text-red-800" },
};

const PRIORIDADE_LABELS = {
  URGENTE: { label: "Urgente", cor: "bg-red-100 text-red-700" },
  ALTA: { label: "Alta", cor: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", cor: "bg-gray-100 text-gray-700" },
  BAIXA: { label: "Baixa", cor: "bg-blue-50 text-blue-600" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function diasAberto(dataAbertura, dataFechamento) {
  const fim = dataFechamento ? new Date(dataFechamento) : new Date();
  const inicio = new Date(dataAbertura);
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24));
}

export default function VagasClient() {
  const [vagas, setVagas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({});
  // Modal status
  const [modalStatus, setModalStatus] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = verTodas ? "?todos=true" : "";
      const [vRes, sRes, cRes] = await Promise.all([
        fetch(`/api/rh/vagas${params}`).then((r) => r.json()),
        fetch("/api/rh/setores").then((r) => r.json()),
        fetch("/api/rh/cargos").then((r) => r.json()),
      ]);
      if (!vRes.success) throw new Error(vRes.error);
      setVagas(vRes.data || []);
      setSetores(sRes.data || []);
      setCargos(cRes.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [verTodas]);

  // Filtros
  const filtradas = vagas.filter((v) => {
    if (filtroStatus && v.status !== filtroStatus) return false;
    if (filtroSetor && v.setor?.id !== filtroSetor) return false;
    if (busca) {
      const b = busca.toLowerCase();
      const hay = `${v.titulo} ${v.setor?.nome || ""} ${v.cargo?.nome || ""}`.toLowerCase();
      if (!hay.includes(b)) return false;
    }
    return true;
  });

  // Criar vaga
  const abrirNova = () => {
    setForm({
      titulo: "", setorId: setores[0]?.id || "", cargoId: "",
      quantidade: 1, prioridade: "NORMAL", tipo: "CLT",
      nivelCargo: "", justificativa: "", requisitos: "", salarioFaixa: "",
    });
    setModalAberto(true);
  };

  const salvarVaga = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        ...form,
        quantidade: Number(form.quantidade) || 1,
        cargoId: form.cargoId || undefined,
        nivelCargo: form.nivelCargo || undefined,
        justificativa: form.justificativa || undefined,
        requisitos: form.requisitos || undefined,
        salarioFaixa: form.salarioFaixa || undefined,
      };
      const res = await fetch("/api/rh/vagas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar vaga");
      setVagas((prev) => [data.data, ...prev]);
      setModalAberto(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Atualizar status
  const handleStatusChange = async (vaga, novoStatus) => {
    setAtualizando(true);
    try {
      const body = { status: novoStatus };
      if (novoStatus === "PREENCHIDA") {
        const nome = prompt("Nome do contratado (opcional):");
        if (nome) body.funcionarioContratadoNome = nome;
      }
      const res = await fetch(`/api/rh/vagas/${vaga.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVagas((prev) => prev.map((v) => (v.id === vaga.id ? { ...v, ...data.data } : v)));
      setModalStatus(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setAtualizando(false);
    }
  };

  // Contadores
  const abertas = vagas.filter((v) => !["PREENCHIDA", "CANCELADA"].includes(v.status)).length;
  const urgentes = vagas.filter((v) => v.prioridade === "URGENTE" && !["PREENCHIDA", "CANCELADA"].includes(v.status)).length;

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando vagas…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Vagas / Recrutamento</h2>
          <p className="text-sm text-torg-gray mt-1">
            {abertas} vaga{abertas !== 1 ? "s" : ""} aberta{abertas !== 1 ? "s" : ""}
            {urgentes > 0 && <span className="text-red-600 ml-2">• {urgentes} urgente{urgentes !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button
          onClick={abrirNova}
          disabled={setores.length === 0}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <PlusCircle size={16} /> Nova Vaga
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, setor, cargo…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <div className="relative">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os setores</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-torg-gray cursor-pointer">
            <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            Incluir preenchidas/canceladas
          </label>
        </div>
      </div>

      {/* Cards de vagas */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {vagas.length === 0 ? "Nenhuma vaga cadastrada" : "Nenhum resultado"}
          </p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Nova Vaga" para solicitar pessoal</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtradas.map((v) => {
            const st = STATUS_LABELS[v.status] || { label: v.status, cor: "bg-gray-100 text-gray-700" };
            const pri = PRIORIDADE_LABELS[v.prioridade] || PRIORIDADE_LABELS.NORMAL;
            const dias = diasAberto(v.dataAbertura, v.dataFechamento);
            const aberta = !["PREENCHIDA", "CANCELADA"].includes(v.status);

            return (
              <div key={v.id} className={`bg-white rounded-xl border shadow-sm p-5 ${
                v.prioridade === "URGENTE" && aberta ? "border-red-200" : "border-gray-100"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-torg-dark text-sm truncate">{v.titulo}</h3>
                    <p className="text-xs text-torg-gray mt-0.5">
                      {v.setor?.nome || "—"} {v.cargo ? `• ${v.cargo.nome}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.cor}`}>{pri.label}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>{st.label}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-torg-gray">
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {v.quantidade} vaga{v.quantidade !== 1 ? "s" : ""}</span>
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmtData(v.dataAbertura)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    <span className={dias > 30 && aberta ? "text-red-600 font-medium" : ""}>{dias} dias</span>
                  </span>
                </div>

                {v.justificativa && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-2">{v.justificativa}</p>
                )}

                {v.funcionarioContratadoNome && (
                  <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Contratado: {v.funcionarioContratadoNome}
                  </p>
                )}

                {/* Ações */}
                {aberta && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                    {v.status === "SOLICITADA" && (
                      <button onClick={() => handleStatusChange(v, "APROVADA")}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition">
                        Aprovar
                      </button>
                    )}
                    {v.status === "APROVADA" && (
                      <button onClick={() => handleStatusChange(v, "EM_RECRUTAMENTO")}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition">
                        Iniciar Recrutamento
                      </button>
                    )}
                    {v.status === "EM_RECRUTAMENTO" && (
                      <button onClick={() => handleStatusChange(v, "PREENCHIDA")}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                        Marcar Preenchida
                      </button>
                    )}
                    <button onClick={() => handleStatusChange(v, "CANCELADA")}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition ml-auto">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova Vaga */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Nova Solicitação de Vaga</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Campo label="Título da vaga *" value={form.titulo}
                onChange={(v) => setForm({ ...form, titulo: v })} placeholder="Ex: Soldador MIG/MAG" />

              <div className="grid grid-cols-2 gap-4">
                <Sel label="Setor *" value={form.setorId} onChange={(v) => setForm({ ...form, setorId: v })}
                  options={setores.map((s) => ({ value: s.id, label: s.nome }))} />
                <Sel label="Cargo" value={form.cargoId} onChange={(v) => setForm({ ...form, cargoId: v })}
                  options={[{ value: "", label: "— Opcional —" }, ...cargos.map((c) => ({ value: c.id, label: c.nome }))]} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Campo label="Quantidade" type="number" value={form.quantidade}
                  onChange={(v) => setForm({ ...form, quantidade: v })} />
                <Sel label="Prioridade" value={form.prioridade} onChange={(v) => setForm({ ...form, prioridade: v })}
                  options={Object.entries(PRIORIDADE_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Sel label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })}
                  options={[
                    { value: "CLT", label: "CLT" },
                    { value: "PJ", label: "PJ" },
                    { value: "ESTAGIO", label: "Estágio" },
                    { value: "TEMPORARIO", label: "Temporário" },
                  ]} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Sel label="Nível" value={form.nivelCargo} onChange={(v) => setForm({ ...form, nivelCargo: v })}
                  options={[
                    { value: "", label: "— Opcional —" },
                    { value: "OPERACIONAL", label: "Operacional" },
                    { value: "TECNICO", label: "Técnico" },
                    { value: "SUPERVISAO", label: "Supervisão" },
                    { value: "GERENCIA", label: "Gerência" },
                  ]} />
                <Campo label="Faixa salarial" value={form.salarioFaixa}
                  onChange={(v) => setForm({ ...form, salarioFaixa: v })} placeholder="Ex: R$ 3.000 - 4.500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Justificativa</label>
                <textarea value={form.justificativa || ""} onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                  rows={2} placeholder="Por que essa vaga é necessária?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Requisitos</label>
                <textarea value={form.requisitos || ""} onChange={(e) => setForm({ ...form, requisitos: e.target.value })}
                  rows={2} placeholder="Experiência, qualificações, NRs obrigatórias…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalAberto(false)} disabled={salvando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvarVaga} disabled={salvando || !form.titulo || !form.setorId}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Criando…" : "Criar Vaga"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <div className="relative">
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
      </div>
    </div>
  );
}
