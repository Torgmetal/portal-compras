"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, BarChart3, DollarSign, TrendingUp,
  FileCheck2, XCircle, FileSpreadsheet, ChevronDown, Calendar,
  Clock, Target, Users, Percent, ArrowUpRight, ArrowDownRight,
  Minus, PieChart, Activity,
} from "lucide-react";

// ─── CONSTANTES ─────────────────────────────────────────────────

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TIPO_VENDA_LABELS = {
  FABRICACAO: "Fabricação",
  MONTAGEM: "Montagem",
  FABRICACAO_E_MONTAGEM: "Fab. e Montagem",
  PINTURA: "Pintura",
  MAO_DE_OBRA: "Mão de Obra",
  REVENDA: "Revenda",
};

const PORTE_LABELS = {
  ATE_1_2M: "Até R$ 1,2M",
  DE_1_2M_A_10M: "R$ 1,2M – R$ 10M",
  DE_10M_A_50M: "R$ 10M – R$ 50M",
  ACIMA_50M: "Acima R$ 50M",
};

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0";
const fmtMoedaCurto = (v) => {
  if (v == null || v === 0) return "R$ 0";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────

export default function KPIsClient() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const now = new Date();
  const [anoSel, setAnoSel] = useState(now.getFullYear());
  const anosDisponiveis = [];
  for (let a = 2024; a <= now.getFullYear() + 1; a++) anosDisponiveis.push(a);

  // ─── FETCH ──────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/comercial/orcamento");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrcamentos(json.orcamentos);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── FILTRAR POR ANO ────────────────────────────────────────

  const doAno = orcamentos.filter((o) => {
    if (!o.dataSolicitada) return false;
    return new Date(o.dataSolicitada).getFullYear() === anoSel;
  });

  // ─── INDICADORES GERAIS ─────────────────────────────────────

  const totalPropostas = doAno.length;
  const valorTotal = doAno.reduce((s, o) => s + (o.valor || 0), 0);
  const fechadas = doAno.filter((o) => o.status === "FECHADA");
  const perdidas = doAno.filter((o) => o.status === "PERDIDA");
  const negociando = doAno.filter((o) => o.status === "EM_NEGOCIACAO");
  const abertas = doAno.filter((o) => o.status === "ORCAMENTO");

  const valorFechado = fechadas.reduce((s, o) => s + (o.valor || 0), 0);
  const valorPerdido = perdidas.reduce((s, o) => s + (o.valor || 0), 0);
  const valorNegociando = negociando.reduce((s, o) => s + (o.valor || 0), 0);
  const valorAberto = abertas.reduce((s, o) => s + (o.valor || 0), 0);

  const taxaConversao = totalPropostas > 0 ? (fechadas.length / totalPropostas * 100) : 0;
  const taxaPerda = totalPropostas > 0 ? (perdidas.length / totalPropostas * 100) : 0;
  const ticketMedio = fechadas.length > 0 ? valorFechado / fechadas.length : 0;
  const ticketMedioGeral = totalPropostas > 0 ? valorTotal / totalPropostas : 0;

  // Tempo médio de fechamento (dias entre dataSolicitada e dataFechamento)
  const temposFechamento = fechadas
    .filter((o) => o.dataSolicitada && o.dataFechamento)
    .map((o) => {
      const d1 = new Date(o.dataSolicitada);
      const d2 = new Date(o.dataFechamento);
      return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    })
    .filter((d) => d > 0);
  const tempoMedioFechamento = temposFechamento.length > 0
    ? Math.round(temposFechamento.reduce((s, d) => s + d, 0) / temposFechamento.length)
    : 0;

  // ─── EVOLUÇÃO MENSAL ────────────────────────────────────────

  const porMes = Array.from({ length: 12 }, (_, i) => {
    const mesOrc = doAno.filter((o) => new Date(o.dataSolicitada).getMonth() === i);
    const mesFechado = mesOrc.filter((o) => o.status === "FECHADA");
    const mesPerdido = mesOrc.filter((o) => o.status === "PERDIDA");
    return {
      mes: MESES[i],
      total: mesOrc.length,
      valorTotal: mesOrc.reduce((s, o) => s + (o.valor || 0), 0),
      fechadas: mesFechado.length,
      valorFechado: mesFechado.reduce((s, o) => s + (o.valor || 0), 0),
      perdidas: mesPerdido.length,
      valorPerdido: mesPerdido.reduce((s, o) => s + (o.valor || 0), 0),
      conversao: mesOrc.length > 0 ? (mesFechado.length / mesOrc.length * 100).toFixed(1) : "—",
    };
  });

  // Maior valor mensal pra escala das barras
  const maxValorMes = Math.max(...porMes.map((m) => m.valorTotal), 1);

  // ─── POR TIPO DE VENDA ──────────────────────────────────────

  const porTipo = {};
  doAno.forEach((o) => {
    const t = o.tipoVenda || "SEM_TIPO";
    if (!porTipo[t]) porTipo[t] = { total: 0, valor: 0, fechadas: 0, valorFechado: 0 };
    porTipo[t].total += 1;
    porTipo[t].valor += o.valor || 0;
    if (o.status === "FECHADA") { porTipo[t].fechadas += 1; porTipo[t].valorFechado += o.valor || 0; }
  });
  const tiposRank = Object.entries(porTipo)
    .map(([tipo, d]) => ({ tipo, label: TIPO_VENDA_LABELS[tipo] || "Sem tipo", ...d }))
    .sort((a, b) => b.valor - a.valor);

  // ─── POR PORTE ──────────────────────────────────────────────

  const porPorte = {};
  doAno.forEach((o) => {
    const p = o.porte || "SEM_PORTE";
    if (!porPorte[p]) porPorte[p] = { total: 0, valor: 0, fechadas: 0, valorFechado: 0 };
    porPorte[p].total += 1;
    porPorte[p].valor += o.valor || 0;
    if (o.status === "FECHADA") { porPorte[p].fechadas += 1; porPorte[p].valorFechado += o.valor || 0; }
  });
  const portesRank = Object.entries(porPorte)
    .map(([porte, d]) => ({ porte, label: PORTE_LABELS[porte] || "Sem porte", ...d }))
    .sort((a, b) => b.valor - a.valor);

  // ─── MOTIVOS DE PERDA ───────────────────────────────────────

  const motivos = {};
  perdidas.forEach((o) => {
    const m = (o.motivoPerda || "Não informado").trim();
    motivos[m] = (motivos[m] || 0) + 1;
  });
  const motivosRank = Object.entries(motivos)
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ─── RENDER ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-7xl space-y-6">
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Indicadores Comercial</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-torg-gray">Carregando indicadores...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="max-w-7xl space-y-6">
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Indicadores Comercial</h2>
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-torg-blue text-white rounded-lg text-sm">Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header + Seletor de Ano */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Indicadores Comercial</h2>
          <p className="text-sm text-torg-gray mt-1">Indicadores de desempenho do setor comercial.</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-torg-gray" />
          <div className="relative">
            <select
              value={anoSel}
              onChange={(e) => setAnoSel(Number(e.target.value))}
              className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-lg text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
            >
              {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Indicadores Principais — 2 linhas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard icon={FileSpreadsheet} label="Total orçado" valor={fmtMoedaCurto(valorTotal)} sub={`${totalPropostas} propostas`} cor="bg-torg-blue" />
        <KPICard icon={FileCheck2} label="Valor fechado" valor={fmtMoedaCurto(valorFechado)} sub={`${fechadas.length} obras`} cor="bg-green-600" />
        <KPICard icon={XCircle} label="Valor perdido" valor={fmtMoedaCurto(valorPerdido)} sub={`${perdidas.length} propostas`} cor="bg-red-500" />
        <KPICard icon={Target} label="Em aberto" valor={fmtMoedaCurto(valorNegociando + valorAberto)} sub={`${negociando.length + abertas.length} ativas`} cor="bg-amber-500" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard icon={Percent} label="Taxa de conversão" valor={`${taxaConversao.toFixed(1)}%`} sub={`${taxaPerda.toFixed(1)}% de perda`} cor="bg-torg-dark" />
        <KPICard icon={DollarSign} label="Ticket médio (fechado)" valor={fmtMoedaCurto(ticketMedio)} sub={`geral: ${fmtMoedaCurto(ticketMedioGeral)}`} cor="bg-indigo-500" />
        <KPICard icon={Clock} label="Tempo médio fechamento" valor={tempoMedioFechamento > 0 ? `${tempoMedioFechamento} dias` : "—"} sub={`${temposFechamento.length} amostras`} cor="bg-purple-500" />
        <KPICard icon={Activity} label="Propostas/mês" valor={totalPropostas > 0 ? (totalPropostas / Math.min(now.getMonth() + 1, 12)).toFixed(1) : "0"} sub="média mensal" cor="bg-cyan-600" />
      </div>

      {/* Evolução Mensal — Gráfico de barras */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-torg-dark mb-5 flex items-center gap-2">
          <BarChart3 size={16} className="text-torg-blue" />
          Evolução Mensal — {anoSel}
        </h3>
        <div className="flex items-end gap-2 h-48">
          {porMes.map((m, i) => {
            const h = maxValorMes > 0 ? (m.valorTotal / maxValorMes) * 100 : 0;
            const mesAtual = i === now.getMonth() && anoSel === now.getFullYear();
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 bg-torg-dark text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                  <p className="font-bold">{MESES_FULL[i]}</p>
                  <p>{m.total} propostas — {fmtMoeda(m.valorTotal)}</p>
                  <p className="text-green-300">{m.fechadas} fechadas — {fmtMoeda(m.valorFechado)}</p>
                  <p className="text-red-300">{m.perdidas} perdidas — {fmtMoeda(m.valorPerdido)}</p>
                  <p>Conversão: {m.conversao}%</p>
                </div>
                {/* Barra */}
                <div
                  className={`w-full rounded-t-md transition-all duration-300 min-h-[4px] ${
                    mesAtual ? "bg-torg-blue" : "bg-torg-blue/40"
                  } group-hover:bg-torg-blue`}
                  style={{ height: `${Math.max(h, 2)}%` }}
                />
                <span className={`text-[10px] ${mesAtual ? "text-torg-blue font-bold" : "text-gray-400"}`}>{m.mes}</span>
              </div>
            );
          })}
        </div>
        {/* Legenda da tabela mensal */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="py-1 text-left font-medium"></th>
                {porMes.map((m, i) => (
                  <th key={i} className={`py-1 text-center font-medium ${i === now.getMonth() && anoSel === now.getFullYear() ? "text-torg-blue" : ""}`}>{m.mes}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-torg-gray">
              <tr>
                <td className="py-0.5 pr-2 text-gray-400 whitespace-nowrap">Propostas</td>
                {porMes.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums">{m.total || "—"}</td>)}
              </tr>
              <tr>
                <td className="py-0.5 pr-2 text-green-600 whitespace-nowrap">Fechadas</td>
                {porMes.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums text-green-600">{m.fechadas || "—"}</td>)}
              </tr>
              <tr>
                <td className="py-0.5 pr-2 text-red-500 whitespace-nowrap">Perdidas</td>
                {porMes.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums text-red-500">{m.perdidas || "—"}</td>)}
              </tr>
              <tr>
                <td className="py-0.5 pr-2 text-gray-400 whitespace-nowrap">Conversão</td>
                {porMes.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums">{m.conversao}%</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Análise por Tipo de Venda + Porte (lado a lado) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Tipo de Venda */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <PieChart size={16} className="text-torg-blue" />
            Por Tipo de Venda
          </h3>
          <div className="space-y-3">
            {tiposRank.map((t) => {
              const pct = valorTotal > 0 ? (t.valor / valorTotal * 100) : 0;
              return (
                <div key={t.tipo}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-torg-dark">{t.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-torg-gray">{t.total} prop.</span>
                      <span className="text-sm font-bold text-torg-dark tabular-nums">{fmtMoedaCurto(t.valor)}</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Por Porte */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-torg-blue" />
            Por Porte do Projeto
          </h3>
          <div className="space-y-3">
            {portesRank.map((p) => {
              const pct = valorTotal > 0 ? (p.valor / valorTotal * 100) : 0;
              return (
                <div key={p.porte}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-torg-dark">{p.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-torg-gray">{p.total} prop.</span>
                      <span className="text-sm font-bold text-torg-dark tabular-nums">{fmtMoedaCurto(p.valor)}</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Motivos de Perda */}
      {motivosRank.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            Principais Motivos de Perda
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {motivosRank.map((m) => (
              <div key={m.motivo} className="bg-red-50/50 border border-red-100 rounded-lg p-3">
                <p className="text-2xl font-extrabold text-red-600 tabular-nums">{m.count}</p>
                <p className="text-xs text-red-700/70 mt-0.5 line-clamp-2">{m.motivo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CARD KPI ───────────────────────────────────────────────────

function KPICard({ icon: Icon, label, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${cor} p-2 rounded-lg flex-shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark tabular-nums truncate">{valor}</p>
        <p className="text-[10px] text-torg-gray/70 truncate">{sub}</p>
      </div>
    </div>
  );
}
