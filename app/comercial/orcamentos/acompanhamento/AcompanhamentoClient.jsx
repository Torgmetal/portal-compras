"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock, AlertTriangle, CheckCircle2, CalendarClock, Loader2,
  AlertCircle, FileSpreadsheet, ChevronDown, Search, X, Filter,
  Eye, Pencil, TrendingUp, XCircle, FileCheck2, Timer,
} from "lucide-react";
import { useStore } from "@/lib/store";

const STATUS_LABELS = {
  ORCAMENTO:     { label: "Orcamento",     cor: "bg-blue-50 text-blue-700",   icon: FileSpreadsheet },
  EM_NEGOCIACAO: { label: "Em Negociacao", cor: "bg-amber-50 text-amber-700", icon: TrendingUp },
  FECHADA:       { label: "Fechada",       cor: "bg-green-50 text-green-700", icon: FileCheck2 },
  PERDIDA:       { label: "Perdida",       cor: "bg-red-50 text-red-600",     icon: XCircle },
};

const VENDEDORES = ["Vitor", "Patricia", "Matheus", "Andre Metzker", "Jorge"];

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "--");
const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "--";

function diasRestantes(prazo) {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const p = new Date(prazo);
  p.setHours(0, 0, 0, 0);
  return Math.ceil((p - hoje) / (1000 * 60 * 60 * 24));
}

function urgenciaPrazo(dias) {
  if (dias === null) return { label: "Sem prazo", cor: "text-gray-400", bg: "bg-gray-50", icon: Clock };
  if (dias < 0) return { label: `${Math.abs(dias)}d atrasado`, cor: "text-red-700", bg: "bg-red-50", icon: AlertTriangle };
  if (dias === 0) return { label: "Vence hoje", cor: "text-red-600", bg: "bg-red-50", icon: AlertTriangle };
  if (dias <= 3) return { label: `${dias}d restante${dias > 1 ? "s" : ""}`, cor: "text-amber-700", bg: "bg-amber-50", icon: Timer };
  if (dias <= 7) return { label: `${dias}d restantes`, cor: "text-blue-700", bg: "bg-blue-50", icon: CalendarClock };
  return { label: `${dias}d restantes`, cor: "text-green-700", bg: "bg-green-50", icon: CheckCircle2 };
}

