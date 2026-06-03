"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  CheckCircle2, Truck, Clock, Archive, XCircle, ShoppingCart,
  Filter, ChevronDown, ChevronUp, Search,
} from "lucide-react";

const STATUS_CONFIG = {
  RECEBIDO:     { label: "Recebido",            icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", barColor: "bg-emerald-500" },
  COMPRADO:     { label: "Aguardando entrega",   icon: Truck,        color: "text-torg-blue",   bg: "bg-torg-blue-50", border: "border-torg-blue/20", barColor: "bg-torg-blue" },
  ESTOQUE:      { label: "Estoque",              icon: Archive,      color: "text-violet-700",  bg: "bg-violet-50",   border: "border-violet-200",  barColor: "bg-violet-500" },
  EM_COTACAO:   { label: "Em cotação",           icon: Clock,        color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   barColor: "bg-amber-400" },
  NAO_COMPRADO: { label: "Não comprado",         icon: ShoppingCart,  color: "text-red-600",     bg: "bg-red-50",      border: "border-red-200",     barColor: "bg-gray-300" },
  CANCELADO:    { label: "Cancelado",            icon: XCircle,      color: "text-gray-400",    bg: "bg-gray-50",     border: "border-gray-200",    barColor: "bg-gray-300" },
};

export default function MateriaisOPPageClient({ ops }) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [expandidos, setExpandidos] = useState(new Set(ops.slice(0, 3).map((op) => op.id)));

  const toggleExpand = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Resumo global
  const globalResumo = { RECEBIDO: 0, COMPRADO: 0, ESTOQUE: 0, EM_COTACAO: 0, NAO_COMPRADO: 0, CANCELADO: 0 };
  let globalTotal = 0;
  for (const op of ops) {
    for (const k of Object.keys(globalResumo)) globalResumo[k] += op.resumo[k];
    globalTotal += op.totalItens;
  }

  // Filtra OPs pela busca
  const buscaLower = busca.toLowerCase();
  const opsFiltradas = ops.filter((op) => {
    if (!busca) return true;
    if (op.numero.toLowerCase().includes(buscaLower)) return true;
    if (op.cliente.toLowerCase().includes(buscaLower)) return true;
    if (op.obra?.toLowerCase().includes(buscaLower)) return true;
    return op.itens.some((it) =>
      it.descricao.toLowerCase().includes(buscaLower) ||
      it.material?.toLowerCase().includes(buscaLower) ||
      it.fornecedor?.toLowerCase().includes(buscaLower)
    );
  });

  return (
    <div className="space-y-4">
      {/* Resumo global */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input
                type="text"
                placeholder="Buscar por OP, cliente, material, fornecedor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
              />
            </div>
          </div>
          <p className="text-xs text-torg-gray">
            {opsFiltradas.length} OP{opsFiltradas.length !== 1 ? "s" : ""} · {globalTotal} itens
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const count = globalResumo[key];
            const ativo = filtroStatus === key;
            return (
              <button
                key={key}
                onClick={() => setFiltroStatus(ativo ? "TODOS" : key)}
                className={`rounded-lg border p-2 text-left transition-all hover:shadow-sm ${
                  ativo ? `${cfg.border} ${cfg.bg} ring-1 ring-offset-1 ${cfg.border}` : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Icon size={10} className={cfg.color} />
                  <span className={`text-[9px] uppercase font-medium tracking-wide ${cfg.color}`}>{cfg.label}</span>
                </div>
                <p className={`text-lg font-extrabold tabular-nums ${count > 0 ? cfg.color : "text-gray-300"}`}>{count}</p>
              </button>
            );
          })}
        </div>

        {/* Barra de progresso global */}
        <div className="mt-3 flex items-center gap-3 text-xs text-torg-gray">
          <span className="font-medium text-torg-dark">Progresso geral:</span>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const pct = globalTotal > 0 ? (globalResumo[key] / globalTotal) * 100 : 0;
              if (pct === 0) return null;
              return <div key={key} className={`${cfg.barColor} h-full`} style={{ width: `${pct}%` }} title={`${cfg.label}: ${globalResumo[key]}`} />;
            })}
          </div>
          <span className="tabular-nums font-medium text-torg-dark">
            {globalTotal > 0 ? Math.round(((globalResumo.RECEBIDO + globalResumo.ESTOQUE) / globalTotal) * 100) : 0}% concluído
          </span>
        </div>

        {filtroStatus !== "TODOS" && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Filter size={12} className="text-torg-gray" />
            <span className="text-torg-gray">
              Filtrando: <strong className="text-torg-dark">{STATUS_CONFIG[filtroStatus]?.label}</strong>
            </span>
            <button onClick={() => setFiltroStatus("TODOS")} className="ml-auto text-torg-blue hover:underline">Limpar</button>
          </div>
        )}
      </div>

      {/* Lista de OPs */}
      {opsFiltradas.map((op) => {
        const aberto = expandidos.has(op.id);
        const itensFiltrados = filtroStatus === "TODOS"
          ? op.itens
          : op.itens.filter((it) => it.statusDerivado === filtroStatus);

        if (filtroStatus !== "TODOS" && itensFiltrados.length === 0) return null;

        const pctConcluido = op.totalItens > 0
          ? Math.round(((op.resumo.RECEBIDO + op.resumo.ESTOQUE) / op.totalItens) * 100)
          : 0;

        return (
          <div key={op.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header da OP */}
            <div
              className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 gap-3"
              onClick={() => toggleExpand(op.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Link
                  href={`/compras/painel-ops/${op.id}`}
                  className="font-mono font-bold text-torg-blue text-lg hover:underline shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {fmtOP(op.numero)}
                </Link>
                <div className="min-w-0">
                  <p className="text-sm text-torg-dark font-medium truncate">{op.cliente}</p>
                  {op.obra && <p className="text-xs text-torg-gray truncate">{op.obra}</p>}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Mini badges de status */}
                <div className="hidden sm:flex items-center gap-1.5">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const count = op.resumo[key];
                    if (count === 0) return null;
                    const Icon = cfg.icon;
                    return (
                      <span key={key} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`} title={cfg.label}>
                        <Icon size={9} />{count}
                      </span>
                    );
                  })}
                </div>

                {/* Mini barra de progresso */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden flex">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                      const pct = op.totalItens > 0 ? (op.resumo[key] / op.totalItens) * 100 : 0;
                      if (pct === 0) return null;
                      return <div key={key} className={`${cfg.barColor} h-full`} style={{ width: `${pct}%` }} />;
                    })}
                  </div>
                  <span className="text-[10px] tabular-nums text-torg-gray font-medium">{pctConcluido}%</span>
                </div>

                <span className="text-xs text-torg-gray">{op.totalItens} itens</span>
                {aberto ? <ChevronUp size={16} className="text-torg-gray" /> : <ChevronDown size={16} className="text-torg-gray" />}
              </div>
            </div>

            {/* Tabela de itens */}
            {aberto && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itensFiltrados.map((item) => {
                      const cfg = STATUS_CONFIG[item.statusDerivado];
                      const Icon = cfg.icon;
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 ${item.statusDerivado === "CANCELADO" ? "opacity-50" : ""}`}>
                          <td className="px-4 py-2 font-mono text-xs text-torg-blue whitespace-nowrap">{item.rmNumero}</td>
                          <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">{item.material || "—"}</td>
                          <td className="px-4 py-2 text-torg-dark max-w-xs truncate" title={item.descricao}>{item.descricao}</td>
                          <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                            {Number(item.quantidade).toLocaleString("pt-BR")} {item.unidade}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                              <Icon size={11} />{cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-torg-dark truncate max-w-[150px]" title={item.fornecedor || ""}>{item.fornecedor || "—"}</td>
                          <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">
                            {item.statusDerivado === "RECEBIDO" && item.nfNumero && <span>NF {item.nfNumero}</span>}
                            {item.statusDerivado === "COMPRADO" && item.pedidoNumero && <span>Pedido #{item.pedidoNumero}</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {itensFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-xs text-torg-gray">
                          Nenhum item com este status nesta OP.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {opsFiltradas.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-torg-gray">
          Nenhuma OP encontrada para "{busca}".
        </div>
      )}
    </div>
  );
}
