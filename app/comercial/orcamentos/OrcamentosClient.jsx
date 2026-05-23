"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSpreadsheet, PlusCircle, Search, X, ChevronDown,
  Pencil, Trash2, Eye, Loader2, AlertCircle, Filter,
  TrendingUp, Clock, XCircle, FileCheck2,
} from "lucide-react";
import { useStore } from "@/lib/store";

// ─── CONSTANTES ─────────────────────────────────────────────────

const STATUS_LABELS = {
  ORCAMENTO:     { label: "Orçamento",     cor: "bg-blue-50 text-blue-700",   icon: FileSpreadsheet },
  EM_NEGOCIACAO: { label: "Em Negociação", cor: "bg-amber-50 text-amber-700", icon: TrendingUp },
  FECHADA:       { label: "Fechada",       cor: "bg-green-50 text-green-700", icon: FileCheck2 },
  PERDIDA:       { label: "Perdida",       cor: "bg-red-50 text-red-600",     icon: XCircle },
};

const TIPO_VENDA_LABELS = {
  FABRICACAO:             "Fabricação",
  MONTAGEM:               "Montagem",
  FABRICACAO_E_MONTAGEM:  "Fabricação e Montagem",
  PINTURA:                "Pintura",
  MAO_DE_OBRA:            "Mão de Obra",
  REVENDA:                "Revenda",
};

const PORTE_LABELS = {
  ATE_1_2M:      "Até R$ 1,2M",
  DE_1_2M_A_10M: "R$ 1,2M – R$ 10M",
  DE_10M_A_50M:  "R$ 10M – R$ 50M",
  ACIMA_50M:     "Acima R$ 50M",
};

const VENDEDORES = ["Vitor", "Patrícia", "Matheus", "André Metzker", "Jorge"];

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────

