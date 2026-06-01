"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, MapPin,
} from "lucide-react";

const AREAS = [
  { id: "PENDENTE", label: "Estoque", rects: [{ x: 30, y: 15, w: 810, h: 80 }], stroke: "#64748b", fill: "#f1f5f9", statusKey: "PENDENTE" },
  { id: "CORTE", label: "Preparação", rects: [{ x: 30, y: 115, w: 810, h: 120 }], stroke: "#2563eb", fill: "#eff6ff", statusKey: "CORTE" },
  { id: "MONTAGEM", label: "Montagem", rects: [{ x: 30, y: 255, w: 395, h: 185 }], stroke: "#059669", fill: "#ecfdf5", statusKey: "MONTAGEM" },
  { id: "SOLDA", label: "Solda", rects: [{ x: 440, y: 255, w: 400, h: 185 }], stroke: "#d97706", fill: "#fffbeb", statusKey: "SOLDA" },
  { id: "JATO", label: "Jato", rects: [{ x: 440, y: 470, w: 400, h: 110 }], stroke: "#4f46e5", fill: "#eef2ff", statusKey: "JATO" },
  { id: "EXPEDIDO", label: "Expedição", rects: [{ x: 890, y: 15, w: 280, h: 200 }], stroke: "#0d9488", fill: "#f0fdfa", statusKey: "EXPEDIDO" },
  { id: "PINTURA", label: "Pintura", rects: [{ x: 890, y: 235, w: 280, h: 210 }], stroke: "#7c3aed", fill: "#f5f3ff", statusKey: "PINTURA" },
];

const FLOW_ORDER = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "JATO", "PINTURA", "EXPEDIDO"];

