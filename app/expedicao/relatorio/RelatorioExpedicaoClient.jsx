"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  FileBarChart2, Search, Package, Truck, Weight, DollarSign,
  Clock, CheckCircle2, AlertTriangle, Download, ChevronDown,
  ChevronUp, X, BarChart3, FileText, GitCompareArrows, ArrowRightLeft,
} from "lucide-react";

function fmtKg(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kg";
}
function fmtMoeda(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}
function fmtPct(v) { return v + "%"; }

const STATUS_CORES = {
  EXPEDIDO: { bg: "bg-green-100", text: "text-green-700", icon: "check" },
  PINTURA: { bg: "bg-teal-100", text: "text-teal-700", icon: "paint" },
  JATO: { bg: "bg-cyan-100", text: "text-cyan-700", icon: "wind" },
  ACABAMENTO: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "sparkle" },
  SOLDA: { bg: "bg-red-100", text: "text-red-700", icon: "flame" },
  MONTAGEM: { bg: "bg-amber-100", text: "text-amber-700", icon: "wrench" },
  CORTE: { bg: "bg-blue-100", text: "text-blue-700", icon: "cut" },
  PENDENTE: { bg: "bg-gray-100", text: "text-gray-500", icon: "clock" },
};

export default function RelatorioExpedicaoClient() {
  const [ops, setOps] = useState([]);
  const [opSel, setOpSel] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [erro, setErro] = useState(null);

  // Filtros de data
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  // Expandir romaneios
  const [expandidos, setExpandidos] = useState(new Set());

  // Aba: expedidos | pendentes | confronto
  const [aba, setAba] = useState("expedidos");

  // Busca
  const [busca, setBusca] = useState("");

  // Confronto
  const [confrontoData, setConfrontoData] = useState(null);
  const [confrontoLoading, setConfrontoLoading] = useState(false);
  const [filtroConfronto, setFiltroConfronto] = useState("todos");
  const [buscaConfronto, setBuscaConfronto] = useState("");
  const [expandidosConfronto, setExpandidosConfronto] = useState(new Set());

  // Carregar lista de OPs
  useEffect(() => {
    fetch("/api/expedicao/relatorio")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao carregar OPs");
        setOps(d.ops || []);
        setLoading(false);
      })
      .catch((e) => {
        setErro(e.message);
        setLoading(false);
      });
  }, []);

  // Carregar detalhes da OP selecionada
  const carregarOP = useCallback(async (opId, de, ate) => {
    if (!opId) { setData(null); return; }
    setLoadingDetail(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ opId });
      if (de) params.set("de", de);
      if (ate) params.set("ate", ate);
      const r = await fetch(`/api/expedicao/relatorio?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar");
      setData(d);
      setExpandidos(new Set());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (opSel) carregarOP(opSel, dataDe, dataAte);
  }, [opSel, dataDe, dataAte, carregarOP]);

  // Carregar dados de confronto (lazy — ao clicar na aba)
  const carregarConfronto = useCallback(async (opId) => {
    if (!opId || confrontoData?.opId === opId) return;
    setConfrontoLoading(true);
    try {
      const r = await fetch(`/api/expedicao/confronto?opId=${opId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar confronto");
      setConfrontoData({ ...d, opId });
      setExpandidosConfronto(new Set());
      setFiltroConfronto("todos");
      setBuscaConfronto("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setConfrontoLoading(false);
    }
  }, [confrontoData?.opId]);

  // Quando muda aba para confronto, carregar dados
  useEffect(() => {
    if (aba === "confronto" && opSel) carregarConfronto(opSel);
  }, [aba, opSel, carregarConfronto]);

  // Limpar confronto quando muda OP
  useEffect(() => {
    setConfrontoData(null);
  }, [opSel]);

  // Toggle expandir romaneio
  const toggleExpand = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandirTodos = () => {
    if (!data?.romaneios) return;
    if (expandidos.size === data.romaneios.length) {
      setExpandidos(new Set());
    } else {
      setExpandidos(new Set(data.romaneios.map((r) => r.id)));
    }
  };

  // Filtrar pendentes por busca
  const pendFiltrados = useMemo(() => {
    if (!data?.pecasPendentes) return [];
    if (!busca) return data.pecasPendentes;
    const b = busca.toLowerCase();
    return data.pecasPendentes.filter(
      (p) => p.marca?.toLowerCase().includes(b) ||
        p.descricao?.toLowerCase().includes(b) ||
        p.material?.toLowerCase().includes(b)
    );
  }, [data?.pecasPendentes, busca]);

  // Filtrar peças do confronto
  const confrontoFiltrado = useMemo(() => {
    if (!confrontoData?.pecas) return [];
    let lista = confrontoData.pecas;
    if (filtroConfronto !== "todos") {
      lista = lista.filter((p) => p.statusConfronto === filtroConfronto);
    }
    if (buscaConfronto) {
      const b = buscaConfronto.toLowerCase();
      lista = lista.filter(
        (p) => p.marca?.toLowerCase().includes(b) ||
          p.descricao?.toLowerCase().includes(b) ||
          p.material?.toLowerCase().includes(b) ||
          p.perfil?.toLowerCase().includes(b)
      );
    }
    return lista;
  }, [confrontoData?.pecas, filtroConfronto, buscaConfronto]);

  const confrontoTotais = useMemo(() => {
    const qtdPlan = confrontoFiltrado.reduce((s, p) => s + p.qtdPlanejada, 0);
    const qtdExp = confrontoFiltrado.reduce((s, p) => s + p.qtdExpedida, 0);
    const qtdPend = confrontoFiltrado.reduce((s, p) => s + p.qtdPendente, 0);
    const pesoTotal = confrontoFiltrado.reduce((s, p) => s + p.pesoTotalKg, 0);
    const pesoExp = confrontoFiltrado.reduce((s, p) => s + p.pesoExpedido, 0);
    const pesoPend = confrontoFiltrado.reduce((s, p) => s + p.pesoPendente, 0);
    return { qtdPlan, qtdExp, qtdPend, pesoTotal, pesoExp, pesoPend };
  }, [confrontoFiltrado]);

  const toggleConfronto = (id) => {
    setExpandidosConfronto((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Obra info do dropdown
  const opInfo = useMemo(() => {
    if (!opSel) return null;
    return ops.find((o) => o.id === opSel);
  }, [ops, opSel]);

  // XLSX Export
  const [exportando, setExportando] = useState(false);
  const exportarXlsx = useCallback(async () => {
    if (!data) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, adicionarRodapeISO, adicionarLegenda, downloadWorkbook,
      } = await import("@/lib/excel-relatorio");

      const totalColunas = 9;
      const filtros = [
        dataDe && `De: ${fmtData(dataDe)}`,
        dataAte && `Ate: ${fmtData(dataAte)}`,
      ].filter(Boolean).join("  |  ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Relatorio de Expedicao — OP ${data.op.numero} — ${data.op.cliente || data.op.obra}`,
        subtitulo: filtros || undefined,
        nomePlanilha: `Expedicao OP-${data.op.numero}`,
        codigoDoc: "REL-EXP-001",
        totalColunas,
        kpis: [
          `Romaneios: ${data.kpis.totalRomaneios}  |  Peso expedido: ${fmtKg(data.kpis.pesoRomaneios)}  |  Valor: ${fmtMoeda(data.kpis.valorRomaneios)}`,
          `Pecas: ${data.kpis.pecasExpedidas}/${data.kpis.totalPecas} expedidas (${data.kpis.pctPecas}%)  |  Peso pecas: ${fmtKg(data.kpis.pesoExpedidoPecas)}/${fmtKg(data.kpis.pesoTotalPecas)}  |  Faltante: ${fmtKg(data.kpis.pesoFaltante)}`,
        ],
      });

      // Largura das colunas
      [6, 14, 12, 12, 32, 14, 14, 12, 14].forEach((w, i) => {
        ws.getColumn(i + 1).width = w;
      });

      // ─── ABA 1: Itens Expedidos ───
      let row = linhaInicio;

      // Titulo da secao
      ws.mergeCells(row, 1, row, totalColunas);
      const cellSec1 = ws.getCell(row, 1);
      cellSec1.value = "PECAS EXPEDIDAS";
      cellSec1.font = { name: "Arial", size: 11, bold: true, color: { argb: "006EAB" } };
      cellSec1.alignment = { vertical: "middle" };
      ws.getRow(row).height = 22;
      row++;

      // Header
      const headers1 = ["No", "Romaneio", "Data", "Tipo", "Descricao", "Marca", "Material", "Qtd", "Peso (kg)"];
      adicionarHeaderTabela(ws, row, headers1);
      row++;

      let totalPesoExp = 0;
      let totalQtdExp = 0;
      let idx = 0;
      for (const rom of (data.romaneios || [])) {
        for (const item of rom.itens) {
          idx++;
          const peso = item.pesoKg || 0;
          totalPesoExp += peso;
          totalQtdExp += item.qtd || 0;
          const fillColor = idx % 2 === 0 ? "F8FAFC" : undefined;
          adicionarLinhaTabela(ws, row, [
            idx,
            rom.numero,
            fmtData(rom.data),
            item.tipo === "peca" ? "Peca" : "Acessorio",
            item.descricao || "",
            item.marca || "",
            item.material || "",
            item.qtd || 1,
            parseFloat(peso.toFixed(1)),
          ], {
            fillColor,
            alinhamento: { 0: "center", 2: "center", 3: "center", 7: "center", 8: "right" },
          });
          row++;
        }
      }

      // Totais expedidos
      adicionarLinhaTotais(ws, row, [
        "", "TOTAL EXPEDIDO", "", "", `${idx} itens`, "", "",
        parseFloat(totalQtdExp.toFixed(0)),
        parseFloat(totalPesoExp.toFixed(1)),
      ]);
      row += 3;

      // ─── ABA 2: Peças Pendentes ───
      if (data.pecasPendentes && data.pecasPendentes.length > 0) {
        ws.mergeCells(row, 1, row, totalColunas);
        const cellSec2 = ws.getCell(row, 1);
        cellSec2.value = "PECAS PENDENTES DE EXPEDICAO";
        cellSec2.font = { name: "Arial", size: 11, bold: true, color: { argb: "D32F2F" } };
        cellSec2.alignment = { vertical: "middle" };
        ws.getRow(row).height = 22;
        row++;

        const headers2 = ["No", "Marca", "Descricao", "Material", "Perfil", "Qtd", "Peso Un (kg)", "Peso Total (kg)", "Status"];
        adicionarHeaderTabela(ws, row, headers2);
        row++;

        let totalPesoPend = 0;
        data.pecasPendentes.forEach((p, i) => {
          totalPesoPend += p.pesoTotalKg || 0;
          const fillColor = i % 2 === 1 ? "F8FAFC" : undefined;
          const fontColors = {};
          // Status em vermelho se pendente, amber se em processo
          if (["PENDENTE", "CORTE"].includes(p.status)) fontColors[8] = "D32F2F";
          else if (["MONTAGEM", "SOLDA", "ACABAMENTO"].includes(p.status)) fontColors[8] = "E65100";
          else fontColors[8] = "2E7D32";

          adicionarLinhaTabela(ws, row, [
            i + 1,
            p.marca || "",
            p.descricao || "",
            p.material || "",
            p.perfil || "",
            p.qte || 1,
            parseFloat((p.pesoUnitKg || 0).toFixed(1)),
            parseFloat((p.pesoTotalKg || 0).toFixed(1)),
            p.status || "PENDENTE",
          ], {
            fillColor,
            fontColors,
            alinhamento: { 0: "center", 5: "center", 6: "right", 7: "right", 8: "center" },
          });
          row++;
        });

        adicionarLinhaTotais(ws, row, [
          "", "TOTAL PENDENTE", "", "", "",
          data.pecasPendentes.reduce((s, p) => s + (p.qte || 1), 0),
          "",
          parseFloat(totalPesoPend.toFixed(1)),
          `${data.pecasPendentes.length} pecas`,
        ]);
        row += 2;
      }

      // ─── Resumo por Romaneio ───
      if (data.romaneios && data.romaneios.length > 0) {
        row++;
        ws.mergeCells(row, 1, row, totalColunas);
        const cellSec3 = ws.getCell(row, 1);
        cellSec3.value = "RESUMO POR ROMANEIO";
        cellSec3.font = { name: "Arial", size: 11, bold: true, color: { argb: "006EAB" } };
        cellSec3.alignment = { vertical: "middle" };
        ws.getRow(row).height = 22;
        row++;

        const headers3 = ["No", "Romaneio", "Data", "Descricao", "Itens", "Peso Real (kg)", "R$/kg", "Valor Total", ""];
        adicionarHeaderTabela(ws, row, headers3);
        row++;

        for (const rom of data.romaneios) {
          const fillColor = undefined;
          adicionarLinhaTabela(ws, row, [
            "",
            rom.numero,
            fmtData(rom.data),
            rom.descricao || "",
            rom.itens.length,
            parseFloat((rom.pesoRealKg || 0).toFixed(1)),
            rom.valorPorKg ? parseFloat(rom.valorPorKg.toFixed(2)) : "",
            rom.valorTotal ? parseFloat(rom.valorTotal.toFixed(2)) : "",
            "",
          ], {
            fillColor,
            alinhamento: { 2: "center", 4: "center", 5: "right", 6: "right", 7: "right" },
          });
          row++;
        }

        adicionarLinhaTotais(ws, row, [
          "", "TOTAL", "", "", data.romaneios.reduce((s, r) => s + r.itens.length, 0),
          parseFloat(data.kpis.pesoRomaneios.toFixed(1)),
          "",
          parseFloat(data.kpis.valorRomaneios.toFixed(2)),
          "",
        ]);
        row += 2;
      }

      // Legenda
      adicionarLegenda(ws, row, [
        { cor: "2E7D32", label: "EXPEDIDO = Peca entregue" },
        { cor: "E65100", label: "Em processo = Montagem/Solda/Acabamento" },
        { cor: "D32F2F", label: "PENDENTE/CORTE = Nao iniciado ou em corte" },
      ], totalColunas);
      row += 2;

      // Rodape ISO
      adicionarRodapeISO(ws, row, totalColunas, {
        elaboradoPor: "Expedicao",
      });

      // Congelar painel
      ws.views = [{ state: "frozen", ySplit: linhaInicio + 1, xSplit: 0 }];

      const fileName = `Relatorio_Expedicao_OP-${data.op.numero}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadWorkbook(workbook, fileName);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      alert("Erro ao gerar planilha: " + e.message);
    } finally {
      setExportando(false);
    }
  }, [data, dataDe, dataAte, opInfo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-torg-blue" />
        <span className="ml-3 text-torg-gray">Carregando OPs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
            <FileBarChart2 className="text-torg-blue" size={28} />
            Relatório de Peças Expedidas
          </h1>
          <p className="text-torg-gray text-sm mt-1">
            Visualize e exporte o detalhamento de peças expedidas por OP
          </p>
        </div>
        {data && (
          <button
            onClick={exportarXlsx}
            disabled={exportando}
            className="flex items-center gap-2 px-4 py-2.5 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {exportando ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Download size={16} />
            )}
            {exportando ? "Gerando..." : "Exportar XLSX"}
          </button>
        )}
      </div>

      {/* Seletor + Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs font-medium text-torg-gray mb-1">Selecionar OP</label>
            <select
              value={opSel}
              onChange={(e) => {
                setOpSel(e.target.value);
                setAba("expedidos");
                setBusca("");
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
            >
              <option value="">— Selecione uma OP —</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  OP-{o.numero} — {o.cliente || o.obra} ({o.pecasExpedidas}/{o.totalPecas} pecas • {fmtKg(o.pesoExpedido)})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-torg-gray mb-1">Data início</label>
            <input
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-torg-gray mb-1">Data fim</label>
            <input
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
            />
          </div>

          {(dataDe || dataAte) && (
            <button
              onClick={() => { setDataDe(""); setDataAte(""); }}
              className="text-xs text-torg-blue hover:text-torg-blue-700 flex items-center gap-1 pb-1"
            >
              <X size={12} /> Limpar período
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loadingDetail && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-torg-blue" />
          <span className="ml-3 text-torg-gray text-sm">Carregando dados...</span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {erro}
          <button onClick={() => setErro(null)} className="ml-auto underline text-xs">Fechar</button>
        </div>
      )}

      {/* Sem OP */}
      {!opSel && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <FileBarChart2 size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray">Selecione uma OP para visualizar o relatório de expedição</p>
          <p className="text-gray-400 text-sm mt-1">{ops.length} OPs com dados de expedição</p>
        </div>
      )}

      {/* Dados */}
      {data && !loadingDetail && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard
              label="Romaneios"
              value={data.kpis.totalRomaneios}
              icon={<FileText size={20} className="text-torg-blue" />}
              sub={`${fmtKg(data.kpis.pesoRomaneios)} expedidos`}
            />
            <KpiCard
              label="Peças Expedidas"
              value={`${data.kpis.pecasExpedidas}/${data.kpis.totalPecas}`}
              icon={<CheckCircle2 size={20} className="text-green-500" />}
              sub={fmtPct(data.kpis.pctPecas) + " concluído"}
              destaque="green"
            />
            <KpiCard
              label="Peso Expedido"
              value={fmtKg(data.kpis.pesoExpedidoPecas)}
              icon={<Weight size={20} className="text-torg-blue" />}
              sub={`de ${fmtKg(data.kpis.pesoTotalPecas)}`}
            />
            <KpiCard
              label="Faltante"
              value={fmtKg(data.kpis.pesoFaltante)}
              icon={<Clock size={20} className="text-amber-500" />}
              sub={`${data.kpis.pecasPendentes} peças pendentes`}
              destaque={data.kpis.pecasPendentes > 0 ? "amber" : "green"}
            />
            <KpiCard
              label="Valor Total"
              value={fmtMoeda(data.kpis.valorRomaneios)}
              icon={<DollarSign size={20} className="text-green-600" />}
              sub={data.kpis.pesoRomaneios > 0 ? `${fmtMoeda(data.kpis.valorRomaneios / data.kpis.pesoRomaneios)}/kg` : "—"}
              destaque="green"
            />
          </div>

          {/* Barra de progresso geral */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-torg-dark">Progresso da Expedição</span>
              <span className="text-lg font-bold text-torg-blue">{data.kpis.pctPecas}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${data.kpis.pctPecas >= 100 ? "bg-green-500" : data.kpis.pctPecas >= 50 ? "bg-torg-blue" : "bg-amber-500"}`}
                style={{ width: `${Math.min(data.kpis.pctPecas, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-torg-gray mt-1">
              <span>{fmtKg(data.kpis.pesoExpedidoPecas)} expedido</span>
              <span>{fmtKg(data.kpis.pesoFaltante)} restante</span>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setAba("expedidos")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                aba === "expedidos"
                  ? "bg-white text-torg-dark shadow-sm"
                  : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              <Truck size={14} className="inline mr-1.5 -mt-0.5" />
              Expedidos ({data.romaneios?.length || 0} romaneios)
            </button>
            <button
              onClick={() => setAba("pendentes")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                aba === "pendentes"
                  ? "bg-white text-torg-dark shadow-sm"
                  : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              <Clock size={14} className="inline mr-1.5 -mt-0.5" />
              Pendentes ({data.pecasPendentes?.length || 0} peças)
            </button>
            <button
              onClick={() => setAba("confronto")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                aba === "confronto"
                  ? "bg-white text-torg-dark shadow-sm"
                  : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              <GitCompareArrows size={14} className="inline mr-1.5 -mt-0.5" />
              Confronto
            </button>
          </div>

          {/* ABA: Expedidos */}
          {aba === "expedidos" && (
            <div className="space-y-3">
              {data.romaneios?.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={expandirTodos}
                    className="text-xs text-torg-blue hover:text-torg-blue-700 flex items-center gap-1"
                  >
                    {expandidos.size === data.romaneios.length ? (
                      <><ChevronUp size={14} /> Recolher todos</>
                    ) : (
                      <><ChevronDown size={14} /> Expandir todos</>
                    )}
                  </button>
                </div>
              )}

              {(!data.romaneios || data.romaneios.length === 0) && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
                  <Truck size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-torg-gray text-sm">Nenhum romaneio emitido{dataDe || dataAte ? " no período selecionado" : ""}</p>
                </div>
              )}

              {data.romaneios?.map((rom) => {
                const isExpanded = expandidos.has(rom.id);
                return (
                  <div key={rom.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleExpand(rom.id)}
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-torg-blue/10 p-2 rounded-lg">
                          <FileText size={18} className="text-torg-blue" />
                        </div>
                        <div className="text-left">
                          <span className="font-mono font-bold text-torg-dark text-sm">{rom.numero}</span>
                          <span className="text-xs text-torg-gray ml-3">{fmtData(rom.data)}</span>
                          {rom.descricao && (
                            <p className="text-xs text-torg-gray mt-0.5">{rom.descricao}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-sm font-semibold text-torg-dark">{fmtKg(rom.pesoRealKg)}</span>
                          {rom.valorTotal && (
                            <span className="text-xs text-torg-gray ml-2">{fmtMoeda(rom.valorTotal)}</span>
                          )}
                        </div>
                        <span className="text-xs bg-torg-blue/10 text-torg-blue px-2 py-0.5 rounded-full font-medium">
                          {rom.itens.length} {rom.itens.length === 1 ? "item" : "itens"}
                        </span>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && rom.itens.length > 0 && (
                      <div className="border-t border-gray-100">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50/60">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase w-16">Tipo</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Descrição</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase w-28">Marca</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase w-24">Material</th>
                              <th className="text-center px-4 py-2 text-xs font-medium text-torg-gray uppercase w-16">Qtd</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-torg-gray uppercase w-24">Peso</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {rom.itens.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-4 py-2">
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    item.tipo === "peca"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-amber-50 text-amber-700"
                                  }`}>
                                    {item.tipo === "peca" ? "Peça" : "Acess."}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-torg-dark">{item.descricao || "—"}</td>
                                <td className="px-4 py-2 text-xs font-mono text-torg-blue">{item.marca || "—"}</td>
                                <td className="px-4 py-2 text-xs text-torg-gray">{item.material || "—"}</td>
                                <td className="px-4 py-2 text-center text-xs text-torg-dark">{item.qtd || 1}</td>
                                <td className="px-4 py-2 text-right text-xs font-medium text-torg-dark">{item.pesoKg ? fmtKg(item.pesoKg) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {isExpanded && rom.itens.length === 0 && (
                      <div className="border-t border-gray-100 px-5 py-4 text-xs text-gray-400 text-center">
                        Nenhum item vinculado a este romaneio
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ABA: Pendentes */}
          {aba === "pendentes" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  Peças Pendentes de Expedição
                  <span className="text-xs text-torg-gray bg-gray-100 px-2 py-0.5 rounded-full">
                    {pendFiltrados.length} {pendFiltrados.length === 1 ? "peça" : "peças"}
                  </span>
                </h3>
                <div className="relative w-52">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar marca..."
                    className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  />
                </div>
              </div>

              {pendFiltrados.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 size={40} className="mx-auto text-green-300 mb-3" />
                  <p className="text-torg-gray text-sm">
                    {data.pecasPendentes?.length === 0
                      ? "Todas as peças foram expedidas!"
                      : "Nenhuma peça encontrada com a busca"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Marca</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Descrição</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Material</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Perfil</th>
                        <th className="text-center px-4 py-2 text-xs font-medium text-torg-gray uppercase">Qtd</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-torg-gray uppercase">Peso Unit.</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-torg-gray uppercase">Peso Total</th>
                        <th className="text-center px-4 py-2 text-xs font-medium text-torg-gray uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pendFiltrados.map((p, idx) => {
                        const cor = STATUS_CORES[p.status] || STATUS_CORES.PENDENTE;
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2 text-xs font-mono text-torg-dark font-medium">{p.marca}</td>
                            <td className="px-4 py-2 text-xs text-torg-gray max-w-[200px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                            <td className="px-4 py-2 text-xs text-torg-gray">{p.material || "—"}</td>
                            <td className="px-4 py-2 text-xs text-torg-gray">{p.perfil || "—"}</td>
                            <td className="px-4 py-2 text-center text-xs">{p.qte || 1}</td>
                            <td className="px-4 py-2 text-right text-xs">{fmtKg(p.pesoUnitKg)}</td>
                            <td className="px-4 py-2 text-right text-xs font-medium">{fmtKg(p.pesoTotalKg)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cor.bg} ${cor.text}`}>
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-2.5 text-xs text-torg-dark" colSpan={4}>TOTAL</td>
                        <td className="px-4 py-2.5 text-center text-xs text-torg-dark">
                          {pendFiltrados.reduce((s, p) => s + (p.qte || 1), 0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">—</td>
                        <td className="px-4 py-2.5 text-right text-xs text-torg-dark">
                          {fmtKg(pendFiltrados.reduce((s, p) => s + (p.pesoTotalKg || 0), 0))}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-torg-gray">
                          {pendFiltrados.length} peças
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ABA: Confronto */}
          {aba === "confronto" && (
            <div className="space-y-4">
              {confrontoLoading && (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-torg-blue" />
                  <span className="ml-3 text-torg-gray text-sm">Carregando confronto...</span>
                </div>
              )}

              {confrontoData && !confrontoLoading && (
                <>
                  {/* KPIs do confronto */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-torg-gray font-medium">Total</span>
                        <Package size={16} className="text-torg-blue" />
                      </div>
                      <div className="text-lg font-bold text-torg-dark">{confrontoData.kpis.totalPecas}</div>
                      <div className="text-xs text-torg-gray">{fmtKg(confrontoData.kpis.pesoTotal)}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-torg-gray font-medium">Completas</span>
                        <CheckCircle2 size={16} className="text-green-500" />
                      </div>
                      <div className="text-lg font-bold text-green-700">{confrontoData.kpis.pecasCompletas}</div>
                      <div className="text-xs text-torg-gray">{confrontoData.kpis.pctPecas}% das peças</div>
                    </div>
                    <div className={`bg-white rounded-xl border shadow-sm p-3 ${confrontoData.kpis.pecasParciais > 0 ? "border-amber-100" : "border-gray-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-torg-gray font-medium">Parciais</span>
                        <ArrowRightLeft size={16} className="text-amber-500" />
                      </div>
                      <div className="text-lg font-bold text-amber-600">{confrontoData.kpis.pecasParciais}</div>
                      <div className="text-xs text-torg-gray">Expedida &lt; planejada</div>
                    </div>
                    <div className={`bg-white rounded-xl border shadow-sm p-3 ${confrontoData.kpis.pecasPendentes > 0 ? "border-red-100" : "border-gray-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-torg-gray font-medium">Pendentes</span>
                        <Clock size={16} className="text-red-500" />
                      </div>
                      <div className="text-lg font-bold text-red-600">{confrontoData.kpis.pecasPendentes}</div>
                      <div className="text-xs text-torg-gray">{fmtKg(confrontoData.kpis.pesoPendente)}</div>
                    </div>
                  </div>

                  {/* Filtros do confronto */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      {[
                        { key: "todos", label: "Todos", count: confrontoData.kpis.totalPecas },
                        { key: "PENDENTE", label: "Pendentes", count: confrontoData.kpis.pecasPendentes },
                        { key: "PARCIAL", label: "Parciais", count: confrontoData.kpis.pecasParciais },
                        { key: "COMPLETO", label: "Completos", count: confrontoData.kpis.pecasCompletas },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setFiltroConfronto(f.key)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            filtroConfronto === f.key
                              ? "bg-white text-torg-dark shadow-sm"
                              : "text-torg-gray hover:text-torg-dark"
                          }`}
                        >
                          {f.label} ({f.count})
                        </button>
                      ))}
                    </div>

                    <div className="relative w-56">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={buscaConfronto}
                        onChange={(e) => setBuscaConfronto(e.target.value)}
                        placeholder="Buscar marca, material..."
                        className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-1.5 text-xs focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                      />
                      {buscaConfronto && (
                        <button onClick={() => setBuscaConfronto("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tabela de confronto */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50/60">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase w-28">Marca</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase">Descrição</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Material</th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-14">
                              <span className="block">Qtd</span><span className="text-[10px] font-normal">Plan</span>
                            </th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-14">
                              <span className="block">Qtd</span><span className="text-[10px] font-normal">Exped</span>
                            </th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-14">
                              <span className="block">Qtd</span><span className="text-[10px] font-normal">Pend</span>
                            </th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Plan</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Exp</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Pend</th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Situação</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {confrontoFiltrado.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="px-4 py-8 text-center text-torg-gray text-sm">
                                Nenhuma peça encontrada com os filtros selecionados
                              </td>
                            </tr>
                          ) : (
                            confrontoFiltrado.map((p) => {
                              const isExp = expandidosConfronto.has(p.id);
                              const temRom = p.romaneios.length > 0;
                              return (
                                <Fragment key={p.id}>
                                  <tr
                                    className={`hover:bg-gray-50/50 ${temRom ? "cursor-pointer" : ""}`}
                                    onClick={temRom ? () => toggleConfronto(p.id) : undefined}
                                  >
                                    <td className="px-3 py-2 text-xs font-mono text-torg-dark font-medium">{p.marca}</td>
                                    <td className="px-3 py-2 text-xs text-torg-gray max-w-[180px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                                    <td className="px-3 py-2 text-xs text-torg-gray">{p.material || "—"}</td>
                                    <td className="px-3 py-2 text-center text-xs font-medium">{p.qtdPlanejada}</td>
                                    <td className={`px-3 py-2 text-center text-xs font-bold ${
                                      p.statusConfronto === "COMPLETO" ? "text-green-700"
                                        : p.statusConfronto === "PARCIAL" ? "text-amber-600" : "text-gray-400"
                                    }`}>
                                      {p.qtdExpedida}
                                    </td>
                                    <td className={`px-3 py-2 text-center text-xs font-bold ${
                                      p.qtdPendente > 0 ? "text-red-600" : "text-green-600"
                                    }`}>
                                      {p.qtdPendente}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs">{fmtKg(p.pesoTotalKg)}</td>
                                    <td className="px-3 py-2 text-right text-xs">{fmtKg(p.pesoExpedido)}</td>
                                    <td className={`px-3 py-2 text-right text-xs font-medium ${
                                      p.pesoPendente > 0 ? "text-red-600" : "text-green-600"
                                    }`}>
                                      {p.pesoPendente > 0 ? fmtKg(p.pesoPendente) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                        p.statusConfronto === "COMPLETO" ? "bg-green-100 text-green-700"
                                          : p.statusConfronto === "PARCIAL" ? "bg-amber-100 text-amber-700"
                                          : "bg-red-100 text-red-700"
                                      }`}>
                                        {p.statusConfronto}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {temRom && (
                                        isExp
                                          ? <ChevronUp size={14} className="text-gray-400" />
                                          : <ChevronDown size={14} className="text-gray-400" />
                                      )}
                                    </td>
                                  </tr>

                                  {isExp && p.romaneios.length > 0 && (
                                    <tr>
                                      <td colSpan={11} className="bg-blue-50/40 px-6 py-2">
                                        <div className="text-xs text-torg-gray mb-1.5 font-medium">Romaneios vinculados:</div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                          {p.romaneios.map((r, ri) => (
                                            <div key={ri} className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center gap-2">
                                              <FileText size={14} className="text-torg-blue flex-shrink-0" />
                                              <div>
                                                <span className="font-mono text-xs font-bold text-torg-dark">{r.numero}</span>
                                                <span className="text-[10px] text-torg-gray ml-2">{fmtData(r.data)}</span>
                                                <div className="text-[10px] text-torg-gray">
                                                  Qtd: {r.qtd} • {r.pesoKg ? fmtKg(r.pesoKg) : "—"}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })
                          )}
                        </tbody>
                        {confrontoFiltrado.length > 0 && (
                          <tfoot>
                            <tr className="bg-gray-50 font-semibold">
                              <td className="px-3 py-2.5 text-xs text-torg-dark" colSpan={3}>
                                TOTAL — {confrontoFiltrado.length} peças
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs">{confrontoTotais.qtdPlan}</td>
                              <td className="px-3 py-2.5 text-center text-xs text-green-700">{confrontoTotais.qtdExp}</td>
                              <td className={`px-3 py-2.5 text-center text-xs ${confrontoTotais.qtdPend > 0 ? "text-red-600" : "text-green-600"}`}>
                                {confrontoTotais.qtdPend}
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtKg(confrontoTotais.pesoTotal)}</td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtKg(confrontoTotais.pesoExp)}</td>
                              <td className={`px-3 py-2.5 text-right text-xs ${confrontoTotais.pesoPend > 0 ? "text-red-600" : "text-green-600"}`}>
                                {fmtKg(confrontoTotais.pesoPend)}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* Itens extras */}
                  {confrontoData.itensExtras?.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-50">
                        <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
                          <Truck size={16} className="text-torg-gray" />
                          Itens Extras em Romaneios
                          <span className="text-xs text-torg-gray bg-gray-100 px-2 py-0.5 rounded-full">
                            {confrontoData.itensExtras.length} sem peça vinculada
                          </span>
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50/60">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Romaneio</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Data</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Tipo</th>
                              <th className="text-left px-4 py-2 text-xs font-medium text-torg-gray uppercase">Descrição</th>
                              <th className="text-center px-4 py-2 text-xs font-medium text-torg-gray uppercase">Qtd</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-torg-gray uppercase">Peso</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {confrontoData.itensExtras.map((ie, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-4 py-2 text-xs font-mono font-medium">{ie.romaneioNumero}</td>
                                <td className="px-4 py-2 text-xs text-torg-gray">{fmtData(ie.data)}</td>
                                <td className="px-4 py-2">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                                    {ie.tipo === "peca" ? "Peça" : "Acess."}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-torg-dark">{ie.descricao || "—"}</td>
                                <td className="px-4 py-2 text-center text-xs">{ie.qtd || 1}</td>
                                <td className="px-4 py-2 text-right text-xs">{ie.pesoKg ? fmtKg(ie.pesoKg) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, sub, destaque, barra }) {
  const corBorda = destaque === "green" ? "border-green-100" : destaque === "amber" ? "border-amber-100" : "border-gray-100";
  return (
    <div className={`bg-white rounded-xl border ${corBorda} shadow-sm p-4`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-torg-gray font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-bold text-torg-dark">{value}</div>
      {sub && <div className="text-xs text-torg-gray mt-1">{sub}</div>}
    </div>
  );
}