export default function OrcamentosClient() {
  const { showToast } = useStore();
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  // Modal
  const [modal, setModal] = useState(null); // "novo" | "editar" | "ver" | "excluir"
  const [orcSelecionado, setOrcSelecionado] = useState(null);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // ─── FETCH ──────────────────────────────────────────────────

  const fetchOrcamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroVendedor) params.set("vendedor", filtroVendedor);
      if (buscaDebounced) params.set("busca", buscaDebounced);
      const res = await fetch(`/api/comercial/orcamento?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrcamentos(json.orcamentos);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroVendedor, buscaDebounced]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  // ─── KPIs ───────────────────────────────────────────────────

  const kpis = orcamentos.reduce(
    (acc, o) => {
      acc.total += 1;
      if (o.status === "ORCAMENTO") acc.abertos += 1;
      if (o.status === "EM_NEGOCIACAO") acc.negociando += 1;
      if (o.status === "FECHADA") {
        acc.fechados += 1;
        acc.valorFechado += o.valor || 0;
      }
      if (o.status === "PERDIDA") acc.perdidos += 1;
      acc.valorTotal += o.valor || 0;
      return acc;
    },
    { total: 0, abertos: 0, negociando: 0, fechados: 0, perdidos: 0, valorTotal: 0, valorFechado: 0 }
  );

  const taxaConversao = kpis.total > 0
    ? ((kpis.fechados / kpis.total) * 100).toFixed(1)
    : "0.0";

  // ─── HANDLERS ───────────────────────────────────────────────

  const handleNovo = () => {
    setOrcSelecionado(null);
    setModal("novo");
  };

  const handleEditar = (orc) => {
    setOrcSelecionado(orc);
    setModal("editar");
  };

  const handleVer = (orc) => {
    setOrcSelecionado(orc);
    setModal("ver");
  };

  const handleExcluir = (orc) => {
    setOrcSelecionado(orc);
    setModal("excluir");
  };

  const confirmarExclusao = async () => {
    try {
      const res = await fetch(`/api/comercial/orcamento/${orcSelecionado.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrcamentos((prev) => prev.filter((o) => o.id !== orcSelecionado.id));
      showToast("Orçamento excluído", "sucesso");
    } catch (e) {
      showToast(e.message, "erro");
    } finally {
      setModal(null);
      setOrcSelecionado(null);
    }
  };

  const handleSalvar = async (dados) => {
    const isEdit = modal === "editar";
    const url = isEdit
      ? `/api/comercial/orcamento/${orcSelecionado.id}`
      : "/api/comercial/orcamento";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    if (isEdit) {
      setOrcamentos((prev) =>
        prev.map((o) => (o.id === orcSelecionado.id ? { ...o, ...json.orcamento } : o))
      );
      showToast("Orçamento atualizado", "sucesso");
    } else {
      // Refetch pra incluir dados completos (com relações)
      fetchOrcamentos();
      showToast("Orçamento criado", "sucesso");
    }
    setModal(null);
    setOrcSelecionado(null);
  };

  // ─── CARDS KPI ──────────────────────────────────────────────

  const cards = [
    { label: "Total",       value: kpis.total,                     color: "bg-torg-blue",   Icon: FileSpreadsheet },
    { label: "Em negociação", value: kpis.negociando,              color: "bg-amber-500",   Icon: TrendingUp },
    { label: "Fechados",    value: kpis.fechados,                  color: "bg-green-600",   Icon: FileCheck2 },
    { label: "Conversão",   value: `${taxaConversao}%`,           color: "bg-torg-dark",   Icon: TrendingUp },
  ];

  // ─── RENDER ─────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Central de Orçamentos
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Propostas comerciais — do orçamento ao fechamento.
          </p>
        </div>
        <button
          onClick={handleNovo}
          className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
        >
          <PlusCircle size={18} /> Novo Orçamento
        </button>
      </div>

      {/* KPI Cards */}
      {!loading && orcamentos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3"
            >
              <div className={`${c.color} p-2.5 rounded-lg`}>
                <c.Icon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-torg-gray truncate">{c.label}</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">
                  {c.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nº, cliente ou obra..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
          >
            <option value="">Todos os vendedores</option>
            {VENDEDORES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {(filtroStatus || filtroVendedor) && (
          <button
            onClick={() => { setFiltroStatus(""); setFiltroVendedor(""); }}
            className="text-xs text-torg-gray hover:text-torg-blue flex items-center gap-1"
          >
            <Filter size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-torg-gray">Carregando orçamentos...</p>
        </div>
      ) : erro ? (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button
            onClick={fetchOrcamentos}
            className="px-4 py-2 bg-torg-blue text-white rounded-lg text-sm hover:bg-torg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : orcamentos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {filtroStatus || filtroVendedor || buscaDebounced
              ? "Nenhum orçamento encontrado com esses filtros"
              : "Nenhum orçamento cadastrado"}
          </p>
          <p className="text-sm text-torg-gray mt-1 mb-4">
            {filtroStatus || filtroVendedor || buscaDebounced
              ? "Tente ajustar os filtros."
              : "Cadastre o primeiro orçamento pra começar."}
          </p>
          {!filtroStatus && !filtroVendedor && !buscaDebounced && (
            <button
              onClick={handleNovo}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
            >
              <PlusCircle size={18} /> Criar primeiro orçamento
            </button>
          )}
        </div>
      ) : (
        <TabelaOrcamentos
          orcamentos={orcamentos}
          onVer={handleVer}
          onEditar={handleEditar}
          onExcluir={handleExcluir}
        />
      )}

      {/* Modais */}
      {(modal === "novo" || modal === "editar") && (
        <FormOrcamentoModal
          orcamento={modal === "editar" ? orcSelecionado : null}
          onSalvar={handleSalvar}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
        />
      )}

      {modal === "ver" && orcSelecionado && (
        <VerOrcamentoModal
          orcamento={orcSelecionado}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
          onEditar={() => setModal("editar")}
        />
      )}

      {modal === "excluir" && orcSelecionado && (
        <ExcluirModal
          orcamento={orcSelecionado}
          onConfirm={confirmarExclusao}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
        />
      )}
    </div>
  );
}

// ─── TABELA ─────────────────────────────────────────────────────

