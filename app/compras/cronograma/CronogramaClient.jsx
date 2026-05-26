"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, Package, Clock, AlertTriangle,
  CheckCircle2, CalendarDays, Truck, Filter, RefreshCw,
  ChevronDown, ChevronRight, ExternalLink, ArrowUpDown,
} from "lucide-react";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtDataCurta = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const diasAte = (d) => {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const STATUS_PRIORITY = { ATRASADO: 0, PROXIMO: 1, PARCIAL: 2, NO_PRAZO: 3, SEM_PRAZO: 4, ENTREGUE: 5 };

const STATUS_CFG = {
  ATRASADO:  { label: "Atrasado",     Icon: AlertTriangle, badge: "bg-red-100 text-red-700",     dot: "bg-red-500",     tab: "border-red-300 bg-red-50 text-red-700",     tabActive: "border-red-500 bg-red-100 text-red-800 ring-1 ring-red-300" },
  PROXIMO:   { label: "Prox. 7 dias", Icon: Clock,         badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500",   tab: "border-amber-300 bg-amber-50 text-amber-700", tabActive: "border-amber-500 bg-amber-100 text-amber-800 ring-1 ring-amber-300" },
  PARCIAL:   { label: "Parcial",      Icon: Package,       badge: "bg-teal-100 text-teal-700",   dot: "bg-teal-500",    tab: "border-teal-300 bg-teal-50 text-teal-700",   tabActive: "border-teal-500 bg-teal-100 text-teal-800 ring-1 ring-teal-300" },
  NO_PRAZO:  { label: "No prazo",     Icon: CalendarDays,  badge: "bg-sky-100 text-sky-700",     dot: "bg-torg-blue",   tab: "border-sky-300 bg-sky-50 text-sky-700",     tabActive: "border-sky-500 bg-sky-100 text-sky-800 ring-1 ring-sky-300" },
  SEM_PRAZO: { label: "Sem prazo",    Icon: Package,       badge: "bg-gray-100 text-gray-600",   dot: "bg-gray-400",    tab: "border-gray-300 bg-gray-50 text-gray-600",   tabActive: "border-gray-500 bg-gray-200 text-gray-800 ring-1 ring-gray-300" },
  ENTREGUE:  { label: "Entregue",     Icon: CheckCircle2,  badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", tab: "border-emerald-300 bg-emerald-50 text-emerald-700", tabActive: "border-emerald-500 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
};

const COLUNAS_SORT = [
  { key: "status",       label: "Status" },
  { key: "prazoEntrega", label: "Prazo" },
  { key: "fornecedor",   label: "Fornecedor" },
  { key: "descricao",    label: "Descricao" },
  { key: "valorBruto",   label: "Valor" },
];

export default function CronogramaClient() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroOP, setFiltroOP] = useState("");
  const [filtroRM, setFiltroRM] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [registrando, setRegistrando] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [ordenacao, setOrdenacao] = useState({ campo: "status", dir: "asc" });

  const fetchData = async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/compras/cronograma");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setItens(data.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const syncOmie = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/compras/cronograma/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao sincronizar");
      setSyncResult(data);
      if (data.sincronizados > 0) fetchData();
    } catch (e) {
      setSyncResult({ error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  // Filtros + ordenacao
  const itensFiltrados = useMemo(() => {
    let lista = itens;
    if (filtroOP) lista = lista.filter((it) => it.opId === filtroOP);
    if (filtroRM) lista = lista.filter((it) => it.rmId === filtroRM);
    if (filtroFornecedor) lista = lista.filter((it) => it.fornecedor === filtroFornecedor);
    if (filtroStatus) lista = lista.filter((it) => (it.statusEntrega || "SEM_PRAZO") === filtroStatus);
    return lista;
  }, [itens, filtroOP, filtroRM, filtroFornecedor, filtroStatus]);

  // Agrupa por status (pra KPIs e tabs — usa itens SEM filtroStatus)
  const grupos = useMemo(() => {
    const base = itens.filter((it) => {
      if (filtroOP && it.opId !== filtroOP) return false;
      if (filtroRM && it.rmId !== filtroRM) return false;
      if (filtroFornecedor && it.fornecedor !== filtroFornecedor) return false;
      return true;
    });
    const map = { ATRASADO: [], PROXIMO: [], PARCIAL: [], NO_PRAZO: [], SEM_PRAZO: [], ENTREGUE: [] };
    for (const it of base) {
      const key = it.statusEntrega || "SEM_PRAZO";
      if (map[key]) map[key].push(it);
      else map.SEM_PRAZO.push(it);
    }
    return map;
  }, [itens, filtroOP, filtroRM, filtroFornecedor]);

  // Ordenacao
  const itensOrdenados = useMemo(() => {
    const lista = [...itensFiltrados];
    const { campo, dir } = ordenacao;
    const mult = dir === "asc" ? 1 : -1;

    lista.sort((a, b) => {
      if (campo === "status") {
        const pa = STATUS_PRIORITY[a.statusEntrega || "SEM_PRAZO"] ?? 3;
        const pb = STATUS_PRIORITY[b.statusEntrega || "SEM_PRAZO"] ?? 3;
        if (pa !== pb) return (pa - pb) * mult;
        // Dentro do mesmo status, ordena por prazo
        const da = a.prazoEntrega ? new Date(a.prazoEntrega).getTime() : Infinity;
        const db = b.prazoEntrega ? new Date(b.prazoEntrega).getTime() : Infinity;
        return (da - db) * mult;
      }
      if (campo === "prazoEntrega") {
        const da = a.prazoEntrega ? new Date(a.prazoEntrega).getTime() : Infinity;
        const db = b.prazoEntrega ? new Date(b.prazoEntrega).getTime() : Infinity;
        return (da - db) * mult;
      }
      if (campo === "valorBruto") {
        return ((a.valorBruto || 0) - (b.valorBruto || 0)) * mult;
      }
      if (campo === "fornecedor" || campo === "descricao") {
        return (a[campo] || "").localeCompare(b[campo] || "") * mult;
      }
      return 0;
    });

    return lista;
  }, [itensFiltrados, ordenacao]);

  // OPs, RMs e fornecedores unicos
  const ops = useMemo(() => {
    const set = new Map();
    for (const it of itens) set.set(it.opId, `OP ${it.opNumero} — ${it.opCliente || ""}`);
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens]);

  // RMs filtradas pela OP selecionada (cascata)
  const rms = useMemo(() => {
    const base = filtroOP ? itens.filter((it) => it.opId === filtroOP) : itens;
    const set = new Map();
    for (const it of base) set.set(it.rmId, `RM ${it.rmNumero}`);
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens, filtroOP]);

  const fornecedores = useMemo(() => {
    const set = new Set(itens.map((it) => it.fornecedor));
    return Array.from(set).sort();
  }, [itens]);

  // KPIs
  const totalBase = useMemo(() => {
    return itens.filter((it) => {
      if (filtroOP && it.opId !== filtroOP) return false;
      if (filtroRM && it.rmId !== filtroRM) return false;
      if (filtroFornecedor && it.fornecedor !== filtroFornecedor) return false;
      return true;
    }).length;
  }, [itens, filtroOP, filtroFornecedor]);

  const kpis = useMemo(() => ({
    total: totalBase,
    atrasados: grupos.ATRASADO.length,
    proximos: grupos.PROXIMO.length,
    noPrazo: grupos.NO_PRAZO.length,
    semPrazo: grupos.SEM_PRAZO.length,
    entregues: grupos.ENTREGUE.length,
    valorAtrasado: grupos.ATRASADO.reduce((s, it) => s + (it.valorBruto || 0), 0),
  }), [totalBase, grupos]);

  const handleSort = (campo) => {
    setOrdenacao((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: "asc" }
    );
  };

  const registrarEntrega = async (cotacaoItemId) => {
    setRegistrando(cotacaoItemId);
    try {
      const res = await fetch("/api/compras/cronograma", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotacaoItemId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      setItens((prev) => prev.map((it) =>
        it.id === cotacaoItemId
          ? { ...it, statusEntrega: "ENTREGUE" }
          : it
      ));
      setExpandido(null);
    } catch (e) {
      alert("Falha: " + e.message);
    } finally {
      setRegistrando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-torg-gray">
        <Loader2 size={24} className="animate-spin" />
        <span>Carregando entregas...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-700 font-medium">{erro}</p>
        <button onClick={fetchData} className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Total itens" value={kpis.total} Icon={Package} color="torg-blue" onClick={() => setFiltroStatus("")} active={!filtroStatus} />
        <KPICard label="Atrasados" value={kpis.atrasados} Icon={AlertTriangle} color="red" highlight={kpis.atrasados > 0} onClick={() => setFiltroStatus(filtroStatus === "ATRASADO" ? "" : "ATRASADO")} active={filtroStatus === "ATRASADO"} />
        <KPICard label="Prox. 7 dias" value={kpis.proximos} Icon={Clock} color="amber" onClick={() => setFiltroStatus(filtroStatus === "PROXIMO" ? "" : "PROXIMO")} active={filtroStatus === "PROXIMO"} />
        <KPICard label="No prazo" value={kpis.noPrazo} Icon={CalendarDays} color="torg-blue" onClick={() => setFiltroStatus(filtroStatus === "NO_PRAZO" ? "" : "NO_PRAZO")} active={filtroStatus === "NO_PRAZO"} />
        <KPICard label="Sem prazo" value={kpis.semPrazo} Icon={Package} color="gray" onClick={() => setFiltroStatus(filtroStatus === "SEM_PRAZO" ? "" : "SEM_PRAZO")} active={filtroStatus === "SEM_PRAZO"} />
        <KPICard label="Entregues" value={kpis.entregues} Icon={CheckCircle2} color="emerald" onClick={() => setFiltroStatus(filtroStatus === "ENTREGUE" ? "" : "ENTREGUE")} active={filtroStatus === "ENTREGUE"} />
      </div>

      {kpis.valorAtrasado > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-red-800">
            <strong>{kpis.atrasados} ite{kpis.atrasados === 1 ? "m" : "ns"}</strong> em atraso,
            totalizando <strong>{fmtMoeda(kpis.valorAtrasado)}</strong> em materiais pendentes.
          </p>
        </div>
      )}

      {/* Filtros + acoes */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-torg-gray">
          <Filter size={16} />
          <span className="font-medium">Filtros:</span>
        </div>
        <select
          value={filtroOP}
          onChange={(e) => { setFiltroOP(e.target.value); setFiltroRM(""); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue"
        >
          <option value="">Todas as OPs</option>
          {ops.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          value={filtroRM}
          onChange={(e) => setFiltroRM(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue"
        >
          <option value="">Todas as RMs</option>
          {rms.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          value={filtroFornecedor}
          onChange={(e) => setFiltroFornecedor(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue"
        >
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {(filtroOP || filtroRM || filtroFornecedor || filtroStatus) && (
          <button
            onClick={() => { setFiltroOP(""); setFiltroRM(""); setFiltroFornecedor(""); setFiltroStatus(""); }}
            className="text-xs text-torg-gray hover:text-red-600 underline"
          >
            Limpar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={syncOmie}
            disabled={syncing}
            className="px-3 py-1.5 text-sm text-torg-orange hover:bg-orange-50 rounded-lg flex items-center gap-1.5 border border-orange-200 font-medium disabled:opacity-50"
            title="Consulta o Omie pra detectar NFs recebidas e atualizar status de entrega"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            {syncing ? "Sincronizando..." : "Sincronizar Omie"}
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm text-torg-blue hover:bg-sky-50 rounded-lg flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Resultado da sincronizacao */}
      {syncResult && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${
          syncResult.error
            ? "bg-red-50 border border-red-200 text-red-700"
            : syncResult.sincronizados > 0
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : "bg-gray-50 border border-gray-200 text-torg-gray"
        }`}>
          <div className="flex items-center gap-2">
            {syncResult.error ? (
              <><AlertCircle size={16} /> Erro: {syncResult.error}</>
            ) : syncResult.sincronizados > 0 ? (
              <><CheckCircle2 size={16} /> {syncResult.sincronizados} pedido{syncResult.sincronizados !== 1 ? "s" : ""} atualizado{syncResult.sincronizados !== 1 ? "s" : ""} ({syncResult.total} consultados)</>
            ) : (
              <><Package size={16} /> Nenhuma entrega nova detectada ({syncResult.total} pedidos consultados)</>
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
      )}

      {/* Tabela ou estado vazio */}
      {itensOrdenados.length === 0 && !filtroStatus ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Truck size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhum item vencedor encontrado</p>
          <p className="text-sm text-gray-400 mt-1">
            Marque itens como vencedores no Mapa de Cotacao pra acompanhar os prazos aqui.
          </p>
        </div>
      ) : itensOrdenados.length === 0 && filtroStatus ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Package size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Nenhum item com status <strong>{STATUS_CFG[filtroStatus]?.label}</strong></p>
          <button onClick={() => setFiltroStatus("")} className="text-sm text-torg-blue hover:underline mt-2">
            Mostrar todos
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Contador */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
            <span className="text-xs text-torg-gray">
              {itensOrdenados.length} ite{itensOrdenados.length !== 1 ? "ns" : "m"}
              {filtroStatus && <> &mdash; {STATUS_CFG[filtroStatus]?.label}</>}
            </span>
            <span className="text-xs text-gray-400">
              Clique em uma linha para ver detalhes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <SortHeader campo="status" label="Status" ordenacao={ordenacao} onSort={handleSort} className="w-[120px]" />
                  <SortHeader campo="prazoEntrega" label="Prazo" ordenacao={ordenacao} onSort={handleSort} className="w-[140px]" />
                  <SortHeader campo="fornecedor" label="Fornecedor" ordenacao={ordenacao} onSort={handleSort} />
                  <SortHeader campo="descricao" label="Material / Descricao" ordenacao={ordenacao} onSort={handleSort} className="min-w-[280px]" />
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[70px]">OP</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[60px]">RM</th>
                  <SortHeader campo="valorBruto" label="Valor" ordenacao={ordenacao} onSort={handleSort} className="w-[110px] text-right" align="right" />
                  <th className="px-3 py-2.5 w-[40px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensOrdenados.map((item) => {
                  const status = item.statusEntrega || "SEM_PRAZO";
                  const cfg = STATUS_CFG[status];
                  const dias = diasAte(item.prazoEntrega);
                  const isExpanded = expandido === item.id;

                  return (
                    <ItemRows
                      key={item.id}
                      item={item}
                      status={status}
                      cfg={cfg}
                      dias={dias}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandido(isExpanded ? null : item.id)}
                      onRegistrarEntrega={() => registrarEntrega(item.id)}
                      registrando={registrando === item.id}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Subcomponents ─── */

function SortHeader({ campo, label, ordenacao, onSort, className = "", align = "left" }) {
  const active = ordenacao.campo === campo;
  return (
    <th
      onClick={() => onSort(campo)}
      className={`px-3 py-2.5 text-${align} text-[11px] font-semibold text-torg-gray uppercase tracking-wider cursor-pointer hover:text-torg-dark select-none ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          ordenacao.dir === "asc"
            ? <ChevronDown size={12} className="text-torg-blue" />
            : <ChevronDown size={12} className="text-torg-blue rotate-180" />
        ) : (
          <ArrowUpDown size={10} className="text-gray-300" />
        )}
      </span>
    </th>
  );
}

function ItemRows({ item, status, cfg, dias, isExpanded, onToggle, onRegistrarEntrega, registrando }) {
  const Icon = cfg.Icon;
  const diasLabel = dias !== null
    ? dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? "Hoje" : `${dias}d`
    : null;
  const diasColor = status === "ATRASADO" ? "text-red-600 font-semibold" : status === "PROXIMO" ? "text-amber-600 font-medium" : "text-torg-gray";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${
          isExpanded ? "bg-sky-50/50" : "hover:bg-gray-50/80"
        } ${status === "ENTREGUE" ? "opacity-60" : ""}`}
      >
        {/* Status badge */}
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        </td>

        {/* Prazo */}
        <td className="px-3 py-2.5">
          {item.prazoEntrega ? (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-torg-dark tabular-nums">{fmtDataCurta(item.prazoEntrega)}</span>
              {diasLabel && <span className={`text-[10px] tabular-nums ${diasColor}`}>{diasLabel}</span>}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Sem prazo</span>
          )}
        </td>

        {/* Fornecedor */}
        <td className="px-3 py-2.5">
          <span className="text-sm font-medium text-torg-dark truncate block max-w-[200px]" title={item.fornecedor}>
            {item.fornecedor}
          </span>
        </td>

        {/* Material / Descricao */}
        <td className="px-3 py-2.5">
          <p className="text-sm text-torg-dark leading-snug" title={item.descricao}>
            {item.descricao}
          </p>
          {item.material && item.material !== item.descricao && (
            <p className="text-[10px] text-torg-gray mt-0.5">{item.material}</p>
          )}
        </td>

        {/* OP */}
        <td className="px-3 py-2.5">
          <span className="text-xs font-mono text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded">{item.opNumero}</span>
        </td>

        {/* RM */}
        <td className="px-3 py-2.5">
          <span className="text-xs text-torg-gray">{item.rmNumero}</span>
        </td>

        {/* Valor */}
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm font-semibold text-torg-dark tabular-nums">{fmtMoeda(item.valorBruto)}</span>
        </td>

        {/* Expand icon */}
        <td className="px-2 py-2.5 text-center">
          {isExpanded
            ? <ChevronDown size={14} className="text-torg-blue" />
            : <ChevronRight size={14} className="text-gray-400" />
          }
        </td>
      </tr>

      {/* Linha expandida */}
      {isExpanded && (
        <tr className="bg-sky-50/30">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Cliente</p>
                <p className="font-medium text-torg-dark">{item.opCliente || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Quantidade</p>
                <p className="font-medium text-torg-dark tabular-nums">
                  {typeof item.qtd === "number" ? item.qtd.toFixed(2) : item.qtd} {item.unidade}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Preco unit.</p>
                <p className="font-medium text-torg-dark tabular-nums">{fmtMoeda(item.precoUnit)}</p>
              </div>
              <div>
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Valor total</p>
                <p className="font-medium text-torg-dark tabular-nums">{fmtMoeda(item.valorBruto)}</p>
              </div>
              <div>
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Prazo completo</p>
                <p className="font-medium text-torg-dark">{fmtData(item.prazoEntrega)}</p>
              </div>
              {item.pedido && (
                <div>
                  <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-0.5">Pedido Omie</p>
                  <p className="font-medium text-torg-blue">{item.pedido.numero || "s/n"}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3 pt-3 border-t border-sky-100">
              <Link
                href={`/compras/painel-ops/${item.opId}`}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-100 text-torg-blue rounded-lg hover:bg-sky-200 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} /> Ver Mapa
              </Link>
              {status !== "ENTREGUE" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegistrarEntrega(); }}
                  disabled={registrando}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium disabled:opacity-50"
                >
                  {registrando ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Marcar entregue
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function KPICard({ label, value, Icon, color, highlight = false, onClick, active = false }) {
  const bgClass = highlight
    ? `bg-red-50 border-red-300 ring-1 ring-red-200`
    : active
    ? `bg-white border-torg-blue ring-1 ring-torg-blue/30`
    : "bg-white border-gray-100 hover:border-gray-200";

  return (
    <div
      onClick={onClick}
      className={`rounded-xl shadow-sm border p-3 flex items-center gap-2.5 cursor-pointer transition-all ${bgClass}`}
    >
      <div className={`p-2 rounded-lg bg-${color}-100`}>
        <Icon size={16} className={`text-${color}-600`} />
      </div>
      <div>
        <p className="text-[11px] text-torg-gray leading-tight">{label}</p>
        <p className={`text-lg font-extrabold tabular-nums ${highlight ? `text-${color}-700` : "text-torg-dark"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
