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
  const [rows, setRows]       = useState([]);
  const [loading, setLoad]    = useState(true);
  const [erro, setErro]       = useState(null);
  const [busca, setBusca]     = useState("");
  const [statusModal, setStatusModal] = useState(""); // "" | "Produzindo" | "Finalizado" | "Finalizado Parcial"

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
    let base = rows;
    // Filtro por status
    if (statusModal) {
      base = base.filter(r => {
        if (statusModal === "Finalizado") return r.status === "Finalizado" || r.status === "Finalizado Total";
        return r.status === statusModal;
      });
    }
    if (!busca.trim()) return base;
    const b = busca.toLowerCase();
    return base.filter(r =>
      (r.opSka        || "").toLowerCase().includes(b) ||
      (r.setor        || "").toLowerCase().includes(b) ||
      (r.maquina      || "").toLowerCase().includes(b) ||
      (r.operador     || "").toLowerCase().includes(b) ||
      (r.descricaoItem|| "").toLowerCase().includes(b) ||
      (r.status       || "").toLowerCase().includes(b)
    );
  }, [rows, busca, statusModal]);

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

        {/* Busca + filtro de status */}
        <div className="px-6 py-3 border-b border-gray-50 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por peça, setor, máquina, operador..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-torg-blue"
            />
          </div>
          {/* Chips de status */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { val: "",                   label: "Todos",      cor: "bg-gray-100 text-gray-600", corAt: "bg-torg-dark text-white" },
              { val: "Produzindo",         label: "▶ Produzindo",   cor: "bg-blue-50 text-blue-700",    corAt: "bg-blue-600 text-white"   },
              { val: "Finalizado",         label: "✓ Finalizado",   cor: "bg-green-50 text-green-700",  corAt: "bg-green-600 text-white"  },
              { val: "Finalizado Parcial", label: "◑ Parcial",      cor: "bg-yellow-50 text-yellow-700",corAt: "bg-yellow-500 text-white" },
            ].map(({ val, label, cor, corAt }) => (
              <button
                key={val}
                onClick={() => setStatusModal(val)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${statusModal === val ? corAt : cor + " hover:opacity-80"}`}
              >
                {label}
                {val && (
                  <span className="ml-1 opacity-70">
                    ({rows.filter(r => val === "Finalizado" ? (r.status === "Finalizado" || r.status === "Finalizado Total") : r.status === val).length})
                  </span>
                )}
              </button>
            ))}
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

// Badge de status para o CardOP
function BadgeStatus({ status }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const cor = status === "Produzindo"          ? "bg-blue-50 text-blue-700 border-blue-200"
            : status === "Finalizado Total"    ? "bg-green-100 text-green-800 border-green-300"
            : status === "Finalizado"          ? "bg-green-50 text-green-700 border-green-200"
            : status === "Finalizado Parcial"  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
            : "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${cor}`}>
      {cfg.icone} {status}
    </span>
  );
}

