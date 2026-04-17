"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import {
  FolderKanban, ChevronDown, ChevronUp, FileSpreadsheet, Mail, ShoppingCart,
  ArrowRight, Search, Filter, Eye,
} from "lucide-react";

export default function PainelOPs() {
  const { rms, loaded } = useStore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOp, setExpandedOp] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Todas");

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

  // Group RMs by OP number
  const opGroups = useMemo(() => {
    const groups = {};
    rms.forEach((rm) => {
      const op = rm.op || "Sem OP";
      if (!groups[op]) groups[op] = { op, rms: [], totalCotacoes: 0, totalEnvios: 0, totalPedidos: 0 };
      groups[op].rms.push(rm);
      groups[op].totalCotacoes += (rm.cotacoes || []).length;
      groups[op].totalEnvios += (rm.envios || []).length;
      groups[op].totalPedidos += rm.status === "Pedido Gerado" ? 1 : 0;
    });
    return Object.values(groups).sort((a, b) => {
      if (a.op === "Sem OP") return 1;
      if (b.op === "Sem OP") return -1;
      return a.op.localeCompare(b.op);
    });
  }, [rms]);

  // Filter
  const filtered = useMemo(() => {
    let result = opGroups;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (g) =>
          g.op.toLowerCase().includes(term) ||
          g.rms.some((rm) => rm.numero?.toLowerCase().includes(term) || rm.descricao?.toLowerCase().includes(term))
      );
    }
    if (filterStatus !== "Todas") {
      result = result.filter((g) => g.rms.some((rm) => rm.status === filterStatus));
    }
    return result;
  }, [opGroups, searchTerm, filterStatus]);

  const allStatuses = ["Todas", "Aberta", "Em Cotação", "Cotada", "Pedido Gerado"];

  const toggleOp = (op) => setExpandedOp(expandedOp === op ? null : op);

  // Summary stats
  const totalOps = opGroups.length;
  const totalRms = rms.length;
  const totalCot = rms.reduce((s, rm) => s + (rm.cotacoes || []).length, 0);
  const totalEnv = rms.reduce((s, rm) => s + (rm.envios || []).length, 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FolderKanban size={24} className="text-blue-600" /> Painel de OPs
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Visão consolidada de todas as Ordens de Produção com suas RMs, cotações e pedidos.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{totalOps}</p>
          <p className="text-xs text-gray-500 mt-1">OPs</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{totalRms}</p>
          <p className="text-xs text-gray-500 mt-1">RMs</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalCot}</p>
          <p className="text-xs text-gray-500 mt-1">Cotações</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalEnv}</p>
          <p className="text-xs text-gray-500 mt-1">Envios</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar OP, RM ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          {allStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* OP Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">Nenhuma OP encontrada</p>
          <p className="text-gray-400 text-sm mt-1">
            {rms.length === 0
              ? "Crie uma RM para começar. O número da OP será extraído automaticamente do arquivo importado."
              : "Ajuste os filtros de busca."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => (
            <div key={group.op} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* OP Header */}
              <div
                className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-gray font-bold text-blue-600">{totalOps}</p>
          <p className="text-xs text-gray-500 mt-1">OPs</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{totalRms}</p>
          <p className="text-xs text-gray-500 mt-1">RMs</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalCot}</p>
          <p className="text-xs text-gray-500 mt-1">Cotações</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalEnv}</p>
          <p className="text-xs text-gray-500 mt-1">Envios</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar OP, RM ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          {allStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* OP Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">Nenhuma OP encontrada</p>
          <p className="text-gray-400 text-sm mt-1">
            {rms.length === 0
              ? "Crie uma RM para começar. O número da OP será extraído automaticamente do arquivo importado."
              : "Ajuste os filtros de busca."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => (
            <div key={group.op} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* OP Header */}
              <div
                className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleOp(group.op)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FolderKanban size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">
                      OP {group.op}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {group.rms.length} RM{group.rms.length !== 1 ? "s" : ""} ·{" "}
                      {group.totalCotacoes} cotaç{group.totalCotacoes !== 1 ? "ões" : "ão"} ·{" "}
                      {group.totalEnvios} envio{group.totalEnvios !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {group.totalPedidos > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                      {group.totalPedidos} pedido{group.totalPedidos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {expandedOp === group.op ? (
                    <ChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded: list RMs */}
              {expandedOp === group.op && (
                <div className="border-t border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Itens</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cotações</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Envios</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.rms.map((rm) => (
                          <tr key={rm.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 font-semibold text-blue-700">RM-{rm.numero}</td>
                            <td className="px-6 py-3 text-gray-700 max-w-[250px] truncate">{rm.descricao}</td>
                            <td className="px-6 py-3 text-gray-600">{(rm.itens || []).length}</td>
                            <td className="px-6 py-3"><Badge status={rm.status} /></td>
                            <td className="px-6 py-3 text-center">
                              {(rm.cotacoes || []).length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                  <FileSpreadsheet size={12} /> {(rm.cotacoes || []).length}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-center">
                              {(rm.envios || []).length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                  <Mail size={12} /> {(rm.envios || []).length}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs">{rm.data}</td>
                            <td className="px-6 py-3 text-center">
                              <button
                                onClick={() => router.push(`/rm/${rm.id}`)}
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs font-medium"
                              >
                                <Eye size={14} /> Ver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
