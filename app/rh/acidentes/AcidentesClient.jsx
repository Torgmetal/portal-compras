"use client";
import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, ChevronUp, Calendar, Clock, Shield, Activity,
  FileText, Eye, Hash,
} from "lucide-react";

/* ── Labels & cores ─────────────────────────────────────────── */

const TIPO_LABELS = {
  COM_AFASTAMENTO: { label: "Com Afastamento", cor: "bg-red-100 text-red-800" },
  SEM_AFASTAMENTO: { label: "Sem Afastamento", cor: "bg-blue-100 text-blue-800" },
  TRAJETO: { label: "Trajeto", cor: "bg-purple-100 text-purple-800" },
  QUASE_ACIDENTE: { label: "Quase Acidente", cor: "bg-amber-100 text-amber-800" },
};

const GRAVIDADE_LABELS = {
  LEVE: { label: "Leve", cor: "bg-green-100 text-green-800" },
  MODERADO: { label: "Moderado", cor: "bg-amber-100 text-amber-800" },
  GRAVE: { label: "Grave", cor: "bg-orange-100 text-orange-800" },
  FATAL: { label: "Fatal", cor: "bg-red-100 text-red-800" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const anoAtual = new Date().getFullYear();

/* ── Formulario vazio ───────────────────────────────────────── */

const FORM_VAZIO = {
  data: new Date().toISOString().split("T")[0],
  hora: "",
  setorId: "",
  obra: "",
  tipo: "SEM_AFASTAMENTO",
  gravidade: "LEVE",
  diasPerdidos: 0,
  funcionarioNome: "",
  funcionarioId: "",
  descricao: "",
  causaRaiz: "",
  parteCorpo: "",
  agenteRisco: "",
  catEmitida: false,
  catNumero: "",
  acaoCorretiva: "",
  responsavelAcao: "",
  prazoAcao: "",
};

/* ══════════════════════════════════════════════════════════════
   Componente principal
   ══════════════════════════════════════════════════════════════ */

export default function AcidentesClient() {
  const [acidentes, setAcidentes] = useState([]);
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroGravidade, setFiltroGravidade] = useState("");
  const [filtroAno, setFiltroAno] = useState(String(anoAtual));

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...FORM_VAZIO });

  // Detalhe expandido
  const [expandido, setExpandido] = useState(null);

  /* ── Carregar dados ─────────────────────────────────────── */

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroAno) params.set("ano", filtroAno);

      const [aRes, sRes] = await Promise.all([
        fetch(`/api/rh/acidentes?${params}`).then((r) => r.json()),
        fetch("/api/rh/setores").then((r) => r.json()),
      ]);
      if (!aRes.success) throw new Error(aRes.error || "Erro ao carregar acidentes");
      setAcidentes(aRes.data || []);
      setSetores(sRes.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [filtroAno]);

  /* ── Filtros locais ─────────────────────────────────────── */

  const filtrados = useMemo(() => {
    return acidentes.filter((a) => {
      if (filtroTipo && a.tipo !== filtroTipo) return false;
      if (filtroGravidade && a.gravidade !== filtroGravidade) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${a.funcionarioNome || ""} ${a.descricao || ""} ${a.obra || ""} ${a.catNumero || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [acidentes, busca, filtroTipo, filtroGravidade]);

  /* ── KPIs ───────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const total = acidentes.length;
    const comAfastamento = acidentes.filter((a) => a.tipo === "COM_AFASTAMENTO").length;
    const diasPerdidos = acidentes.reduce((sum, a) => sum + (Number(a.diasPerdidos) || 0), 0);
    const quaseAcidentes = acidentes.filter((a) => a.tipo === "QUASE_ACIDENTE").length;
    return { total, comAfastamento, diasPerdidos, quaseAcidentes };
  }, [acidentes]);

  /* ── Criar acidente ─────────────────────────────────────── */

  const abrirNovo = () => {
    setForm({ ...FORM_VAZIO, setorId: setores[0]?.id || "" });
    setErro("");
    setModalAberto(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        data: form.data,
        hora: form.hora || undefined,
        setorId: form.setorId || undefined,
        obra: form.obra || undefined,
        tipo: form.tipo,
        gravidade: form.gravidade,
        diasPerdidos: Number(form.diasPerdidos) || 0,
        funcionarioNome: form.funcionarioNome || undefined,
        funcionarioId: form.funcionarioId || undefined,
        descricao: form.descricao,
        causaRaiz: form.causaRaiz || undefined,
        parteCorpo: form.parteCorpo || undefined,
        agenteRisco: form.agenteRisco || undefined,
        catEmitida: form.catEmitida || false,
        catNumero: form.catNumero || undefined,
        acaoCorretiva: form.acaoCorretiva || undefined,
        responsavelAcao: form.responsavelAcao || undefined,
        prazoAcao: form.prazoAcao || undefined,
      };
      const res = await fetch("/api/rh/acidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar acidente");
      setAcidentes((prev) => [data.data, ...prev]);
      setModalAberto(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  /* ── Anos para selector ─────────────────────────────────── */

  const anos = useMemo(() => {
    const lista = [];
    for (let a = anoAtual; a >= anoAtual - 5; a--) lista.push(String(a));
    return lista;
  }, []);

  /* ── Loading state ──────────────────────────────────────── */

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando acidentes...
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Acidentes de Trabalho
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            {kpis.total} registro{kpis.total !== 1 ? "s" : ""} em {filtroAno}
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2"
        >
          <PlusCircle size={16} /> Registrar Acidente
        </button>
      </div>

      {/* Erro global */}
      {erro && !modalAberto && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button
            onClick={carregar}
            className="text-xs font-medium text-red-800 underline hover:no-underline ml-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="Total de Acidentes"
          valor={kpis.total}
          cor="text-torg-blue"
          bgCor="bg-blue-50"
        />
        <KpiCard
          icon={<Shield size={20} />}
          label="Com Afastamento"
          valor={kpis.comAfastamento}
          cor="text-red-600"
          bgCor="bg-red-50"
        />
        <KpiCard
          icon={<Calendar size={20} />}
          label="Dias Perdidos"
          valor={kpis.diasPerdidos}
          cor="text-amber-600"
          bgCor="bg-amber-50"
        />
        <KpiCard
          icon={<Activity size={20} />}
          label="Quase Acidentes"
          valor={kpis.quaseAcidentes}
          cor="text-purple-600"
          bgCor="bg-purple-50"
        />
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
              placeholder="Buscar por funcionario, descricao, obra, CAT..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>
          <div className="relative">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todos os tipos</option>
              {Object.entries(TIPO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filtroGravidade}
              onChange={(e) => setFiltroGravidade(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todas gravidades</option>
              {Object.entries(GRAVIDADE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
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
        </div>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <AlertTriangle size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {acidentes.length === 0 ? "Nenhum acidente registrado" : "Nenhum resultado para os filtros"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {acidentes.length === 0
              ? 'Clique em "Registrar Acidente" para adicionar o primeiro registro'
              : "Tente ajustar os filtros acima"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">Funcionario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">Gravidade</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">Dias Perdidos</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider">CAT</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wider w-16">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((a) => {
                const tp = TIPO_LABELS[a.tipo] || { label: a.tipo, cor: "bg-gray-100 text-gray-700" };
                const gv = GRAVIDADE_LABELS[a.gravidade] || { label: a.gravidade, cor: "bg-gray-100 text-gray-700" };
                const aberto = expandido === a.id;

                return (
                  <AcidenteRow
                    key={a.id}
                    acidente={a}
                    tp={tp}
                    gv={gv}
                    aberto={aberto}
                    onToggle={() => setExpandido(aberto ? null : a.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Registrar Acidente */}
      {modalAberto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !salvando && setModalAberto(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Registrar Acidente de Trabalho</h3>
              <button
                onClick={() => setModalAberto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Erro dentro do modal */}
              {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" /> {erro}
                </div>
              )}

              {/* Secao: Dados do Acidente */}
              <div>
                <h4 className="text-sm font-bold text-torg-dark mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} /> Dados do Acidente
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <Campo
                    label="Data *"
                    type="date"
                    value={form.data}
                    onChange={(v) => setForm({ ...form, data: v })}
                  />
                  <Campo
                    label="Hora"
                    type="time"
                    value={form.hora}
                    onChange={(v) => setForm({ ...form, hora: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Sel
                    label="Tipo *"
                    value={form.tipo}
                    onChange={(v) => setForm({ ...form, tipo: v })}
                    options={Object.entries(TIPO_LABELS).map(([k, v]) => ({ value: k, label: v.label }))}
                  />
                  <Sel
                    label="Gravidade"
                    value={form.gravidade}
                    onChange={(v) => setForm({ ...form, gravidade: v })}
                    options={Object.entries(GRAVIDADE_LABELS).map(([k, v]) => ({ value: k, label: v.label }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Sel
                    label="Setor"
                    value={form.setorId}
                    onChange={(v) => setForm({ ...form, setorId: v })}
                    options={[
                      { value: "", label: "— Opcional —" },
                      ...setores.map((s) => ({ value: s.id, label: s.nome })),
                    ]}
                  />
                  <Campo
                    label="Obra / Local"
                    value={form.obra}
                    onChange={(v) => setForm({ ...form, obra: v })}
                    placeholder="Ex: Obra Gerdau - Ouro Branco"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Campo
                    label="Funcionario"
                    value={form.funcionarioNome}
                    onChange={(v) => setForm({ ...form, funcionarioNome: v })}
                    placeholder="Nome do funcionario"
                  />
                  <Campo
                    label="Dias Perdidos"
                    type="number"
                    value={form.diasPerdidos}
                    onChange={(v) => setForm({ ...form, diasPerdidos: v })}
                  />
                </div>
              </div>

              {/* Secao: Detalhes */}
              <div>
                <h4 className="text-sm font-bold text-torg-dark mb-3 flex items-center gap-2">
                  <FileText size={14} /> Detalhes
                </h4>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">
                    Descricao do acidente *
                  </label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    rows={3}
                    placeholder="Descreva o que aconteceu..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-medium text-torg-gray mb-1">Causa raiz</label>
                  <textarea
                    value={form.causaRaiz}
                    onChange={(e) => setForm({ ...form, causaRaiz: e.target.value })}
                    rows={2}
                    placeholder="Analise da causa raiz..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Campo
                    label="Parte do corpo atingida"
                    value={form.parteCorpo}
                    onChange={(v) => setForm({ ...form, parteCorpo: v })}
                    placeholder="Ex: Mao direita"
                  />
                  <Campo
                    label="Agente de risco"
                    value={form.agenteRisco}
                    onChange={(v) => setForm({ ...form, agenteRisco: v })}
                    placeholder="Ex: Material cortante"
                  />
                </div>
              </div>

              {/* Secao: CAT */}
              <div>
                <h4 className="text-sm font-bold text-torg-dark mb-3 flex items-center gap-2">
                  <Hash size={14} /> CAT
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-torg-gray mb-1">CAT emitida?</label>
                    <label className="inline-flex items-center gap-2 text-sm text-torg-gray cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={form.catEmitida}
                        onChange={(e) => setForm({ ...form, catEmitida: e.target.checked })}
                        className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                      />
                      Sim, CAT foi emitida
                    </label>
                  </div>
                  <Campo
                    label="Numero da CAT"
                    value={form.catNumero}
                    onChange={(v) => setForm({ ...form, catNumero: v })}
                    placeholder="Ex: 123456789"
                  />
                </div>
              </div>

              {/* Secao: Acoes Corretivas */}
              <div>
                <h4 className="text-sm font-bold text-torg-dark mb-3 flex items-center gap-2">
                  <Shield size={14} /> Acoes Corretivas
                </h4>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">
                    Acao corretiva
                  </label>
                  <textarea
                    value={form.acaoCorretiva}
                    onChange={(e) => setForm({ ...form, acaoCorretiva: e.target.value })}
                    rows={2}
                    placeholder="Descreva as acoes corretivas tomadas ou planejadas..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Campo
                    label="Responsavel pela acao"
                    value={form.responsavelAcao}
                    onChange={(v) => setForm({ ...form, responsavelAcao: v })}
                    placeholder="Nome do responsavel"
                  />
                  <Campo
                    label="Prazo"
                    type="date"
                    value={form.prazoAcao}
                    onChange={(v) => setForm({ ...form, prazoAcao: v })}
                  />
                </div>
              </div>
            </div>

            {/* Footer modal */}
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
                disabled={salvando || !form.data || !form.tipo || !form.descricao}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Registrando..." : "Registrar Acidente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sub-componentes
   ══════════════════════════════════════════════════════════════ */

function AcidenteRow({ acidente: a, tp, gv, aberto, onToggle }) {
  return (
    <>
      <tr className="hover:bg-gray-50/50 transition-colors">
        <td className="px-4 py-3 text-torg-dark whitespace-nowrap">
          <div className="font-medium">{fmtData(a.data)}</div>
          {a.hora && <div className="text-xs text-torg-gray">{a.hora}</div>}
        </td>
        <td className="px-4 py-3 text-torg-dark">
          <div>{a.funcionarioNome || "—"}</div>
          {a.obra && <div className="text-xs text-torg-gray">{a.obra}</div>}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${tp.cor}`}>
            {tp.label}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${gv.cor}`}>
            {gv.label}
          </span>
        </td>
        <td className="px-4 py-3 text-center font-medium text-torg-dark">
          {Number(a.diasPerdidos) || 0}
        </td>
        <td className="px-4 py-3 text-center">
          {a.catEmitida ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
              <FileText size={12} />
              {a.catNumero || "Sim"}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-torg-gray transition-colors"
            title={aberto ? "Fechar detalhes" : "Ver detalhes"}
          >
            {aberto ? <ChevronUp size={16} /> : <Eye size={16} />}
          </button>
        </td>
      </tr>

      {/* Detalhe expandido */}
      {aberto && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <DetalheBloco titulo="Descricao" valor={a.descricao} />
              <DetalheBloco titulo="Causa raiz" valor={a.causaRaiz} />
              <DetalheBloco titulo="Parte do corpo" valor={a.parteCorpo} />
              <DetalheBloco titulo="Agente de risco" valor={a.agenteRisco} />
              <DetalheBloco titulo="Acao corretiva" valor={a.acaoCorretiva} />
              <div className="space-y-1">
                <DetalheBloco titulo="Responsavel pela acao" valor={a.responsavelAcao} />
                {a.prazoAcao && (
                  <p className="text-xs text-torg-gray">
                    Prazo: {fmtData(a.prazoAcao)}
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetalheBloco({ titulo, valor }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide">{titulo}</p>
      <p className="text-sm text-torg-dark mt-0.5 whitespace-pre-line">{valor}</p>
    </div>
  );
}

function KpiCard({ icon, label, valor, cor, bgCor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-3">
        <div className={`${bgCor} ${cor} p-2.5 rounded-lg`}>{icon}</div>
        <div>
          <p className="text-xs text-torg-gray font-medium">{label}</p>
          <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
        </div>
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