export default function AcompanhamentoClient() {
  const { showToast } = useStore();
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Filtros
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroUrgencia, setFiltroUrgencia] = useState(""); // "atrasado" | "urgente" | "semana" | "ok" | ""
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const fetchOrcamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
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
  }, [buscaDebounced]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  // Filtra apenas orcamentos em andamento (ORCAMENTO ou EM_NEGOCIACAO)
  // a menos que o usuario queira ver todos
  const emAndamento = orcamentos.filter((o) => {
    if (!mostrarFinalizados && (o.status === "FECHADA" || o.status === "PERDIDA")) return false;
    if (filtroVendedor && o.vendedor !== filtroVendedor) return false;
    return true;
  });

  // Enriquece com dias restantes
  const comPrazo = emAndamento.map((o) => {
    const dias = diasRestantes(o.prazoEntrega);
    const urg = urgenciaPrazo(dias);
    return { ...o, _dias: dias, _urg: urg };
  });

  // Filtra por urgencia
  const filtrados = comPrazo.filter((o) => {
    if (!filtroUrgencia) return true;
    if (filtroUrgencia === "atrasado") return o._dias !== null && o._dias < 0;
    if (filtroUrgencia === "hoje") return o._dias === 0;
    if (filtroUrgencia === "urgente") return o._dias !== null && o._dias >= 0 && o._dias <= 3;
    if (filtroUrgencia === "semana") return o._dias !== null && o._dias >= 0 && o._dias <= 7;
    if (filtroUrgencia === "semprazo") return o._dias === null;
    return true;
  });

  // Ordena: atrasados primeiro, depois por prazo mais proximo, sem prazo no final
  const ordenados = [...filtrados].sort((a, b) => {
    if (a._dias === null && b._dias === null) return 0;
    if (a._dias === null) return 1;
    if (b._dias === null) return -1;
    return a._dias - b._dias;
  });

  // KPIs
  const pendentes = comPrazo.filter((o) => o.status === "ORCAMENTO" || o.status === "EM_NEGOCIACAO");
  const atrasados = pendentes.filter((o) => o._dias !== null && o._dias < 0);
  const venceHoje = pendentes.filter((o) => o._dias === 0);
  const urgentes = pendentes.filter((o) => o._dias !== null && o._dias > 0 && o._dias <= 3);
  const noPrazo = pendentes.filter((o) => o._dias !== null && o._dias > 3);
  const semPrazo = pendentes.filter((o) => o._dias === null);

  const cards = [
    {
      label: "Atrasados",
      value: atrasados.length,
      sub: atrasados.length > 0 ? `${atrasados.length} orcamento${atrasados.length > 1 ? "s" : ""} vencido${atrasados.length > 1 ? "s" : ""}` : "Nenhum atrasado",
      color: "bg-red-500",
      Icon: AlertTriangle,
      filtro: "atrasado",
    },
    {
      label: "Vence hoje",
      value: venceHoje.length,
      sub: venceHoje.length > 0 ? "Entrega urgente!" : "Nenhum para hoje",
      color: "bg-red-400",
      Icon: Timer,
      filtro: "hoje",
    },
    {
      label: "Proximos 3 dias",
      value: urgentes.length,
      sub: urgentes.length > 0 ? "Atencao redobrada" : "Tudo tranquilo",
      color: "bg-amber-500",
      Icon: CalendarClock,
      filtro: "urgente",
    },
    {
      label: "No prazo",
      value: noPrazo.length,
      sub: `${semPrazo.length} sem prazo definido`,
      color: "bg-green-600",
      Icon: CheckCircle2,
      filtro: "",
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
          Acompanhamento de Orcamentos
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Controle de prazos de entrega das propostas comerciais.
        </p>
      </div>

      {/* KPI Cards */}
      {!loading && pendentes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((c) => (
            <button
              key={c.label}
              onClick={() => setFiltroUrgencia(filtroUrgencia === c.filtro ? "" : c.filtro)}
              className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-3 text-left transition-all ${
                filtroUrgencia === c.filtro ? "border-torg-blue ring-2 ring-torg-blue/20" : "border-torg-blue-100 hover:border-torg-blue/30"
              }`}
            >
              <div className={`${c.color} p-2.5 rounded-lg`}>
                <c.Icon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-torg-gray truncate">{c.label}</p>
                <p className="text-2xl font-extrabold text-torg-dark tabular-nums">{c.value}</p>
                <p className="text-[10px] text-torg-gray/70 truncate">{c.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por no, cliente ou obra..."
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

        <label className="flex items-center gap-2 text-sm text-torg-gray cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostrarFinalizados}
            onChange={(e) => setMostrarFinalizados(e.target.checked)}
            className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
          />
          Mostrar finalizados
        </label>

        {(filtroVendedor || filtroUrgencia) && (
          <button
            onClick={() => { setFiltroVendedor(""); setFiltroUrgencia(""); }}
            className="text-xs text-torg-gray hover:text-torg-blue flex items-center gap-1"
          >
            <Filter size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Conteudo */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-torg-gray">Carregando orcamentos...</p>
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
      ) : ordenados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <CalendarClock size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {filtroUrgencia || filtroVendedor || buscaDebounced
              ? "Nenhum orcamento encontrado com esses filtros"
              : "Nenhum orcamento em andamento"}
          </p>
          <p className="text-sm text-torg-gray mt-1">
            {filtroUrgencia || filtroVendedor || buscaDebounced
              ? "Tente ajustar os filtros."
              : "Todos os orcamentos estao finalizados ou sem prazo."}
          </p>
        </div>
      ) : (
        <TabelaAcompanhamento orcamentos={ordenados} />
      )}
    </div>
  );
}

// ─── TABELA ─────────────────────────────────────────────────────

function TabelaAcompanhamento({ orcamentos }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente / Obra</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitacao</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Situacao</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orcamentos.map((orc) => {
              const s = STATUS_LABELS[orc.status] || STATUS_LABELS.ORCAMENTO;
              const urg = orc._urg;
              const UrgIcon = urg.icon;
              const enviado = Boolean(orc.dataEnvio);

              return (
                <tr key={orc.id} className={`hover:bg-gray-50/50 ${orc._dias !== null && orc._dias < 0 ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-semibold text-torg-blue">{orc.numero}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-torg-dark font-medium truncate">{orc.cliente}</p>
                    {orc.obra && <p className="text-xs text-torg-gray truncate">{orc.obra}</p>}
                  </td>
                  <td className="px-4 py-3 text-torg-gray whitespace-nowrap text-xs">{orc.vendedor || "--"}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs whitespace-nowrap">{fmtData(orc.dataSolicitada)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-medium text-torg-dark">
                      {orc.prazoEntrega ? fmtData(orc.prazoEntrega) : "--"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {enviado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} />
                        Enviado {fmtData(orc.dataEnvio)}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${urg.cor} ${urg.bg} px-2 py-0.5 rounded-full`}>
                        <UrgIcon size={12} />
                        {urg.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap text-xs">
                    {fmtMoeda(orc.valor)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.cor}`}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="px-4 py-3 bg-gray-50/40 border-t border-gray-100 flex flex-wrap gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Atrasado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 1-3 dias</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> 4-7 dias</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> +7 dias</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Sem prazo</span>
      </div>
    </div>
  );
}