const fmtPeso = (kg) => {
  if (!kg) return "0 kg";
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${Math.round(kg).toLocaleString("pt-BR")} kg`;
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function MapaProducaoClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [pecas, setPecas] = useState([]);
  const [loadingPecas, setLoadingPecas] = useState(false);

  const now = new Date();
  const [mesAtual, setMesAtual] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/producao/mapa?mes=${mesAtual}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      setDados(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mesAtual]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  const handleSelectSetor = async (key) => {
    if (setorSelecionado === key) {
      setSetorSelecionado(null);
      setPecas([]);
      return;
    }
    setSetorSelecionado(key);
    setLoadingPecas(true);
    try {
      const res = await fetch(`/api/producao/mapa?setor=${key}&mes=${mesAtual}`);
      const data = await res.json();
      setPecas(data.pecas || []);
    } catch {
      setPecas([]);
    } finally {
      setLoadingPecas(false);
    }
  };

  const getSetorData = (key) => {
    if (!dados) return { qtd: 0, pesoKg: 0 };
    return dados.statusAgg.find((s) => s.status === key) || { qtd: 0, pesoKg: 0 };
  };

  const getMeta = (key) => {
    if (!dados) return null;
    const map = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
    return dados.metas.find((m) => m.setor === key || m.setor === map[key]) || null;
  };

  const getRealizado = (key) => {
    if (!dados) return 0;
    const map = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
    const r = dados.realizadoMes.find((r) => r.setor === key || r.setor === map[key]);
    return r?.realizadoKg || 0;
  };

  const totalEmProducao = dados ? dados.statusAgg.filter((s) => s.status !== "EXPEDIDO").reduce((sum, s) => sum + (s.qtd || 0), 0) : 0;
  const pesoEmProducao = dados ? dados.statusAgg.filter((s) => s.status !== "EXPEDIDO").reduce((sum, s) => sum + (s.pesoKg || 0), 0) : 0;
  const totalExpedido = getSetorData("EXPEDIDO");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-torg-gray">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span className="text-sm">Carregando mapa da produção…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-red-500 gap-3">
        <AlertCircle size={32} />
        <p className="text-sm">{error}</p>
        <button onClick={fetchDados} className="text-sm text-torg-blue hover:underline flex items-center gap-1">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Mapa da Produção</h1>
          <p className="text-sm text-torg-gray mt-1">Rastreamento de peças por setor da fábrica</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={mesAtual}
            onChange={(e) => setMesAtual(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-torg-dark focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const y = now.getFullYear();
              const val = `${y}-${String(m).padStart(2, "0")}`;
              return <option key={val} value={val}>{MESES[i]} {y}</option>;
            })}
          </select>
          <button onClick={fetchDados} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-torg-gray transition" title="Atualizar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Em produção" valor={totalEmProducao} sub="peças" cor="#2563eb" />
        <KpiCard label="Peso em produção" valor={fmtPeso(pesoEmProducao)} cor="#059669" />
        <KpiCard label="Expedido no mês" valor={totalExpedido.qtd} sub="peças" cor="#0d9488" />
        <KpiCard label="Peso expedido" valor={fmtPeso(totalExpedido.pesoKg)} cor="#0d9488" />
      </div>

      {/* Factory floor SVG map */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-torg-blue" />
            <h2 className="text-sm font-semibold text-torg-dark uppercase tracking-wide">Planta da Fábrica</h2>
          </div>
          <p className="text-xs text-torg-gray">Clique no setor para ver as peças</p>
        </div>

        <div className="p-4 bg-slate-50">
          <svg viewBox="0 0 1200 600" className="w-full h-auto" style={{ minHeight: 260 }}>
            <defs>
              <pattern id="gridMap" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
              </pattern>
              <marker id="arrowMap" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
            </defs>
            <rect width="1200" height="600" fill="url(#gridMap)" />

            {/* Galpão 01 — Produção */}
            <rect x={15} y={5} width={850} height={450} fill="white" stroke="#cbd5e1" strokeWidth={1.5} rx={6} />
            <text x={435} y={230} textAnchor="middle" fill="rgba(0,0,0,0.05)" fontSize={16} fontWeight="bold" letterSpacing={3}>
              GALPÃO 01 — PRODUÇÃO
            </text>

            {/* Galpão 02 — Pintura */}
            <rect x={880} y={5} width={300} height={450} fill="white" stroke="#cbd5e1" strokeWidth={1.5} rx={6} />
            <text x={1030} y={200} textAnchor="middle" fill="rgba(0,0,0,0.05)" fontSize={13} fontWeight="bold" letterSpacing={3}>
              GALPÃO 02
            </text>

            {/* Sector areas */}
            {AREAS.map((area) => {
              const r = area.rects[0];
              const d = getSetorData(area.statusKey);
              const meta = getMeta(area.statusKey);
              const realizado = getRealizado(area.statusKey);
              const isSelected = setorSelecionado === area.statusKey;
              const metaKg = meta?.valorMensal || 0;
              const aderencia = metaKg > 0 ? Math.min((realizado / metaKg) * 100, 100) : 0;
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              const isWide = r.w > 500;
              const isSmall = r.h < 130;
              const barW = isWide ? 160 : isSmall ? 80 : 120;

              return (
                <g key={area.id}>
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill={area.fill}
                    stroke={area.stroke}
                    strokeWidth={isSelected ? 2.5 : 1.2}
                    rx={4}
                    className="cursor-pointer transition-all duration-200"
                    onClick={() => handleSelectSetor(area.statusKey)}
                  />

                  {/* Sector name */}
                  <text
                    x={r.x + 12} y={r.y + 18}
                    fill={area.stroke} fontSize={11} fontWeight="700"
                    letterSpacing={0.8} className="pointer-events-none uppercase"
                  >
                    {area.label}
                  </text>

                  {/* Piece data */}
                  {d.qtd > 0 ? (
                    <g className="pointer-events-none">
                      <text x={cx} y={cy - (isSmall ? 6 : 14)} textAnchor="middle" fill="#1e293b" fontSize={isSmall ? 18 : 24} fontWeight="800">
                        {d.qtd.toLocaleString("pt-BR")}
                      </text>
                      <text x={cx} y={cy + (isSmall ? 8 : 4)} textAnchor="middle" fill="#64748b" fontSize={isSmall ? 9 : 10}>
                        peças · {fmtPeso(d.pesoKg)}
                      </text>

                      {metaKg > 0 && (
                        <>
                          <rect x={cx - barW / 2} y={cy + (isSmall ? 16 : 14)} width={barW} height={5} rx={2.5} fill="#e2e8f0" />
                          <rect
                            x={cx - barW / 2} y={cy + (isSmall ? 16 : 14)}
                            width={Math.min(aderencia / 100, 1) * barW} height={5} rx={2.5}
                            fill={area.stroke}
                          />
                          <text x={cx} y={cy + (isSmall ? 30 : 32)} textAnchor="middle" fill={area.stroke} fontSize={isSmall ? 10 : 12} fontWeight="700">
                            {aderencia.toFixed(0)}%
                          </text>
                        </>
                      )}
                    </g>
                  ) : (
                    <text x={cx} y={cy + 4} textAnchor="middle" fill="#94a3b8" fontSize={10} className="pointer-events-none">
                      sem peças
                    </text>
                  )}

                  {isSelected && (
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={area.stroke} strokeWidth={3} rx={4} className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Flow arrows: Estoque → Prep → Mont → Solda → Jato ... Pintura → Exp */}

            {/* 1. Estoque → Preparação */}
            <path d="M435,97 L435,113" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={445} y={108} fill="#94a3b8" fontSize={8} fontWeight="600">①</text>

            {/* 2. Preparação → Montagem */}
            <path d="M300,237 L300,253" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={310} y={248} fill="#94a3b8" fontSize={8} fontWeight="600">②</text>

            {/* 3. Montagem → Solda */}
            <path d="M427,350 L438,350" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={433} y={342} fill="#94a3b8" fontSize={8} fontWeight="600">③</text>

            {/* 4. Solda → Jato */}
            <path d="M640,442 L640,468" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={650} y={458} fill="#94a3b8" fontSize={8} fontWeight="600">④</text>

            {/* 5. Jato → Pintura */}
            <path d="M842,525 L1030,525 L1030,447" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={930} y={518} fill="#94a3b8" fontSize={8} fontWeight="600">⑤</text>

            {/* 6. Pintura → Expedição (up in Galpão 02) */}
            <path d="M1030,233 L1030,217" fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            <text x={1040} y={228} fill="#94a3b8" fontSize={8} fontWeight="600">⑥</text>
          </svg>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-5 flex-wrap text-[11px] text-torg-gray">
          <span className="font-semibold text-torg-dark uppercase text-[10px] tracking-wide">Fluxo:</span>
          {FLOW_ORDER.map((key, i) => {
            const area = AREAS.find((a) => a.statusKey === key);
            return (
              <span key={key} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm inline-block border" style={{ borderColor: area.stroke, backgroundColor: area.fill }} />
                <span>{area.label}</span>
                {i < FLOW_ORDER.length - 1 && <span className="ml-1 text-gray-300">→</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      {setorSelecionado && (
        <PecasDetalhe
          area={AREAS.find((a) => a.statusKey === setorSelecionado)}
          pecas={pecas}
          loading={loadingPecas}
          data={getSetorData(setorSelecionado)}
        />
      )}
    </div>
  );
}

function KpiCard({ label, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-torg-gray uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold" style={{ color: cor }}>{valor}</span>
        {sub && <span className="text-xs text-torg-gray">{sub}</span>}
      </div>
    </div>
  );
}

function PecasDetalhe({ area, pecas, loading, data }) {
  const [expandido, setExpandido] = useState(true);

  const porOp = {};
  pecas.forEach((p) => {
    if (!porOp[p.opNumero]) porOp[p.opNumero] = { cliente: p.op?.cliente || "—", pecas: [] };
    porOp[p.opNumero].pecas.push(p);
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full px-5 py-3 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: area.stroke }} />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-torg-dark">{area.label}</h3>
            <p className="text-xs text-torg-gray">{data.qtd} peças · {fmtPeso(data.pesoKg)}</p>
          </div>
        </div>
        {expandido ? <ChevronUp size={16} className="text-torg-gray" /> : <ChevronDown size={16} className="text-torg-gray" />}
      </button>

      {expandido && (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-torg-gray">
              <Loader2 size={18} className="animate-spin mr-2" /> Carregando peças…
            </div>
          ) : pecas.length === 0 ? (
            <p className="text-sm text-torg-gray text-center py-6">Nenhuma peça neste setor</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(porOp).map(([opNum, { cliente, pecas: pecasOp }]) => (
                <div key={opNum}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-torg-dark bg-gray-100 px-2 py-0.5 rounded">OP {opNum}</span>
                    <span className="text-xs text-torg-gray">{cliente}</span>
                    <span className="text-xs text-torg-gray ml-auto">{pecasOp.reduce((s, p) => s + p.qte, 0)} pç · {fmtPeso(pecasOp.reduce((s, p) => s + p.pesoTotalKg, 0))}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-torg-gray border-b border-gray-100">
                          <th className="py-1.5 pr-3 font-medium">Marca</th>
                          <th className="py-1.5 pr-3 font-medium">Descrição</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Qtd</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Peso unit.</th>
                          <th className="py-1.5 font-medium text-right">Peso total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pecasOp.map((p) => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="py-1.5 pr-3 font-mono font-medium text-torg-dark">{p.marca}</td>
                            <td className="py-1.5 pr-3 text-torg-gray">{p.descricao || "—"}</td>
                            <td className="py-1.5 pr-3 text-right text-torg-dark">{p.qte}</td>
                            <td className="py-1.5 pr-3 text-right text-torg-gray">{fmtPeso(p.pesoUnitKg)}</td>
                            <td className="py-1.5 text-right font-medium text-torg-dark">{fmtPeso(p.pesoTotalKg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