// ─── Card de OP ───────────────────────────────────────────────────────────────
function CardOP({ obra, opInfo, setores, statusDominante, onVerDetalhe }) {
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
            {statusDominante && <BadgeStatus status={statusDominante} />}
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
// Extrai o código base de uma obra: "T64A" → "T64", "T100B" → "T100"
function obraBaseCode(obra) {
  const m = (obra || "").match(/^(T\d+)/i);
  return m ? m[1].toUpperCase() : obra;
}

function ViewPorPeca({ de, ate, obrasDisponiveis }) {
  const [busca,      setBusca]     = useState("");
  const [obraFiltro, setObraFiltro]= useState(""); // "T64" | "" (sempre código base)
  const [abaPeca,    setAbaPeca]   = useState("apontamentos"); // "apontamentos" | "rastreabilidade"

  // Normaliza para código base único: [T64, T64A, T64B] → [T64]
  const obrasBase = useMemo(() =>
    [...new Set(obrasDisponiveis.map(obraBaseCode))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    ), [obrasDisponiveis]);

  // ── Tab Apontamentos ────────────────────────────────────────────────────────
  const [todos,   setTodos]   = useState([]);
  const [loadAp,  setLoadAp]  = useState(false);
  const [erroAp,  setErroAp]  = useState(null);

  useEffect(() => {
    let ativo = true;
    setLoadAp(true);
    setErroAp(null);
    setBusca("");
    const qs = new URLSearchParams({ detalhe: "1" });
    // Quando uma OP específica está selecionada: busca histórico COMPLETO (sem filtro de data)
    // Quando "Todas as OPs": usa filtro de data do período selecionado
    if (!obraFiltro && de)  qs.set("de",  de);
    if (!obraFiltro && ate) qs.set("ate", ate);
    if (obraFiltro) {
      // Passa o código base para capturar sub-OPs (T64A, T64B, T64C)
      // O backend aceita obra como prefixo (startsWith)
      qs.set("obra", obraFiltro);
    }
    fetch(`/api/mes/apontamentos?${qs}`)
      .then(r => r.json())
      .then(d => { if (ativo) { setTodos(d.rows || []); setLoadAp(false); } })
      .catch(e => { if (ativo) { setErroAp(e.message); setLoadAp(false); } });
    return () => { ativo = false; };
  }, [de, ate, obraFiltro]);

  // ── Tab Rastreabilidade ─────────────────────────────────────────────────────
  const [rastData, setRastData] = useState(null); // { pecas, contagens, total }
  const [loadRast, setLoadRast] = useState(false);
  const [erroRast, setErroRast] = useState(null);
  const [filtroRast, setFiltroRast] = useState(""); // "" | "Não Iniciada" | "Produzindo" | "Finalizado" | "Finalizado Parcial"

  useEffect(() => {
    if (abaPeca !== "rastreabilidade" || !obraFiltro) { setRastData(null); return; }
    let ativo = true;
    setLoadRast(true);
    setErroRast(null);
    fetch(`/api/mes/rastreabilidade-op?obra=${encodeURIComponent(obraFiltro)}`)
      .then(r => r.json())
      .then(d => { if (ativo) { setRastData(d); setLoadRast(false); } })
      .catch(e => { if (ativo) { setErroRast(e.message); setLoadRast(false); } });
    return () => { ativo = false; };
  }, [abaPeca, obraFiltro]);

  // ── Filtros client-side ─────────────────────────────────────────────────────
  const filtradosAp = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return todos;
    return todos.filter(r =>
      (r.opSka || "").toLowerCase().includes(termo) ||
      (r.descricaoItem || "").toLowerCase().includes(termo) ||
      (r.obra || "").toLowerCase().includes(termo) ||
      (r.setor || "").toLowerCase().includes(termo) ||
      (r.maquina || "").toLowerCase().includes(termo)
    );
  }, [todos, busca]);

  const filtradosRast = useMemo(() => {
    if (!rastData?.pecas) return [];
    let base = rastData.pecas;
    if (filtroRast) base = base.filter(p => {
      if (filtroRast === "Finalizado") return p.statusSyneco === "Finalizado" || p.statusSyneco === "Finalizado Total";
      return p.statusSyneco === filtroRast;
    });
    if (busca.trim()) {
      const b = busca.toLowerCase();
      base = base.filter(p =>
        (p.marca || "").toLowerCase().includes(b) ||
        (p.descricao || "").toLowerCase().includes(b) ||
        (p.ultimoSetor || "").toLowerCase().includes(b)
      );
    }
    return base;
  }, [rastData, filtroRast, busca]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro por OP */}
          <div className="relative">
            <select
              value={obraFiltro}
              onChange={e => { setObraFiltro(e.target.value); setBusca(""); setFiltroRast(""); }}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-torg-blue bg-white min-w-[160px]"
            >
              <option value="">Todas as OPs</option>
              {obrasBase.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Busca texto */}
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Filtrar por peça, SKA, setor, máquina..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-torg-blue"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs: Apontamentos | Rastreabilidade */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: "apontamentos",    label: "Apontamentos Syneco" },
            { id: "rastreabilidade", label: "Rastreabilidade por Peça" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setAbaPeca(id); setBusca(""); setFiltroRast(""); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                abaPeca === id ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chips de status — só na tab Rastreabilidade */}
        {abaPeca === "rastreabilidade" && rastData && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { val: "",                   label: "Todas",         cnt: rastData.total },
              { val: "Não Iniciada",       label: "Não Iniciada",  cnt: rastData.contagens?.naoIniciada  || 0, cor: "bg-gray-50 text-gray-600 border-gray-200",        corAt: "bg-gray-600 text-white" },
              { val: "Produzindo",         label: "Produzindo",    cnt: rastData.contagens?.produzindo   || 0, cor: "bg-blue-50 text-blue-700 border-blue-200",         corAt: "bg-blue-600 text-white" },
              { val: "Finalizado",         label: "Finalizado",    cnt: rastData.contagens?.finalizado   || 0, cor: "bg-green-50 text-green-700 border-green-200",      corAt: "bg-green-600 text-white" },
              { val: "Finalizado Parcial", label: "Parcial",       cnt: rastData.contagens?.parcial      || 0, cor: "bg-yellow-50 text-yellow-700 border-yellow-200",   corAt: "bg-yellow-500 text-white" },
            ].map(({ val, label, cnt, cor = "bg-torg-blue text-white", corAt = "bg-torg-dark text-white" }) => (
              <button
                key={val}
                onClick={() => setFiltroRast(val)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  filtroRast === val
                    ? corAt + " border-transparent"
                    : (cor || "bg-gray-100 text-gray-600 border-gray-200") + " hover:opacity-80"
                }`}
              >
                {label}
                <span className="text-[10px] font-bold opacity-70">{cnt}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB: APONTAMENTOS ── */}
      {abaPeca === "apontamentos" && (
        <>
          {erroAp && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle size={15} /> {erroAp}
            </div>
          )}
          {loadAp ? (
            <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
              <Loader2 size={20} className="animate-spin" />
              <span>Carregando apontamentos...</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-torg-dark">
                  {busca.trim()
                    ? `${filtradosAp.length} de ${todos.length} apontamentos`
                    : `${todos.length} apontamentos${obraFiltro ? ` — ${obraFiltro}` : " no período"}`}
                </span>
                {todos.length >= 1000 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Info size={11} /> Limite 1.000 — refine o período
                  </span>
                )}
              </div>
              {filtradosAp.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-torg-gray gap-2">
                  <Activity size={32} className="opacity-30" />
                  <span className="text-sm">Nenhum apontamento encontrado</span>
                </div>
              ) : (
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
                      {filtradosAp.map(r => {
                        const st = STATUS_CONFIG[r.status] || { cor: "text-gray-500 bg-gray-50", icone: "·" };
                        return (
                          <tr key={r.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.opSka || "—"}</td>
                            <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.descricaoItem}>{r.descricaoItem || "—"}</td>
                            <td className="px-4 py-2 font-bold text-torg-blue text-xs">{r.obra}</td>
                            <td className="px-4 py-2">
                              {r.setor && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${corSetor(r.setor)}`}>{r.setor}</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{r.maquina || "—"}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmtNum(r.produzidoKg)}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmtNum(r.produzidoUn, 0)}</td>
                            <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>{st.icone} {r.status || "—"}</span></td>
                            <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDataCurta(r.dataInicio)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB: RASTREABILIDADE ── */}
      {abaPeca === "rastreabilidade" && (
        <>
          {!obraFiltro && (
            <div className="flex flex-col items-center justify-center py-12 text-torg-gray gap-3 bg-white rounded-xl border border-dashed border-gray-200">
              <Package size={36} className="opacity-30" />
              <div className="text-center">
                <div className="font-medium">Selecione uma OP acima</div>
                <div className="text-sm text-gray-400 mt-1">
                  Ex: T64 → ver todas as peças com status de produção no Syneco
                </div>
              </div>
            </div>
          )}

          {obraFiltro && erroRast && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle size={15} /> {erroRast}
            </div>
          )}

          {obraFiltro && loadRast && (
            <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
              <Loader2 size={20} className="animate-spin" />
              <span>Carregando rastreabilidade de {obraFiltro}...</span>
            </div>
          )}

          {obraFiltro && rastData && !loadRast && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Aviso modo fallback — LE não importada */}
              {rastData.modoFallback && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2 text-xs text-amber-800">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Lista de Estrutura (LE) não importada</strong> para esta OP —
                    mostrando apenas peças com apontamentos no Syneco.
                    Para ver peças "Não Iniciadas", importe a LE na aba <strong>Produção → Peças</strong>.
                  </span>
                </div>
              )}
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-torg-dark">
                  {filtradosRast.length} de {rastData.total} peças — <strong>{obraFiltro}</strong>
                  {rastData.modoFallback && <span className="text-amber-600 text-xs ml-2">(Syneco only)</span>}
                  {filtroRast && <span className="text-torg-blue"> · {filtroRast}</span>}
                </span>
                <div className="flex gap-3 text-xs text-torg-gray">
                  {!rastData.modoFallback && <span className="text-gray-500 font-medium">{rastData.contagens?.naoIniciada || 0} não iniciadas</span>}
                  <span className="text-blue-600 font-medium">{rastData.contagens?.produzindo || 0} produzindo</span>
                  <span className="text-green-600 font-medium">{rastData.contagens?.finalizado || 0} finalizadas</span>
                </div>
              </div>

              {filtradosRast.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-torg-gray gap-2">
                  <Activity size={32} className="opacity-30" />
                  <span className="text-sm">Nenhuma peça neste filtro</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">Marca</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark">Descrição</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">UN Total</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">UN Produzida</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">Peso</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">Status Syneco</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">Setores</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-torg-dark whitespace-nowrap">Último apont.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtradosRast.map(p => {
                        const naoIniciada = p.statusSyneco === "Não Iniciada";
                        const pct = p.qte > 0 ? Math.min(100, Math.round((p.produzidoUn / p.qte) * 100)) : 0;
                        const corStatus =
                          naoIniciada                          ? "text-gray-400 bg-gray-50 border-gray-200"
                          : p.statusSyneco === "Produzindo"    ? "text-blue-700 bg-blue-50 border-blue-200"
                          : p.statusSyneco.includes("Total")   ? "text-green-800 bg-green-100 border-green-300"
                          : p.statusSyneco.includes("Parcial") ? "text-yellow-700 bg-yellow-50 border-yellow-200"
                          :                                      "text-green-700 bg-green-50 border-green-200";
                        const corBarra =
                          naoIniciada          ? "bg-gray-200"
                          : pct >= 100         ? "bg-green-500"
                          : pct > 0            ? "bg-yellow-400"
                          :                     "bg-gray-200";
                        return (
                          <tr key={p.id} className={`hover:bg-gray-50/50 transition-colors ${naoIniciada ? "opacity-55" : ""}`}>
                            {/* Marca */}
                            <td className="px-4 py-2.5 font-mono text-xs font-bold text-torg-blue whitespace-nowrap">{p.marca}</td>
                            {/* Descrição */}
                            <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                            {/* UN Total */}
                            <td className="px-4 py-2.5 text-right font-semibold text-torg-dark">{p.qte} un</td>
                            {/* UN Produzida + barra */}
                            <td className="px-4 py-2.5 text-right min-w-[110px]">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={`font-semibold text-sm ${naoIniciada ? "text-gray-400" : pct >= 100 ? "text-green-700" : pct > 0 ? "text-yellow-700" : "text-gray-500"}`}>
                                  {naoIniciada ? "0" : fmtNum(p.produzidoUn, 0)} <span className="text-xs font-normal text-gray-400">/ {p.qte} un</span>
                                </span>
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${corBarra}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </td>
                            {/* Peso */}
                            <td className="px-4 py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">{fmtNum(p.pesoTotalKg)} kg</td>
                            {/* Status Syneco */}
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${corStatus}`}>
                                {naoIniciada ? "Não Iniciada" : p.statusSyneco}
                              </span>
                            </td>
                            {/* Setores visitados */}
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1 max-w-[160px]">
                                {p.setoresVisitados.map(s => (
                                  <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${corSetor(s)}`}>{s}</span>
                                ))}
                                {p.setoresVisitados.length === 0 && <span className="text-gray-300 text-xs">—</span>}
                              </div>
                            </td>
                            {/* Último apontamento */}
                            <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {p.ultimaData ? (
                                <div className="flex flex-col gap-0.5">
                                  <span>{fmtDataCurta(p.ultimaData)}</span>
                                  {p.ultimoSetor && <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium w-fit ${corSetor(p.ultimoSetor)}`}>{p.ultimoSetor}</span>}
                                </div>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Card de OP Não Iniciada ──────────────────────────────────────────────────
function CardNaoIniciada({ obra, opInfo }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3 opacity-70 hover:opacity-90 transition-opacity">
      <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-torg-dark text-sm">{opInfo?.numero ? opInfo.numero : obra}</span>
          {opInfo?.cliente && <span className="text-sm text-torg-gray truncate">{opInfo.cliente}</span>}
          {opInfo?.obra    && <span className="text-sm text-gray-400 truncate">· {opInfo.obra}</span>}
        </div>
        <span className="text-xs text-gray-400 mt-0.5 block">Nenhum apontamento no período</span>
      </div>
      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap shrink-0">
        Não iniciada
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MesClient({
  grupos: gruposIniciais,
  opMap:     opMapInicial,
  totaisMap: totaisMapInicial,
  statusMapInicial,
  naoInicidasIniciais,
  setoresDisponiveis: setoresIniciais,
  ultimoSync: ultimoSyncInicial,
  totalGeralBanco,
  deInicial,
  ateInicial,
}) {
  const [grupos,        setGrupos]       = useState(gruposIniciais);
  const [opMap,         setOpMap]        = useState(opMapInicial);
  const [ultimoSync,    setUltimoSync]   = useState(ultimoSyncInicial);
  const [setoresDisp,   setSetoresDisp]  = useState(setoresIniciais);
  const [statusMap,     setStatusMap]    = useState(statusMapInicial || {});
  const [naoIniciadas,  setNaoIniciadas] = useState(naoInicidasIniciais || []);

  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState(null);

  // Filtros
  const [de,           setDe]          = useState(deInicial);
  const [ate,          setAte]         = useState(ateInicial);
  const [buscaOP,      setBuscaOP]     = useState("");
  const [setorFiltro,  setSetorFiltro] = useState("");
  const [statusFiltro, setStatusFiltro]= useState(""); // "" | "Produzindo" | "Finalizado" | "Finalizado Parcial" | "naoIniciada"

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
      setStatusMap(data.statusMap || {});
      setNaoIniciadas(data.naoIniciadas || []);
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

  // Contagens por status (para badges nos filtros)
  const contagensStatus = useMemo(() => {
    const cnt = { Produzindo: 0, Finalizado: 0, "Finalizado Parcial": 0, naoIniciada: naoIniciadas.length };
    for (const st of Object.values(statusMap)) {
      if (st === "Produzindo")       cnt.Produzindo++;
      else if (st === "Finalizado Total" || st === "Finalizado") cnt.Finalizado++;
      else if (st === "Finalizado Parcial") cnt["Finalizado Parcial"]++;
    }
    return cnt;
  }, [statusMap, naoIniciadas]);

  // Filtra OPs por texto + status
  const obras = useMemo(() => {
    let todas = Object.keys(obraGroups).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    // Filtro por status
    if (statusFiltro && statusFiltro !== "naoIniciada") {
      todas = todas.filter(obra => {
        const st = statusMap[obra] || "";
        if (statusFiltro === "Produzindo")          return st === "Produzindo";
        if (statusFiltro === "Finalizado")          return st === "Finalizado" || st === "Finalizado Total";
        if (statusFiltro === "Finalizado Parcial")  return st === "Finalizado Parcial";
        return true;
      });
    }
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
  }, [obraGroups, opMap, buscaOP, statusFiltro, statusMap]);

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

      {/* Banner: histórico limitado */}
      {ultimoSync && (() => {
        const primeiroSync = new Date(totalGeralBanco > 0
          ? "2026-05-27" // data aproximada do primeiro sync — poderia ser dinâmica
          : new Date().toISOString());
        const diasDesde = Math.round((Date.now() - new Date(ultimoSync.criadoEm).getTime()) / 86400000);
        // Mostra aviso se existir sync recente mas os dados começam depois de jan/2026
        return null; // removido do render, instrução fica no painel de diagnóstico
      })()}

      {/* Instrução de backfill — só aparece para ADMIN */}
      {totalGeralBanco > 0 && totalGeralBanco < 500 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-amber-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Histórico limitado</strong> — apenas {totalGeralBanco} apontamentos no banco.
            Para importar dados históricos do Syneco, execute no servidor onde o agente está instalado:
            <code className="block mt-1 bg-amber-100 rounded px-2 py-1 text-xs font-mono text-amber-900">
              node mes-sync-agent.js --start 2026-01-01
            </code>
            <span className="text-xs opacity-80 mt-0.5 block">
              Isso importa todos os apontamentos de 01/01/2026 até hoje.
              Ajuste a data conforme necessário.
            </span>
          </div>
        </div>
      )}

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

      {/* Filtro por status — exibido acima das tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { val: "",                   label: "Todas as OPs",   cor: "bg-gray-100 text-gray-600 border-gray-200",         corAtivo: "bg-torg-dark text-white border-torg-dark",   cnt: Object.keys(obraGroups).length + naoIniciadas.length },
          { val: "Produzindo",         label: "Produzindo",     cor: "bg-blue-50 text-blue-700 border-blue-200",          corAtivo: "bg-blue-600 text-white border-blue-600",      cnt: contagensStatus.Produzindo },
          { val: "Finalizado",         label: "Finalizado",     cor: "bg-green-50 text-green-700 border-green-200",       corAtivo: "bg-green-600 text-white border-green-600",    cnt: contagensStatus.Finalizado },
          { val: "Finalizado Parcial", label: "Parcial",        cor: "bg-yellow-50 text-yellow-700 border-yellow-200",    corAtivo: "bg-yellow-500 text-white border-yellow-500",  cnt: contagensStatus["Finalizado Parcial"] },
          { val: "naoIniciada",        label: "Não Iniciada",   cor: "bg-gray-50 text-gray-500 border-gray-200",          corAtivo: "bg-gray-500 text-white border-gray-500",      cnt: contagensStatus.naoIniciada },
        ].map(({ val, label, cor, corAtivo, cnt }) => (
          <button
            key={val}
            onClick={() => setStatusFiltro(val)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              statusFiltro === val ? corAtivo : cor + " hover:opacity-80"
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              statusFiltro === val ? "bg-white/20" : "bg-black/8"
            }`}>
              {cnt}
            </span>
          </button>
        ))}
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
              {/* Lista de Não Iniciadas */}
              {statusFiltro === "naoIniciada" ? (
                naoIniciadas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-torg-gray gap-3">
                    <CheckCircle2 size={40} className="opacity-30 text-green-500" />
                    <div className="text-center">
                      <div className="font-medium text-green-700">Todas as OPs têm apontamentos!</div>
                      <div className="text-sm mt-1 text-gray-400">Nenhuma OP sem produção no período.</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-torg-gray px-1">
                      {naoIniciadas.length} OP{naoIniciadas.length !== 1 ? "s" : ""} sem apontamentos no período
                    </div>
                    {naoIniciadas
                      .filter(ni => {
                        if (!buscaOP.trim()) return true;
                        const b = buscaOP.toLowerCase();
                        return (
                          (ni.opInfo?.numero  || "").toLowerCase().includes(b) ||
                          (ni.opInfo?.cliente || "").toLowerCase().includes(b) ||
                          (ni.opInfo?.obra    || "").toLowerCase().includes(b)
                        );
                      })
                      .map(ni => (
                        <CardNaoIniciada key={ni.obra} obra={ni.obra} opInfo={ni.opInfo} />
                      ))
                    }
                  </div>
                )
              ) : obras.length === 0 ? (
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
                    {statusFiltro && <span className="text-torg-blue"> · filtro: {statusFiltro}</span>}
                    {buscaOP && <span> · buscando &ldquo;{buscaOP}&rdquo;</span>}
                  </div>
                  {obras.map(obra => (
                    <CardOP
                      key={obra}
                      obra={obra}
                      opInfo={opMap[obra]}
                      setores={obraGroups[obra] || []}
                      statusDominante={statusMap[obra]}
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
            <ViewPorPeca
              de={de}
              ate={ate}
              obrasDisponiveis={Object.keys(obraGroups).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
              )}
            />
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
