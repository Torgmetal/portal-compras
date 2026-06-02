"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Loader2, AlertCircle, RefreshCw, Weight,
  Package, Cpu, Users, TrendingUp, ChevronRight, Activity,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { FLUXO_VISUAL, corSetor, normSetor } from "@/lib/setores";
import { fmtOP } from "@/lib/utils";

const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—";
const fmtNum = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";

const STATUS_ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const STATUS_CORES = {
  PENDENTE: "#94a3b8", CORTE: "#b91c1c", MONTAGEM: "#1d4ed8", SOLDA: "#c2410c",
  ACABAMENTO: "#7e22ce", JATO: "#0e7490", PINTURA: "#15803d", EXPEDIDO: "#0f766e",
};
const STATUS_LABELS = {
  PENDENTE: "Pendente", CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

export default function PCPDashboardClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

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
        <span className="ml-3 text-sm text-torg-gray">Carregando dashboard PCP...</span>
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

  const { kgPorSetor, pipeline, tendencia, maquinasAtivas, ops, totalPecasAtivas, metasSemana } = data;

  // KPI totais
  const totalHoje = kgPorSetor.hoje.reduce((s, r) => s + (r._sum.produzidoKg || 0), 0);
  const totalSemana = kgPorSetor.semana.reduce((s, r) => s + (r._sum.produzidoKg || 0), 0);
  const totalMes = kgPorSetor.mes.reduce((s, r) => s + (r._sum.produzidoKg || 0), 0);

  // Pipeline pra gráfico pizza
  const pipelineData = STATUS_ORDEM
    .map((s) => {
      const item = pipeline.find((p) => p.status === s);
      return item ? { name: STATUS_LABELS[s], value: item._count, kg: item._sum.pesoTotalKg || 0, fill: STATUS_CORES[s] } : null;
    })
    .filter(Boolean);

  // KG por setor hoje pra gráfico de barras
  const setorHojeData = FLUXO_VISUAL.map((setor) => {
    const norm = normSetor(setor);
    const item = kgPorSetor.hoje.find((r) => normSetor(r.setor) === norm);
    return {
      setor,
      kg: item?._sum.produzidoKg || 0,
      fill: corSetor(setor).hex,
    };
  }).filter((s) => s.kg > 0);

  // Meta vs Realizado da semana agrupado por setor
  const metasPorSetor = {};
  for (const m of metasSemana) {
    if (!metasPorSetor[m.setor]) metasPorSetor[m.setor] = { setor: m.setor, meta: 0, realizado: 0 };
    metasPorSetor[m.setor].meta += m.pesoMetaKg || 0;
    metasPorSetor[m.setor].realizado += m.pesoRealizadoKg || 0;
  }
  const metasArr = Object.values(metasPorSetor).filter((m) => m.meta > 0 || m.realizado > 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <LayoutDashboard size={28} className="text-torg-blue" />
            Dashboard PCP
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Visão consolidada do chão de fábrica — dados do Syneco em tempo real.
          </p>
        </div>
        <button
          onClick={carregar}
          className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon={Weight} label="Produzido hoje" value={fmtKg(totalHoje)} cor="bg-torg-blue" />
        <KpiCard icon={TrendingUp} label="Produzido semana" value={fmtKg(totalSemana)} cor="bg-torg-blue-700" />
        <KpiCard icon={Activity} label="Produzido mês" value={fmtKg(totalMes)} cor="bg-emerald-600" />
        <KpiCard icon={Package} label="Peças ativas" value={fmtNum(totalPecasAtivas)} cor="bg-torg-orange" />
      </div>

      {/* Máquinas ativas */}
      {maquinasAtivas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Cpu size={18} className="text-torg-blue" />
            <h3 className="text-lg font-semibold text-torg-dark">Máquinas produzindo agora</h3>
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {maquinasAtivas.length} ativas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Setor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Máquina</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peça</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operador</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">KG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {maquinasAtivas.map((m, i) => {
                  const c = corSetor(m.setor);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>
                          {m.setor || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-torg-dark">{m.maquina || "—"}</td>
                      <td className="px-4 py-2 text-xs font-medium text-torg-blue">{m.obra || "—"}</td>
                      <td className="px-4 py-2 text-xs text-torg-gray max-w-[200px] truncate">{m.descricaoItem || m.opSka || "—"}</td>
                      <td className="px-4 py-2 text-xs text-torg-dark">{m.operador || "—"}</td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums font-medium">{fmtKg(m.produzidoKg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gráficos: KG por setor hoje + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KG por setor hoje */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-torg-dark mb-4">KG produzido hoje por setor</h3>
          {setorHojeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={setorHojeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}t`} />
                <YAxis type="category" dataKey="setor" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  formatter={(v) => [fmtKg(v), "Produzido"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="kg" radius={[0, 4, 4, 0]}>
                  {setorHojeData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-torg-gray text-center py-8">Sem produção registrada hoje.</p>
          )}
        </div>

        {/* Pipeline de peças */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-torg-dark mb-4">Pipeline de peças</h3>
          {pipelineData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie
                    data={pipelineData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name, props) => [`${v} peças (${fmtKg(props.payload.kg)})`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {pipelineData.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.fill }} />
                    <span className="text-torg-gray flex-1">{p.name}</span>
                    <span className="font-medium text-torg-dark tabular-nums">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-torg-gray text-center py-8">Sem peças cadastradas.</p>
          )}
        </div>
      </div>

      {/* Tendência 14 dias */}
      {tendencia.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-torg-dark mb-4">Produção diária — últimos 14 dias (kg)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={tendencia} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="dia"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => { const d = new Date(v + "T12:00:00"); return `${d.getDate()}/${d.getMonth() + 1}`; }}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}t`} />
              <Tooltip
                labelFormatter={(v) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR")}
                formatter={(v) => [fmtKg(v)]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area type="monotone" dataKey="total" stroke="#006EAB" fill="#006EAB" fillOpacity={0.15} strokeWidth={2} name="Total" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Meta vs Realizado da semana */}
      {metasArr.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-torg-dark mb-4">Meta vs Realizado — semana atual</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={metasArr} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}t`} />
              <Tooltip formatter={(v) => [fmtKg(v)]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="meta" fill="#94a3b8" name="Meta" radius={[4, 4, 0, 0]} />
              <Bar dataKey="realizado" fill="#006EAB" name="Realizado" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OPs ativas com progresso */}
      {ops.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-torg-dark">Progresso das OPs ativas</h3>
            <p className="text-xs text-torg-gray mt-0.5">Peças expedidas vs total de peças por OP.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {ops.filter((o) => o.totalPecas > 0).slice(0, 15).map((op) => (
              <div key={op.numero} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50">
                <div className="w-20 shrink-0">
                  <span className="font-mono text-sm font-bold text-torg-blue">{fmtOP(op.numero)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-torg-dark truncate">{op.cliente}{op.obra ? ` — ${op.obra}` : ""}</p>
                  <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-torg-blue rounded-full transition-all"
                      style={{ width: `${op.pctConcluido}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-torg-dark">{op.pctConcluido}%</span>
                  <p className="text-[10px] text-torg-gray">{op.pecasExpedidas}/{op.totalPecas} peças</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links rápidos pros setores */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { href: "/pcp/maquinas", label: "Máquinas", icon: Cpu },
          { href: "/pcp/montagem", label: "Montagem", icon: Package },
          { href: "/pcp/solda", label: "Solda", icon: Activity },
          { href: "/pcp/jato", label: "Jato", icon: Activity },
          { href: "/pcp/pintura", label: "Pintura", icon: Activity },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue-200 hover:shadow transition-all flex items-center gap-3 group"
            >
              <Icon size={18} className="text-torg-gray group-hover:text-torg-blue" />
              <span className="text-sm font-medium text-torg-dark group-hover:text-torg-blue">{s.label}</span>
              <ChevronRight size={14} className="ml-auto text-gray-300 group-hover:text-torg-blue" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, cor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${cor} p-2.5 rounded-lg`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-torg-gray">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums">{value}</p>
      </div>
    </div>
  );
}
