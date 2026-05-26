"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Activity, ChevronDown, ChevronRight, Weight, Package,
  AlertCircle, Loader2, X, Search, Filter, Factory,
  Info, ArrowRight, BarChart2, List, CheckCircle2,
} from "lucide-react";

// ─── Hierarquia de setores ────────────────────────────────────────────────────
// Usado para determinar o "setor de referência" (peso real da OP).
// Sempre usamos o peso do setor MAIS AVANÇADO com KG > 0.
// As mesmas peças passam por múltiplos setores — somar todos geraria duplicidade.
const HIERARQUIA_REF = [
  "Expedição", "Pintura", "Jato", "Acabamento",
  "Solda", "Montagem", "Dobra", "Corte", "Usinagem",
];

// Ordem visual do fluxo produtivo (da esquerda para direita)
const FLUXO_VISUAL = [
  "Corte", "Dobra", "Montagem", "Solda",
  "Acabamento", "Jato", "Pintura", "Expedição",
];

function normSetor(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const NORM_HIERARQUIA = HIERARQUIA_REF.map(normSetor);
const NORM_FLUXO      = FLUXO_VISUAL.map(normSetor);

/** Retorna o objeto de setor de referência (mais avançado com KG > 0) para uma OP. */
function setorRef(setoresOp) {
  for (const refNorm of NORM_HIERARQUIA) {
    const found = setoresOp.find(
      s => normSetor(s.setor) === refNorm && (s._sum?.produzidoKg || 0) > 0
    );
    if (found) return found;
  }
  // fallback: setor com maior KG
  return [...setoresOp].sort(
    (a, b) => (b._sum?.produzidoKg || 0) - (a._sum?.produzidoKg || 0)
  )[0] || null;
}

// ─── Cores por setor ──────────────────────────────────────────────────────────
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
  const key = normSetor(setor).replace(/[^a-z]/g, "");
  return SETOR_CORES[key] || "bg-gray-100 text-gray-600 border-gray-200";
}

