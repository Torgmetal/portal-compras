"use client";
import { useState, useMemo, useCallback } from "react";
import {
  Activity, RefreshCw, ChevronDown, ChevronRight, Weight,
  Package, Clock, CheckCircle2, AlertCircle, Loader2, X,
  Search, Calendar, Filter, Factory, TrendingUp, Info,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────
function fmtNum(n, dec = 1) {
  if (!n || isNaN(n)) return "—";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDataCurta(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function tempoRelativo(d) {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 2)  return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.floor(h / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

const SETOR_CORES = {
  corte:       "bg-red-100 text-red-700 border-red-200",
  montagem:    "bg-blue-100 text-blue-700 border-blue-200",
  solda:       "bg-orange-100 text-orange-700 border-orange-200",
  acabamento:  "bg-purple-100 text-purple-700 border-purple-200",
  jato:        "bg-cyan-100 text-cyan-700 border-cyan-200",
  pintura:     "bg-green-100 text-green-700 border-green-200",
  expedicao:   "bg-teal-100 text-teal-700 border-teal-200",
  usinagem:    "bg-yellow-100 text-yellow-700 border-yellow-200",
  dobra:       "bg-pink-100 text-pink-700 border-pink-200",
};
function corSetor(setor) {
  const key = (setor || "").toLowerCase().replace(/[^a-z]/g, "");
  return SETOR_CORES[key] || "bg-gray-100 text-gray-600 border-gray-200";
}

const STATUS_CONFIG = {
  "Finalizado":        { cor: "text-green-600 bg-green-50",  icone: "✓" },
  "Finalizado Total":  { cor: "text-green-700 bg-green-50",  icone: "✓✓" },
  "Finalizado Parcial":{ cor: "text-yellow-600 bg-yellow-50",icone: "◑" },
  "Produzindo":        { cor: "text-blue-600 bg-blue-50",    icone: "▶" },
};

// ─── Modal de detalhe de OP ───────────────────────────────────────
function ModalDetalhe({ obra, opInfo, onClose, de, ate }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [erro, setErro]     = useState(null);
  const [busca, setBusca]   = useState("");

  useState(() => {
    let ativo = true;
    const qs = new URLSearchParams({ obra, detalhe: "1" });
    if (de)  qs.set("de",  de);
    if (ate) qs.set("ate", ate);
    fetch(`/api/mes/apontamentos?${qs}`)
      .then(r => r.json())
      .then(d => { if (ativo) { setRows(d.rows || []); setLoad(false); } })
      .catch(e => { if (ativo) { setErro(e.message); setLoad(false); } });
    return () => { ativo = false; };
  }, [obra, de, ate]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return rows;
    const b = busca.toLowerCase();
    return rows.filter(r =>
      (r.opSka || "").toLowerCase().includes(b) ||
      (r.setor || "").toLowerCase().includes(b) ||
      (r.maquina || "").toLowerCase().includes(b) ||
      (r.operador || "").toLowerCase().includes(b) ||
      (r.descricaoItem || "").toLowerCase().includes(b) ||
      (r.status || "").toLowerCase().includes(b)
    );
  }, [rows, busca]);

  const totalKg = rows.reduce((s, r) => s + (r.produzidoKg || 0), 0);
  const totalUn = rows.reduce((s, r) => s + (r.produzidoUn || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <Factory size={20} className="text-torg-blue" />
              <h2 className="text-lg font-bold text-torg-dark">OP {obra}</h2>
              {opInfo && (
                <span className="text-sm text-torg-gray">{opInfo.cliente} — {opInfo.obra}</span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-torg-gray">
              <span className="flex items-center gap-1"><Weight size={13} /> {fmtNum(totalKg)} kg</span>
              <span className="flex items-center gap-1"><Package size={13} /> {fmtNum(totalUn, 0)} un</span>
              <span className="text-gray-400">{rows.length} apontamentos</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* Busca */}
        <div className="px-6 py-3 border-b border-gray-50">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por peça, setor, máquina, operador..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-torg-blue"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-torg-gray">
              <Loader2 size={20} className="animate-spin" /> Carregando...
            </div>
          ) : erro ? (
            <div className="flex items-center justify-center h-32 gap-2 text-red-500">
              <AlertCircle size={18} /> {erro}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-torg-gray gap-2">
              <Activity size={24} className="opacity-40" />
              <span className="text-sm">Nenhum apontamento encontrado</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Início</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Fim</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Setor</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Máquina</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Peça (SKA)</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Descrição</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Operador</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-torg-dark text-xs">KG</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-torg-dark text-xs">UN</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-torg-dark text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(r => {
                  const st = STATUS_CONFIG[r.status] || { cor: "text-gray-500 bg-gray-50", icone: "·" };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtData(r.dataInicio)}</td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtData(r.dataFim)}</td>
                      <td className="px-4 py-2">
                        {r.setor && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${corSetor(r.setor)}`}>
                            {r.setor}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{r.maquina || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.opSka || "—"}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.descricaoItem}>{r.descricaoItem || "—"}</td>
                      <td className="px-4 py-2 text-gray-700">{r.operador || "—"}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">{fmtNum(r.produzidoKg)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">{fmtNum(r.produzidoUn, 0)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>
                          {st.icone} {r.status || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card de OP ──────────────────────────────────────────────────
function CardOP({ obra, opInfo, total, setores, onVerDetalhe }) {
  const [expandido, setExpandido] = useState(false);
  const totalKg = total?._sum?.produzidoKg || 0;
  const totalUn = total?._sum?.produzidoUn || 0;
  const qtd = total?._count?.productionId || 0;
  const ultimaAtt = total?._max?.updatedAt;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header da OP */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpandido(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-torg-dark text-sm">{obra}</span>
            {opInfo && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-sm text-torg-gray truncate">{opInfo.cliente}</span>
                {opInfo.obra && (
                  <>
                    <span className="text-gray-400">·</span>
                    <span className="text-sm text-gray-500 truncate">{opInfo.obra}</span>
                  </>
                )}
              </>
            )}
            {!opInfo && (
              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                OP não encontrada no portal
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-torg-gray flex items-center gap-1">
              <Weight size={11} /> <strong className="text-torg-dark">{fmtNum(totalKg)} kg</strong>
            </span>
            <span className="text-xs text-torg-gray flex items-center gap-1">
              <Package size={11} /> <strong className="text-torg-dark">{fmtNum(totalUn, 0)} un</strong>
            </span>
            <span className="text-xs text-gray-400">{qtd} apont.</span>
            <span className="text-xs text-gray-400">{tempoRelativo(ultimaAtt)}</span>
          </div>
        </div>

        {/* Badges de setor resumidos */}
        <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
          {setores.slice(0, 4).map(s => (
            <span key={s.setor} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${corSetor(s.setor)}`}>
              {s.setor} {fmtNum(s._sum?.produzidoKg || 0, 0)}kg
            </span>
          ))}
          {setores.length > 4 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              +{setores.length - 4}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={e => { e.stopPropagation(); onVerDetalhe(obra); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-torg-blue text-torg-blue hover:bg-torg-blue hover:text-white transition-colors"
          >
            Detalhe
          </button>
          {expandido ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* Breakdown por setor */}
      {expandido && (
        <div className="border-t border-gray-50 px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {setores.map(s => (
              <div key={s.setor} className="bg-gray-50 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${corSetor(s.setor)}`}>
                    {s.setor || "Sem setor"}
                  </span>
                </div>
                <div className="text-sm font-bold text-torg-dark">{fmtNum(s._sum?.produzidoKg || 0)} kg</div>
                <div className="text-xs text-torg-gray">{fmtNum(s._sum?.produzidoUn || 0, 0)} un · {s._count?.productionId} apont.</div>
                {(s._sum?.rejeitado > 0 || s._sum?.retrabalhado > 0) && (
                  <div className="text-xs text-orange-500 mt-0.5">
                    {s._sum?.rejeitado > 0 && <span>Rej: {fmtNum(s._sum.rejeitado, 0)}</span>}
                    {s._sum?.retrabalhado > 0 && <span className="ml-1">Retrab: {fmtNum(s._sum.retrabalhado, 0)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────
export default function MesClient({
  grupos: gruposIniciais,
  opMap: opMapInicial,
  totaisMap: totaisMapInicial,
  setoresDisponiveis: setoresIniciais,
  ultimoSync: ultimoSyncInicial,
  totalGeralBanco,
  deInicial,
  ateInicial,
}) {
  const [grupos,    setGrupos]    = useState(gruposIniciais);
  const [opMap,     setOpMap]     = useState(opMapInicial);
  const [totaisMap, setTotaisMap] = useState(totaisMapInicial);
  const [ultimoSync, setUltimoSync] = useState(ultimoSyncInicial);
  const [setoresDisp, setSetoresDisp] = useState(setoresIniciais);

  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState(null);

  // Filtros
  const [de,         setDe]         = useState(deInicial);
  const [ate,        setAte]        = useState(ateInicial);
  const [buscaOP,    setBuscaOP]    = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");

  // Modal detalhe
  const [detalheObra, setDetalheObra] = useState(null);

  // Busca/recarrega dados via API
  const buscar = useCallback(async (deQ, ateQ, setorQ) => {
    setLoading(true);
    setErro(null);
    try {
      const qs = new URLSearchParams();
      if (deQ)   qs.set("de", deQ);
      if (ateQ)  qs.set("ate", ateQ);
      if (setorQ) qs.set("setor", setorQ);
      const r = await fetch(`/api/mes/apontamentos?${qs}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setGrupos(data.grupos || []);
      setOpMap(data.opMap || {});
      setTotaisMap(data.totaisMap || {});
      setUltimoSync(data.ultimoSync || null);
      // Atualiza setores disponíveis com base nos novos dados
      const novosSets = [...new Set((data.grupos || []).map(g => g.setor).filter(Boolean))].sort();
      setSetoresDisp(novosSets);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Agrupa grupos por obra
  const obraGroups = useMemo(() => {
    const map = {};
    for (const g of grupos) {
      if (!map[g.obra]) map[g.obra] = [];
      map[g.obra].push(g);
    }
    return map;
  }, [grupos]);

  // Filtra OPs pela busca de texto
  const obras = useMemo(() => {
    const todas = Object.keys(obraGroups).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    if (!buscaOP.trim()) return todas;
    const b = buscaOP.toLowerCase();
    return todas.filter(obra => {
      const op = opMap[obra];
      return (
        obra.toLowerCase().includes(b) ||
        (op?.cliente || "").toLowerCase().includes(b) ||
        (op?.obra || "").toLowerCase().includes(b)
      );
    });
  }, [obraGroups, opMap, buscaOP]);

  // Totais gerais para o período filtrado
  const totaisGerais = useMemo(() => {
    let kg = 0, un = 0, apont = 0;
    for (const t of Object.values(totaisMap)) {
      kg    += t._sum?.produzidoKg || 0;
      un    += t._sum?.produzidoUn || 0;
      apont += t._count?.productionId || 0;
    }
    return { kg, un, apont, ops: Object.keys(totaisMap).length };
  }, [totaisMap]);

  function handleFiltrar() {
    buscar(de, ate, setorFiltro);
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
            <Factory size={24} className="text-torg-blue" />
            Rastreabilidade MES
          </h1>
          <p className="text-sm text-torg-gray mt-0.5">
            Dados do SKA Syneco — dataset 242 (Rastreabilidade de OP e Item)
          </p>
        </div>

        {/* Badge último sync */}
        {ultimoSync && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
            ultimoSync.sucesso
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {ultimoSync.sucesso
              ? <CheckCircle2 size={15} />
              : <AlertCircle size={15} />
            }
            <div>
              <div className="font-medium">
                {ultimoSync.sucesso ? "Sync OK" : "Falha no sync"}
              </div>
              <div className="text-xs opacity-75">
                {tempoRelativo(ultimoSync.criadoEm)} · {ultimoSync.criados}↑ {ultimoSync.atualizados}↻
              </div>
            </div>
          </div>
        )}
        {!ultimoSync && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border bg-yellow-50 text-yellow-700 border-yellow-200">
            <Info size={15} />
            <span>Nenhum sync realizado ainda</span>
          </div>
        )}
      </div>

      {/* Cards de KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1">OPs no período</div>
          <div className="text-2xl font-bold text-torg-dark">{totaisGerais.ops}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1 flex items-center gap-1"><Weight size={11} /> KG produzido</div>
          <div className="text-2xl font-bold text-torg-dark">{fmtNum(totaisGerais.kg, 0)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1 flex items-center gap-1"><Package size={11} /> UN produzido</div>
          <div className="text-2xl font-bold text-torg-dark">{fmtNum(totaisGerais.un, 0)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1">Total no banco</div>
          <div className="text-2xl font-bold text-torg-dark">{totalGeralBanco.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-gray-400 mt-0.5">apontamentos</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">De</label>
            <input
              type="date"
              value={de}
              onChange={e => setDe(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Até</label>
            <input
              type="date"
              value={ate}
              onChange={e => setAte(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Setor</label>
            <select
              value={setorFiltro}
              onChange={e => setSetorFiltro(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torg-blue bg-white"
            >
              <option value="">Todos os setores</option>
              {setoresDisp.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={handleFiltrar}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-torg-blue text-white text-sm font-medium hover:bg-torg-blue/90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Filter size={15} />}
            Filtrar
          </button>
          {/* Busca rápida por OP */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-torg-gray mb-1">Buscar OP</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={buscaOP}
                onChange={e => setBuscaOP(e.target.value)}
                placeholder="Número, cliente..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-torg-blue"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{erro}</span>
          <button onClick={() => setErro(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
          <Loader2 size={20} className="animate-spin" />
          <span>Carregando dados do MES...</span>
        </div>
      )}

      {/* Lista de OPs */}
      {!loading && (
        <>
          {obras.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-torg-gray gap-3">
              <Activity size={40} className="opacity-30" />
              <div className="text-center">
                <div className="font-medium">Nenhum apontamento encontrado</div>
                <div className="text-sm mt-1 text-gray-400">
                  {buscaOP ? "Tente outro termo de busca." : "Ajuste o período ou execute o agente de sync."}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-torg-gray px-1">
                {obras.length} OP{obras.length !== 1 ? "s" : ""} com apontamentos no período
                {buscaOP && <span> · filtrando por "{buscaOP}"</span>}
              </div>
              {obras.map(obra => (
                <CardOP
                  key={obra}
                  obra={obra}
                  opInfo={opMap[obra]}
                  total={totaisMap[obra]}
                  setores={obraGroups[obra] || []}
                  onVerDetalhe={setDetalheObra}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal detalhe */}
      {detalheObra && (
        <ModalDetalhe
          obra={detalheObra}
          opInfo={opMap[detalheObra]}
          onClose={() => setDetalheObra(null)}
          de={de}
          ate={ate}
        />
      )}
    </div>
  );
}
