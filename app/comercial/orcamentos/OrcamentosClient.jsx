"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FileSpreadsheet, PlusCircle, Search, X, ChevronDown, Pencil, Trash2, Eye, Loader2, AlertCircle, Filter, FileDown, FileText, TrendingUp, XCircle, FileCheck2, DollarSign, Calendar, BarChart3, RefreshCw, ArrowRight, FileSpreadsheet as IconLqc } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtOP, fmtMoedaCompacta, fmtMoedaInteira } from "@/lib/utils";
import { conversaoComercial, META_CONVERSAO } from "@/lib/conversao-comercial";
import OrcamentosTabs from "@/components/OrcamentosTabs";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";

// ─── CONSTANTES ─────────────────────────────────────────────────

const STATUS_LABELS = {
  ORCAMENTO:     { label: "Orçamento",     cor: "bg-blue-50 text-blue-700",   icon: FileSpreadsheet },
  EM_NEGOCIACAO: { label: "Em Negociação", cor: "bg-amber-50 text-amber-700", icon: TrendingUp },
  FECHADA:       { label: "Fechada",       cor: "bg-green-50 text-green-700", icon: FileCheck2 },
  PERDIDA:       { label: "Perdida",       cor: "bg-red-50 text-red-600",     icon: XCircle },
};

const TIPO_VENDA_LABELS = {
  FABRICACAO:             "Fabricação",
  MONTAGEM:               "Montagem",
  FABRICACAO_E_MONTAGEM:  "Fabricação e Montagem",
  PINTURA:                "Pintura",
  MAO_DE_OBRA:            "Mão de Obra",
  REVENDA:                "Revenda",
  LAUDO:                  "Laudo",
};

const PORTE_LABELS = {
  ATE_1_2M:      "Até R$ 1,2M",
  DE_1_2M_A_10M: "R$ 1,2M – R$ 10M",
  DE_10M_A_50M:  "R$ 10M – R$ 50M",
  ACIMA_50M:     "Acima R$ 50M",
};

const VENDEDORES = ["Vitor", "Patrícia", "Matheus", "André Metzker", "Jorge"];

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// ─── HELPERS DE PERÍODO ─────────────────────────────────────────

function getISOWeekBounds(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // Mon=1 ... Sun=7
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return [mon, sun];
}

function getMonthBounds(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return [start, end];
}

function getYearBounds(year) {
  return [new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59, 999)];
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * O recorte do período — uma função só, usada pela lista E pela conversão.
 *
 * ⚠⚠ MESMO DEFEITO QUE O PIPELINE TINHA. Isto aqui usava `dataSolicitada` e DESCARTAVA quem não
 * tivesse: 141 dos 284 orçamentos não têm esse campo, porque a planilha do Comercial registra
 * "Data envio", não "Data solicitada". Não aparecia porque o período abre em "Tudo" — bastava
 * escolher "Ano" para a lista cair de 284 para 143 sem explicação.
 *
 * A referência é a data de ENVIO, com `dataSolicitada` de reserva. `createdAt` fica de fora: nas
 * 129 vindas da planilha ele é o dia da importação, e empilharia todas em agosto.
 */
export function dataDeReferencia(o) {
  return o?.dataEnvio || o?.dataSolicitada || null;
}

function limitesDoPeriodo(periodo, mesSel, anoSel) {
  if (periodo === "semana") return getISOWeekBounds(new Date());
  if (periodo === "mes") return getMonthBounds(anoSel, mesSel);
  if (periodo === "ano") return getYearBounds(anoSel);
  return null;
}

function filtrarPorPeriodo(orcamentos, periodo, mesSel, anoSel) {
  if (periodo === "tudo") return orcamentos;
  const limites = limitesDoPeriodo(periodo, mesSel, anoSel);
  if (!limites) return orcamentos;
  const [start, end] = limites;
  return orcamentos.filter((o) => {
    const ref = dataDeReferencia(o);
    // ⚠ sem data nenhuma a proposta continua na lista: são as 13 ainda não enviadas, e sumir com
    // elas esconde justamente o que está por sair.
    if (!ref) return true;
    const d = new Date(ref);
    return d >= start && d <= end;
  });
}

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────