const STATUS_CONFIG = {
  "Finalizado":         { cor: "text-green-600 bg-green-50",  icone: "✓"  },
  "Finalizado Total":   { cor: "text-green-700 bg-green-50",  icone: "✓✓" },
  "Finalizado Parcial": { cor: "text-yellow-600 bg-yellow-50",icone: "◑"  },
  "Produzindo":         { cor: "text-blue-600 bg-blue-50",    icone: "▶"  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n, dec = 1) {
  if (!n || isNaN(n)) return "—";
  return Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}
function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "UTC", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtDataCurta(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function tempoRelativo(d) {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 2)  return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dia${Math.floor(h / 24) > 1 ? "s" : ""}`;
}

// ─── FluxoBar ─────────────────────────────────────────────────────────────────
function FluxoBar({ setoresOp }) {
  const presentes = new Set(setoresOp.map(s => normSetor(s.setor)));
  const ref = setorRef(setoresOp);
  const refNorm = ref ? normSetor(ref.setor) : null;

  // Setores fora do fluxo padrão
  const extras = setoresOp.filter(s => !NORM_FLUXO.includes(normSetor(s.setor)));

  return (
    <div className="flex items-center gap-0.5 flex-wrap mt-1.5">
      {FLUXO_VISUAL.map((setor, i) => {
        const n       = normSetor(setor);
        const ativo   = presentes.has(n);
        const isRef   = n === refNorm;
        return (
          <div key={setor} className="flex items-center gap-0.5">
            {i > 0 && (
              <ArrowRight
                size={8}
                className={ativo ? "text-gray-400" : "text-gray-200"}
              />
            )}
            <span
              title={setor}
              className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border font-medium transition-all ${
                isRef
                  ? corSetor(setor) + " ring-1 ring-current"
                  : ativo
                  ? corSetor(setor) + " opacity-60"
                  : "bg-gray-50 text-gray-300 border-gray-100"
              }`}
            >
              {setor}
              {isRef && " ●"}
            </span>
          </div>
        );
      })}
      {extras.map(s => (
        <span
          key={s.setor}
          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border font-medium opacity-60 ${corSetor(s.setor)}`}
        >
          {s.setor}
        </span>
      ))}
    </div>
  );
}

// ─── Modal de detalhe de OP ───────────────────────────────────────────────────
function ModalDetalhe({ obra, opInfo, onClose, de, ate }) {
  const [rows, setRows]   = useState([]);
  const [loading, setLoad] = useState(true);
  const [erro, setErro]   = useState(null);
  const [busca, setBusca] = useState("");

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
      (r.opSka        || "").toLowerCase().includes(b) ||
      (r.setor        || "").toLowerCase().includes(b) ||
      (r.maquina      || "").toLowerCase().includes(b) ||
      (r.operador     || "").toLowerCase().includes(b) ||
      (r.descricaoItem|| "").toLowerCase().includes(b) ||
      (r.status       || "").toLowerCase().includes(b)
    );
  }, [rows, busca]);

  // Agrupa por setor para mostrar referência no header
  const porSetorHeader = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const s = r.setor || "Sem setor";
      if (!map[s]) map[s] = { setor: s, kg: 0, un: 0 };
      map[s].kg += r.produzidoKg || 0;
      map[s].un += r.produzidoUn || 0;
    }
    return Object.values(map);
  }, [rows]);

  const ref       = setorRef(porSetorHeader.map(s => ({
    setor: s.setor,
    _sum: { produzidoKg: s.kg, produzidoUn: s.un },
  })));
  const pesoRef   = ref?._sum?.produzidoKg || 0;
  const totalKg   = rows.reduce((s, r) => s + (r.produzidoKg || 0), 0);
  const totalUn   = rows.reduce((s, r) => s + (r.produzidoUn || 0), 0);

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
                <span className="text-sm text-torg-gray">
                  {opInfo.cliente} — {opInfo.obra}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-torg-gray flex-wrap">
              <span className="flex items-center gap-1 text-torg-dark font-medium">
                <Weight size={13} className="text-torg-blue" />
                {fmtNum(pesoRef)} kg
                {ref && (
                  <span className={`text-xs px-1.5 py-0 rounded-full border font-medium ml-1 ${corSetor(ref.setor)}`}>
                    via {ref.setor}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Package size={13} /> {fmtNum(totalUn, 0)} un
              </span>
              <span className="text-gray-400">{rows.length} apontamentos</span>
              {totalKg !== pesoRef && (
                <span className="flex items-center gap-1 text-xs text-gray-400 border-l pl-4">
                  <Info size={11} />
                  Soma bruta de todas as etapas: {fmtNum(totalKg)} kg
                  (mesmas peças em múltiplas etapas)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
          >
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
                      <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.descricaoItem}>
                        {r.descricaoItem || "—"}
                      </td>
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

// ─── Card de OP ───────────────────────────────────────────────────────────────
function CardOP({ obra, opInfo, setores, onVerDetalhe }) {
  const [expandido, setExpandido] = useState(false);

  const ref        = setorRef(setores);
  const pesoReal   = ref?._sum?.produzidoKg || 0;
  const unReal     = ref?._sum?.produzidoUn || 0;
  const totalApont = setores.reduce((s, g) => s + (g._count?.productionId || 0), 0);
  const ultimaAtt  = setores.reduce((m, g) => {
    const d = g._max?.updatedAt;
    return !m || d > m ? d : m;
  }, null);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpandido(v => !v)}
      >
        <div className="flex-1 min-w-0">
          {/* Identificação */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-torg-dark text-sm">{obra}</span>
            {opInfo ? (
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
            ) : (
              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                OP não encontrada no portal
              </span>
            )}
          </div>

          {/* Peso + contadores */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs flex items-center gap-1">
              <Weight size={11} className="text-torg-blue" />
              <strong className="text-torg-dark">{fmtNum(pesoReal)} kg</strong>
              {ref && (
                <span className={`text-[10px] px-1.5 py-0 rounded-full border font-medium ${corSetor(ref.setor)}`}>
                  via {ref.setor}
                </span>
              )}
            </span>
            <span className="text-xs text-torg-gray flex items-center gap-1">
              <Package size={11} />
              <strong className="text-torg-dark">{fmtNum(unReal, 0)} un</strong>
            </span>
            <span className="text-xs text-gray-400">{totalApont} apont.</span>
            <span className="text-xs text-gray-400">{tempoRelativo(ultimaAtt)}</span>
          </div>

          {/* Barra de fluxo */}
          <FluxoBar setoresOp={setores} />
        </div>

        <div className="flex items-center gap-2 ml-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onVerDetalhe(obra); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-torg-blue text-torg-blue hover:bg-torg-blue hover:text-white transition-colors"
          >
            Detalhe
          </button>
          {expandido
            ? <ChevronDown  size={16} className="text-gray-400" />
            : <ChevronRight size={16} className="text-gray-400" />
          }
        </div>
      </div>

      {/* Breakdown por setor (expandido) */}
      {expandido && (
        <div className="border-t border-gray-50 px-4 py-3">
          <div className="flex items-start gap-1.5 text-xs text-gray-400 mb-3">
            <Info size={11} className="mt-0.5 shrink-0" />
            As mesmas peças passam por múltiplos setores — o peso real da OP é medido
            via <strong className="text-torg-gray ml-0.5">{ref?.setor || "—"}</strong>
            {ref && ` (${fmtNum(pesoReal)} kg)`}. Os valores por setor abaixo mostram o volume de trabalho em cada etapa.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {setores.map(s => {
              const isRef = normSetor(s.setor) === normSetor(ref?.setor || "");
              return (
                <div
                  key={s.setor}
                  className={`rounded-lg p-2.5 ${
                    isRef
                      ? "bg-blue-50 border border-torg-blue/20"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${corSetor(s.setor)}`}>
                      {s.setor || "Sem setor"}
                    </span>
                    {isRef && <span className="text-[10px] text-torg-blue font-bold">● ref</span>}
                  </div>
                  <div className="text-sm font-bold text-torg-dark">
                    {fmtNum(s._sum?.produzidoKg || 0)} kg
                  </div>
                  <div className="text-xs text-torg-gray">
                    {fmtNum(s._sum?.produzidoUn || 0, 0)} un · {s._count?.productionId} apont.
                  </div>
                  {(s._sum?.rejeitado > 0 || s._sum?.retrabalhado > 0) && (
                    <div className="text-xs text-orange-500 mt-0.5">
                      {s._sum?.rejeitado    > 0 && <span>Rej: {fmtNum(s._sum.rejeitado, 0)}</span>}
                      {s._sum?.retrabalhado > 0 && <span className="ml-1">Retrab: {fmtNum(s._sum.retrabalhado, 0)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── View: Por Setor ──────────────────────────────────────────────────────────
function ViewPorSetor({ grupos }) {
  const porSetor = useMemo(() => {
    const map = {};
    for (const g of grupos) {
      const s = g.setor || "Sem setor";
      if (!map[s]) map[s] = { setor: s, kg: 0, un: 0, ops: new Set(), apont: 0 };
      map[s].kg    += g._sum?.produzidoKg     || 0;
      map[s].un    += g._sum?.produzidoUn     || 0;
      map[s].apont += g._count?.productionId  || 0;
      map[s].ops.add(g.obra);
    }
    return Object.values(map)
      .map(s => ({ ...s, ops: s.ops.size }))
      .sort((a, b) => {
        // Ordena pelo fluxo visual; setores não-mapeados ficam por último
        const ia = NORM_FLUXO.indexOf(normSetor(a.setor));
        const ib = NORM_FLUXO.indexOf(normSetor(b.setor));
        if (ia === -1 && ib === -1) return b.kg - a.kg;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
  }, [grupos]);

  const maxKg = Math.max(...porSetor.map(s => s.kg), 1);

  if (porSetor.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-torg-gray gap-3">
        <Activity size={40} className="opacity-30" />
        <span className="text-sm">Nenhum apontamento no período</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-torg-gray px-1 mb-2">
        {porSetor.length} setor{porSetor.length !== 1 ? "es" : ""} com apontamentos · valores brutos por etapa
      </div>
      {porSetor.map(s => (
        <div key={s.setor} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <span
              className={`text-sm px-2.5 py-1 rounded-lg border font-medium w-28 text-center shrink-0 ${corSetor(s.setor)}`}
            >
              {s.setor}
            </span>
            <div className="flex-1">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-torg-blue rounded-full"
                  style={{ width: `${(s.kg / maxKg) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="font-bold text-torg-dark flex items-center gap-1">
                  <Weight size={12} className="text-torg-blue" />
                  {fmtNum(s.kg)} kg
                </span>
                <span className="text-torg-gray flex items-center gap-1">
                  <Package size={12} />
                  {fmtNum(s.un, 0)} un
                </span>
                <span className="text-gray-400 text-xs">
                  {s.ops} OP{s.ops !== 1 ? "s" : ""}
                </span>
                <span className="text-gray-400 text-xs">
                  {s.apont} apontamentos
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── View: Por Peça ───────────────────────────────────────────────────────────
function ViewPorPeca({ de, ate }) {
  const [busca,   setBusca]   = useState("");
  const [todos,   setTodos]   = useState([]); // todos os rows do período
  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState(null);

  // Carrega todos os apontamentos do período ao montar ou quando a data muda
  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro(null);
    setBusca("");
    const qs = new URLSearchParams({ detalhe: "1" });
    if (de)  qs.set("de",  de);
    if (ate) qs.set("ate", ate);
    fetch(`/api/mes/apontamentos?${qs}`)
      .then(r => r.json())
      .then(d => { if (ativo) { setTodos(d.rows || []); setLoading(false); } })
      .catch(e => { if (ativo) { setErro(e.message); setLoading(false); } });
    return () => { ativo = false; };
  }, [de, ate]);

  // Filtra client-side conforme o usuário digita
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return todos;
    return todos.filter(r =>
      (r.opSka         || "").toLowerCase().includes(termo) ||
      (r.descricaoItem || "").toLowerCase().includes(termo) ||
      (r.obra          || "").toLowerCase().includes(termo) ||
      (r.setor         || "").toLowerCase().includes(termo) ||
      (r.maquina       || "").toLowerCase().includes(termo)
    );
  }, [todos, busca]);

  const tabela = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50/60 sticky top-0">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Peça (SKA)</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Descrição</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">OP</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Setor</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Máquina</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-torg-dark">KG</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-torg-dark">UN</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Status</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtrados.map(r => {
            const st = STATUS_CONFIG[r.status] || { cor: "text-gray-500 bg-gray-50", icone: "·" };
            return (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.opSka || "—"}</td>
                <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.descricaoItem}>
                  {r.descricaoItem || "—"}
                </td>
                <td className="px-4 py-2 font-bold text-torg-blue text-xs">{r.obra}</td>
                <td className="px-4 py-2">
                  {r.setor && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${corSetor(r.setor)}`}>
                      {r.setor}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.maquina || "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{fmtNum(r.produzidoKg)}</td>
                <td className="px-4 py-2 text-right font-medium">{fmtNum(r.produzidoUn, 0)}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>
                    {st.icone} {r.status || "—"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {fmtDataCurta(r.dataInicio)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Campo de filtro */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por peça, código SKA, OP, setor, máquina..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-torg-blue"
            disabled={loading}
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} /> {erro}
          <button onClick={() => setErro(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
          <Loader2 size={20} className="animate-spin" />
          <span>Carregando peças do período...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-torg-dark">
              {busca.trim()
                ? `${filtrados.length} de ${todos.length} apontamentos`
                : `${todos.length} apontamentos no período`
              }
            </span>
            {todos.length >= 1000 && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Info size={11} /> Limite de 1.000 registros — refine o período se necessário
              </span>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-torg-gray gap-2">
              <Search size={32} className="opacity-30" />
              <span className="text-sm">Nenhuma peça encontrada para &ldquo;{busca}&rdquo;</span>
            </div>
          ) : tabela}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MesClient({
  grupos: gruposIniciais,
  opMap:     opMapInicial,
  totaisMap: totaisMapInicial, // mantido por compatibilidade, não usado nos cálculos
  setoresDisponiveis: setoresIniciais,
  ultimoSync: ultimoSyncInicial,
  totalGeralBanco,
  deInicial,
  ateInicial,
}) {
  const [grupos,      setGrupos]     = useState(gruposIniciais);
  const [opMap,       setOpMap]      = useState(opMapInicial);
  const [ultimoSync,  setUltimoSync] = useState(ultimoSyncInicial);
  const [setoresDisp, setSetoresDisp]= useState(setoresIniciais);

  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState(null);

  // Filtros
  const [de,          setDe]         = useState(deInicial);
  const [ate,         setAte]        = useState(ateInicial);
  const [buscaOP,     setBuscaOP]    = useState("");
  const [setorFiltro, setSetorFiltro]= useState("");

  // Modo de visualização
  const [modoView, setModoView] = useState("op"); // "op" | "setor" | "peca"

  // Modal detalhe
  const [detalheObra, setDetalheObra] = useState(null);

  // Recarrega dados via API
  const buscar = useCallback(async (deQ, ateQ, setorQ) => {
    setLoading(true);
    setErro(null);
    try {
      const qs = new URLSearchParams();
      if (deQ)    qs.set("de",    deQ);
      if (ateQ)   qs.set("ate",   ateQ);
      if (setorQ) qs.set("setor", setorQ);
      const r = await fetch(`/api/mes/apontamentos?${qs}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setGrupos(data.grupos || []);
      setOpMap(data.opMap || {});
      setUltimoSync(data.ultimoSync || null);
      const novos = [...new Set((data.grupos || []).map(g => g.setor).filter(Boolean))].sort();
      setSetoresDisp(novos);
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

  // ── KPIs corrigidos ────────────────────────────────────────────────────────
  // KG = soma do setor de referência de cada OP (não soma todos os setores)
  const totaisGerais = useMemo(() => {
    let kg = 0, un = 0, apont = 0;
    const etapasCount = {};
    for (const obra of Object.keys(obraGroups)) {
      const setoresOp = obraGroups[obra];
      const ref = setorRef(setoresOp);
      kg    += ref?._sum?.produzidoKg || 0;
      un    += ref?._sum?.produzidoUn || 0;
      apont += setoresOp.reduce((s, g) => s + (g._count?.productionId || 0), 0);
      if (ref?.setor) {
        etapasCount[ref.setor] = (etapasCount[ref.setor] || 0) + 1;
      }
    }
    return { kg, un, apont, ops: Object.keys(obraGroups).length, etapasCount };
  }, [obraGroups]);

  // Filtra OPs por texto
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
        (op?.obra    || "").toLowerCase().includes(b)
      );
    });
  }, [obraGroups, opMap, buscaOP]);

  function handleFiltrar() {
    buscar(de, ate, setorFiltro);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
            <Factory size={24} className="text-torg-blue" />
            Rastreabilidade Syneco
          </h1>
          <p className="text-sm text-torg-gray mt-0.5">
            Dados do SKA Syneco — dataset 242 (Rastreabilidade de OP e Item)
          </p>
        </div>

        {/* Badge último sync */}
        {ultimoSync ? (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
            ultimoSync.sucesso
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {ultimoSync.sucesso
              ? <CheckCircle2 size={15} />
              : <AlertCircle  size={15} />
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
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border bg-yellow-50 text-yellow-700 border-yellow-200">
            <Info size={15} />
            <span>Nenhum sync realizado ainda</span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1">OPs no período</div>
          <div className="text-2xl font-bold text-torg-dark">{totaisGerais.ops}</div>
        </div>

        <div className="bg-white rounded-xl border border-torg-blue/20 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1 flex items-center gap-1">
            <Weight size={11} /> KG produzido
          </div>
          <div className="text-2xl font-bold text-torg-dark">
            {fmtNum(totaisGerais.kg, 0)}
          </div>
          <div className="text-[10px] text-torg-blue mt-0.5 flex items-center gap-1">
            <Info size={9} /> Pelo setor mais avançado de cada OP
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1 flex items-center gap-1">
            <Package size={11} /> UN produzidas
          </div>
          <div className="text-2xl font-bold text-torg-dark">
            {fmtNum(totaisGerais.un, 0)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-torg-gray mb-1">Etapas mais avançadas</div>
          {Object.keys(totaisGerais.etapasCount).length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(totaisGerais.etapasCount)
                .sort((a, b) => b[1] - a[1])
                .map(([setor, qtd]) => (
                  <span
                    key={setor}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${corSetor(setor)}`}
                  >
                    {setor} ({qtd})
                  </span>
                ))
              }
            </div>
          ) : (
            <div className="text-sm text-gray-400 mt-1">—</div>
          )}
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
            {loading
              ? <Loader2 size={15} className="animate-spin" />
              : <Filter  size={15} />
            }
            Filtrar
          </button>
          {/* Busca rápida por OP (visível só no modo OP) */}
          {modoView === "op" && (
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
          )}
        </div>
      </div>

      {/* Tabs de visualização */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: "op",    label: "Por OP",    icon: List      },
          { id: "setor", label: "Por Setor", icon: BarChart2 },
          { id: "peca",  label: "Por Peça",  icon: Search    },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setModoView(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              modoView === id
                ? "bg-white text-torg-dark shadow-sm"
                : "text-torg-gray hover:text-torg-dark"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{erro}</span>
          <button onClick={() => setErro(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Conteúdo por modo */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
          <Loader2 size={20} className="animate-spin" />
          <span>Carregando dados do MES...</span>
        </div>
      ) : (
        <>
          {/* ── Por OP ── */}
          {modoView === "op" && (
            <>
              {obras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-torg-gray gap-3">
                  <Activity size={40} className="opacity-30" />
                  <div className="text-center">
                    <div className="font-medium">Nenhum apontamento encontrado</div>
                    <div className="text-sm mt-1 text-gray-400">
                      {buscaOP
                        ? "Tente outro termo de busca."
                        : "Ajuste o período ou execute o agente de sync."
                      }
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-torg-gray px-1">
                    {obras.length} OP{obras.length !== 1 ? "s" : ""} com apontamentos no período
                    {buscaOP && <span> · filtrando por &ldquo;{buscaOP}&rdquo;</span>}
                  </div>
                  {obras.map(obra => (
                    <CardOP
                      key={obra}
                      obra={obra}
                      opInfo={opMap[obra]}
                      setores={obraGroups[obra] || []}
                      onVerDetalhe={setDetalheObra}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Por Setor ── */}
          {modoView === "setor" && (
            <ViewPorSetor grupos={grupos} />
          )}

          {/* ── Por Peça ── */}
          {modoView === "peca" && (
            <ViewPorPeca de={de} ate={ate} />
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
