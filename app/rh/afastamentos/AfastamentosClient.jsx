"use client";
import { useState, useEffect, useMemo } from "react";
import {
  ShieldAlert, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, CheckCircle2, Clock, UserX, Activity, HeartPulse,
  Ban,
} from "lucide-react";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const NATUREZA_LABELS = {
  FISICO: "Físico",
  MENTAL: "Mental",
  ACIDENTE_TRABALHO: "Acidente de Trabalho",
  ACIDENTE_TRAJETO: "Acidente de Trajeto",
  MATERNIDADE: "Maternidade",
  PATERNIDADE: "Paternidade",
};

const STATUS_LABELS = {
  EM_ANDAMENTO: { label: "Em andamento", cor: "bg-amber-100 text-amber-800" },
  ENCERRADO: { label: "Encerrado", cor: "bg-emerald-100 text-emerald-800" },
};

const NATUREZA_OPTIONS = Object.entries(NATUREZA_LABELS).map(([value, label]) => ({ value, label }));

const CID_GRUPOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function AfastamentosClient() {
  const [afastamentos, setAfastamentos] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroNatureza, setFiltroNatureza] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  // Modal criar
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({});
  const [erroForm, setErroForm] = useState("");

  // Encerrar
  const [encerrando, setEncerrando] = useState(null); // id do afastamento sendo encerrado

  // Excluir
  const [excluindo, setExcluindo] = useState(null);

  // Carregar dados
  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const [aRes, fRes] = await Promise.all([
        fetch("/api/rh/afastamentos").then((r) => r.json()),
        fetch("/api/rh/funcionarios").then((r) => r.json()),
      ]);
      if (!aRes.success) throw new Error(aRes.error);
      setAfastamentos(aRes.data || []);
      setFuncionarios((fRes.data || []).filter((f) => f.status === "ATIVO"));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // Filtros
  const filtrados = useMemo(() => {
    return afastamentos.filter((a) => {
      if (filtroNatureza && a.natureza !== filtroNatureza) return false;
      if (filtroStatus && a.status !== filtroStatus) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${a.funcionario?.nome || ""} ${a.funcionario?.setor?.nome || ""} ${NATUREZA_LABELS[a.natureza] || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [afastamentos, busca, filtroNatureza, filtroStatus]);

  // KPIs
  const kpis = useMemo(() => {
    const emAndamento = afastamentos.filter((a) => a.status === "EM_ANDAMENTO").length;
    const encerrados = afastamentos.filter((a) => a.status === "ENCERRADO").length;
    const comDias = afastamentos.filter((a) => a.diasAfastado != null && a.diasAfastado > 0);
    const diasMedio = comDias.length > 0
      ? Math.round(comDias.reduce((acc, a) => acc + a.diasAfastado, 0) / comDias.length)
      : 0;
    const inss = afastamentos.filter((a) => a.inss === true).length;
    return { emAndamento, encerrados, diasMedio, inss };
  }, [afastamentos]);

  // Abrir modal novo
  const abrirNovo = () => {
    setForm({
      funcionarioId: "",
      dataInicio: new Date().toISOString().split("T")[0],
      dataFim: "",
      natureza: "FISICO",
      categoriaCID: "",
      inss: false,
      observacao: "",
    });
    setErroForm("");
    setModalAberto(true);
  };

  // Salvar novo afastamento
  const salvar = async () => {
    setErroForm("");
    // Validacao client-side
    if (!form.funcionarioId) { setErroForm("Selecione um funcionário."); return; }
    if (!form.dataInicio) { setErroForm("Informe a data de início."); return; }
    if (!form.natureza) { setErroForm("Selecione a natureza do afastamento."); return; }

    setSalvando(true);
    try {
      const body = {
        funcionarioId: form.funcionarioId,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim || undefined,
        natureza: form.natureza,
        categoriaCID: form.categoriaCID || undefined,
        inss: form.inss || undefined,
        observacao: form.observacao || undefined,
      };
      const res = await fetch("/api/rh/afastamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar afastamento");

      // Optimistic: enriquecer com dados do funcionario
      const func = funcionarios.find((f) => f.id === form.funcionarioId);
      setAfastamentos((prev) => [
        { ...data.data, funcionario: func ? { id: func.id, nome: func.nome, setor: func.setor } : data.data.funcionario },
        ...prev,
      ]);
      setModalAberto(false);
    } catch (e) {
      setErroForm(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Encerrar afastamento
  const encerrar = async (afastamento) => {
    setEncerrando(afastamento.id);
    setErro("");
    try {
      const hoje = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/rh/afastamentos/${afastamento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataFim: hoje, status: "ENCERRADO" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao encerrar afastamento");

      setAfastamentos((prev) =>
        prev.map((a) =>
          a.id === afastamento.id
            ? { ...a, dataFim: hoje, status: "ENCERRADO", diasAfastado: data.data.diasAfastado ?? a.diasAfastado }
            : a
        )
      );
    } catch (e) {
      setErro(e.message);
    } finally {
      setEncerrando(null);
    }
  };

  // Excluir afastamento
  const excluir = async (afastamento) => {
    if (!confirm("Tem certeza que deseja excluir este afastamento?")) return;
    setExcluindo(afastamento.id);
    setErro("");
    try {
      const res = await fetch(`/api/rh/afastamentos/${afastamento.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir afastamento");
      setAfastamentos((prev) => prev.filter((a) => a.id !== afastamento.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setExcluindo(null);
    }
  };

  // Loading state
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando afastamentos...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Afastamentos</h2>
          <p className="text-sm text-torg-gray mt-1">
            {afastamentos.length} registro{afastamentos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={abrirNovo}
          disabled={funcionarios.length === 0}
          title={funcionarios.length === 0 ? "Cadastre funcionários ativos primeiro" : ""}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <PlusCircle size={16} /> Novo Afastamento
        </button>
      </div>

      {/* Erro global */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={carregar} className="text-red-600 underline text-xs font-medium shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Clock} label="Em andamento" valor={kpis.emAndamento} cor="text-amber-600" bg="bg-amber-50" />
        <KpiCard icon={CheckCircle2} label="Encerrados" valor={kpis.encerrados} cor="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard icon={Activity} label="Dias (media)" valor={kpis.diasMedio} cor="text-torg-blue" bg="bg-blue-50" />
        <KpiCard icon={HeartPulse} label="INSS" valor={kpis.inss} cor="text-purple-600" bg="bg-purple-50" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por funcionario, setor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>
          <div className="relative">
            <select
              value={filtroNatureza}
              onChange={(e) => setFiltroNatureza(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todas as naturezas</option>
              {NATUREZA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ShieldAlert size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {afastamentos.length === 0 ? "Nenhum afastamento registrado" : "Nenhum resultado encontrado"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {afastamentos.length === 0
              ? "Clique em \"Novo Afastamento\" para registrar"
              : "Tente ajustar os filtros de busca"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-xs font-medium text-torg-gray uppercase tracking-wider">
                <th className="px-4 py-3">Funcionario</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Natureza</th>
                <th className="px-4 py-3">Data Inicio</th>
                <th className="px-4 py-3">Data Fim</th>
                <th className="px-4 py-3">Dias</th>
                <th className="px-4 py-3">CID</th>
                <th className="px-4 py-3">INSS</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((a) => {
                const st = STATUS_LABELS[a.status] || { label: a.status, cor: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={a.id} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-torg-dark whitespace-nowrap">
                      {a.funcionario?.nome || "—"}
                    </td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">
                      {a.funcionario?.setor?.nome || "—"}
                    </td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">
                      {NATUREZA_LABELS[a.natureza] || a.natureza}
                    </td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">{fmtData(a.dataInicio)}</td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">{fmtData(a.dataFim)}</td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">
                      {a.diasAfastado != null ? a.diasAfastado : "—"}
                    </td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap">
                      {a.categoriaCID ? a.categoriaCID.charAt(0).toUpperCase() : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.inss ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">Sim</span>
                      ) : (
                        <span className="text-torg-gray">Nao</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === "EM_ANDAMENTO" && (
                          <button
                            onClick={() => encerrar(a)}
                            disabled={encerrando === a.id}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {encerrando === a.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={12} />
                            )}
                            Encerrar
                          </button>
                        )}
                        <button
                          onClick={() => excluir(a)}
                          disabled={excluindo === a.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {excluindo === a.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Ban size={12} />
                          )}
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Novo Afastamento */}
      {modalAberto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !salvando && setModalAberto(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Novo Afastamento</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erroForm && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erroForm}
                </div>
              )}

              {/* Funcionario */}
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Funcionario *</label>
                <div className="relative">
                  <select
                    value={form.funcionarioId || ""}
                    onChange={(e) => setForm({ ...form, funcionarioId: e.target.value })}
                    className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  >
                    <option value="">Selecione...</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} {f.setor ? `(${f.setor.nome})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                </div>
              </div>

              {/* Natureza */}
              <Sel
                label="Natureza *"
                value={form.natureza}
                onChange={(v) => setForm({ ...form, natureza: v })}
                options={NATUREZA_OPTIONS}
              />

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4">
                <Campo
                  label="Data Inicio *"
                  type="date"
                  value={form.dataInicio}
                  onChange={(v) => setForm({ ...form, dataInicio: v })}
                />
                <Campo
                  label="Data Fim"
                  type="date"
                  value={form.dataFim}
                  onChange={(v) => setForm({ ...form, dataFim: v })}
                />
              </div>

              {/* CID + INSS */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Grupo CID (A-Z)</label>
                  <div className="relative">
                    <select
                      value={form.categoriaCID || ""}
                      onChange={(e) => setForm({ ...form, categoriaCID: e.target.value })}
                      className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                    >
                      <option value="">— Opcional —</option>
                      {CID_GRUPOS.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-sm text-torg-gray cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.inss || false}
                      onChange={(e) => setForm({ ...form, inss: e.target.checked })}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    Afastamento pelo INSS
                  </label>
                </div>
              </div>

              {/* Observacao */}
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Observacao</label>
                <textarea
                  value={form.observacao || ""}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  rows={3}
                  placeholder="Informacoes adicionais sobre o afastamento..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !form.funcionarioId || !form.dataInicio || !form.natureza}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Registrando..." : "Registrar Afastamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Componentes auxiliares ---- */

function KpiCard({ icon: Icon, label, valor, cor, bg }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
      <div className={`${bg} rounded-lg p-2.5`}>
        <Icon size={20} className={cor} />
      </div>
      <div>
        <p className="text-2xl font-bold text-torg-dark">{valor}</p>
        <p className="text-xs text-torg-gray">{label}</p>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
      />
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <div className="relative">
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
      </div>
    </div>
  );
}
