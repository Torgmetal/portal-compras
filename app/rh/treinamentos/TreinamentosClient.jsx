"use client";
import { useState, useEffect, useMemo } from "react";
import {
  GraduationCap, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, Clock, DollarSign, Users, BookOpen, Shield,
} from "lucide-react";

const TIPOS = [
  { value: "NR_OBRIGATORIO", label: "NR Obrigatório", cor: "bg-red-100 text-red-800" },
  { value: "TECNICO", label: "Técnico", cor: "bg-blue-100 text-blue-800" },
  { value: "COMPORTAMENTAL", label: "Comportamental", cor: "bg-purple-100 text-purple-800" },
  { value: "INTEGRACAO", label: "Integração", cor: "bg-green-100 text-green-800" },
  { value: "SST", label: "SST", cor: "bg-amber-100 text-amber-800" },
];
const tipoMap = Object.fromEntries(TIPOS.map((t) => [t.value, t]));

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

const anoAtual = new Date().getFullYear();

const FORM_INICIAL = {
  titulo: "",
  tipo: "NR_OBRIGATORIO",
  nrRelacionada: "",
  descricao: "",
  instrutor: "",
  local: "",
  dataInicio: "",
  dataFim: "",
  cargaHoraria: "",
  validadeMeses: "",
  custo: "",
  participantesIds: [],
};

