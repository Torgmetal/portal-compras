"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, Package, Clock, AlertTriangle,
  CheckCircle2, CalendarDays, Truck, Filter, RefreshCw,
  ChevronDown, ChevronRight, ExternalLink, List, LayoutGrid,
  FileText, MapPin, Wrench, Mail, Send, X,
  CalendarClock, History,
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

const STATUS_CFG = {
  ATRASADO:  { label: "Atrasado",     Icon: AlertTriangle, cor: "red",     badge: "bg-red-100 text-red-700",         dot: "bg-red-500",     border: "border-red-300",   headerBg: "bg-red-50" },
  PROXIMO:   { label: "Próx. 7 dias", Icon: Clock,         cor: "amber",   badge: "bg-amber-100 text-amber-700",     dot: "bg-amber-500",   border: "border-amber-300", headerBg: "bg-amber-50" },
  NO_PRAZO:  { label: "No prazo",     Icon: CalendarDays,  cor: "sky",     badge: "bg-sky-100 text-sky-700",         dot: "bg-torg-blue",   border: "border-sky-300",   headerBg: "bg-sky-50" },
  SEM_PRAZO: { label: "Sem prazo",    Icon: Package,       cor: "gray",    badge: "bg-gray-100 text-gray-600",       dot: "bg-gray-400",    border: "border-gray-300",  headerBg: "bg-gray-50" },
  ENTREGUE:  { label: "Entregue",     Icon: CheckCircle2,  cor: "emerald", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-300", headerBg: "bg-emerald-50" },
};

const KANBAN_ORDER = ["ATRASADO", "PROXIMO", "NO_PRAZO", "SEM_PRAZO", "ENTREGUE"];

export default function CronogramaClient() {
  const [pedidosTodos, setPedidosTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [abaEntregas, setAbaEntregas] = useState("ENGENHARIA"); // "ENGENHARIA" | "INTERNA"
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroOP, setFiltroOP] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [registrando, setRegistrando] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [visao, setVisao] = useState("kanban"); // "kanban" | "tabela"
  const [modalCobrar, setModalCobrar] = useState(null); // pedido obj ou null
  const [modalPrazo, setModalPrazo] = useState(null); // pedido obj ou null
  const [ajustandoOmie, setAjustandoOmie] = useState(null); // pedidoId durante ajuste

  // Filtro por tipo de RM — separa entregas de materiais (OP) vs consumíveis
  const pedidos = useMemo(
    () => pedidosTodos.filter((p) => (p.tipoRM || "ENGENHARIA") === abaEntregas),
    [pedidosTodos, abaEntregas]
  );

  // Contagem por aba pra badges
  const countPorAba = useMemo(() => {
    const eng = pedidosTodos.filter((p) => (p.tipoRM || "ENGENHARIA") === "ENGENHARIA");
    const int = pedidosTodos.filter((p) => (p.tipoRM || "ENGENHARIA") === "INTERNA");
    return {
      ENGENHARIA: eng.length,
      ENGENHARIA_ATRASADO: eng.filter((p) => p.statusEntrega === "ATRASADO").length,
      INTERNA: int.length,
      INTERNA_ATRASADO: int.filter((p) => p.statusEntrega === "ATRASADO").length,
    };
  }, [pedidosTodos]);

  const fetchData = async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/compras/entregas");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setPedidosTodos(data.data || []);
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

  // Filtros
  const pedidosFiltrados = useMemo(() => {
    let lista = pedidos;
    if (filtroFornecedor) lista = lista.filter((p) => p.fornecedor === filtroFornecedor);
    if (filtroOP) lista = lista.filter((p) => p.opId === filtroOP);
    if (filtroStatus) lista = lista.filter((p) => p.statusEntrega === filtroStatus);
    return lista;
  }, [pedidos, filtroFornecedor, filtroOP, filtroStatus]);

  // Agrupados por status (pra kanban — ignora filtroStatus)
  const gruposKanban = useMemo(() => {
    let base = pedidos;
    if (filtroFornecedor) base = base.filter((p) => p.fornecedor === filtroFornecedor);
    if (filtroOP) base = base.filter((p) => p.opId === filtroOP);
    const map = {};
    for (const key of KANBAN_ORDER) map[key] = [];
    for (const p of base) {
      const key = p.statusEntrega || "SEM_PRAZO";
      if (map[key]) map[key].push(p);
      else map.SEM_PRAZO.push(p);
    }
    return map;
  }, [pedidos, filtroFornecedor, filtroOP]);

  // Listas únicas pra filtros
  const fornecedores = useMemo(() => {
    return [...new Set(pedidos.map((p) => p.fornecedor))].sort();
  }, [pedidos]);

  const ops = useMemo(() => {
    const set = new Map();
    for (const p of pedidos) {
      if (p.opId) set.set(p.opId, `OP ${p.opNumero} — ${p.opCliente || ""}`);
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [pedidos]);

  // KPIs
  const kpis = useMemo(() => {
    const base = pedidos.filter((p) => {
      if (filtroFornecedor && p.fornecedor !== filtroFornecedor) return false;
      if (filtroOP && p.opId !== filtroOP) return false;
      return true;
    });
    const porStatus = {};
    for (const key of KANBAN_ORDER) porStatus[key] = 0;
    let valorAtrasado = 0;
    for (const p of base) {
      const k = p.statusEntrega || "SEM_PRAZO";
      porStatus[k] = (porStatus[k] || 0) + 1;
      if (k === "ATRASADO") valorAtrasado += p.total || 0;
    }
    return { total: base.length, ...porStatus, valorAtrasado };
  }, [pedidos, filtroFornecedor, filtroOP]);

  const registrarEntrega = async (pedidoId) => {
    setRegistrando(pedidoId);
    try {
      const res = await fetch("/api/compras/entregas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      setPedidosTodos((prev) => prev.map((p) =>
        p.id === pedidoId
          ? { ...p, statusEntrega: "ENTREGUE", dataEntregaReal: new Date().toISOString() }
          : p
      ));
      setExpandido(null);
    } catch (e) {
      alert("Falha: " + e.message);
    } finally {
      setRegistrando(null);
    }
  };

  const ajustarOmie = async (pedido) => {
    const confirmMsg = `Ajustar quantidades do pedido #${pedido.numero} no Omie para igualar ao recebimento real da NF?\n\nIsso altera o peso/quantidade pedida para o peso real recebido, permitindo fechar o pedido no Omie.`;
    if (!confirm(confirmMsg)) return;

    setAjustandoOmie(pedido.id);
    try {
      const res = await fetch("/api/compras/entregas/ajustar-omie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: pedido.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao ajustar");

      if (data.ajustados === 0) {
        alert(data.mensagem || "Nenhum item precisou de ajuste.");
      } else {
        const resumo = data.ajustes
          .map((a) => `• ${a.descricao}: ${a.qtdOriginal.toFixed(2)} → ${a.qtdRecebida.toFixed(2)} ${a.unidade}`)
          .join("\n");
        alert(`Pedido #${pedido.numero} ajustado no Omie!\n\n${data.ajustados} item(ns):\n${resumo}`);
      }
    } catch (e) {
      alert("Falha ao ajustar: " + e.message);
    } finally {
      setAjustandoOmie(null);
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

  const trocarAba = (aba) => {
    setAbaEntregas(aba);
    setFiltroFornecedor("");
    setFiltroOP("");
    setFiltroStatus("");
    setExpandido(null);
  };

  return (
    <div className="space-y-5">
      {/* Abas: Materiais vs Consumíveis */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => trocarAba("ENGENHARIA")}
          className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
            abaEntregas === "ENGENHARIA"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark hover:border-gray-300"
          }`}>
          <Truck size={15} /> Materiais (OP)
          {countPorAba.ENGENHARIA > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-torg-gray">
              {countPorAba.ENGENHARIA}
            </span>
          )}
          {countPorAba.ENGENHARIA_ATRASADO > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
              {countPorAba.ENGENHARIA_ATRASADO} atraso
            </span>
          )}
        </button>
        <button onClick={() => trocarAba("INTERNA")}
          className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
            abaEntregas === "INTERNA"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark hover:border-gray-300"
          }`}>
          <Wrench size={15} /> Consumíveis
          {countPorAba.INTERNA > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-torg-gray">
              {countPorAba.INTERNA}
            </span>
          )}
          {countPorAba.INTERNA_ATRASADO > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
              {countPorAba.INTERNA_ATRASADO} atraso
            </span>
          )}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KANBAN_ORDER.map((key) => {
          const cfg = STATUS_CFG[key];
          const count = kpis[key] || 0;
          const isActive = filtroStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFiltroStatus(isActive ? "" : key)}
              className={`rounded-xl shadow-sm border p-3 flex items-center gap-2.5 transition-all text-left ${
                isActive
                  ? "border-torg-blue ring-1 ring-torg-blue/30 bg-white"
                  : key === "ATRASADO" && count > 0
                  ? "bg-red-50 border-red-300 ring-1 ring-red-200"
                  : "bg-white border-gray-100 hover:border-gray-200"
              }`}
            >
              <div className={`p-2 rounded-lg bg-${cfg.cor}-100`}>
                <cfg.Icon size={16} className={`text-${cfg.cor}-600`} />
              </div>
              <div>
                <p className="text-[11px] text-torg-gray leading-tight">{cfg.label}</p>
                <p className={`text-lg font-extrabold tabular-nums ${
                  key === "ATRASADO" && count > 0 ? "text-red-700" : "text-torg-dark"
                }`}>{count}</p>
              </div>
            </button>
          );
        })}
        <button
          onClick={() => setFiltroStatus("")}
          className={`rounded-xl shadow-sm border p-3 flex items-center gap-2.5 transition-all text-left ${
            !filtroStatus
              ? "border-torg-blue ring-1 ring-torg-blue/30 bg-white"
              : "bg-white border-gray-100 hover:border-gray-200"
          }`}
        >
          <div className="p-2 rounded-lg bg-torg-blue-50">
            <Package size={16} className="text-torg-blue" />
          </div>
          <div>
            <p className="text-[11px] text-torg-gray leading-tight">Total</p>
            <p className="text-lg font-extrabold tabular-nums text-torg-dark">{kpis.total}</p>
          </div>
        </button>
      </div>

      {kpis.valorAtrasado > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-red-800">
            <strong>{kpis.ATRASADO} pedido{kpis.ATRASADO !== 1 ? "s" : ""}</strong> em atraso.
          </p>
        </div>
      )}

      {/* Filtros + toggle visao */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-torg-gray">
            <Filter size={16} />
            <span className="font-medium">Filtros:</span>
          </div>
          {abaEntregas === "ENGENHARIA" && (
            <select
              value={filtroOP}
              onChange={(e) => setFiltroOP(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue"
            >
              <option value="">Todas as OPs</option>
              {ops.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          )}
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
          {(filtroOP || filtroFornecedor || filtroStatus) && (
            <button
              onClick={() => { setFiltroOP(""); setFiltroFornecedor(""); setFiltroStatus(""); }}
              className="text-xs text-torg-gray hover:text-red-600 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle Kanban / Tabela */}
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setVisao("kanban")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                visao === "kanban"
                  ? "bg-torg-blue text-white font-medium"
                  : "bg-white text-torg-gray hover:bg-gray-50"
              }`}
              title="Visão Kanban"
            >
              <LayoutGrid size={14} /> Kanban
            </button>
            <button
              onClick={() => setVisao("tabela")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                visao === "tabela"
                  ? "bg-torg-blue text-white font-medium"
                  : "bg-white text-torg-gray hover:bg-gray-50"
              }`}
              title="Visão Lista"
            >
              <List size={14} /> Lista
            </button>
          </div>
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
              <><CheckCircle2 size={16} /> {syncResult.sincronizados} pedido{syncResult.sincronizados !== 1 ? "s" : ""} atualizado{syncResult.sincronizados !== 1 ? "s" : ""}</>
            ) : (
              <><Package size={16} /> Nenhuma entrega nova detectada ({syncResult.total} pedidos consultados)</>
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
      )}

      {/* Conteúdo */}
      {pedidos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Truck size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhum pedido de compra encontrado</p>
          <p className="text-sm text-gray-400 mt-1">
            Gere pedidos a partir do Mapa de Cotação pra acompanhar as entregas aqui.
          </p>
        </div>
      ) : visao === "kanban" ? (
        <KanbanView
          grupos={gruposKanban}
          filtroStatus={filtroStatus}
          expandido={expandido}
          setExpandido={setExpandido}
          registrarEntrega={registrarEntrega}
          registrando={registrando}
          onCobrar={setModalCobrar}
          onAtualizarPrazo={setModalPrazo}
          onAjustarOmie={ajustarOmie}
          ajustandoOmie={ajustandoOmie}
        />
      ) : (
        <TabelaView
          pedidos={pedidosFiltrados}
          expandido={expandido}
          setExpandido={setExpandido}
          registrarEntrega={registrarEntrega}
          registrando={registrando}
          onCobrar={setModalCobrar}
          onAtualizarPrazo={setModalPrazo}
        />
      )}

      {/* Modal de cobrança */}
      {modalCobrar && (
        <ModalCobrarFornecedor
          pedido={modalCobrar}
          onClose={() => setModalCobrar(null)}
        />
      )}

      {/* Modal de atualizar prazo */}
      {modalPrazo && (
        <ModalAtualizarPrazo
          pedido={modalPrazo}
          onClose={() => setModalPrazo(null)}
          onSalvo={fetchData}
        />
      )}
    </div>
  );
}

