"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, GitBranchPlus, DollarSign, TrendingUp,
  FileCheck2, XCircle, FileSpreadsheet, ChevronDown, Calendar,
  ArrowRight, Users, BarChart3, Target,
} from "lucide-react";
import { fmtMoedaCompacta, fmtMoedaInteira } from "@/lib/utils";
import { conversaoComercial, META_CONVERSAO } from "@/lib/conversao-comercial";
import OrcamentosTabs from "@/components/OrcamentosTabs";

// ─── CONSTANTES ─────────────────────────────────────────────────

const ETAPAS_PIPELINE = [
  { key: "ORCAMENTO",     label: "Orçamento",      cor: "bg-blue-500",   corLight: "bg-blue-50 text-blue-700 border-blue-200",   icon: FileSpreadsheet },
  { key: "EM_NEGOCIACAO", label: "Em Negociação",   cor: "bg-amber-500",  corLight: "bg-amber-50 text-amber-700 border-amber-200", icon: TrendingUp },
  { key: "FECHADA",       label: "Fechada",         cor: "bg-green-500",  corLight: "bg-green-50 text-green-700 border-green-200", icon: FileCheck2 },
  { key: "PERDIDA",       label: "Perdida",         cor: "bg-red-500",    corLight: "bg-red-50 text-red-600 border-red-200",     icon: XCircle },
];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0";
// ⚠ o compacto vem da lib. A cópia local aqui escrevia "R$ 1333,5M" — "M" inglês numa vírgula
// decimal brasileira, e sem virar bilhão. Mesmo defeito que o Vitor apontou no card da Central;
// estava em dois arquivos porque cada tela tinha o seu.

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────

