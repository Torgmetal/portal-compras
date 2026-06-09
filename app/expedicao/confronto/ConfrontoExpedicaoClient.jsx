"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  GitCompareArrows, Search, Package, Truck, Weight, Download,
  ChevronDown, ChevronUp, X, CheckCircle2, AlertTriangle,
  Clock, FileText, Filter, ArrowRightLeft,
} from "lucide-react";

function fmtKg(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kg";
}
function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

const FILTROS_CONFRONTO = [
  { key: "todos", label: "Todos", icon: Package },
  { key: "PENDENTE", label: "Pendentes", icon: Clock },
  { key: "PARCIAL", label: "Parciais", icon: ArrowRightLeft },
  { key: "COMPLETO", label: "Completos", icon: CheckCircle2 },
];

const STATUS_PROD_CORES = {
  EXPEDIDO: "bg-green-100 text-green-700",
  PINTURA: "bg-teal-100 text-teal-700",
  JATO: "bg-cyan-100 text-cyan-700",
  ACABAMENTO: "bg-emerald-100 text-emerald-700",
  SOLDA: "bg-red-100 text-red-700",
  MONTAGEM: "bg-amber-100 text-amber-700",
  CORTE: "bg-blue-100 text-blue-700",
  PENDENTE: "bg-gray-100 text-gray-500",
};

const CONFRONTO_CORES = {
  COMPLETO: { badge: "bg-green-100 text-green-700", row: "" },
  PARCIAL: { badge: "bg-amber-100 text-amber-700", row: "bg-amber-50/30" },
  PENDENTE: { badge: "bg-red-100 text-red-700", row: "" },
};