export default function TreinamentosClient() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroAno, setFiltroAno] = useState(String(anoAtual));

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);

  // Participantes
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregandoFunc, setCarregandoFunc] = useState(false);
  const [buscaFunc, setBuscaFunc] = useState("");

  // Carregar treinamentos
  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroTipo) params.set("tipo", filtroTipo);
      if (filtroAno) params.set("ano", filtroAno);
      const qs = params.toString();
      const res = await fetch(`/api/rh/treinamentos${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Erro ao carregar treinamentos");
      setTreinamentos(data.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [filtroTipo, filtroAno]);

  // Carregar funcionários ao abrir modal
  const carregarFuncionarios = async () => {
    setCarregandoFunc(true);
    try {
      const res = await fetch("/api/rh/funcionarios");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar funcionários");
      setFuncionarios((data.data || []).filter((f) => f.status === "ATIVO"));
    } catch (e) {
      setErroModal("Erro ao carregar funcionários: " + e.message);
    } finally {
      setCarregandoFunc(false);
    }
  };

  // Abrir modal novo
  const abrirNovo = () => {
    setForm({ ...FORM_INICIAL });
    setErroModal("");
    setBuscaFunc("");
    setModalAberto(true);
    carregarFuncionarios();
  };

  // Toggle participante
  const toggleParticipante = (id) => {
    setForm((prev) => ({
      ...prev,
      participantesIds: prev.participantesIds.includes(id)
        ? prev.participantesIds.filter((pid) => pid !== id)
        : [...prev.participantesIds, id],
    }));
  };

  // Funcionários filtrados pela busca
  const funcFiltrados = useMemo(() => {
    if (!buscaFunc) return funcionarios;
    const b = buscaFunc.toLowerCase();
    return funcionarios.filter((f) => {
      const hay = `${f.nome} ${f.setor?.nome || ""} ${f.cargo?.nome || ""}`.toLowerCase();
      return hay.includes(b);
    });
  }, [funcionarios, buscaFunc]);

  // Salvar treinamento
  const salvar = async () => {
    setSalvando(true);
    setErroModal("");
    try {
      if (!form.titulo.trim()) throw new Error("Título é obrigatório");
      if (!form.tipo) throw new Error("Tipo é obrigatório");
      if (!form.dataInicio) throw new Error("Data de início é obrigatória");
      if (!form.cargaHoraria) throw new Error("Carga horária é obrigatória");

      const body = {
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        nrRelacionada: form.nrRelacionada.trim() || null,
        descricao: form.descricao.trim() || null,
        instrutor: form.instrutor.trim() || null,
        local: form.local.trim() || null,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim || null,
        cargaHoraria: Number(form.cargaHoraria),
        validadeMeses: form.validadeMeses ? Number(form.validadeMeses) : null,
        custo: form.custo ? Number(form.custo) : null,
        participantesIds: form.participantesIds.length > 0 ? form.participantesIds : undefined,
      };

      const res = await fetch("/api/rh/treinamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar treinamento");

      // Optimistic update
      setTreinamentos((prev) => [
        {
          ...data.data,
          _count: { participantes: form.participantesIds.length },
        },
        ...prev,
      ]);
      setModalAberto(false);
    } catch (e) {
      setErroModal(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = treinamentos.length;
    const horasTotais = treinamentos.reduce((acc, t) => acc + (Number(t.cargaHoraria) || 0), 0);
    const investimento = treinamentos.reduce((acc, t) => acc + (Number(t.custo) || 0), 0);
    const participantes = treinamentos.reduce((acc, t) => acc + (t._count?.participantes || 0), 0);
    return { total, horasTotais, investimento, participantes };
  }, [treinamentos]);

  // Anos disponíveis
  const anos = useMemo(() => {
    const a = [];
    for (let y = anoAtual; y >= anoAtual - 5; y--) a.push(String(y));
    return a;
  }, []);

  // Mostrar campo NR
  const mostraNR = form.tipo === "NR_OBRIGATORIO" || form.tipo === "SST";

  // --- Loading state ---
  if (carregando && treinamentos.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando treinamentos...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Treinamentos</h2>
          <p className="text-sm text-torg-gray mt-1">Gestão de capacitações e treinamentos obrigatórios</p>
        </div>
        <button
          onClick={abrirNovo}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2"
        >
          <PlusCircle size={16} /> Novo Treinamento
        </button>
      </div>

      {/* Erro global */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button
            onClick={carregar}
            className="ml-2 px-3 py-1 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-torg-blue/10">
              <BookOpen size={20} className="text-torg-blue" />
            </div>
            <div>
              <p className="text-xs text-torg-gray font-medium uppercase tracking-wider">Total de Treinamentos</p>
              <p className="text-2xl font-bold text-torg-dark">{kpis.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-100">
              <Clock size={20} className="text-purple-700" />
            </div>
            <div>
              <p className="text-xs text-torg-gray font-medium uppercase tracking-wider">Horas de Capacitação</p>
              <p className="text-2xl font-bold text-torg-dark">
                {kpis.horasTotais.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-100">
              <DollarSign size={20} className="text-green-700" />
            </div>
            <div>
              <p className="text-xs text-torg-gray font-medium uppercase tracking-wider">Investimento Total</p>
              <p className="text-2xl font-bold text-torg-dark">{fmtMoeda(kpis.investimento)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-100">
              <Users size={20} className="text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-torg-gray font-medium uppercase tracking-wider">Participantes</p>
              <p className="text-2xl font-bold text-torg-dark">{kpis.participantes}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filtroAno}
              onChange={(e) => setFiltroAno(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              {anos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          {(filtroTipo || filtroAno !== String(anoAtual)) && (
            <button
              onClick={() => { setFiltroTipo(""); setFiltroAno(String(anoAtual)); }}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <X size={12} /> Limpar
            </button>
          )}
          {carregando && (
            <Loader2 size={14} className="animate-spin text-torg-gray" />
          )}
          <p className="text-xs text-torg-gray ml-auto">
            <strong>{treinamentos.length}</strong> treinamento{treinamentos.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tabela / Empty state */}
      {treinamentos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <GraduationCap size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum treinamento encontrado</p>
          <p className="text-sm text-gray-400 mt-1">Cadastre o primeiro treinamento clicando no botão acima</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NR</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Carga Horária</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Participantes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {treinamentos.map((t) => {
                  const tipo = tipoMap[t.tipo] || { label: t.tipo, cor: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-torg-dark">{t.titulo}</span>
                          {t.instrutor && (
                            <p className="text-[10px] text-torg-gray mt-0.5">Instrutor: {t.instrutor}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${tipo.cor}`}>
                          {tipo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-torg-gray">{t.nrRelacionada || "—"}</td>
                      <td className="px-4 py-3 text-right text-xs text-torg-gray tabular-nums">
                        {fmtData(t.dataInicio)}
                        {t.dataFim && t.dataFim !== t.dataInicio && (
                          <span> — {fmtData(t.dataFim)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-torg-dark tabular-nums">
                        {Number(t.cargaHoraria).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-torg-dark tabular-nums">
                        {t._count?.participantes || 0}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-torg-dark tabular-nums">
                        {fmtMoeda(t.custo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Novo Treinamento */}
      {modalAberto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !salvando && setModalAberto(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Novo Treinamento</h3>
              <button
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {erroModal && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erroModal}
                </div>
              )}

              {/* Título */}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">
                  Título <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: NR-35 Trabalho em Altura"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                />
              </div>

              {/* Tipo + NR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">
                    Tipo <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.tipo}
                      onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value, nrRelacionada: "" }))}
                      className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                    >
                      {TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                  </div>
                </div>
                {mostraNR && (
                  <div>
                    <label className="block text-sm font-medium text-torg-dark mb-1">NR Relacionada</label>
                    <input
                      type="text"
                      value={form.nrRelacionada}
                      onChange={(e) => setForm((p) => ({ ...p, nrRelacionada: e.target.value }))}
                      placeholder="Ex: NR-35, NR-10"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                    />
                  </div>
                )}
              </div>

              {/* Datas + Carga + Validade */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">
                    Data Início <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.dataInicio}
                    onChange={(e) => setForm((p) => ({ ...p, dataInicio: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">Data Fim</label>
                  <input
                    type="date"
                    value={form.dataFim}
                    onChange={(e) => setForm((p) => ({ ...p, dataFim: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">
                    Carga Horária (h) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.cargaHoraria}
                    onChange={(e) => setForm((p) => ({ ...p, cargaHoraria: e.target.value }))}
                    placeholder="Ex: 8"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">Validade (meses)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.validadeMeses}
                    onChange={(e) => setForm((p) => ({ ...p, validadeMeses: e.target.value }))}
                    placeholder="Ex: 12"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
              </div>

              {/* Instrutor + Local + Custo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">Instrutor</label>
                  <input
                    type="text"
                    value={form.instrutor}
                    onChange={(e) => setForm((p) => ({ ...p, instrutor: e.target.value }))}
                    placeholder="Nome do instrutor"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">Local</label>
                  <input
                    type="text"
                    value={form.local}
                    onChange={(e) => setForm((p) => ({ ...p, local: e.target.value }))}
                    placeholder="Ex: Sala de treinamento"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-torg-dark mb-1">Custo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.custo}
                    onChange={(e) => setForm((p) => ({ ...p, custo: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  rows={3}
                  placeholder="Descrição do treinamento, objetivo, conteúdo programático..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue resize-none"
                />
              </div>

              {/* Participantes */}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">
                  Participantes
                  {form.participantesIds.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-torg-gray">
                      ({form.participantesIds.length} selecionado{form.participantesIds.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </label>

                {carregandoFunc ? (
                  <div className="flex items-center gap-2 text-sm text-torg-gray py-3">
                    <Loader2 size={14} className="animate-spin" /> Carregando funcionários...
                  </div>
                ) : funcionarios.length === 0 ? (
                  <p className="text-sm text-torg-gray py-2">Nenhum funcionário ativo encontrado</p>
                ) : (
                  <div>
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
                      <input
                        type="text"
                        value={buscaFunc}
                        onChange={(e) => setBuscaFunc(e.target.value)}
                        placeholder="Buscar funcionário por nome ou setor..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {funcFiltrados.length === 0 ? (
                        <p className="text-sm text-torg-gray px-3 py-3 text-center">Nenhum resultado</p>
                      ) : (
                        funcFiltrados.map((f) => {
                          const selecionado = form.participantesIds.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                                selecionado ? "bg-torg-blue/5" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => toggleParticipante(f.id)}
                                className="h-4 w-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-sm text-torg-dark font-medium">{f.nome}</span>
                                {(f.setor?.nome || f.cargo?.nome) && (
                                  <span className="text-[10px] text-torg-gray ml-2">
                                    {[f.cargo?.nome, f.setor?.nome].filter(Boolean).join(" - ")}
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {form.participantesIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, participantesIds: [] }))}
                        className="mt-1 text-xs text-red-500 hover:text-red-700"
                      >
                        Limpar seleção
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="px-4 py-2 text-sm font-medium text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Salvando..." : "Criar Treinamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
