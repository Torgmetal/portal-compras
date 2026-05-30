"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, BarChart3, DollarSign, TrendingUp,
  FileCheck2, XCircle, ChevronDown, Calendar, Clock, Target,
  Percent, PieChart, Activity, Users, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Timer, Zap,
} from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const TIPO_LABELS = {
  FABRICACAO: "Fabricacao", MONTAGEM: "Montagem", FABRICACAO_E_MONTAGEM: "Fab. e Montagem",
  PINTURA: "Pintura", MAO_DE_OBRA: "Mao de Obra", REVENDA: "Revenda", SEM_TIPO: "Sem tipo",
};
const PORTE_LABELS = {
  ATE_1_2M: "Ate R$ 1,2M", DE_1_2M_A_10M: "R$ 1,2M - 10M",
  DE_10M_A_50M: "R$ 10M - 50M", ACIMA_50M: "Acima R$ 50M", SEM_PORTE: "Sem porte",
};
const STATUS_LABELS = { ORCAMENTO: "Orcamento", EM_NEGOCIACAO: "Em Negociacao" };

const fmtMoeda = (v) => v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0";
const fmtMoedaCurto = (v) => {
  if (v == null || v === 0) return "R$ 0";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────

export default function KPIsClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const now = new Date();
  const [anoSel, setAnoSel] = useState(now.getFullYear());
  const anosDisponiveis = [];
  for (let a = 2024; a <= now.getFullYear() + 1; a++) anosDisponiveis.push(a);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/comercial/indicadores?ano=${anoSel}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [anoSel]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const { winRate, margem, tempoResposta, pipeline, concentracao, evolucaoMensal, resumo } = data;

  return (
    <div className="max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Indicadores Comercial</h2>
          <p className="text-sm text-torg-gray mt-1">
            {resumo.totalPropostas} propostas | {fmtMoedaCurto(resumo.valorTotal)} orcados em {anoSel}
          </p>
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

      {/* ════════ 1. WIN RATE ════════ */}
      <Section icon={Target} title="Win Rate" subtitle="Taxa de conversao de propostas">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Numero grande */}
          <div className="flex flex-col items-center justify-center bg-gray-50/50 rounded-xl p-6">
            <p className="text-5xl font-black text-torg-dark tabular-nums">{winRate.taxa}%</p>
            <p className="text-sm text-torg-gray mt-2">
              {winRate.ganhas} ganhas de {winRate.totalComDesfecho} com desfecho
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1 text-green-600">
                <FileCheck2 size={12} /> {winRate.ganhas} ganhas ({fmtMoedaCurto(winRate.valorGanho)})
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <XCircle size={12} /> {winRate.perdidas} perdidas ({fmtMoedaCurto(winRate.valorPerdido)})
              </span>
            </div>
          </div>

          {/* Por tipo de venda */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Tipo de Venda</p>
            <div className="space-y-2.5">
              {winRate.porTipo.map((t) => (
                <div key={t.tipo}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-torg-dark">{TIPO_LABELS[t.tipo] || t.tipo}</span>
                    <span className="text-xs font-bold text-torg-dark tabular-nums">{t.taxa}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${Math.max(t.taxa, 2)}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t.ganhas}/{t.total} propostas</p>
                </div>
              ))}
            </div>
          </div>

          {/* Por porte */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Porte</p>
            <div className="space-y-2.5">
              {winRate.porPorte.map((p) => (
                <div key={p.porte}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-torg-dark">{PORTE_LABELS[p.porte] || p.porte}</span>
                    <span className="text-xs font-bold text-torg-dark tabular-nums">{p.taxa}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.max(p.taxa, 2)}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{p.ganhas}/{p.total} propostas</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Motivos de perda */}
        {winRate.motivosPerda.length > 0 && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <XCircle size={12} className="text-red-400" /> Principais Motivos de Perda
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {winRate.motivosPerda.map((m) => (
                <div key={m.motivo} className="bg-red-50/50 border border-red-100 rounded-lg p-3">
                  <p className="text-2xl font-extrabold text-red-600 tabular-nums">{m.count}</p>
                  <p className="text-xs text-red-700/70 mt-0.5 line-clamp-2">{m.motivo}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ════════ 2. MARGEM BRUTA ════════ */}
      <Section icon={DollarSign} title="Margem Bruta por Contrato" subtitle="Qualidade da venda — receita vs. custo direto">
        {margem.totalContratos === 0 ? (
          <div className="text-center py-8">
            <DollarSign size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">
              {margem.semOP > 0
                ? `${margem.semOP} proposta(s) fechada(s) sem OP vinculada — vincule a OP para calcular a margem.`
                : "Nenhuma proposta fechada com OP vinculada neste periodo."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-6 mb-5">
              <div className="bg-gray-50/50 rounded-xl px-6 py-4 text-center">
                <p className="text-3xl font-black text-torg-dark tabular-nums">{margem.media}%</p>
                <p className="text-xs text-torg-gray mt-1">Margem media</p>
              </div>
              <div className="text-xs text-torg-gray">
                <p>{margem.totalContratos} contratos com OP vinculada</p>
                {margem.semOP > 0 && (
                  <p className="text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle size={12} /> {margem.semOP} fechadas sem OP
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Contrato</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Custo Torg</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Impostos</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Margem R$</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Margem %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {margem.contratos.map((c) => (
                    <tr key={c.opId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-torg-blue text-xs">{c.opNumero}</td>
                      <td className="px-4 py-2.5 text-torg-dark max-w-[200px] truncate">{c.cliente}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(c.valorContrato)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(c.custoTorg)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-400">{fmtMoeda(c.impostos)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium text-xs ${c.margemR >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmtMoeda(c.margemR)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          c.margemPct >= 15 ? "bg-green-50 text-green-700"
                          : c.margemPct >= 5 ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-600"
                        }`}>
                          {c.margemPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ════════ 3. TEMPO DE RESPOSTA ════════ */}
      <Section icon={Zap} title="Tempo de Resposta a RFQ" subtitle={`Meta: ate ${tempoResposta.prazoAlvo} dias`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metricas principais */}
          <div className="flex flex-col items-center justify-center bg-gray-50/50 rounded-xl p-6">
            <p className="text-4xl font-black text-torg-dark tabular-nums">
              {tempoResposta.media > 0 ? tempoResposta.media : "--"}
              {tempoResposta.media > 0 && <span className="text-lg font-bold text-torg-gray ml-1">dias</span>}
            </p>
            <p className="text-xs text-torg-gray mt-2">Tempo medio de resposta</p>

            <div className="mt-4 flex items-center gap-2">
              <div className={`text-2xl font-black tabular-nums ${tempoResposta.dentroPrazoPct >= 80 ? "text-green-600" : tempoResposta.dentroPrazoPct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {tempoResposta.dentroPrazoPct}%
              </div>
              <p className="text-xs text-torg-gray">dentro do prazo<br />({tempoResposta.prazoAlvo} dias)</p>
            </div>
          </div>

          {/* Distribuicao */}
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Distribuicao por Faixa</p>
            <div className="space-y-2.5">
              {tempoResposta.distribuicao.map((f) => {
                const pct = tempoResposta.totalComResposta > 0
                  ? (f.count / tempoResposta.totalComResposta) * 100
                  : 0;
                const cor = f.max <= 7 ? "bg-green-500" : f.max <= 14 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-torg-dark">{f.label}</span>
                      <span className="text-xs text-torg-gray tabular-nums">{f.count} proposta{f.count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${cor} rounded-full transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {tempoResposta.totalSemResposta > 0 && (
              <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                <AlertTriangle size={12} /> {tempoResposta.totalSemResposta} proposta(s) ainda sem envio
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ════════ 4. PIPELINE PONDERADO ════════ */}
      <Section icon={TrendingUp} title="Pipeline Ponderado" subtitle="Previsibilidade de receita futura">
        {pipeline.totalPropostas === 0 ? (
          <div className="text-center py-8">
            <TrendingUp size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Nenhuma proposta em aberto no momento.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <MiniCard label="Pipeline bruto" valor={fmtMoedaCurto(pipeline.bruto)} sub={`${pipeline.totalPropostas} propostas`} cor="bg-torg-blue" />
              <MiniCard label="Pipeline ponderado" valor={fmtMoedaCurto(pipeline.ponderado)} sub="receita estimada" cor="bg-green-600" />
              {pipeline.porEtapa.map((e) => (
                <MiniCard
                  key={e.status}
                  label={STATUS_LABELS[e.status] || e.status}
                  valor={fmtMoedaCurto(e.valorPonderado)}
                  sub={`${e.count} prop. (${e.probabilidade}% prob.)`}
                  cor={e.status === "EM_NEGOCIACAO" ? "bg-amber-500" : "bg-blue-400"}
                />
              ))}
            </div>

            {/* Tabela de propostas em aberto */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Etapa</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Valor bruto</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Ponderado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pipeline.propostas.slice(0, 15).map((p) => (
                    <tr key={p.numero} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-torg-blue text-xs">{p.numero}</td>
                      <td className="px-4 py-2.5 text-torg-dark max-w-[200px] truncate">{p.cliente}</td>
                      <td className="px-4 py-2.5 text-torg-gray text-xs">{p.vendedor || "--"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.status === "EM_NEGOCIACAO" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                        }`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(p.valor)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs font-medium text-green-700">{fmtMoeda(p.ponderado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ════════ 5. CONCENTRAÇÃO DE CLIENTES ════════ */}
      <Section icon={Users} title="Concentracao de Clientes" subtitle="Diversificacao da carteira">
        {concentracao.totalClientes === 0 ? (
          <div className="text-center py-8">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Nenhuma proposta fechada neste periodo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Indicadores de concentracao */}
            <div className="space-y-4">
              <div className="bg-gray-50/50 rounded-xl p-5">
                <p className="text-xs text-torg-gray mb-1">Top 1 cliente</p>
                <p className={`text-3xl font-black tabular-nums ${concentracao.top1 > 30 ? "text-red-600" : "text-torg-dark"}`}>
                  {concentracao.top1}%
                </p>
                <p className="text-[10px] text-gray-400">da receita total</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50/50 rounded-xl p-4 text-center">
                  <p className="text-xl font-black text-torg-dark tabular-nums">{concentracao.top3}%</p>
                  <p className="text-[10px] text-gray-400">Top 3</p>
                </div>
                <div className="bg-gray-50/50 rounded-xl p-4 text-center">
                  <p className="text-xl font-black text-torg-dark tabular-nums">{concentracao.top5}%</p>
                  <p className="text-[10px] text-gray-400">Top 5</p>
                </div>
              </div>
              {concentracao.alerta && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{concentracao.alerta}</span>
                </div>
              )}
            </div>

            {/* Ranking de clientes */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Ranking — {concentracao.totalClientes} clientes | {fmtMoedaCurto(concentracao.receitaTotal)} total
              </p>
              <div className="space-y-2">
                {concentracao.ranking.map((c, i) => {
                  const cor = i === 0 && c.pct > 30 ? "bg-red-500"
                    : i < 3 ? "bg-torg-blue"
                    : "bg-gray-400";
                  return (
                    <div key={c.cliente}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-torg-dark flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full ${cor} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                            {i + 1}
                          </span>
                          <span className="truncate max-w-[200px]">{c.cliente}</span>
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-torg-dark tabular-nums">{fmtMoedaCurto(c.receita)}</span>
                          <span className="text-xs text-torg-gray tabular-nums w-12 text-right">{c.pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-7">
                        <div className={`h-full ${cor} rounded-full transition-all`} style={{ width: `${Math.max(c.pct, 1)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ════════ EVOLUÇÃO MENSAL ════════ */}
      <Section icon={BarChart3} title={`Evolucao Mensal — ${anoSel}`} subtitle="Propostas por mes">
        {(() => {
          const maxVal = Math.max(...evolucaoMensal.map((m) => m.valorTotal), 1);
          return (
            <>
              <div className="flex items-end gap-2 h-44">
                {evolucaoMensal.map((m, i) => {
                  const h = maxVal > 0 ? (m.valorTotal / maxVal) * 100 : 0;
                  const mesAtual = i === now.getMonth() && anoSel === now.getFullYear();
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute bottom-full mb-2 bg-torg-dark text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                        <p>{m.total} propostas — {fmtMoedaCurto(m.valorTotal)}</p>
                        <p className="text-green-300">{m.fechadas} fechadas</p>
                        <p className="text-red-300">{m.perdidas} perdidas</p>
                      </div>
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 min-h-[4px] ${
                          mesAtual ? "bg-torg-blue" : "bg-torg-blue/40"
                        } group-hover:bg-torg-blue`}
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                      <span className={`text-[10px] ${mesAtual ? "text-torg-blue font-bold" : "text-gray-400"}`}>{MESES[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="py-1 text-left font-medium w-20"></th>
                      {evolucaoMensal.map((_, i) => (
                        <th key={i} className={`py-1 text-center font-medium ${i === now.getMonth() && anoSel === now.getFullYear() ? "text-torg-blue" : ""}`}>{MESES[i]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-torg-gray">
                    <tr>
                      <td className="py-0.5 pr-2 text-gray-400 whitespace-nowrap">Propostas</td>
                      {evolucaoMensal.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums">{m.total || "--"}</td>)}
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2 text-green-600 whitespace-nowrap">Fechadas</td>
                      {evolucaoMensal.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums text-green-600">{m.fechadas || "--"}</td>)}
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2 text-red-500 whitespace-nowrap">Perdidas</td>
                      {evolucaoMensal.map((m, i) => <td key={i} className="py-0.5 text-center tabular-nums text-red-500">{m.perdidas || "--"}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </Section>
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ─────────────────────────────────────

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-torg-dark flex items-center gap-2">
          <Icon size={16} className="text-torg-blue" />
          {title}
        </h3>
        {subtitle && <p className="text-xs text-torg-gray mt-0.5 ml-6">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function MiniCard({ label, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2.5">
      <div className={`${cor} w-2 h-10 rounded-full flex-shrink-0`} />
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark tabular-nums truncate">{valor}</p>
        <p className="text-[10px] text-torg-gray/70 truncate">{sub}</p>
      </div>
    </div>
  );
}