/* ─── Kanban View ────────────────────────────────────────────────── */

function KanbanView({ grupos, filtroStatus, expandido, setExpandido, registrarEntrega, registrando, onCobrar, onAtualizarPrazo, onAjustarOmie, ajustandoOmie }) {
  const colunas = filtroStatus
    ? KANBAN_ORDER.filter((k) => k === filtroStatus)
    : KANBAN_ORDER;

  return (
    <div className={`grid gap-4 ${
      colunas.length === 1
        ? "grid-cols-1 max-w-2xl"
        : colunas.length <= 3
        ? `grid-cols-1 md:grid-cols-${colunas.length}`
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    }`}>
      {colunas.map((key) => {
        const cfg = STATUS_CFG[key];
        const lista = grupos[key] || [];
        return (
          <div key={key} className={`rounded-xl border ${cfg.border} bg-white flex flex-col min-h-[200px]`}>
            {/* Cabeçalho da coluna */}
            <div className={`px-3 py-2.5 ${cfg.headerBg} rounded-t-xl border-b ${cfg.border} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-sm font-semibold text-torg-dark">{cfg.label}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {lista.length}
              </span>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[600px]">
              {lista.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Nenhum pedido</p>
              ) : (
                lista.map((p) => (
                  <PedidoCard
                    key={p.id}
                    pedido={p}
                    cfg={cfg}
                    isExpanded={expandido === p.id}
                    onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
                    onRegistrarEntrega={() => registrarEntrega(p.id)}
                    registrando={registrando === p.id}
                    onCobrar={onCobrar}
                    onAtualizarPrazo={onAtualizarPrazo}
                    onAjustarOmie={onAjustarOmie}
                    ajustandoOmie={ajustandoOmie === p.id}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Pedido Card (Kanban) ───────────────────────────────────────── */

function PedidoCard({ pedido, cfg, isExpanded, onToggle, onRegistrarEntrega, registrando, onCobrar, onAtualizarPrazo, onAjustarOmie, ajustandoOmie }) {
  const p = pedido;
  const dias = diasAte(p.prazoEntregaPrevisto);
  const diasLabel = dias !== null
    ? dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? "Hoje" : `em ${dias}d`
    : null;

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm overflow-hidden ${
        isExpanded ? "ring-1 ring-torg-blue/30 border-torg-blue-200 bg-sky-50/30" : "border-gray-200 bg-white"
      }`}
      onClick={onToggle}
    >
      {/* Header: número + valor */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono font-bold text-torg-blue">
          #{p.numero}
        </span>
        <span className="text-xs font-semibold text-torg-dark tabular-nums">
          {fmtMoeda(p.total)}
        </span>
      </div>

      {/* Fornecedor */}
      <p className="text-sm font-medium text-torg-dark leading-snug truncate" title={p.fornecedor}>
        {p.fornecedor}
      </p>

      {/* OP + prazo */}
      <div className="flex items-center justify-between mt-2 text-[11px] text-torg-gray">
        <span className="truncate">
          {p.opNumero ? `OP ${p.opNumero}` : "Sem OP"}
          {p.opCliente ? ` · ${p.opCliente}` : ""}
        </span>
        {p.qtdItens > 0 && (
          <span className="text-gray-400 shrink-0 ml-2">{p.qtdItens} ite{p.qtdItens !== 1 ? "ns" : "m"}</span>
        )}
      </div>

      {/* Prazo */}
      {p.prazoEntregaPrevisto && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px]">
          <CalendarDays size={11} className="text-torg-gray" />
          <span className="text-torg-gray">{fmtDataCurta(p.prazoEntregaPrevisto)}</span>
          {diasLabel && (
            <span className={`font-medium ${
              p.statusEntrega === "ATRASADO" ? "text-red-600" :
              p.statusEntrega === "PROXIMO" ? "text-amber-600" :
              "text-torg-gray"
            }`}>
              ({diasLabel})
            </span>
          )}
        </div>
      )}

      {/* NF de entrada — aparece direto no card quando tem recebimento */}
      {p.temRecebimento && (() => {
        const nfs = [...new Set(p.recebimentos.filter(r => r.nfNumero).map(r => r.nfNumero))];
        return nfs.length > 0 ? (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]">
            <FileText size={11} className="text-emerald-600" />
            <span className="text-emerald-700 font-medium">
              NF {nfs.join(", ")}
            </span>
          </div>
        ) : null;
      })()}

      {/* Data de entrega — quando já entregue */}
      {p.dataEntregaReal && (
        <div className="flex items-center gap-1.5 mt-1 text-[11px]">
          <CheckCircle2 size={11} className="text-emerald-500" />
          <span className="text-emerald-700 font-medium">Entregue {fmtDataCurta(p.dataEntregaReal)}</span>
        </div>
      )}

      {/* Badges */}
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {p.faturamentoDireto && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded font-medium">
            FD
          </span>
        )}
        {p.foiPostergado && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">
            Postergado
          </span>
        )}
      </div>

      {/* Expandido: detalhes */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Itens do pedido */}
          {p.itens.length > 0 && (
            <div className="bg-gray-50 rounded-md px-2.5 py-2">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1.5 font-semibold">Itens</p>
              <div className="space-y-0.5">
                {p.itens.slice(0, 5).map((it, i) => (
                  <div key={i} className="flex items-baseline gap-1 text-xs min-w-0">
                    <span className="truncate text-torg-dark flex-1 min-w-0" title={it.descricao}>{it.descricao}</span>
                    <span className="text-torg-gray tabular-nums whitespace-nowrap shrink-0">
                      {it.qtd != null ? `${Number(it.qtd).toFixed(it.unidade === "KG" ? 1 : 0)} ${it.unidade || ""}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              {p.itens.length > 5 && (
                <p className="text-[10px] text-gray-400 mt-1">+ {p.itens.length - 5} itens</p>
              )}
            </div>
          )}

          {/* Recebimentos */}
          {p.temRecebimento && (
            <div className="bg-emerald-50 rounded-md px-2.5 py-2">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide mb-1.5 font-semibold">Recebimentos</p>
              <div className="space-y-0.5">
                {p.recebimentos.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs min-w-0">
                    <span className="text-torg-dark whitespace-nowrap">{fmtDataCurta(r.dataRecebimento)}</span>
                    <span className="text-torg-gray tabular-nums whitespace-nowrap">{r.qtdRecebida}</span>
                    {r.nfNumero && (
                      <span className="text-emerald-700 font-mono text-[10px] font-medium whitespace-nowrap">NF {r.nfNumero}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline de prazos */}
          {p.prazoHistorico?.length > 0 && (
            <TimelinePrazos historico={p.prazoHistorico} prazoOriginal={p.prazoOriginal} />
          )}

          {/* Datas */}
          <div className="flex gap-4 text-[11px]">
            <div>
              <span className="text-torg-gray">Criado </span>
              <span className="text-torg-dark font-medium">{fmtDataCurta(p.createdAt)}</span>
            </div>
            {p.dataEntregaReal && (
              <div>
                <span className="text-torg-gray">Entregue </span>
                <span className="text-emerald-700 font-medium">{fmtDataCurta(p.dataEntregaReal)}</span>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-1 flex-wrap">
            {p.opId && (
              <Link
                href={`/compras/painel-ops/${p.opId}`}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-sky-100 text-torg-blue rounded-lg hover:bg-sky-200 font-medium"
              >
                <ExternalLink size={10} /> Ver OP
              </Link>
            )}
            {p.statusEntrega !== "ENTREGUE" && (
              <button
                onClick={() => onAtualizarPrazo(p)}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
              >
                <CalendarClock size={10} /> Prazo
              </button>
            )}
            {p.statusEntrega !== "ENTREGUE" && (
              <button
                onClick={onRegistrarEntrega}
                disabled={registrando}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium disabled:opacity-50"
              >
                {registrando ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                Entregue
              </button>
            )}
            {p.statusEntrega === "ATRASADO" && p.fornecedorEmail && (
              <button
                onClick={() => onCobrar(p)}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
              >
                <Mail size={10} /> Cobrar
              </button>
            )}
            {p.temRecebimento && p.codigoPedido && (
              <button
                onClick={() => onAjustarOmie(p)}
                disabled={ajustandoOmie}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium disabled:opacity-50"
                title="Ajustar quantidades do pedido no Omie para igualar ao recebimento real (NF)"
              >
                {ajustandoOmie ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />}
                Ajustar Omie
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tabela View ────────────────────────────────────────────────── */

function TabelaView({ pedidos, expandido, setExpandido, registrarEntrega, registrando, onCobrar, onAtualizarPrazo }) {
  if (pedidos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <Package size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="text-torg-gray">Nenhum pedido encontrado com esses filtros</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs text-torg-gray">
          {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/60 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[110px]">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[90px]">Nº Pedido</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider">Fornecedor</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[120px]">OP</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[100px]">Prazo</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[60px]">Itens</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[110px]">Valor</th>
              <th className="px-2 py-2.5 w-[30px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pedidos.map((p) => {
              const cfg = STATUS_CFG[p.statusEntrega || "SEM_PRAZO"];
              const dias = diasAte(p.prazoEntregaPrevisto);
              const diasLabel = dias !== null
                ? dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? "Hoje" : `${dias}d`
                : null;
              const isExp = expandido === p.id;

              return (
                <TabelaRow
                  key={p.id}
                  pedido={p}
                  cfg={cfg}
                  dias={dias}
                  diasLabel={diasLabel}
                  isExpanded={isExp}
                  onToggle={() => setExpandido(isExp ? null : p.id)}
                  onRegistrarEntrega={() => registrarEntrega(p.id)}
                  registrando={registrando === p.id}
                  onCobrar={onCobrar}
                  onAtualizarPrazo={onAtualizarPrazo}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaRow({ pedido: p, cfg, dias, diasLabel, isExpanded, onToggle, onRegistrarEntrega, registrando, onCobrar, onAtualizarPrazo }) {
  const diasColor = p.statusEntrega === "ATRASADO" ? "text-red-600 font-semibold"
    : p.statusEntrega === "PROXIMO" ? "text-amber-600 font-medium"
    : "text-torg-gray";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${
          isExpanded ? "bg-sky-50/50" : "hover:bg-gray-50/80"
        } ${p.statusEntrega === "ENTREGUE" ? "opacity-60" : ""}`}
      >
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="font-mono font-semibold text-torg-blue text-xs">
            #{p.numero}
          </span>
          {p.faturamentoDireto && (
            <span className="ml-1 text-[9px] px-1 py-0.5 bg-purple-50 text-purple-600 rounded font-medium">FD</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm font-medium text-torg-dark truncate block max-w-[250px]" title={p.fornecedor}>
            {p.fornecedor}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {p.opNumero ? (
            <div>
              <span className="text-xs font-mono text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded">{p.opNumero}</span>
              {p.opCliente && <p className="text-[10px] text-torg-gray mt-0.5 truncate max-w-[100px]">{p.opCliente}</p>}
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {p.prazoEntregaPrevisto ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-torg-dark tabular-nums">{fmtDataCurta(p.prazoEntregaPrevisto)}</span>
                {p.foiPostergado && (
                  <span className="text-[9px] px-1 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Post.</span>
                )}
              </div>
              {diasLabel && <span className={`text-[10px] tabular-nums ${diasColor}`}>{diasLabel}</span>}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Sem prazo</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className="text-xs text-torg-gray tabular-nums">{p.qtdItens}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className="text-sm font-semibold text-torg-dark tabular-nums">{fmtMoeda(p.total)}</span>
        </td>
        <td className="px-2 py-2.5 text-center">
          {isExpanded
            ? <ChevronDown size={14} className="text-torg-blue" />
            : <ChevronRight size={14} className="text-gray-400" />
          }
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-sky-50/30">
          <td colSpan={8} className="px-4 py-3">
            {/* Itens do pedido */}
            {p.itens.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1.5 font-semibold">Itens do pedido</p>
                <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-3 py-1.5 text-left text-torg-gray font-medium">Descrição</th>
                        <th className="px-3 py-1.5 text-right text-torg-gray font-medium w-[80px]">Qtd</th>
                        <th className="px-3 py-1.5 text-right text-torg-gray font-medium w-[90px]">Preço unit.</th>
                        <th className="px-3 py-1.5 text-left text-torg-gray font-medium w-[90px]">Prazo item</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {p.itens.map((it, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-torg-dark">{it.descricao}</td>
                          <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">
                            {it.qtd != null ? `${Number(it.qtd).toFixed(it.unidade === "KG" ? 1 : 0)} ${it.unidade || ""}` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">
                            {it.precoUnit ? fmtMoeda(it.precoUnit) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-torg-gray">
                            {it.prazoEntrega ? fmtDataCurta(it.prazoEntrega) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recebimentos */}
            {p.temRecebimento && (
              <div className="mb-3">
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1 font-semibold">Recebimentos</p>
                {p.recebimentos.map((r) => (
                  <div key={r.id} className="text-xs flex items-center gap-2 text-torg-dark py-0.5">
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    <span>{fmtData(r.dataRecebimento)}</span>
                    {r.nfNumero && <span className="text-torg-gray font-mono">NF {r.nfNumero}</span>}
                    <span className="text-torg-gray tabular-nums">{r.qtdRecebida} un</span>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline de prazos */}
            {p.prazoHistorico?.length > 0 && (
              <div className="mb-3">
                <TimelinePrazos historico={p.prazoHistorico} prazoOriginal={p.prazoOriginal} />
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-2 border-t border-sky-100 flex-wrap">
              {p.opId && (
                <Link
                  href={`/compras/painel-ops/${p.opId}`}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-100 text-torg-blue rounded-lg hover:bg-sky-200 font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} /> Ver OP
                </Link>
              )}
              {p.statusEntrega !== "ENTREGUE" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAtualizarPrazo(p); }}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
                >
                  <CalendarClock size={12} /> Atualizar prazo
                </button>
              )}
              {p.statusEntrega !== "ENTREGUE" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegistrarEntrega(); }}
                  disabled={registrando}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium disabled:opacity-50"
                >
                  {registrando ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Marcar entregue
                </button>
              )}
              {p.statusEntrega === "ATRASADO" && p.fornecedorEmail && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCobrar(p); }}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                >
                  <Mail size={12} /> Cobrar fornecedor
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Modal: Cobrar Fornecedor ──────────────────────────────────── */

function ModalCobrarFornecedor({ pedido, onClose }) {
  const p = pedido;
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const diasAtraso = p.prazoEntregaPrevisto
    ? Math.max(0, Math.ceil((Date.now() - new Date(p.prazoEntregaPrevisto).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const totalRecebido = (p.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
  const temParcial = totalRecebido > 0;

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/compras/entregas/cobrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      setResultado({
        ok: true, email: data.emailEnviadoPara,
        pendentes: data.itensPendentes, entregues: data.itensEntregues,
      });
    } catch (e) {
      setResultado({ ok: false, error: e.message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-100">
              <Mail size={18} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-torg-dark">Cobrar fornecedor</h3>
              <p className="text-xs text-torg-gray">
                {temParcial ? "Entrega parcial — cobrar itens pendentes" : "Enviar email de cobranca de entrega"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Info do pedido */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-torg-gray">Pedido</span>
              <span className="font-mono font-bold text-torg-blue">#{p.numero}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-torg-gray">Fornecedor</span>
              <span className="font-medium text-torg-dark">{p.fornecedor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-torg-gray">Email</span>
              <span className="text-torg-dark text-xs">{p.fornecedorEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-torg-gray">Prazo previsto</span>
              <span className="font-medium text-torg-dark">{fmtData(p.prazoEntregaPrevisto)}</span>
            </div>
            {diasAtraso > 0 && (
              <div className="flex justify-between">
                <span className="text-torg-gray">Dias em atraso</span>
                <span className="font-bold text-red-600">{diasAtraso} dia{diasAtraso !== 1 ? "s" : ""}</span>
              </div>
            )}
            {p.opNumero && (
              <div className="flex justify-between">
                <span className="text-torg-gray">OP</span>
                <span className="text-torg-dark">{p.opNumero}{p.opCliente ? ` — ${p.opCliente}` : ""}</span>
              </div>
            )}
          </div>

          {/* Preview da mensagem padrao */}
          <div>
            <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-2">
              Mensagem que sera enviada
            </p>
            <div className="bg-white border border-gray-200 rounded-lg p-4 text-xs text-torg-dark leading-relaxed space-y-2">
              <p>Prezado(a) <strong>{p.fornecedor}</strong>,</p>
              {temParcial ? (
                <p>
                  Gostaríamos de verificar o andamento do Pedido de Compra <strong>#{p.numero}</strong>.
                  Parte dos itens ja foi entregue, porem {p.itens?.length || "alguns"} ite{(p.itens?.length || 2) !== 1 ? "ns" : "m"} encontra{(p.itens?.length || 2) !== 1 ? "m" : ""}-se pendente{(p.itens?.length || 2) !== 1 ? "s" : ""}
                  {diasAtraso > 0
                    ? <> e o prazo acordado (<strong>{fmtData(p.prazoEntregaPrevisto)}</strong>) foi ultrapassado em <strong>{diasAtraso} dia{diasAtraso !== 1 ? "s" : ""}</strong></>
                    : <> com prazo previsto para <strong>{fmtData(p.prazoEntregaPrevisto)}</strong></>}.
                </p>
              ) : (
                <p>
                  Gostaríamos de verificar o andamento do Pedido de Compra <strong>#{p.numero}</strong>,
                  cujo prazo de entrega estava previsto para <strong>{fmtData(p.prazoEntregaPrevisto)}</strong>
                  {diasAtraso > 0 && <> e encontra-se com <strong>{diasAtraso} dia{diasAtraso !== 1 ? "s" : ""}</strong> alem do prazo acordado</>}.
                </p>
              )}
              <p>Pedimos, por gentileza, que nos envie uma previsao atualizada de entrega ou a confirmacao de despacho dos materiais pendentes.</p>

              {/* Itens inline */}
              {p.itens?.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold text-red-700 mb-1">Itens pendentes de entrega:</p>
                  <div className="border border-gray-100 rounded overflow-hidden max-h-32 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <tbody className="divide-y divide-gray-50">
                        {p.itens.map((it, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1 text-torg-dark">{it.descricao}</td>
                            <td className="px-2 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">
                              {it.qtd != null ? `${Number(it.qtd).toFixed(it.unidade === "KG" ? 1 : 0)} ${it.unidade || ""}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {temParcial && (
                    <p className="text-[10px] text-torg-gray mt-1 italic">
                      O saldo pendente por item sera descontado automaticamente com base nos recebimentos.
                    </p>
                  )}
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-3 text-center mt-2">
                <p className="text-[10px] text-torg-gray mb-1">O fornecedor recebera um link para informar a nova data:</p>
                <span className="inline-block text-[10px] bg-torg-blue text-white px-3 py-1 rounded font-medium">
                  Informar previsao de entrega
                </span>
              </div>
              <p className="text-torg-gray pt-1">Voce tambem pode responder este email diretamente.</p>
              <p className="text-torg-gray">Atenciosamente, Equipe de Compras — Torg Metal</p>
            </div>
          </div>

          {/* Resultado */}
          {resultado && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              resultado.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {resultado.ok ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>Email enviado para <strong>{resultado.email}</strong></span>
                  </div>
                  {(resultado.pendentes > 0 || resultado.entregues > 0) && (
                    <p className="text-xs text-emerald-700 ml-6">
                      {resultado.pendentes} ite{resultado.pendentes !== 1 ? "ns" : "m"} pendente{resultado.pendentes !== 1 ? "s" : ""}
                      {resultado.entregues > 0 && ` · ${resultado.entregues} ja entregue${resultado.entregues !== 1 ? "s" : ""}`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} /> {resultado.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100"
          >
            {resultado?.ok ? "Fechar" : "Cancelar"}
          </button>
          {!resultado?.ok && (
            <button
              onClick={enviar}
              disabled={enviando}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {enviando ? (
                <><Loader2 size={14} className="animate-spin" /> Enviando...</>
              ) : (
                <><Send size={14} /> Enviar cobranca</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Timeline de Prazos ───────────────────────────────────────── */

function TimelinePrazos({ historico, prazoOriginal }) {
  if (!historico || historico.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-2 font-semibold flex items-center gap-1">
        <History size={10} /> Historico de prazos
      </p>
      <div className="relative pl-4 space-y-2">
        {/* Linha vertical */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />

        {/* Prazo original */}
        {prazoOriginal && (
          <div className="relative flex items-start gap-2">
            <div className="absolute left-[-13px] top-1 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white" />
            <div className="text-xs">
              <span className="text-torg-gray">Prazo original:</span>{" "}
              <span className="font-medium text-torg-dark">{fmtData(prazoOriginal)}</span>
            </div>
          </div>
        )}

        {/* Cada postergacao */}
        {historico.map((h, i) => (
          <div key={h.id} className="relative flex items-start gap-2">
            <div className={`absolute left-[-13px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
              i === historico.length - 1 ? "bg-amber-500" : "bg-amber-300"
            }`} />
            <div className="text-xs space-y-0.5">
              <div>
                <span className="text-torg-gray">Novo prazo:</span>{" "}
                <span className="font-medium text-amber-700">{fmtData(h.prazoNovo)}</span>
                <span className="text-[10px] text-gray-400 ml-2">
                  em {fmtData(h.criadoEm)} por {h.alteradoPor?.name || "—"}
                </span>
              </div>
              {h.motivo && (
                <p className="text-[10px] text-torg-gray italic">{h.motivo}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Modal: Atualizar Prazo ───────────────────────────────────── */

function ModalAtualizarPrazo({ pedido, onClose, onSalvo }) {
  const p = pedido;
  const [novoPrazo, setNovoPrazo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const salvar = async () => {
    if (!novoPrazo) { setErro("Selecione a nova data"); return; }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/compras/entregas/prazo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: p.id, novoPrazo, motivo: motivo.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      setSucesso(true);
      onSalvo?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100">
              <CalendarClock size={18} className="text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-torg-dark">Atualizar prazo de entrega</h3>
              <p className="text-xs text-torg-gray">Pedido #{p.numero} — {p.fornecedor}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Prazo atual */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-torg-gray">Prazo atual</span>
              <span className="font-medium text-torg-dark">
                {p.prazoEntregaPrevisto ? fmtData(p.prazoEntregaPrevisto) : "Nao definido"}
              </span>
            </div>
            {p.prazoOriginal && (
              <div className="flex justify-between mt-1">
                <span className="text-torg-gray">Prazo original</span>
                <span className="text-xs text-gray-500">{fmtData(p.prazoOriginal)}</span>
              </div>
            )}
            {p.prazoHistorico?.length > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-torg-gray">Postergacoes</span>
                <span className="text-xs text-amber-700 font-medium">{p.prazoHistorico.length}x</span>
              </div>
            )}
          </div>

          {/* Timeline existente */}
          {p.prazoHistorico?.length > 0 && (
            <TimelinePrazos historico={p.prazoHistorico} prazoOriginal={p.prazoOriginal} />
          )}

          {/* Nova data */}
          {!sucesso && (
            <>
              <div>
                <label className="block text-xs font-semibold text-torg-gray uppercase tracking-wide mb-1">
                  Novo prazo de entrega
                </label>
                <input
                  type="date"
                  value={novoPrazo}
                  onChange={(e) => setNovoPrazo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-torg-gray uppercase tracking-wide mb-1">
                  Motivo / observacao <span className="font-normal">(opcional)</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: Fornecedor informou atraso na producao"
                  rows={2}
                  maxLength={500}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
                />
              </div>
            </>
          )}

          {/* Erro */}
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={14} /> {erro}
            </div>
          )}

          {/* Sucesso */}
          {sucesso && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Prazo atualizado com sucesso!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100"
          >
            {sucesso ? "Fechar" : "Cancelar"}
          </button>
          {!sucesso && (
            <button
              onClick={salvar}
              disabled={salvando || !novoPrazo}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {salvando ? (
                <><Loader2 size={14} className="animate-spin" /> Salvando...</>
              ) : (
                <><CalendarClock size={14} /> Salvar novo prazo</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