export default function ConfrontoExpedicaoClient() {
  const [ops, setOps] = useState([]);
  const [opSel, setOpSel] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [expandidos, setExpandidos] = useState(new Set());
  const [exportando, setExportando] = useState(false);

  // Carregar lista de OPs
  useEffect(() => {
    fetch("/api/expedicao/confronto")
      .then((r) => r.json())
      .then((d) => { setOps(d.ops || []); setLoading(false); })
      .catch((e) => { setErro(e.message); setLoading(false); });
  }, []);

  // Carregar dados do confronto
  const carregarOP = useCallback(async (opId) => {
    if (!opId) { setData(null); return; }
    setLoadingDetail(true);
    setErro(null);
    try {
      const r = await fetch(`/api/expedicao/confronto?opId=${opId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar");
      setData(d);
      setExpandidos(new Set());
      setFiltro("todos");
      setBusca("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (opSel) carregarOP(opSel);
  }, [opSel, carregarOP]);

  // Filtrar peças
  const pecasFiltradas = useMemo(() => {
    if (!data?.pecas) return [];
    let lista = data.pecas;
    if (filtro !== "todos") {
      lista = lista.filter((p) => p.statusConfronto === filtro);
    }
    if (busca) {
      const b = busca.toLowerCase();
      lista = lista.filter(
        (p) => p.marca?.toLowerCase().includes(b) ||
          p.descricao?.toLowerCase().includes(b) ||
          p.material?.toLowerCase().includes(b) ||
          p.perfil?.toLowerCase().includes(b)
      );
    }
    return lista;
  }, [data?.pecas, filtro, busca]);

  // Totais filtrados
  const totaisFiltrados = useMemo(() => {
    const qtdPlan = pecasFiltradas.reduce((s, p) => s + p.qtdPlanejada, 0);
    const qtdExp = pecasFiltradas.reduce((s, p) => s + p.qtdExpedida, 0);
    const qtdPend = pecasFiltradas.reduce((s, p) => s + p.qtdPendente, 0);
    const pesoTotal = pecasFiltradas.reduce((s, p) => s + p.pesoTotalKg, 0);
    const pesoExp = pecasFiltradas.reduce((s, p) => s + p.pesoExpedido, 0);
    const pesoPend = pecasFiltradas.reduce((s, p) => s + p.pesoPendente, 0);
    return { qtdPlan, qtdExp, qtdPend, pesoTotal, pesoExp, pesoPend };
  }, [pecasFiltradas]);

  // Toggle expandir
  const toggleExpand = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // XLSX Export
  const exportarXlsx = useCallback(async () => {
    if (!data) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, adicionarRodapeISO, adicionarLegenda, downloadWorkbook,
      } = await import("@/lib/excel-relatorio");

      const totalColunas = 12;
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Confronto de Expedicao — OP ${data.op.numero} — ${data.op.cliente || data.op.obra}`,
        subtitulo: filtro !== "todos" ? `Filtro: ${filtro}` : undefined,
        nomePlanilha: `Confronto OP-${data.op.numero}`,
        codigoDoc: "REL-EXP-002",
        totalColunas,
        kpis: [
          `Pecas: ${data.kpis.totalPecas} total | ${data.kpis.pecasCompletas} completas | ${data.kpis.pecasParciais} parciais | ${data.kpis.pecasPendentes} pendentes`,
          `Peso: ${fmtKg(data.kpis.pesoTotal)} total | ${fmtKg(data.kpis.pesoExpedido)} expedido (${data.kpis.pctPeso}%) | ${fmtKg(data.kpis.pesoPendente)} pendente`,
          `Romaneios emitidos: ${data.kpis.totalRomaneios} | Peso romaneios: ${fmtKg(data.kpis.pesoRomaneios)}`,
        ],
      });

      // Margens reduzidas para paisagem
      ws.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 };

      // Largura das colunas
      [4, 14, 20, 10, 10, 7, 8, 7, 8, 7, 8, 14].forEach((w, i) => {
        ws.getColumn(i + 1).width = w;
      });

      // ── SECAO 1: Confronto Completo ──
      let row = linhaInicio;
      ws.mergeCells(row, 1, row, totalColunas);
      const cellSec1 = ws.getCell(row, 1);
      cellSec1.value = "CONFRONTO PECAS × ROMANEIOS";
      cellSec1.font = { name: "Arial", size: 11, bold: true, color: { argb: "006EAB" } };
      cellSec1.alignment = { vertical: "middle" };
      ws.getRow(row).height = 22;
      row++;

      const headers = [
        "No", "Marca", "Descricao", "Material", "Perfil",
        "Qtd\nPlan", "Peso\nPlan(kg)", "Qtd\nExp", "Peso\nExp(kg)",
        "Qtd\nPend", "Peso\nPend(kg)", "Romaneios",
      ];
      adicionarHeaderTabela(ws, row, headers);
      ws.getRow(row).height = 28;
      row++;

      pecasFiltradas.forEach((p, idx) => {
        const fontColors = {};
        // Cor da qtd pendente
        if (p.qtdPendente > 0) fontColors[9] = "D32F2F";
        if (p.qtdPendente > 0) fontColors[10] = "D32F2F";
        // Cor da qtd expedida
        if (p.statusConfronto === "COMPLETO") {
          fontColors[7] = "2E7D32";
          fontColors[8] = "2E7D32";
        } else if (p.statusConfronto === "PARCIAL") {
          fontColors[7] = "E65100";
          fontColors[8] = "E65100";
        }

        const romsStr = p.romaneios.map((r) => `${r.numero}(${r.qtd})`).join(", ");

        const fillColor = idx % 2 === 1 ? "F8FAFC" : undefined;
        adicionarLinhaTabela(ws, row, [
          idx + 1,
          p.marca || "",
          p.descricao || "",
          p.material || "",
          p.perfil || "",
          p.qtdPlanejada,
          parseFloat(p.pesoTotalKg.toFixed(1)),
          p.qtdExpedida,
          parseFloat(p.pesoExpedido.toFixed(1)),
          p.qtdPendente,
          parseFloat(p.pesoPendente.toFixed(1)),
          romsStr || "—",
        ], {
          fillColor,
          fontColors,
          fontSize: 8,
          rowHeight: 18,
          alinhamento: {
            0: "center", 5: "center", 6: "right", 7: "center",
            8: "right", 9: "center", 10: "right", 11: "left",
          },
        });
        row++;
      });

      // Totais
      adicionarLinhaTotais(ws, row, [
        "", "TOTAL", `${pecasFiltradas.length} pecas`, "", "",
        totaisFiltrados.qtdPlan,
        parseFloat(totaisFiltrados.pesoTotal.toFixed(1)),
        totaisFiltrados.qtdExp,
        parseFloat(totaisFiltrados.pesoExp.toFixed(1)),
        totaisFiltrados.qtdPend,
        parseFloat(totaisFiltrados.pesoPend.toFixed(1)),
        "",
      ]);
      row += 3;

      // ── SECAO 2: Apenas Pendentes (se houver) ──
      const pendentes = data.pecas.filter((p) => p.statusConfronto !== "COMPLETO");
      if (pendentes.length > 0) {
        ws.mergeCells(row, 1, row, totalColunas);
        const cellSec2 = ws.getCell(row, 1);
        cellSec2.value = "ITENS PENDENTES DE EXPEDICAO";
        cellSec2.font = { name: "Arial", size: 11, bold: true, color: { argb: "D32F2F" } };
        cellSec2.alignment = { vertical: "middle" };
        ws.getRow(row).height = 22;
        row++;

        const headers2 = [
          "No", "Marca", "Descricao", "Material", "Perfil",
          "Qtd\nPlan", "Qtd\nExp", "Qtd\nPend", "Peso\nPend(kg)",
          "Status\nProd", "Situacao", "",
        ];
        adicionarHeaderTabela(ws, row, headers2);
        ws.getRow(row).height = 28;
        row++;

        let totalPesoPend = 0;
        pendentes.forEach((p, idx) => {
          totalPesoPend += p.pesoPendente;
          const fontColors = {};
          if (p.statusConfronto === "PARCIAL") fontColors[10] = "E65100";
          else fontColors[10] = "D32F2F";

          const fillColor = idx % 2 === 1 ? "F8FAFC" : undefined;
          adicionarLinhaTabela(ws, row, [
            idx + 1,
            p.marca || "",
            p.descricao || "",
            p.material || "",
            p.perfil || "",
            p.qtdPlanejada,
            p.qtdExpedida,
            p.qtdPendente,
            parseFloat(p.pesoPendente.toFixed(1)),
            p.statusProd,
            p.statusConfronto,
            "",
          ], {
            fillColor,
            fontColors,
            fontSize: 8,
            rowHeight: 18,
            alinhamento: {
              0: "center", 5: "center", 6: "center", 7: "center",
              8: "right", 9: "center", 10: "center",
            },
          });
          row++;
        });

        adicionarLinhaTotais(ws, row, [
          "", "TOTAL PENDENTE", `${pendentes.length} pecas`, "", "",
          pendentes.reduce((s, p) => s + p.qtdPlanejada, 0),
          pendentes.reduce((s, p) => s + p.qtdExpedida, 0),
          pendentes.reduce((s, p) => s + p.qtdPendente, 0),
          parseFloat(totalPesoPend.toFixed(1)),
          "", "", "",
        ]);
        row += 3;
      }

      // ── SECAO 3: Resumo dos Romaneios ──
      if (data.romaneios?.length > 0) {
        ws.mergeCells(row, 1, row, totalColunas);
        const cellSec3 = ws.getCell(row, 1);
        cellSec3.value = "ROMANEIOS EMITIDOS";
        cellSec3.font = { name: "Arial", size: 11, bold: true, color: { argb: "006EAB" } };
        cellSec3.alignment = { vertical: "middle" };
        ws.getRow(row).height = 22;
        row++;

        const headers3 = [
          "No", "Romaneio", "Data", "Descricao", "", "", "Itens",
          "Peso Real (kg)", "", "Valor Total", "", "",
        ];
        adicionarHeaderTabela(ws, row, headers3);
        row++;

        data.romaneios.forEach((r) => {
          adicionarLinhaTabela(ws, row, [
            "", r.numero, fmtData(r.data), r.descricao || "", "", "",
            r.totalItens,
            parseFloat((r.pesoRealKg || 0).toFixed(1)), "",
            r.valorTotal ? parseFloat(r.valorTotal.toFixed(2)) : "", "", "",
          ], {
            fontSize: 8,
            rowHeight: 18,
            alinhamento: { 2: "center", 6: "center", 7: "right", 9: "right" },
          });
          row++;
        });

        adicionarLinhaTotais(ws, row, [
          "", "TOTAL", "", "", "", "",
          data.romaneios.reduce((s, r) => s + r.totalItens, 0),
          parseFloat(data.kpis.pesoRomaneios.toFixed(1)), "", "", "", "",
        ]);
        row += 2;
      }

      // Legenda
      adicionarLegenda(ws, row, [
        { cor: "2E7D32", label: "COMPLETO = Quantidade expedida >= planejada" },
        { cor: "E65100", label: "PARCIAL = Parte ja expedida, falta quantidade" },
        { cor: "D32F2F", label: "PENDENTE = Nenhuma quantidade expedida" },
      ], totalColunas);
      row += 2;

      adicionarRodapeISO(ws, row, totalColunas, {
        elaboradoPor: "Expedicao",
      });

      ws.views = [{ state: "frozen", ySplit: linhaInicio + 1, xSplit: 2 }];

      const fileName = `Confronto_Expedicao_OP-${data.op.numero}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadWorkbook(workbook, fileName);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      alert("Erro ao gerar planilha: " + e.message);
    } finally {
      setExportando(false);
    }
  }, [data, filtro, pecasFiltradas, totaisFiltrados]);

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
            <GitCompareArrows className="text-torg-blue" size={28} />
            Confronto de Expedição
          </h1>
          <p className="text-torg-gray text-sm mt-1">
            Confronte a lista de peças com os romaneios emitidos e identifique pendências
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

      {/* Seletor de OP */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="block text-xs font-medium text-torg-gray mb-1">Selecionar OP</label>
        <select
          value={opSel}
          onChange={(e) => setOpSel(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
        >
          <option value="">— Selecione uma OP —</option>
          {ops.map((o) => (
            <option key={o.id} value={o.id}>
              OP-{o.numero} — {o.cliente || o.obra} ({o.totalPecas} peças • {o.totalRomaneios} romaneios)
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loadingDetail && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-torg-blue" />
          <span className="ml-3 text-torg-gray text-sm">Carregando confronto...</span>
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
          <GitCompareArrows size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray">Selecione uma OP para confrontar peças com romaneios</p>
          <p className="text-gray-400 text-sm mt-1">{ops.length} OPs com peças cadastradas</p>
        </div>
      )}

      {/* Dados */}
      {data && !loadingDetail && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total de Peças"
              value={data.kpis.totalPecas}
              icon={<Package size={20} className="text-torg-blue" />}
              sub={fmtKg(data.kpis.pesoTotal)}
            />
            <KpiCard
              label="Completas"
              value={data.kpis.pecasCompletas}
              icon={<CheckCircle2 size={20} className="text-green-500" />}
              sub={`${data.kpis.pctPecas}% das peças`}
              destaque="green"
            />
            <KpiCard
              label="Parciais"
              value={data.kpis.pecasParciais}
              icon={<ArrowRightLeft size={20} className="text-amber-500" />}
              sub="Qtd expedida < planejada"
              destaque={data.kpis.pecasParciais > 0 ? "amber" : undefined}
            />
            <KpiCard
              label="Pendentes"
              value={data.kpis.pecasPendentes}
              icon={<Clock size={20} className="text-red-500" />}
              sub={fmtKg(data.kpis.pesoPendente) + " faltante"}
              destaque={data.kpis.pecasPendentes > 0 ? "red" : "green"}
            />
          </div>

          {/* Barra de progresso */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-torg-dark">Progresso da Expedição (peso)</span>
              <span className="text-lg font-bold text-torg-blue">{data.kpis.pctPeso}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 flex overflow-hidden">
              {data.kpis.pesoTotal > 0 && (
                <>
                  <div
                    className="h-3 bg-green-500 transition-all"
                    style={{ width: `${(data.kpis.pesoExpedido / data.kpis.pesoTotal) * 100}%` }}
                  />
                  {data.kpis.pecasParciais > 0 && (() => {
                    const parcialPeso = data.pecas
                      .filter((p) => p.statusConfronto === "PARCIAL")
                      .reduce((s, p) => s + p.pesoExpedido, 0);
                    // Peso parcial ja esta contido em pesoExpedido, mostrar como segmento separado
                    return null;
                  })()}
                </>
              )}
            </div>
            <div className="flex justify-between text-xs text-torg-gray mt-1">
              <span>{fmtKg(data.kpis.pesoExpedido)} expedido</span>
              <span>{fmtKg(data.kpis.pesoPendente)} restante</span>
            </div>
          </div>

          {/* Filtros + Busca */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {FILTROS_CONFRONTO.map((f) => {
                const Icon = f.icon;
                const count = f.key === "todos"
                  ? data.kpis.totalPecas
                  : data.kpis[
                      f.key === "COMPLETO" ? "pecasCompletas"
                        : f.key === "PARCIAL" ? "pecasParciais" : "pecasPendentes"
                    ];
                return (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      filtro === f.key
                        ? "bg-white text-torg-dark shadow-sm"
                        : "text-torg-gray hover:text-torg-dark"
                    }`}
                  >
                    <Icon size={14} />
                    {f.label}
                    <span className="text-xs text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded-full ml-0.5">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar marca, material..."
                className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
              />
              {busca && (
                <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Confronto */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase w-28">Marca</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase">Descrição</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Material</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-16">
                      <span className="block">Qtd</span><span className="text-[10px] font-normal">Plan</span>
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-16">
                      <span className="block">Qtd</span><span className="text-[10px] font-normal">Exped</span>
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-16">
                      <span className="block">Qtd</span><span className="text-[10px] font-normal">Pend</span>
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Plan</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Exp</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Peso Pend</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-16">Prod</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-20">Situação</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-torg-gray uppercase w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pecasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-torg-gray text-sm">
                        {data.pecas.length === 0
                          ? "Nenhuma peça cadastrada nesta OP"
                          : "Nenhuma peça encontrada com os filtros selecionados"}
                      </td>
                    </tr>
                  ) : (
                    pecasFiltradas.map((p) => {
                      const corConf = CONFRONTO_CORES[p.statusConfronto];
                      const corProd = STATUS_PROD_CORES[p.statusProd] || STATUS_PROD_CORES.PENDENTE;
                      const isExpanded = expandidos.has(p.id);
                      const temRom = p.romaneios.length > 0;

                      return (
                        <Fragment key={p.id}>
                          <tr
                            className={`hover:bg-gray-50/50 ${corConf.row} ${temRom ? "cursor-pointer" : ""}`}
                            onClick={temRom ? () => toggleExpand(p.id) : undefined}
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
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${corProd}`}>
                                {p.statusProd}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${corConf.badge}`}>
                                {p.statusConfronto}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {temRom && (
                                isExpanded
                                  ? <ChevronUp size={14} className="text-gray-400" />
                                  : <ChevronDown size={14} className="text-gray-400" />
                              )}
                            </td>
                          </tr>

                          {/* Romaneios vinculados expandidos */}
                          {isExpanded && p.romaneios.length > 0 && (
                            <tr>
                              <td colSpan={12} className="bg-torg-blue/5 px-6 py-2">
                                <div className="text-xs text-torg-gray mb-1 font-medium">Romaneios vinculados:</div>
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
                {pecasFiltradas.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2.5 text-xs text-torg-dark" colSpan={3}>
                        TOTAL — {pecasFiltradas.length} peças
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">{totaisFiltrados.qtdPlan}</td>
                      <td className="px-3 py-2.5 text-center text-xs text-green-700">{totaisFiltrados.qtdExp}</td>
                      <td className={`px-3 py-2.5 text-center text-xs ${totaisFiltrados.qtdPend > 0 ? "text-red-600" : "text-green-600"}`}>
                        {totaisFiltrados.qtdPend}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtKg(totaisFiltrados.pesoTotal)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtKg(totaisFiltrados.pesoExp)}</td>
                      <td className={`px-3 py-2.5 text-right text-xs ${totaisFiltrados.pesoPend > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmtKg(totaisFiltrados.pesoPend)}
                      </td>
                      <td colSpan={3} className="px-3 py-2.5"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Itens extras (sem peça vinculada) */}
          {data.itensExtras?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
                  <Truck size={16} className="text-torg-gray" />
                  Itens Extras em Romaneios
                  <span className="text-xs text-torg-gray bg-gray-100 px-2 py-0.5 rounded-full">
                    {data.itensExtras.length} itens sem peça vinculada
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
                    {data.itensExtras.map((ie, idx) => (
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
  );
}

function KpiCard({ label, value, icon, sub, destaque }) {
  const corBorda = destaque === "green" ? "border-green-100"
    : destaque === "amber" ? "border-amber-100"
    : destaque === "red" ? "border-red-100"
    : "border-gray-100";
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
