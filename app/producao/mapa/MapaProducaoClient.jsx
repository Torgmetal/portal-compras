"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, ChevronRight, MapPin,
  AlertTriangle, Clock, Download,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, downloadWorkbook, CORES,
} from "@/lib/excel-relatorio";

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
  return `${Math.round(kg).toLocaleString("pt-BR")} kg`;
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Calcula dias desde uma data */
function diasDesde(data) {
  if (!data) return null;
  const d = new Date(data);
  const agora = new Date();
  return Math.floor((agora - d) / (1000 * 60 * 60 * 24));
}

/** Formata tempo no setor */
function fmtTempo(dias) {
  if (dias == null) return "—";
  if (dias === 0) return "Hoje";
  if (dias === 1) return "1 dia";
  return `${dias} dias`;
}

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
    if (!dados) return { qtd: 0, pesoKg: 0, alertas: null };
    return dados.statusAgg.find((s) => s.status === key) || { qtd: 0, pesoKg: 0, alertas: null };
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

  // Total de alertas
  const totalAlertas = dados
    ? dados.statusAgg.reduce((sum, s) => sum + (s.alertas?.qtd || 0), 0)
    : 0;

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <KpiCard label="Em produção" valor={totalEmProducao} sub="peças" cor="#2563eb" />
        <KpiCard label="Peso em produção" valor={fmtPeso(pesoEmProducao)} cor="#059669" />
        <KpiCard label="Expedido no mês" valor={totalExpedido.qtd} sub="peças" cor="#0d9488" />
        <KpiCard label="Peso expedido" valor={fmtPeso(totalExpedido.pesoKg)} cor="#0d9488" />
        {totalAlertas > 0 && (
          <KpiCard label="Peças paradas" valor={totalAlertas} sub="há +1 dia" cor="#dc2626" icon={AlertTriangle} />
        )}
      </div>

      {/* Alerta geral se houver peças paradas */}
      {totalAlertas > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {totalAlertas} peça{totalAlertas > 1 ? "s" : ""} parada{totalAlertas > 1 ? "s" : ""} há mais de 1 dia
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Clique no setor para ver os detalhes e tomar providências.
            </p>
          </div>
        </div>
      )}

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
          <div className="flex flex-wrap items-stretch gap-2.5">
            {FLOW_ORDER.map((key, i) => {
              const area = AREAS.find((a) => a.statusKey === key);
              const d = getSetorData(key);
              const meta = getMeta(key);
              const realizado = getRealizado(key);
              const metaKg = meta?.valorMensal || 0;
              const aderencia = metaKg > 0 ? Math.min((realizado / metaKg) * 100, 100) : null;
              const alertaQtd = d.alertas?.qtd || 0;
              const isSelected = setorSelecionado === key;

              return (
                <Fragment key={key}>
                  <button
                    onClick={() => handleSelectSetor(key)}
                    className="relative flex-1 min-w-[150px] text-left rounded-xl border-2 p-3.5 transition-shadow hover:shadow-md"
                    style={{
                      borderColor: area.stroke,
                      backgroundColor: area.fill,
                      boxShadow: isSelected ? `0 0 0 3px ${area.stroke}55` : undefined,
                    }}
                  >
                    {alertaQtd > 0 && (
                      <span
                        className="absolute -top-2.5 -right-2.5 min-w-[24px] h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow"
                        title={`${alertaQtd} parada(s) há mais de 1 dia`}
                      >
                        {alertaQtd > 99 ? "99+" : alertaQtd}
                      </span>
                    )}
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: area.stroke }}>
                      {area.label}
                    </p>
                    {d.qtd > 0 ? (
                      <>
                        <p className="text-3xl font-extrabold text-torg-dark leading-none mt-2 tabular-nums">
                          {d.qtd.toLocaleString("pt-BR")}
                        </p>
                        <p className="text-[11px] text-torg-gray mt-1">peças · {fmtPeso(d.pesoKg)}</p>
                        {aderencia != null && (
                          <div className="mt-2.5">
                            <div className="h-2 rounded-full bg-white/80 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${aderencia}%`, backgroundColor: area.stroke }} />
                            </div>
                            <p className="text-[10px] font-semibold mt-1" style={{ color: area.stroke }}>
                              {aderencia.toFixed(0)}% da meta
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 mt-3">sem peças</p>
                    )}
                  </button>
                  {i < FLOW_ORDER.length - 1 && (
                    <div className="hidden sm:flex items-center self-center text-gray-300 shrink-0">
                      <ChevronRight size={20} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
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
          <span className="flex items-center gap-1 ml-2">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
            <span className="text-red-600 font-medium">Parada há +1 dia</span>
          </span>
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

function KpiCard({ label, valor, sub, cor, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-torg-gray uppercase tracking-wide flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {label}
      </p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold" style={{ color: cor }}>{valor}</span>
        {sub && <span className="text-xs text-torg-gray">{sub}</span>}
      </div>
    </div>
  );
}

function PecasDetalhe({ area, pecas, loading, data }) {
  const [expandido, setExpandido] = useState(true);
  const [exportando, setExportando] = useState(false);

  const porOp = {};
  pecas.forEach((p) => {
    if (!porOp[p.opNumero]) porOp[p.opNumero] = { cliente: p.op?.cliente || "—", obra: p.op?.obra || "", pecas: [] };
    porOp[p.opNumero].pecas.push(p);
  });

  // Peças com alerta (>1 dia no setor)
  const pecasComAlerta = pecas.filter((p) => diasDesde(p.atualizadoEm) > 1);
  const totalAlerta = pecasComAlerta.reduce((s, p) => s + (p.qte || 1), 0);

  // Exportar relatório do setor
  async function exportarSetor() {
    setExportando(true);
    try {
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Mapa da Produção — ${area.label}`,
        subtitulo: `${data.qtd} peças · ${fmtPeso(data.pesoKg)}`,
        kpis: [
          totalAlerta > 0
            ? `⚠ ${totalAlerta} peça${totalAlerta > 1 ? "s" : ""} parada${totalAlerta > 1 ? "s" : ""} há mais de 1 dia`
            : `✓ Nenhuma peça parada há mais de 1 dia`,
        ],
        totalColunas: 8,
        nomePlanilha: area.label,
      });

      // Larguras
      ws.columns = [
        { width: 10 }, // OP
        { width: 14 }, // Marca
        { width: 28 }, // Descrição
        { width: 8 },  // Qtd
        { width: 12 }, // Peso unit
        { width: 12 }, // Peso total
        { width: 14 }, // Tempo no setor
        { width: 10 }, // Alerta
      ];

      let row = linhaInicio;

      // Header
      adicionarHeaderTabela(ws, row, ["OP", "Marca", "Descrição", "Qtd", "Peso unit.", "Peso total", "Tempo no setor", "Alerta"]);
      row++;
      const primeiraLinha = row;

      // Dados
      for (const [opNum, { pecas: pecasOp }] of Object.entries(porOp)) {
        for (const p of pecasOp) {
          const dias = diasDesde(p.atualizadoEm);
          const temAlerta = dias > 1;
          const fontColors = {};
          if (temAlerta) {
            fontColors[6] = "DC2626"; // vermelho
            fontColors[7] = "DC2626";
          }
          adicionarLinhaTabela(ws, row, [
            fmtOP(opNum),
            p.marca,
            p.descricao || "—",
            p.qte,
            p.pesoUnitKg ? Number(p.pesoUnitKg.toFixed(1)) : 0,
            p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : 0,
            fmtTempo(dias),
            temAlerta ? "PARADA" : "OK",
          ], {
            fillColor: temAlerta ? "FEF2F2" : undefined,
            fontColors,
            alinhamento: { 3: "center", 4: "right", 5: "right", 6: "center", 7: "center" },
          });
          row++;
        }
      }

      // Totais com formulas Excel
      const ultimaLinha = row - 1;
      adicionarLinhaTotais(ws, row, [
        "TOTAL", "", "",
        { formula: `SUM(D${primeiraLinha}:D${ultimaLinha})` },
        "",
        { formula: `SUM(F${primeiraLinha}:F${ultimaLinha})` },
        pecasComAlerta.length > 0 ? `${totalAlerta} paradas` : "—", "",
      ]);
      const fileName = `Mapa_${area.label}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadWorkbook(workbook, fileName);
    } catch (e) {
      alert("Erro ao exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full px-5 py-3 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: area.stroke }} />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
              {area.label}
              {totalAlerta > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {totalAlerta} parada{totalAlerta > 1 ? "s" : ""}
                </span>
              )}
            </h3>
            <p className="text-xs text-torg-gray">{data.qtd} peças · {fmtPeso(data.pesoKg)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); exportarSetor(); }}
            disabled={exportando || loading || pecas.length === 0}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Exportar
          </button>
          {expandido ? <ChevronUp size={16} className="text-torg-gray" /> : <ChevronDown size={16} className="text-torg-gray" />}
        </div>
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
              {Object.entries(porOp).map(([opNum, { cliente, obra, pecas: pecasOp }]) => (
                <div key={opNum}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-torg-dark bg-gray-100 px-2 py-0.5 rounded">{fmtOP(opNum)}</span>
                    <span className="text-xs text-torg-gray">{cliente}{obra ? ` · ${obra}` : ""}</span>
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
                          <th className="py-1.5 pr-3 font-medium text-right">Peso total</th>
                          <th className="py-1.5 pr-3 font-medium text-center">Tempo no setor</th>
                          <th className="py-1.5 font-medium text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pecasOp.map((p) => {
                          const dias = diasDesde(p.atualizadoEm);
                          const temAlerta = dias > 1 && area.statusKey !== "PENDENTE" && area.statusKey !== "EXPEDIDO";
                          return (
                            <tr
                              key={p.id}
                              className={`border-b border-gray-50 hover:bg-gray-50/50 ${temAlerta ? "bg-red-50/60" : ""}`}
                            >
                              <td className="py-1.5 pr-3 font-mono font-medium text-torg-dark">{p.marca}</td>
                              <td className="py-1.5 pr-3 text-torg-gray max-w-[200px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                              <td className="py-1.5 pr-3 text-right text-torg-dark">{p.qte}</td>
                              <td className="py-1.5 pr-3 text-right text-torg-gray">{fmtPeso(p.pesoUnitKg)}</td>
                              <td className="py-1.5 pr-3 text-right font-medium text-torg-dark">{fmtPeso(p.pesoTotalKg)}</td>
                              <td className="py-1.5 pr-3 text-center">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                  temAlerta ? "text-red-600" : dias === 0 ? "text-emerald-600" : "text-torg-gray"
                                }`}>
                                  <Clock size={10} />
                                  {fmtTempo(dias)}
                                </span>
                              </td>
                              <td className="py-1.5 text-center">
                                {temAlerta ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                    <AlertTriangle size={9} /> PARADA
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-emerald-600">OK</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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