export default function OrcamentosClient() {
  const { showToast } = useStore();
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  // Filtro de período
  const now = new Date();
  const [periodo, setPeriodo] = useState("tudo"); // "semana" | "mes" | "ano" | "tudo"
  const [mesSel, setMesSel] = useState(now.getMonth()); // 0-11
  const [anoSel, setAnoSel] = useState(now.getFullYear());

  // Modal
  const [importando, setImportando] = useState(false);
  const [modal, setModal] = useState(null); // "novo" | "editar" | "ver" | "excluir"
  const [orcSelecionado, setOrcSelecionado] = useState(null);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // ─── FETCH ──────────────────────────────────────────────────

  const fetchOrcamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroVendedor) params.set("vendedor", filtroVendedor);
      if (buscaDebounced) params.set("busca", buscaDebounced);
      const res = await fetch(`/api/comercial/orcamento?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrcamentos(json.orcamentos);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroVendedor, buscaDebounced]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  // ─── DADOS FILTRADOS POR PERÍODO ─────────────────────────────

  const orcPeriodo = filtrarPorPeriodo(orcamentos, periodo, mesSel, anoSel);

  // ─── KPIs (sobre dados filtrados por período) ──────────────

  const kpis = orcPeriodo.reduce(
    (acc, o) => {
      acc.total += 1;
      acc.valorTotal += o.valor || 0;
      if (o.status === "ORCAMENTO") acc.abertos += 1;
      if (o.status === "EM_NEGOCIACAO") {
        acc.negociando += 1;
        acc.valorNegociando += o.valor || 0;
      }
      if (o.status === "FECHADA") {
        acc.fechados += 1;
        acc.valorFechado += o.valor || 0;
      }
      if (o.status === "PERDIDA") {
        acc.perdidos += 1;
        acc.valorPerdido += o.valor || 0;
      }
      return acc;
    },
    { total: 0, abertos: 0, negociando: 0, fechados: 0, perdidos: 0, valorTotal: 0, valorFechado: 0, valorPerdido: 0, valorNegociando: 0 }
  );

  // ⚠ MESMA CONTA DO PIPELINE E DA PLANILHA. Aqui era `fechados ÷ total da lista`, que por acaso
  // chegava perto do número certo (14,8% × 15,2%) por outro caminho — mas mudava conforme o filtro
  // de status: filtrando por "Fechada" a taxa virava 100%. Duas telas com duas contas é como a
  // mesma pergunta ganha duas respostas na mesma reunião.
  const limitesPeriodo = limitesDoPeriodo(periodo, mesSel, anoSel);
  const conv = conversaoComercial(orcamentos, (d) =>
    !limitesPeriodo || (d >= limitesPeriodo[0] && d <= limitesPeriodo[1]));

  // ─── HANDLERS ───────────────────────────────────────────────

  const handleNovo = () => {
    setOrcSelecionado(null);
    setModal("novo");
  };

  const handleEditar = (orc) => {
    setOrcSelecionado(orc);
    setModal("editar");
  };

  const handleVer = (orc) => {
    setOrcSelecionado(orc);
    setModal("ver");
  };

  const handleExcluir = (orc) => {
    setOrcSelecionado(orc);
    setModal("excluir");
  };

  const confirmarExclusao = async () => {
    try {
      const res = await fetch(`/api/comercial/orcamento/${orcSelecionado.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrcamentos((prev) => prev.filter((o) => o.id !== orcSelecionado.id));
      showToast("Orçamento excluído", "sucesso");
    } catch (e) {
      showToast(e.message, "erro");
    } finally {
      setModal(null);
      setOrcSelecionado(null);
    }
  };

  const handleSalvar = async (dados) => {
    const isEdit = modal === "editar";
    const url = isEdit
      ? `/api/comercial/orcamento/${orcSelecionado.id}`
      : "/api/comercial/orcamento";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    if (isEdit) {
      setOrcamentos((prev) =>
        prev.map((o) => (o.id === orcSelecionado.id ? { ...o, ...json.orcamento } : o))
      );
      showToast("Orçamento atualizado", "sucesso");
    } else {
      // Refetch pra incluir dados completos (com relações)
      fetchOrcamentos();
      showToast("Orçamento criado", "sucesso");
    }
    setModal(null);
    setOrcSelecionado(null);
  };

  // ─── ATUALIZAR DO SHAREPOINT ─────────────────────────────────
  // A `RELATÓRIO_PROPOSTAS_<ano>.xlsx` é a planilha que o Comercial mantém, e é dela que a central
  // se abastece. O botão fica aqui porque quem percebe que falta proposta é quem está olhando a
  // lista — não adianta a sincronia existir só no cron ou num script meu.
  const atualizarDoSharePoint = async () => {
    setImportando(true);
    try {
      const res = await fetch("/api/comercial/orcamento/importar-sharepoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano: new Date().getFullYear() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao importar");
      showToast(
        `${j.criados} nova(s) · ${j.atualizados} atualizada(s) · ${j.iguais} sem mudança`,
        j.erros?.length ? "erro" : "sucesso"
      );
      fetchOrcamentos();
    } catch (e) {
      showToast(e.message, "erro");
    } finally {
      setImportando(false);
    }
  };

  // ─── LABEL DO PERÍODO ATIVO ──────────────────────────────────

  const labelPeriodo = periodo === "semana"
    ? "Esta semana"
    : periodo === "mes"
      ? `${MESES[mesSel]} ${anoSel}`
      : periodo === "ano"
        ? `${anoSel}`
        : "Todo o período";

  // Anos disponíveis (de 2024 até ano atual + 1)
  const anosDisponiveis = [];
  for (let a = 2024; a <= now.getFullYear() + 1; a++) anosDisponiveis.push(a);

  // ─── CARDS KPI ──────────────────────────────────────────────

  const cards = [
    // ⚠ `exato` fica embaixo do resumo: o resumo é para comparar de relance, o total exato é o
    // que se leva para uma reunião. Antes só existia o resumo, e mal formatado.
    { label: "Total orçado",   value: fmtMoedaCompacta(kpis.valorTotal),   exato: fmtMoedaInteira(kpis.valorTotal),   sub: `${kpis.total} propostas`,          color: "bg-torg-blue", Icon: DollarSign },
    { label: "Obras fechadas", value: fmtMoedaCompacta(kpis.valorFechado), exato: fmtMoedaInteira(kpis.valorFechado), sub: `${kpis.fechados} fechadas`,        color: "bg-green-600", Icon: FileCheck2 },
    { label: "Obras perdidas", value: fmtMoedaCompacta(kpis.valorPerdido), exato: fmtMoedaInteira(kpis.valorPerdido), sub: `${kpis.perdidos} perdidas`,        color: "bg-red-500",   Icon: XCircle },
    { label: "Conversão", value: conv.pct == null ? "—" : `${conv.pct}%`, exato: null,
      sub: `${conv.fechados} fechados ÷ ${conv.enviados} enviados · meta ${META_CONVERSAO}%`,
      color: conv.pct != null && conv.pct < META_CONVERSAO ? "bg-red-500" : "bg-torg-dark", Icon: BarChart3 },
  ];

  // ─── RENDER ─────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl">
      <OrcamentosTabs />
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Propostas</h2>
        <p className="text-sm text-torg-gray mt-1">
          Todas as propostas comerciais — do orçamento ao fechamento.
        </p>
      </div>

      {/* ⚠ AQUI SÓ FICA O QUE CUIDA DA PRÓPRIA LISTA. Criar proposta saiu para a barra lateral
          (Vitor, 30/08/2026): "a Central de Orçamentos seria apenas para trazer todas as propostas
          que foram criadas, pipeline, KPIs e o acompanhamento". Cadastrar um orçamento avulso e
          resincronizar com a planilha são manutenção DESTA lista, não começo de proposta nova. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleNovo}
          className="px-4 py-2.5 border border-torg-blue-100 text-torg-blue rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
        >
          <PlusCircle size={18} /> Novo Orçamento
        </button>
        <button
          onClick={atualizarDoSharePoint}
          disabled={importando}
          title="Relê a RELATÓRIO_PROPOSTAS do SharePoint e atualiza a central"
          className="ml-auto px-3 py-2.5 text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} className={importando ? "animate-spin" : ""} />
          {importando ? "Atualizando…" : "Atualizar do SharePoint"}
        </button>
      </div>

      {/* Filtro de Período */}
      {!loading && orcamentos.length > 0 && (
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

            {/* Seletor de mês (quando período = mês) */}
            {periodo === "mes" && (
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={mesSel}
                    onChange={(e) => setMesSel(Number(e.target.value))}
                    className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
                  >
                    {MESES.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={anoSel}
                    onChange={(e) => setAnoSel(Number(e.target.value))}
                    className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
                  >
                    {anosDisponiveis.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Seletor de ano (quando período = ano) */}
            {periodo === "ano" && (
              <div className="relative">
                <select
                  value={anoSel}
                  onChange={(e) => setAnoSel(Number(e.target.value))}
                  className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
                >
                  {anosDisponiveis.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}

            <span className="text-xs text-torg-gray/70 ml-auto">
              {labelPeriodo} — {orcPeriodo.length} orçamento{orcPeriodo.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {!loading && orcamentos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3"
            >
              <div className={`${c.color} p-2.5 rounded-lg`}>
                <c.Icon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-torg-gray truncate">{c.label}</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate" title={c.exato || undefined}>
                  {c.value}
                </p>
                {/* o total exato, embaixo do resumo — é o número que vai para a reunião */}
                <p className="text-[10px] text-torg-gray/70 tabular-nums truncate">
                  {c.exato ? `${c.exato} · ${c.sub}` : c.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros da tabela */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nº, cliente ou obra..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
          >
            <option value="">Todos os vendedores</option>
            {VENDEDORES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {(filtroStatus || filtroVendedor) && (
          <button
            onClick={() => { setFiltroStatus(""); setFiltroVendedor(""); }}
            className="text-xs text-torg-gray hover:text-torg-blue flex items-center gap-1"
          >
            <Filter size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-torg-gray">Carregando orçamentos...</p>
        </div>
      ) : erro ? (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button
            onClick={fetchOrcamentos}
            className="px-4 py-2 bg-torg-blue text-white rounded-lg text-sm hover:bg-torg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : orcPeriodo.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {filtroStatus || filtroVendedor || buscaDebounced || periodo !== "tudo"
              ? "Nenhum orçamento encontrado nesse período/filtro"
              : "Nenhum orçamento cadastrado"}
          </p>
          <p className="text-sm text-torg-gray mt-1 mb-4">
            {filtroStatus || filtroVendedor || buscaDebounced || periodo !== "tudo"
              ? "Tente ajustar o período ou os filtros."
              : "Cadastre o primeiro orçamento pra começar."}
          </p>
          {!filtroStatus && !filtroVendedor && !buscaDebounced && periodo === "tudo" && (
            <button
              onClick={handleNovo}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
            >
              <PlusCircle size={18} /> Criar primeiro orçamento
            </button>
          )}
        </div>
      ) : (
        <TabelaOrcamentos
          orcamentos={orcPeriodo}
          onVer={handleVer}
          onEditar={handleEditar}
          onExcluir={handleExcluir}
        />
      )}

      {/* Modais */}
      {(modal === "novo" || modal === "editar") && (
        <FormOrcamentoModal
          orcamento={modal === "editar" ? orcSelecionado : null}
          onSalvar={handleSalvar}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
        />
      )}

      {modal === "ver" && orcSelecionado && (
        <VerOrcamentoModal
          orcamento={orcSelecionado}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
          onEditar={() => setModal("editar")}
        />
      )}

      {modal === "excluir" && orcSelecionado && (
        <ExcluirModal
          orcamento={orcSelecionado}
          onConfirm={confirmarExclusao}
          onClose={() => { setModal(null); setOrcSelecionado(null); }}
        />
      )}
    </div>
  );
}

// ─── TABELA ─────────────────────────────────────────────────────

// ⚠ FILTRO POR COLUNA, IGUAL AO EXCEL. Vitor (30/08/2026): "mesmo caso aqui, transforme em filtro
// de planilha". Mesmo componente das listas do PCP, da Expedição e das atividades do cronograma —
// `components/FiltroColuna` — e não mais um filtro inventado só para esta tela.
//
// ⚠ Nº e Valor ficam SEM funil de propósito: um é único por linha e o outro é contínuo. Lista de
// 283 números para marcar com checkbox não filtra nada, só empurra as colunas úteis para o lado.
// O mês de envio, sim, é filtro ("ago/2026") — é como o Comercial fecha o período.
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (d) => (d ? `${MES_CURTO[new Date(d).getUTCMonth()]}/${new Date(d).getUTCFullYear()}` : "—");

function TabelaOrcamentos({ orcamentos, onVer, onEditar, onExcluir }) {
  const [colAberta, setColAberta] = useState(null);
  const COLUNAS = useMemo(() => [
    { key: "cliente",  label: "Cliente",    valor: (o) => o.cliente || "—" },
    { key: "obra",     label: "Obra",       valor: (o) => o.obra || "—" },
    { key: "venda",    label: "Tipo Venda", valor: (o) => (o.tipoVenda ? TIPO_VENDA_LABELS[o.tipoVenda] || o.tipoVenda : "—") },
    { key: "vendedor", label: "Vendedor",   valor: (o) => o.vendedor || "—" },
    { key: "envio",    label: "Envio",      valor: (o) => mesAno(o.dataEnvio) },
    { key: "status",   label: "Status",     valor: (o) => (STATUS_LABELS[o.status] || STATUS_LABELS.ORCAMENTO).label },
  ], []);
  const { filtros, setFiltros, filtradas, opcoesDaColuna, ativos, limpar, rotulosAtivos } =
    useFiltroColunas(orcamentos, COLUNAS);
  const fp = { filtros, setFiltros, opcoesDaColuna, aberta: colAberta, setAberta: setColAberta };
  const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* ⚠ o que está filtrado fica ESCRITO. Filtro de coluna é fácil de esquecer ligado, e uma
          tabela com 12 de 283 linhas parecendo a lista inteira é como se tira conclusão errada. */}
      {ativos > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-torg-orange/5 border-b border-torg-orange/20 text-[12px]">
          <span className="text-torg-dark">
            <strong className="tabular-nums">{filtradas.length}</strong> de {orcamentos.length} · filtrando por {rotulosAtivos.join(", ")}
          </span>
          <button onClick={limpar} className="ml-auto text-torg-blue hover:underline font-medium">limpar filtros</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/60">
            <tr>
              <th className={th}>Nº</th>
              <ThFiltro col="cliente" label="Cliente" larg="w-[16%]" className={th} {...fp} />
              <ThFiltro col="obra" label="Obra" larg="w-[16%]" className={th} {...fp} />
              <ThFiltro col="venda" label="Tipo Venda" larg="w-[11%]" className={th} {...fp} />
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              <ThFiltro col="vendedor" label="Vendedor" larg="w-[9%]" className={th} {...fp} />
              <th className={th}>Solicitação</th>
              <ThFiltro col="envio" label="Envio" larg="w-[8%]" className={th} {...fp} />
              <ThFiltro col="status" label="Status" larg="w-[9%]" className={th} {...fp} />
              <th className="px-3 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtradas.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-torg-gray text-[13px]">
                Nenhum orçamento com esses filtros. <button onClick={limpar} className="text-torg-blue hover:underline">limpar</button>
              </td></tr>
            )}
            {filtradas.map((orc) => {
              const s = STATUS_LABELS[orc.status] || STATUS_LABELS.ORCAMENTO;
              return (
                <tr key={orc.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => onVer(orc)}
                      className="font-mono font-semibold text-torg-blue hover:underline block"
                    >
                      {orc.numero}
                    </button>
                    {/* ⚠ atalho direto para o estudo, sem passar pelo modal: quem está varrendo a
                        lista atrás de um número quer chegar no cenário, não numa ficha. */}
                    {orc.estudosLqc?.[0] && (
                      <a
                        href={`/comercial/orcamentos/estudos/${orc.estudosLqc[0].id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Abrir o estudo LQC e os cenários financeiros"
                        className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-torg-gray hover:text-torg-blue"
                      >
                        <IconLqc size={10} /> LQC
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-torg-dark max-w-[200px] truncate" title={orc.cliente}>{orc.cliente}</td>
                  <td className="px-4 py-3 text-torg-gray max-w-[180px] truncate" title={orc.obra || ""}>{orc.obra || "—"}</td>
                  {/* ⚠ nowrap: "Fabricação e Montagem" quebrava em TRÊS linhas e esticava a linha
                      inteira da tabela — o print que o Vitor mandou é isso. */}
                  <td className="px-4 py-3 text-torg-gray text-xs whitespace-nowrap">
                    {orc.tipoVenda ? TIPO_VENDA_LABELS[orc.tipoVenda] || orc.tipoVenda : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">
                    {fmtMoeda(orc.valor)}
                  </td>
                  <td className="px-4 py-3 text-torg-gray whitespace-nowrap">{orc.vendedor || "—"}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs whitespace-nowrap">{fmtData(orc.dataSolicitada)}</td>
                  <td className="px-4 py-3 text-torg-gray text-xs whitespace-nowrap">{fmtData(orc.dataEnvio)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.cor}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => onVer(orc)}
                        className="p-1.5 text-gray-400 hover:text-torg-blue rounded-lg hover:bg-torg-blue-50"
                        title="Ver detalhes"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => onEditar(orc)}
                        className="p-1.5 text-gray-400 hover:text-torg-blue rounded-lg hover:bg-torg-blue-50"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => onExcluir(orc)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MODAL: FORM (NOVO / EDITAR) ───────────────────────────────

function FormOrcamentoModal({ orcamento, onSalvar, onClose }) {
  const isEdit = Boolean(orcamento);
  const [form, setForm] = useState({
    numero: orcamento?.numero || "",
    cliente: orcamento?.cliente || "",
    obra: orcamento?.obra || "",
    responsavel: orcamento?.responsavel || "",
    contato: orcamento?.contato || "",
    orcamentista: orcamento?.orcamentista || "",
    tipoVenda: orcamento?.tipoVenda || "",
    valor: orcamento?.valor ?? "",
    porte: orcamento?.porte || "",
    dataSolicitada: orcamento?.dataSolicitada ? orcamento.dataSolicitada.slice(0, 10) : "",
    prazoEntrega: orcamento?.prazoEntrega ? orcamento.prazoEntrega.slice(0, 10) : "",
    dataEnvio: orcamento?.dataEnvio ? orcamento.dataEnvio.slice(0, 10) : "",
    dataFechamento: orcamento?.dataFechamento ? orcamento.dataFechamento.slice(0, 10) : "",
    status: orcamento?.status || "ORCAMENTO",
    vendedor: orcamento?.vendedor || "",
    motivoPerda: orcamento?.motivoPerda || "",
    observacoes: orcamento?.observacoes || "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    try {
      const dados = {
        ...form,
        valor: form.valor !== "" ? parseFloat(form.valor) : null,
        tipoVenda: form.tipoVenda || null,
        porte: form.porte || null,
        dataSolicitada: form.dataSolicitada || null,
        prazoEntrega: form.prazoEntrega || null,
        dataEnvio: form.dataEnvio || null,
        dataFechamento: form.dataFechamento || null,
        obra: form.obra || null,
        responsavel: form.responsavel || null,
        contato: form.contato || null,
        orcamentista: form.orcamentista || null,
        vendedor: form.vendedor || null,
        motivoPerda: form.motivoPerda || null,
        observacoes: form.observacoes || null,
      };
      await onSalvar(dados);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-torg-dark">
            {isEdit ? "Editar Orçamento" : "Novo Orçamento"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> {erro}
            </div>
          )}

          {/* Linha 1: Número + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº Orçamento *</label>
              <input
                type="text"
                value={form.numero}
                onChange={set("numero")}
                placeholder="001-26"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={set("status")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Cliente + Obra */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
              <input
                type="text"
                value={form.cliente}
                onChange={set("cliente")}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Obra</label>
              <input
                type="text"
                value={form.obra}
                onChange={set("obra")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          </div>

          {/* Linha 3: Responsável + Contato (email) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsável</label>
              <input
                type="text"
                value={form.responsavel}
                onChange={set("responsavel")}
                placeholder="Nome do contato no cliente"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contato (e-mail)</label>
              <input
                type="email"
                value={form.contato}
                onChange={set("contato")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          </div>

          {/* Linha 4: Orçamentista + Vendedor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Orçamentista</label>
              <input
                type="text"
                value={form.orcamentista}
                onChange={set("orcamentista")}
                placeholder="Quem elaborou"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
              <select
                value={form.vendedor}
                onChange={set("vendedor")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {VENDEDORES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 5: Tipo Venda + Porte + Valor */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo Venda</label>
              <select
                value={form.tipoVenda}
                onChange={set("tipoVenda")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {Object.entries(TIPO_VENDA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Porte</label>
              <select
                value={form.porte}
                onChange={set("porte")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              >
                <option value="">— Selecione —</option>
                {Object.entries(PORTE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={set("valor")}
                placeholder="0,00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue tabular-nums"
              />
            </div>
          </div>

          {/* Linha 6: Datas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data solicitada</label>
              <input
                type="date"
                value={form.dataSolicitada}
                onChange={set("dataSolicitada")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-600 mb-1">Prazo de entrega</label>
              <input
                type="date"
                value={form.prazoEntrega}
                onChange={set("prazoEntrega")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data envio</label>
              <input
                type="date"
                value={form.dataEnvio}
                onChange={set("dataEnvio")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fechamento</label>
              <input
                type="date"
                value={form.dataFechamento}
                onChange={set("dataFechamento")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
              />
            </div>
          </div>

          {/* Motivo perda (só quando PERDIDA) */}
          {form.status === "PERDIDA" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo da perda *</label>
              <input
                type="text"
                value={form.motivoPerda}
                onChange={set("motivoPerda")}
                required
                placeholder="Por que a proposta foi perdida"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
              />
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={set("observacoes")}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar orçamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── MODAL: VER DETALHE ─────────────────────────────────────────

// ─── EMITIR A PROPOSTA DIRETO DO ORÇAMENTO ────────────────────────────────────────────────────
// Vitor (31/08/2026): "estou na proposta 290-26 e não estou encontrando o botão para extrair a
// proposta (…) pode colocar emitir Word e emitir PDF".
//
// ⚠ FALTAVA O CAMINHO DE IDA. O documento nasce no assistente, sobre uma `PropostaEstrutura` — e
// não havia como criar uma A PARTIR do orçamento. Quem abria a 290-26 procurava um botão que não
// tinha de onde sair. Aqui o clique faz a ponte: cria a proposta ligada ao orçamento e ao estudo
// LQC dele, e emite.
//
// ⚠⚠ EMITIR SOBE A REVISÃO — é um ato, não uma prévia. Por isso o aviso e a confirmação: a PT da
// VALE chegou ao R04 assim, uma emissão de cada vez.
function BotoesEmitirProposta({ orcamento }) {
  const [emitindo, setEmitindo] = useState(null); // "docx" | "pdf"
  const [erro, setErro] = useState("");
  const [tipo, setTipo] = useState("PTC");

  async function emitir(formato) {
    if (!confirm(
      `Emitir a proposta ${tipo} do orçamento ${orcamento.numero} em ${formato === "pdf" ? "PDF" : "Word"}?\n\n` +
      "Cada emissão SOBE A REVISÃO e entra no histórico da proposta."
    )) return;
    setEmitindo(formato); setErro("");
    try {
      // 1. garante a proposta deste orçamento (não sobrescreve o que já foi montado)
      const r1 = await fetch(`/api/comercial/orcamentos/${orcamento.id}/proposta`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Não foi possível preparar a proposta.");
      // ⚠ sem estudo LQC a tabela de preço sai vazia — melhor avisar antes de gerar do que entregar
      // ao cliente uma proposta sem preço.
      if (j1.semEstudo && !confirm(
        "Este orçamento não tem estudo LQC vinculado — a proposta sai sem a tabela de preço.\n\nEmitir assim mesmo?"
      )) { setEmitindo(null); return; }

      // 2. emite
      const r2 = await fetch(`/api/comercial/proposta-estrutura/${j1.id}/emitir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato, revisar: true }),
      });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || "Falha ao emitir");
      const blob = await r2.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r2.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `proposta.${formato}`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErro(e.message); } finally { setEmitindo(null); }
  }

  return (
    <div className="flex items-center gap-2 mr-auto">
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={!!emitindo}
        title="PTC: técnica e comercial · PT: só técnica · PC: só comercial"
        className="text-[13px] border border-gray-200 rounded-lg px-2 py-2 bg-white text-torg-dark">
        <option value="PTC">PTC</option>
        <option value="PT">PT</option>
        <option value="PC">PC</option>
      </select>
      <button onClick={() => emitir("docx")} disabled={!!emitindo}
        className="px-3 py-2 border border-torg-blue-100 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50">
        {emitindo === "docx" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Emitir Word
      </button>
      <button onClick={() => emitir("pdf")} disabled={!!emitindo}
        className="px-3 py-2 border border-torg-blue-100 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50">
        {emitindo === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Emitir PDF
      </button>
      {erro && <span className="text-[12px] text-red-600 max-w-[220px]">{erro}</span>}
    </div>
  );
}

function VerOrcamentoModal({ orcamento, onClose, onEditar }) {
  const s = STATUS_LABELS[orcamento.status] || STATUS_LABELS.ORCAMENTO;
  // a revisão mais nova é a que vale (a API já ordena por revisão desc)
  const estudo = orcamento.estudosLqc?.[0] || null;
  const res = estudo?.resultado || {};

  const campos = [
    { label: "Nº Orçamento", value: orcamento.numero },
    { label: "Status", value: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cor}`}>{s.label}</span> },
    { label: "Cliente", value: orcamento.cliente },
    { label: "Obra", value: orcamento.obra || "—" },
    { label: "Responsável", value: orcamento.responsavel || "—" },
    { label: "Contato", value: orcamento.contato || "—" },
    { label: "Orçamentista", value: orcamento.orcamentista || "—" },
    { label: "Vendedor", value: orcamento.vendedor || "—" },
    { label: "Tipo Venda", value: orcamento.tipoVenda ? TIPO_VENDA_LABELS[orcamento.tipoVenda] : "—" },
    { label: "Porte", value: orcamento.porte ? PORTE_LABELS[orcamento.porte] : "—" },
    { label: "Valor", value: fmtMoeda(orcamento.valor) },
    { label: "Data solicitada", value: fmtData(orcamento.dataSolicitada) },
    { label: "Prazo de entrega", value: fmtData(orcamento.prazoEntrega) },
    { label: "Data envio", value: fmtData(orcamento.dataEnvio) },
    { label: "Data fechamento", value: fmtData(orcamento.dataFechamento) },
  ];

  if (orcamento.status === "PERDIDA") {
    campos.push({ label: "Motivo perda", value: orcamento.motivoPerda || "—" });
  }

  if (orcamento.op) {
    campos.push({ label: "OP vinculada", value: fmtOP(orcamento.op.numero) });
  }

  if (orcamento.observacoes) {
    campos.push({ label: "Observações", value: orcamento.observacoes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-torg-dark">
            Orçamento {orcamento.numero}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {/* ⚠⚠ O ESTUDO PRIMEIRO, E COM NÚMERO. Vitor (30/08/2026): "quero clicar para abrir os
              dados que foram preenchidos para eu ver os cenários (...) hoje você só me traz o
              resumo e não consigo ver as coisas de fato". Estava certo: o modal listava os 15
              campos do cadastro e acabava — peso, custo, esquema de pintura e os três cenários
              ficavam do outro lado de um caminho que não existia na tela. */}
          {estudo && (
            <a href={`/comercial/orcamentos/estudos/${estudo.id}`}
              className="block -mt-1 mb-4 rounded-xl border border-torg-blue-100 bg-torg-blue-50/50 p-4 hover:border-torg-blue hover:bg-torg-blue-50 transition-colors group">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <span className="font-mono text-[13px] font-bold text-torg-blue">
                  LQC-{String(estudo.numero || 0).padStart(3, "0")}-{String(estudo.ano).slice(-2)}
                  {estudo.revisao ? ` R${estudo.revisao}` : ""}
                </span>
                <span className="text-[11px] font-semibold text-torg-blue group-hover:underline inline-flex items-center gap-1">
                  abrir estudo e cenários <ArrowRight size={12} />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { r: "Peso", v: res.pesoTotal ? `${Math.round(res.pesoTotal).toLocaleString("pt-BR")} kg` : "—" },
                  { r: "Preço", v: res.preco ? fmtMoedaCompacta(res.preco) : "—" },
                  { r: "R$/kg", v: res.precoPorKg ? `R$ ${Number(res.precoPorKg).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                ].map((x) => (
                  <div key={x.r}>
                    <p className="text-[10px] uppercase tracking-wide text-torg-gray">{x.r}</p>
                    <p className="text-[13px] font-bold text-torg-dark tabular-nums">{x.v}</p>
                  </div>
                ))}
              </div>
            </a>
          )}

          {campos.map((c, i) => (
            <div key={i} className="flex justify-between items-start gap-4">
              <span className="text-xs text-gray-500 font-medium min-w-[120px]">{c.label}</span>
              <span className="text-sm text-torg-dark text-right">{c.value}</span>
            </div>
          ))}

          {orcamento.revisoes?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Revisões</p>
              <div className="space-y-1">
                {orcamento.revisoes.map((r) => (
                  <div key={r.id} className="text-xs text-torg-gray flex justify-between">
                    <span>Rev. {r.numero}</span>
                    <span>{fmtData(r.dataEnvio)}</span>
                    {r.observacao && <span className="text-gray-400 truncate max-w-[150px]">{r.observacao}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <BotoesEmitirProposta orcamento={orcamento} />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
          >
            Fechar
          </button>
          <button
            onClick={onEditar}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 flex items-center gap-2"
          >
            <Pencil size={14} /> Editar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: EXCLUIR ─────────────────────────────────────────────

function ExcluirModal({ orcamento, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-torg-dark mb-2">Excluir orçamento?</h3>
        <p className="text-sm text-torg-gray mb-6">
          O orçamento <strong>{orcamento.numero}</strong> ({orcamento.cliente}) será excluído permanentemente.
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-torg-gray hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
