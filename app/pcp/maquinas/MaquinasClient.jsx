"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, RefreshCw, Cpu, Weight,
  Search, Package, Users,
} from "lucide-react";
import { FLUXO_VISUAL, corSetor, normSetor } from "@/lib/setores";

const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—";
const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};
const STATUS_BADGE = {
  Produzindo:           { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500",  label: "Produzindo" },
  Finalizado:           { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", label: "Finalizado" },
  "Finalizado Total":   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", label: "Finalizado" },
  "Finalizada Parcial": { bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500",  label: "Parcial" },
  "Não Inicializada":   { bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-300",   label: "Não iniciada" },
};
const getStatusBadge = (status) =>
  STATUS_BADGE[status] || { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: status || "—" };
const isAtiva = (status) => status === "Produzindo" || status === "Finalizada Parcial";

/**
 * Página especial de Máquinas — mostra TODAS as máquinas de todos os setores,
 * agrupadas por setor, com visão kanban/grid.
 */
export default function MaquinasClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/pcp/dashboard");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-torg-blue" />
        <span className="ml-3 text-sm text-torg-gray">Carregando máquinas...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle size={24} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-600">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { maquinasAtivas: todasMaquinas } = data;

  // Filtra: página de Máquinas mostra apenas equipamentos reais (IoT/CNC)
  // Corte → só lasers; Montagem e Solda → bancadas de pessoas (exibem na aba do setor)
  const maquinasAtivas = todasMaquinas.filter((m) => {
    const s = (m.setor || "").toLowerCase();
    if (s === "corte") return (m.maquina || "").toUpperCase().startsWith("LASER");
    if (s === "montagem" || s === "solda") return false;
    return true;
  });

  // Agrupa máquinas por setor
  const porSetor = {};
  for (const m of maquinasAtivas) {
    const s = m.setor || "Outros";
    if (!porSetor[s]) porSetor[s] = [];
    porSetor[s].push(m);
  }

  // Ordena setores pelo fluxo visual
  const setoresOrdenados = Object.keys(porSetor).sort((a, b) => {
    const ia = FLUXO_VISUAL.findIndex((f) => normSetor(f) === normSetor(a));
    const ib = FLUXO_VISUAL.findIndex((f) => normSetor(f) === normSetor(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // Filtra
  const filtroLower = filtro.toLowerCase();
  const filtrar = (m) => {
    if (!filtro) return true;
    return (
      (m.maquina || "").toLowerCase().includes(filtroLower) ||
      (m.obra || "").toLowerCase().includes(filtroLower) ||
      (m.operador || "").toLowerCase().includes(filtroLower) ||
      (m.setor || "").toLowerCase().includes(filtroLower)
    );
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Cpu size={28} className="text-torg-blue" />
            Programação de Máquinas
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Visão de todas as máquinas por setor — dados em tempo real do Syneco.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar máquina, OP, operador..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
            />
          </div>
          <button
            onClick={carregar}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-blue p-2.5 rounded-lg"><Cpu size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Total de máquinas</p>
            <p className="text-xl font-extrabold text-torg-dark">{maquinasAtivas.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4 flex items-center gap-3">
          <div className="bg-emerald-600 p-2.5 rounded-lg"><Cpu size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Em produção</p>
            <p className="text-xl font-extrabold text-emerald-600">
              {maquinasAtivas.filter((m) => isAtiva(m.status)).length}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-blue-700 p-2.5 rounded-lg"><Package size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Setores</p>
            <p className="text-xl font-extrabold text-torg-dark">{setoresOrdenados.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-orange p-2.5 rounded-lg"><Users size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Operadores</p>
            <p className="text-xl font-extrabold text-torg-dark">
              {new Set(maquinasAtivas.map((m) => m.operador).filter(Boolean)).size}
            </p>
          </div>
        </div>
      </div>

      {/* Máquinas agrupadas por setor */}
      {maquinasAtivas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Cpu size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhum apontamento registrado no Syneco.</p>
          <p className="text-xs text-torg-gray mt-1">Os dados atualizam automaticamente com o sync do MES.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {setoresOrdenados.map((setor) => {
            const maquinas = porSetor[setor].filter(filtrar);
            if (maquinas.length === 0) return null;
            const c = corSetor(setor);
            return (
              <div key={setor} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className={`px-6 py-3 border-b border-gray-100 flex items-center gap-2`}>
                  <span className={`w-3 h-3 rounded-full`} style={{ background: c.hex }} />
                  <h3 className="text-base font-semibold text-torg-dark">{setor}</h3>
                  <span className="text-xs text-torg-gray ml-1">({maquinas.length} máquinas)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {maquinas.map((m, i) => {
                    const badge = getStatusBadge(m.status);
                    const ativa = isAtiva(m.status);
                    return (
                      <div
                        key={i}
                        className={`border rounded-lg p-3 hover:shadow-sm transition-shadow ${ativa ? "ring-1 ring-green-300 bg-green-50/30" : ""}`}
                        style={{ borderColor: ativa ? undefined : c.hex + "40" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-sm font-bold" style={{ color: c.hex }}>
                            {m.maquina || m.codigoMaquina || "Máquina"}
                          </span>
                          <span className={`text-[10px] ${badge.bg} ${badge.text} px-1.5 py-0.5 rounded font-medium flex items-center gap-1`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} ${ativa ? "animate-pulse" : ""}`} />
                            {badge.label}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-xs text-torg-gray">
                          <p>OP: <span className="font-medium text-torg-blue">{m.obra || "—"}</span></p>
                          <p>Peça: <span className="text-torg-dark">{m.descricaoItem || m.opSka || "—"}</span></p>
                          <p>Operador: <span className="text-torg-dark">{m.operador || "—"}</span></p>
                          <p>Último registro: <span className="text-torg-dark">{fmtData(m.dataInicio)}</span></p>
                          <p className="pt-1">
                            <span className="font-medium text-torg-dark text-sm">{fmtKg(m.produzidoKg)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
