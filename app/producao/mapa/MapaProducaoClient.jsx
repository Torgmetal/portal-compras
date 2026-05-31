"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, MapPin,
} from "lucide-react";

const AREAS = [
  { id: "CORTE", label: "Corte", rects: [{ x: 30, y: 30, w: 398, h: 180 }], stroke: "#2563eb", fill: "#eff6ff" },
  { id: "ACABAMENTO", label: "Acabamento", rects: [{ x: 432, y: 30, w: 398, h: 180 }], stroke: "#ea580c", fill: "#fff7ed" },
  { id: "MONTAGEM", label: "Montagem", rects: [{ x: 30, y: 230, w: 400, h: 240 }], stroke: "#059669", fill: "#ecfdf5" },
  { id: "SOLDA", label: "Solda", rects: [{ x: 450, y: 230, w: 380, h: 240 }], stroke: "#d97706", fill: "#fffbeb" },
  { id: "PINTURA", label: "Pintura", rects: [{ x: 870, y: 20, w: 310, h: 340 }], stroke: "#7c3aed", fill: "#f5f3ff" },
  { id: "JATO", label: "Jato", rects: [{ x: 20, y: 500, w: 200, h: 130 }], stroke: "#4f46e5", fill: "#eef2ff" },
  { id: "EXPEDIDO", label: "Expedição", rects: [{ x: 240, y: 500, w: 240, h: 130 }], stroke: "#0d9488", fill: "#f0fdfa" },
  { id: "almoxarifado", label: "Almoxarifado", rects: [{ x: 500, y: 500, w: 200, h: 130 }], stroke: "#64748b", fill: "#f8fafc", support: true },
  { id: "qualidade", label: "Qualidade", rects: [{ x: 720, y: 500, w: 160, h: 130 }], stroke: "#22c55e", fill: "#f0fdf4", support: true },
  { id: "manutencao", label: "Manutenção", rects: [{ x: 880, y: 380, w: 150, h: 100 }], stroke: "#f97316", fill: "#fff7ed", support: true },
  { id: "pcp", label: "PCP / SESMT", rects: [{ x: 1050, y: 380, w: 130, h: 100 }], stroke: "#94a3b8", fill: "#f1f5f9", support: true },
];

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
    if (AREAS.find((a) => a.id === key)?.support) return;
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
    const map = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
    return dados.metas.find((m) => m.setor === key || m.setor === map[key]) || null;
  };

  const getRealizado = (key) => {
    if (!dados) return 0;
    const map = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
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
          <svg viewBox="0 0 1200 650" className="w-full h-auto" style={{ minHeight: 260 }}>
            <defs>
              <pattern id="gridMap" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="1200" height="650" fill="url(#gridMap)" />

            {/* Galpão 01 */}
            <rect x={20} y={20} width={820} height={460} fill="white" stroke="#cbd5e1" strokeWidth={1.5} rx={6} />
            <text x={430} y={225} textAnchor="middle" fill="rgba(0,0,0,0.06)" fontSize={14} fontWeight="bold" letterSpacing={2}>
              GALPÃO 01 — PRODUÇÃO
            </text>

            {/* Galpão 02 */}
            <rect x={870} y={20} width={310} height={340} fill="white" stroke="#cbd5e1" strokeWidth={1.5} rx={6} />
            <text x={1025} y={200} textAnchor="middle" fill="rgba(0,0,0,0.06)" fontSize={12} fontWeight="bold" letterSpacing={2}>
              GALPÃO 02
            </text>

            {/* Sector areas */}
            {AREAS.map((area) => {
              const r = area.rects[0];
              const d = getSetorData(area.id);
              const meta = getMeta(area.id);
              const realizado = getRealizado(area.id);
              const isProd = !area.support;
              const isSelected = setorSelecionado === area.id;
              const metaKg = meta?.valorMensal || 0;
              const aderencia = metaKg > 0 ? Math.min((realizado / metaKg) * 100, 100) : 0;
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              const isSmall = r.w < 210;
              const barW = isSmall ? 80 : 120;

              return (
                <g key={area.id}>
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill={isSelected ? area.fill : isProd ? area.fill : "#f8fafc"}
                    stroke={area.stroke}
                    strokeWidth={isSelected ? 2.5 : 1.2}
                    strokeDasharray={isProd ? "none" : "5 3"}
                    rx={4}
                    opacity={isProd ? 1 : 0.7}
                    className={isProd ? "cursor-pointer transition-all duration-200" : ""}
                    onClick={() => handleSelectSetor(area.id)}
                  />

                  {/* Sector name */}
                  <text
                    x={r.x + 12} y={r.y + 18}
                    fill={area.stroke} fontSize={isSmall ? 10 : 11} fontWeight="700"
                    letterSpacing={0.8} className="pointer-events-none uppercase"
                  >
                    {area.label}
                  </text>

                  {/* Production data */}
                  {isProd && d.qtd > 0 ? (
                    <g className="pointer-events-none">
                      {/* Piece count */}
                      <text x={cx} y={cy - (isSmall ? 10 : 18)} textAnchor="middle" fill="#1e293b" fontSize={isSmall ? 18 : 24} fontWeight="800">
                        {d.qtd.toLocaleString("pt-BR")}
                      </text>
                      <text x={cx} y={cy + (isSmall ? 4 : 2)} textAnchor="middle" fill="#64748b" fontSize={isSmall ? 9 : 10}>
                        peças · {fmtPeso(d.pesoKg)}
                      </text>

                      {/* Meta progress bar */}
                      {metaKg > 0 && (
                        <>
                          <rect x={cx - barW / 2} y={cy + (isSmall ? 12 : 14)} width={barW} height={5} rx={2.5} fill="#e2e8f0" />
                          <rect
                            x={cx - barW / 2} y={cy + (isSmall ? 12 : 14)}
                            width={Math.min(aderencia / 100, 1) * barW} height={5} rx={2.5}
                            fill={area.stroke}
                          />
                          <text x={cx} y={cy + (isSmall ? 28 : 32)} textAnchor="middle" fill={area.stroke} fontSize={isSmall ? 10 : 12} fontWeight="700">
                            {aderencia.toFixed(0)}%
                          </text>
                        </>
                      )}
                    </g>
                  ) : isProd ? (
                    <text x={cx} y={cy + 4} textAnchor="middle" fill="#94a3b8" fontSize={10} className="pointer-events-none">
                      sem peças
                    </text>
                  ) : (
                    <text x={cx} y={cy + 4} textAnchor="middle" fill="#94a3b8" fontSize={9} className="pointer-events-none">
                      apoio
                    </text>
                  )}

                  {/* Selected indicator */}
                  {isSelected && (
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={area.stroke} strokeWidth={3} rx={4} className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Flow arrows */}
            <defs>
              <marker id="arrowMap" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {/* Corte → Montagem */}
            <line x1={229} y1={210} x2={229} y2={228} stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            {/* Montagem → Solda */}
            <line x1={430} y1={350} x2={448} y2={350} stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            {/* Solda → Acabamento */}
            <line x1={640} y1={228} x2={640} y2={210} stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            {/* Acabamento → Jato */}
            <path d="M432,180 Q10,400 120,498" fill="none" stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            {/* Jato → Pintura */}
            <path d="M220,565 Q540,640 870,200" fill="none" stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
            {/* Pintura → Expedição */}
            <path d="M870,340 Q700,480 480,498" fill="none" stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#arrowMap)" />
          </svg>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 flex-wrap text-[11px] text-torg-gray">
          <span className="font-semibold text-torg-dark uppercase text-[10px] tracking-wide">Legenda:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border inline-block" style={{ borderColor: "#2563eb", backgroundColor: "#eff6ff" }} /> Setor produtivo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-dashed inline-block" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }} /> Apoio
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#arrowMap)" /></svg> Fluxo
          </span>
        </div>
      </div>

      {/* Detail Panel */}
      {setorSelecionado && (
        <PecasDetalhe
          area={AREAS.find((a) => a.id === setorSelecionado)}
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