function TabelaOrcamentos({ orcamentos, onVer, onEditar, onExcluir }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo Venda</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitação</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Envio</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orcamentos.map((orc) => {
              const s = STATUS_LABELS[orc.status] || STATUS_LABELS.ORCAMENTO;
              return (
                <tr key={orc.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onVer(orc)}
                      className="font-mono font-semibold text-torg-blue hover:underline"
                    >
                      {orc.numero}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-torg-dark max-w-[200px] truncate">{orc.cliente}</td>
                  <td className="px-4 py-3 text-torg-gray max-w-[180px] truncate">{orc.obra || "—"}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs">
                    {orc.tipoVenda ? TIPO_VENDA_LABELS[orc.tipoVenda] : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-torg-dark font-medium tabular-nums">
                    {fmtMoeda(orc.valor)}
                  </td>
                  <td className="px-4 py-3 text-torg-gray">{orc.vendedor || "—"}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs">{fmtData(orc.dataSolicitada)}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs">{fmtData(orc.dataEnvio)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.cor}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => onVer(orc)}
                        className="p-1.5 text-gray-400 hover:text-torg-blue rounded-lg hover:bg-torg-blue-50"
                        title="Ver detalhes"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => onEditar(orc)}
                        className="p-1.5 text-gray-400 hover:text-torg-blue rounded-lg hover:bg-torg-blue-50"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => onExcluir(orc)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MODAL: FORM (NOVO / EDITAR) ───────────────────────────────

function FormOrcamentoModal({ orcamento, onSalvar, onClose }) {
  const isEdit = Boolean(orcamento);
  const [form, setForm] = useState({
    numero: orcamento?.numero || "",
    cliente: orcamento?.cliente || "",
    obra: orcamento?.obra || "",
    responsavel: orcamento?.responsavel || "",
    contato: orcamento?.contato || "",
    orcamentista: orcamento?.orcamentista || "",
    tipoVenda: orcamento?.tipoVenda || "",
    valor: orcamento?.valor ?? "",
    porte: orcamento?.porte || "",
    dataSolicitada: orcamento?.dataSolicitada ? orcamento.dataSolicitada.slice(0, 10) : "",
    dataEnvio: orcamento?.dataEnvio ? orcamento.dataEnvio.slice(0, 10) : "",
    dataFechamento: orcamento?.dataFechamento ? orcamento.dataFechamento.slice(0, 10) : "",
    status: orcamento?.status || "ORCAMENTO",
    vendedor: orcamento?.vendedor || "",
    motivoPerda: orcamento?.motivoPerda || "",
    observacoes: orcamento?.observacoes || "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    try {
      const dados = {
        ...form,
        valor: form.valor !== "" ? parseFloat(form.valor) : null,
        tipoVenda: form.tipoVenda || null,
        porte: form.porte || null,
        dataSolicitada: form.dataSolicitada || null,
        dataEnvio: form.dataEnvio || null,
        dataFechamento: form.dataFechamento || null,
        obra: form.obra || null,
        responsavel: form.responsavel || null,
        contato: form.contato || null,
        orcamentista: form.orcamentista || null,
        vendedor: form.vendedor || null,
        motivoPerda: form.motivoPerda || null,
        observacoes: form.observacoes || null,
      };
      await onSalvar(dados);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-torg-dark">
            {isEdit ? "Editar Orçamento" : "Novo Orçamento"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> {erro}
            </div>
          )}

          {/* Linha 1: Número + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº Orçamento *</label>
              <input
                type="text"
                value={form.numero}
                onChange={set("numero")}
                placeholder="001-26"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={set("status")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Cliente + Obra */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
              <input
                type="text"
                value={form.cliente}
                onChange={set("cliente")}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Obra</label>
              <input
                type="text"
                value={form.obra}
                onChange={set("obra")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          </div>

          {/* Linha 3: Responsável + Contato (email) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsável</label>
              <input
                type="text"
                value={form.responsavel}
                onChange={set("responsavel")}
                placeholder="Nome do contato no cliente"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contato (e-mail)</label>
              <input
                type="email"
                value={form.contato}
                onChange={set("contato")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          </div>

          {/* Linha 4: Orçamentista + Vendedor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Orçamentista</label>
              <input
                type="text"
                value={form.orcamentista}
                onChange={set("orcamentista")}
                placeholder="Quem elaborou"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
              <select
                value={form.vendedor}
                onChange={set("vendedor")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {VENDEDORES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 5: Tipo Venda + Porte + Valor */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo Venda</label>
              <select
                value={form.tipoVenda}
                onChange={set("tipoVenda")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {Object.entries(TIPO_VENDA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Porte</label>
              <select
                value={form.porte}
                onChange={set("porte")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {Object.entries(PORTE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={set("valor")}
                placeholder="0,00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue tabular-nums"
              />
            </div>
          </div>

          {/* Linha 6: Datas */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data solicitada</label>
              <input
                type="date"
                value={form.dataSolicitada}
                onChange={set("dataSolicitada")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data envio</label>
              <input
                type="date"
                value={form.dataEnvio}
                onChange={set("dataEnvio")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fechamento</label>
              <input
                type="date"
                value={form.dataFechamento}
                onChange={set("dataFechamento")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
          </div>

          {/* Motivo perda (só quando PERDIDA) */}
          {form.status === "PERDIDA" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo da perda *</label>
              <input
                type="text"
                value={form.motivoPerda}
                onChange={set("motivoPerda")}
                required
                placeholder="Por que a proposta foi perdida"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={set("observacoes")}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar orçamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── MODAL: VER DETALHE ─────────────────────────────────────────

function VerOrcamentoModal({ orcamento, onClose, onEditar }) {
  const s = STATUS_LABELS[orcamento.status] || STATUS_LABELS.ORCAMENTO;

  const campos = [
    { label: "Nº Orçamento", value: orcamento.numero },
    { label: "Status", value: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cor}`}>{s.label}</span> },
    { label: "Cliente", value: orcamento.cliente },
    { label: "Obra", value: orcamento.obra || "—" },
    { label: "Responsável", value: orcamento.responsavel || "—" },
    { label: "Contato", value: orcamento.contato || "—" },
    { label: "Orçamentista", value: orcamento.orcamentista || "—" },
    { label: "Vendedor", value: orcamento.vendedor || "—" },
    { label: "Tipo Venda", value: orcamento.tipoVenda ? TIPO_VENDA_LABELS[orcamento.tipoVenda] : "—" },
    { label: "Porte", value: orcamento.porte ? PORTE_LABELS[orcamento.porte] : "—" },
    { label: "Valor", value: fmtMoeda(orcamento.valor) },
    { label: "Data solicitada", value: fmtData(orcamento.dataSolicitada) },
    { label: "Data envio", value: fmtData(orcamento.dataEnvio) },
    { label: "Data fechamento", value: fmtData(orcamento.dataFechamento) },
  ];

  if (orcamento.status === "PERDIDA") {
    campos.push({ label: "Motivo perda", value: orcamento.motivoPerda || "—" });
  }

  if (orcamento.op) {
    campos.push({ label: "OP vinculada", value: orcamento.op.numero });
  }

  if (orcamento.observacoes) {
    campos.push({ label: "Observações", value: orcamento.observacoes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-torg-dark">
            Orçamento {orcamento.numero}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {campos.map((c, i) => (
            <div key={i} className="flex justify-between items-start gap-4">
              <span className="text-xs text-gray-500 font-medium min-w-[120px]">{c.label}</span>
              <span className="text-sm text-torg-dark text-right">{c.value}</span>
            </div>
          ))}

          {orcamento.revisoes?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Revisões</p>
              <div className="space-y-1">
                {orcamento.revisoes.map((r) => (
                  <div key={r.id} className="text-xs text-torg-gray flex justify-between">
                    <span>Rev. {r.numero}</span>
                    <span>{fmtData(r.dataEnvio)}</span>
                    {r.observacao && <span className="text-gray-400 truncate max-w-[150px]">{r.observacao}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
          >
            Fechar
          </button>
          <button
            onClick={onEditar}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 flex items-center gap-2"
          >
            <Pencil size={14} /> Editar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: EXCLUIR ─────────────────────────────────────────────

function ExcluirModal({ orcamento, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-torg-dark mb-2">Excluir orçamento?</h3>
        <p className="text-sm text-torg-gray mb-6">
          O orçamento <strong>{orcamento.numero}</strong> ({orcamento.cliente}) será excluído permanentemente.
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