export default function PipelineClient() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Filtro de período
  const now = new Date();
  const [periodo, setPeriodo] = useState("ano");
  const [mesSel, setMesSel] = useState(now.getMonth());
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

  // ─── FILTRO POR PERÍODO ─────────────────────────────────────

  // ⚠⚠ O PIPELINE ESCONDIA METADE DA CARTEIRA. Vitor (30/08/2026): "vamos atualizar o pipeline
  // também, tem muita informação errada e isso é muito importante para nós". O filtro de período
  // usava `dataSolicitada` e descartava quem não tivesse — mas a planilha do Comercial registra
  // "Data envio", não "Data solicitada": **141 dos 284 orçamentos não têm dataSolicitada**. No ano
  // corrente a tela mostrava 143 de 284, R$ 916 milhões de R$ 1,33 bilhão.
  //
  // A data do funil é a do ENVIO — é quando a proposta vira oportunidade de verdade, e é a que o
  // Comercial preenche (271 dos 284). `dataSolicitada` entra como reserva.
  //
  // ⚠ `createdAt` NÃO entra nessa cadeia, e é uma armadilha: para as 129 propostas que vieram da
  // planilha ele é 29/08/2026, o dia em que eu importei. Usá-lo como data de negócio jogaria
  // todas elas dentro de agosto no filtro por mês — um pico de carteira que nunca existiu.
  const dataDoFunil = (o) => o.dataEnvio || o.dataSolicitada || null;

  // ⚠ e quem NÃO tem data nenhuma não some: são 13 propostas ainda não enviadas, todas em
  // "Orçamento" — sumir com elas é justamente perder o topo do funil.
  const semData = orcamentos.filter((o) => !dataDoFunil(o));

  // o recorte do período, num lugar só — a lista e a conversão precisam do MESMO corte
  const noPeriodo = (d) => {
    if (periodo === "tudo") return true;
    if (!d) return false;
    if (periodo === "mes") return d.getMonth() === mesSel && d.getFullYear() === anoSel;
    if (periodo === "ano") return d.getFullYear() === anoSel;
    const hoje = new Date();
    const day = hoje.getDay() || 7;
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - day + 1); seg.setHours(0, 0, 0, 0);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6); dom.setHours(23, 59, 59, 999);
    return d >= seg && d <= dom;
  };

  const filtrados = orcamentos.filter((o) => {
    if (periodo === "tudo") return true;
    const ref = dataDoFunil(o);
    if (!ref) return true;
    return noPeriodo(new Date(ref));
  });

  // ─── DADOS POR ETAPA ────────────────────────────────────────

  const porEtapa = ETAPAS_PIPELINE.map((etapa) => {
    const items = filtrados.filter((o) => o.status === etapa.key);
    const valor = items.reduce((s, o) => s + (o.valor || 0), 0);
    return { ...etapa, items, count: items.length, valor };
  });

  const totalGeral = filtrados.reduce((s, o) => s + (o.valor || 0), 0);
  const totalFechado = porEtapa.find((e) => e.key === "FECHADA")?.valor || 0;
  const totalPerdido = porEtapa.find((e) => e.key === "PERDIDA")?.valor || 0;
  const totalAberto = porEtapa
    .filter((e) => e.key === "ORCAMENTO" || e.key === "EM_NEGOCIACAO")
    .reduce((s, e) => s + e.valor, 0);
  // ⚠⚠ A CONVERSÃO É A DA TORG: fechados ÷ ENVIADOS no período (lib/conversao-comercial).
  // Eu tinha trocado por "fechadas ÷ decididas" achando que era mais justo — proposta em aberto
  // não é derrota. O raciocínio é defensável e a definição é errada: o padrão está na
  // RELATÓRIO_PROPOSTAS, aba Indicadores, linha GERAL, e a meta ISO de 15% é sobre ELE. A minha
  // versão dava 41,2% onde o número da casa é 15,2% — quase o triplo, numa tela de diretoria.
  const conv = conversaoComercial(orcamentos, (d) => noPeriodo(d));

  // ─── POR VENDEDOR ───────────────────────────────────────────

  const porVendedor = {};
  filtrados.forEach((o) => {
    const v = o.vendedor || "Sem vendedor";
    if (!porVendedor[v]) porVendedor[v] = { total: 0, valor: 0, fechadas: 0, valorFechado: 0, perdidas: 0 };
    porVendedor[v].total += 1;
    porVendedor[v].valor += o.valor || 0;
    if (o.status === "FECHADA") { porVendedor[v].fechadas += 1; porVendedor[v].valorFechado += o.valor || 0; }
    if (o.status === "PERDIDA") porVendedor[v].perdidas += 1;
  });

  const vendedoresRank = Object.entries(porVendedor)
    .map(([nome, data]) => ({ nome, ...data, conversao: data.total > 0 ? ((data.fechadas / data.total) * 100).toFixed(1) : "0.0" }))
    .sort((a, b) => b.valorFechado - a.valorFechado);

  // ─── RENDER ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-7xl space-y-6">
        <OrcamentosTabs />
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Pipeline</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-torg-gray">Carregando pipeline...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="max-w-7xl space-y-6">
        <OrcamentosTabs />
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Pipeline</h2>
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-torg-blue text-white rounded-lg text-sm hover:bg-torg-blue-700">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <OrcamentosTabs />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Pipeline</h2>
          <p className="text-sm text-torg-gray mt-1">
            Visão do funil de vendas — do orçamento ao fechamento.
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-xs text-torg-gray justify-end">
            <GitBranchPlus size={16} />
            <span>{filtrados.length} de {orcamentos.length} oportunidades</span>
          </div>
          {/* ⚠ proposta sem data entra em TODO período, e isso precisa estar dito: são as que
              ainda não foram enviadas — o topo do funil. Escondê-las seria pior; deixá-las
              aparecer sem avisar faria a soma do mês não bater com a do ano. */}
          {periodo !== "tudo" && semData.length > 0 && (
            <p className="text-[11px] text-amber-600 mt-0.5">
              inclui {semData.length} ainda sem data de envio
            </p>
          )}
        </div>
      </div>

      {/* Filtro de Período */}
      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-torg-gray">
            <Calendar size={16} />
            <span className="font-medium">Período:</span>
          </div>
          <div className="flex gap-1">
            {[
              { key: "semana", label: "Semana" },
              { key: "mes", label: "Mês" },
              { key: "ano", label: "Ano" },
              { key: "tudo", label: "Tudo" },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodo === p.key
                    ? "bg-torg-blue text-white"
                    : "bg-gray-100 text-torg-gray hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {periodo === "mes" && (
            <div className="flex gap-2">
              <div className="relative">
                <select value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30">
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={anoSel} onChange={(e) => setAnoSel(Number(e.target.value))} className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30">
                  {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
          {periodo === "ano" && (
            <div className="relative">
              <select value={anoSel} onChange={(e) => setAnoSel(Number(e.target.value))} className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30">
                {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* KPIs Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total orçado", value: fmtMoedaCompacta(totalGeral),  sub: `${fmtMoedaInteira(totalGeral)} · ${filtrados.length} propostas`, color: "bg-torg-blue",  Icon: DollarSign },
          { label: "Em aberto",    value: fmtMoedaCompacta(totalAberto), sub: `${fmtMoedaInteira(totalAberto)} · ${porEtapa[0].count + porEtapa[1].count} ativas`, color: "bg-amber-500", Icon: Target },
          { label: "Fechado",      value: fmtMoedaCompacta(totalFechado), sub: `${fmtMoedaInteira(totalFechado)} · ${porEtapa[2].count} obras`, color: "bg-green-600", Icon: FileCheck2 },
          { label: "Perdido",      value: fmtMoedaCompacta(totalPerdido), sub: `${fmtMoedaInteira(totalPerdido)} · ${porEtapa[3].count} propostas`, color: "bg-red-500", Icon: XCircle },
          // ⚠ o rodapé escreve a CONTA. Uma taxa sem denominador à vista é onde cada um supõe uma
          // definição diferente — foi o que me fez trocar a fórmula sem perceber que trocava.
          { label: "Conversão", value: conv.pct == null ? "—" : `${conv.pct}%`,
            sub: `${conv.fechados} fechados ÷ ${conv.enviados} enviados · meta ${META_CONVERSAO}%`,
            color: conv.pct != null && conv.pct < META_CONVERSAO ? "bg-red-500" : "bg-torg-dark", Icon: BarChart3 },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
            <div className={`${c.color} p-2 rounded-lg`}>
              <c.Icon size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide truncate">{c.label}</p>
              <p className="text-lg font-extrabold text-torg-dark tabular-nums truncate">{c.value}</p>
              <p className="text-[10px] text-torg-gray/70 truncate">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Funil Visual */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-torg-dark mb-5 flex items-center gap-2">
          <GitBranchPlus size={16} className="text-torg-blue" />
          Funil de Vendas
        </h3>
        <div className="space-y-3">
          {porEtapa.map((etapa, i) => {
            const pct = totalGeral > 0 ? (etapa.valor / totalGeral) * 100 : 0;
            const Icon = etapa.icon;
            return (
              <div key={etapa.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${etapa.cor}`} />
                    <span className="text-sm font-medium text-torg-dark">{etapa.label}</span>
                    <span className="text-xs text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded">
                      {etapa.count}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-torg-dark tabular-nums">
                    {fmtMoeda(etapa.valor)}
                  </span>
                </div>
                <div className="h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div
                    className={`h-full ${etapa.cor} rounded-lg transition-all duration-500 flex items-center`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  >
                    {pct > 8 && (
                      <span className="text-white text-xs font-bold ml-3">{pct.toFixed(1)}%</span>
                    )}
                  </div>
                  {pct <= 8 && pct > 0 && (
                    <span className="absolute left-[calc(max(2%,_var(--pct))_+_8px)] top-1/2 -translate-y-1/2 text-xs font-bold text-torg-gray" style={{ "--pct": `${pct}%` }}>
                      {pct.toFixed(1)}%
                    </span>
                  )}
                </div>
                {i < porEtapa.length - 1 && (
                  <div className="flex justify-center my-1">
                    <ArrowRight size={12} className="text-gray-300 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranking por Vendedor */}
      {vendedoresRank.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-torg-dark flex items-center gap-2">
              <Users size={16} className="text-torg-blue" />
              Desempenho por Vendedor
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Propostas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total orçado</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Fechadas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor fechado</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Perdidas</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendedoresRank.map((v) => (
                  <tr key={v.nome} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-medium text-torg-dark whitespace-nowrap">{v.nome}</td>
                    <td className="px-6 py-3 text-center text-torg-gray">{v.total}</td>
                    <td className="px-6 py-3 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtMoeda(v.valor)}</td>
                    <td className="px-6 py-3 text-center">
                      <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">{v.fechadas}</span>
                    </td>
                    <td className="px-6 py-3 text-right text-green-700 font-medium tabular-nums whitespace-nowrap">{fmtMoeda(v.valorFechado)}</td>
                    <td className="px-6 py-3 text-center">
                      <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">{v.perdidas}</span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`text-xs font-bold tabular-nums ${
                        parseFloat(v.conversao) >= 30 ? "text-green-600" :
                        parseFloat(v.conversao) >= 15 ? "text-amber-600" : "text-red-500"
                      }`}>
                        {v.conversao}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Oportunidades em Aberto */}
      {(() => {
        const abertas = filtrados
          .filter((o) => o.status === "EM_NEGOCIACAO" || o.status === "ORCAMENTO")
          .sort((a, b) => (b.valor || 0) - (a.valor || 0))
          .slice(0, 10);

        if (abertas.length === 0) return null;

        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-torg-dark flex items-center gap-2">
                <Target size={16} className="text-amber-500" />
                Top Oportunidades em Aberto
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {abertas.map((o) => {
                    const etapa = ETAPAS_PIPELINE.find((e) => e.key === o.status);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3 font-mono font-semibold text-torg-blue whitespace-nowrap">{o.numero}</td>
                        <td className="px-6 py-3 text-torg-dark max-w-[200px] truncate">{o.cliente}</td>
                        <td className="px-6 py-3 text-torg-gray max-w-[180px] truncate">{o.obra || "—"}</td>
                        <td className="px-6 py-3 text-right text-torg-dark font-bold tabular-nums whitespace-nowrap">{fmtMoeda(o.valor)}</td>
                        <td className="px-6 py-3 text-torg-gray whitespace-nowrap">{o.vendedor || "—"}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${etapa?.corLight || ""}`}>
                            {etapa?.label || o.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
