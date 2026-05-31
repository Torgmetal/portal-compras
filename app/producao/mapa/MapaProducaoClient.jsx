"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Package, Scissors, Wrench, Zap, Sparkles, Wind, Paintbrush, Truck,
  ArrowRight, ArrowDown, Loader2, AlertCircle, RefreshCw, ChevronDown,
  ChevronUp,
} from "lucide-react";

const SETORES = [
  { key: "PENDENTE", label: "Pendente", Icon: Package, accent: "#6b7280", bgLight: "#f3f4f6", borderLight: "#d1d5db" },
  { key: "CORTE", label: "Corte", Icon: Scissors, accent: "#2563eb", bgLight: "#eff6ff", borderLight: "#93c5fd" },
  { key: "MONTAGEM", label: "Montagem", Icon: Wrench, accent: "#059669", bgLight: "#ecfdf5", borderLight: "#6ee7b7" },
  { key: "SOLDA", label: "Solda", Icon: Zap, accent: "#d97706", bgLight: "#fffbeb", borderLight: "#fcd34d" },
  { key: "ACABAMENTO", label: "Acabamento", Icon: Sparkles, accent: "#ea580c", bgLight: "#fff7ed", borderLight: "#fdba74" },
  { key: "JATO", label: "Jato", Icon: Wind, accent: "#4f46e5", bgLight: "#eef2ff", borderLight: "#a5b4fc" },
  { key: "PINTURA", label: "Pintura", Icon: Paintbrush, accent: "#7c3aed", bgLight: "#f5f3ff", borderLight: "#c4b5fd" },
  { key: "EXPEDIDO", label: "Expedido", Icon: Truck, accent: "#0d9488", bgLight: "#f0fdfa", borderLight: "#5eead4" },
];

const FLOW_PROD = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

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
    if (!dados) return { qtd: 0, pesoKg: 0, count: 0 };
    return dados.statusAgg.find((s) => s.status === key) || { qtd: 0, pesoKg: 0, count: 0 };
  };

  const getMeta = (key) => {
    if (!dados) return null;
    const setorMap = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
    return dados.metas.find((m) => m.setor === key || m.setor === setorMap[key]) || null;
  };

  const getRealizado = (key) => {
    if (!dados) return 0;
    const setorMap = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedicao" };
    const r = dados.realizadoMes.find((r) => r.setor === key || r.setor === setorMap[key]);
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

      {/* Flow: Row 1 — PENDENTE → CORTE → MONTAGEM → SOLDA → ACABAMENTO */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1.5 h-5 rounded-full bg-torg-blue" />
          <h2 className="text-sm font-semibold text-torg-dark uppercase tracking-wide">Fluxo de Produção</h2>
          <p className="text-xs text-torg-gray ml-auto">Clique no setor para ver as peças</p>
        </div>

        {/* Row 1: CORTE → MONTAGEM → SOLDA → ACABAMENTO */}
        <div className="flex items-stretch gap-2 overflow-x-auto pb-3">
          <SetorCard
            setor={SETORES[0]}
            data={getSetorData("PENDENTE")}
            meta={getMeta("PENDENTE")}
            realizado={getRealizado("PENDENTE")}
            selected={setorSelecionado === "PENDENTE"}
            onClick={() => handleSelectSetor("PENDENTE")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[1]}
            data={getSetorData("CORTE")}
            meta={getMeta("CORTE")}
            realizado={getRealizado("CORTE")}
            selected={setorSelecionado === "CORTE"}
            onClick={() => handleSelectSetor("CORTE")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[2]}
            data={getSetorData("MONTAGEM")}
            meta={getMeta("MONTAGEM")}
            realizado={getRealizado("MONTAGEM")}
            selected={setorSelecionado === "MONTAGEM"}
            onClick={() => handleSelectSetor("MONTAGEM")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[3]}
            data={getSetorData("SOLDA")}
            meta={getMeta("SOLDA")}
            realizado={getRealizado("SOLDA")}
            selected={setorSelecionado === "SOLDA"}
            onClick={() => handleSelectSetor("SOLDA")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[4]}
            data={getSetorData("ACABAMENTO")}
            meta={getMeta("ACABAMENTO")}
            realizado={getRealizado("ACABAMENTO")}
            selected={setorSelecionado === "ACABAMENTO"}
            onClick={() => handleSelectSetor("ACABAMENTO")}
          />
        </div>

        {/* Connector arrow down */}
        <div className="flex justify-end pr-16 py-1">
          <ArrowDown size={20} className="text-gray-300" />
        </div>

        {/* Row 2: JATO → PINTURA → EXPEDIDO (reversed visually) */}
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1 justify-end">
          <SetorCard
            setor={SETORES[5]}
            data={getSetorData("JATO")}
            meta={getMeta("JATO")}
            realizado={getRealizado("JATO")}
            selected={setorSelecionado === "JATO"}
            onClick={() => handleSelectSetor("JATO")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[6]}
            data={getSetorData("PINTURA")}
            meta={getMeta("PINTURA")}
            realizado={getRealizado("PINTURA")}
            selected={setorSelecionado === "PINTURA"}
            onClick={() => handleSelectSetor("PINTURA")}
          />
          <FlowArrow />
          <SetorCard
            setor={SETORES[7]}
            data={getSetorData("EXPEDIDO")}
            meta={getMeta("EXPEDIDO")}
            realizado={getRealizado("EXPEDIDO")}
            selected={setorSelecionado === "EXPEDIDO"}
            onClick={() => handleSelectSetor("EXPEDIDO")}
          />
        </div>
      </div>

      {/* Detail Panel */}
      {setorSelecionado && (
        <PecasDetalhe
          setor={SETORES.find((s) => s.key === setorSelecionado)}
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

function FlowArrow() {
  return (
    <div className="flex items-center shrink-0 px-0.5">
      <ArrowRight size={18} className="text-gray-300" />
    </div>
  );
}

function SetorCard({ setor, data, meta, realizado, selected, onClick }) {
  const { key, label, Icon, accent, bgLight, borderLight } = setor;
  const { qtd, pesoKg } = data;
  const metaKg = meta?.valorMensal || 0;
  const aderencia = metaKg > 0 ? Math.min((realizado / metaKg) * 100, 100) : 0;
  const isEmpty = qtd === 0 && pesoKg === 0;

  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[140px] max-w-[200px] rounded-xl border-2 p-3 text-left transition-all duration-200 hover:shadow-md"
      style={{
        borderColor: selected ? accent : borderLight,
        backgroundColor: selected ? bgLight : "white",
        boxShadow: selected ? `0 0 0 1px ${accent}30` : undefined,
      }}
    >
      {/* Header: icon + name */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bgLight }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{label}</span>
      </div>

      {/* Metrics */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold text-torg-dark">{qtd}</span>
          <span className="text-[10px] text-torg-gray">peças</span>
        </div>
        <p className="text-xs text-torg-gray">{fmtPeso(pesoKg)}</p>

        {/* Progress bar (meta) */}
        {metaKg > 0 && (
          <div className="mt-1.5">
            <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${aderencia}%`, backgroundColor: accent }} />
            </div>
            <p className="text-[10px] text-torg-gray mt-0.5">
              {fmtPeso(realizado)} / {fmtPeso(metaKg * 1000)}
            </p>
          </div>
        )}

        {isEmpty && key !== "EXPEDIDO" && (
          <p className="text-[10px] text-gray-400 italic">Nenhuma peça</p>
        )}
      </div>
    </button>
  );
}

function PecasDetalhe({ setor, pecas, loading, data }) {
  const [expandido, setExpandido] = useState(true);
  const { label, Icon, accent, bgLight } = setor;

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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgLight }}>
            <Icon size={16} style={{ color: accent }} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-torg-dark">{label}</h3>
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
                          {pecasOp[0]?.dataPrevista && <th className="py-1.5 pl-3 font-medium text-right">Prevista</th>}
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
                            {p.dataPrevista && <td className="py-1.5 pl-3 text-right text-torg-gray">{fmtData(p.dataPrevista)}</td>}
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
