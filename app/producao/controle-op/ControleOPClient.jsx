"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Factory, Search, Filter, ChevronDown, Package, ArrowDownToLine,
  CheckCircle2, Clock, AlertTriangle, BarChart3, X, Download,
} from "lucide-react";

const SETOR_CORES = {
  Corte: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-500", border: "border-blue-200" },
  Montagem: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", border: "border-amber-200" },
  Solda: { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", border: "border-red-200" },
  Acabamento: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500", border: "border-emerald-200" },
  Jato: { bg: "bg-cyan-50", text: "text-cyan-700", bar: "bg-cyan-500", border: "border-cyan-200" },
  Pintura: { bg: "bg-teal-50", text: "text-teal-700", bar: "bg-teal-500", border: "border-teal-200" },
};

const STATUS_BADGE = {
  "Finalizado Total": { cls: "bg-green-100 text-green-700", icon: "✓" },
  "Finalizado": { cls: "bg-green-50 text-green-600", icon: "✓" },
  "Finalizada Parcial": { cls: "bg-yellow-100 text-yellow-700", icon: "◐" },
  "Produzindo": { cls: "bg-blue-100 text-blue-700", icon: "▶" },
  "Não Inicializada": { cls: "bg-gray-100 text-gray-500", icon: "○" },
};

function fmtKg(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";
}

function fmtPct(v) {
  return v + "%";
}

export default function ControleOPClient() {
  const [obras, setObras] = useState([]);
  const [obraSel, setObraSel] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [erro, setErro] = useState(null);

  // Filtros
  const [setorFiltro, setSetorFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [grupoFiltro, setGrupoFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  // Paginação
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 50;

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Carregar lista de obras
  useEffect(() => {
    fetch("/api/producao/controle-op")
      .then((r) => r.json())
      .then((d) => {
        setObras(d.obras || []);
        setLoading(false);
      })
      .catch((e) => {
        setErro(e.message);
        setLoading(false);
      });
  }, []);

  // Carregar detalhes da obra selecionada
  const carregarObra = useCallback(async (obra, setor, grupo) => {
    if (!obra) { setData(null); return; }
    setLoadingDetail(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ obra });
      if (setor) params.set("setor", setor);
      if (grupo) params.set("grupo", grupo);
      const r = await fetch(`/api/producao/controle-op?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao carregar");
      setData(d);
      setPagina(0);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (obraSel) carregarObra(obraSel, setorFiltro, grupoFiltro);
  }, [obraSel, setorFiltro, grupoFiltro, carregarObra]);

  // Filtrar items localmente (status e busca)
  const itemsFiltrados = useMemo(() => {
    if (!data?.items) return [];
    let list = data.items;

    if (statusFiltro === "pendente") {
      list = list.filter((i) =>
        Object.values(i.setores).some((s) => !s.status?.includes("Finalizado"))
      );
    } else if (statusFiltro === "finalizado") {
      list = list.filter((i) =>
        Object.values(i.setores).every((s) => s.status?.includes("Finalizado"))
      );
    }

    if (buscaDebounced) {
      const b = buscaDebounced.toLowerCase();
      list = list.filter(
        (i) => i.item.toLowerCase().includes(b) || (i.descItem && i.descItem.toLowerCase().includes(b))
      );
    }

    return list;
  }, [data?.items, statusFiltro, buscaDebounced]);

  const itemsPaginados = useMemo(() => {
    return itemsFiltrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  }, [itemsFiltrados, pagina]);

  const totalPaginas = Math.ceil(itemsFiltrados.length / POR_PAGINA);

  // Obra info para header
  const obraInfo = useMemo(() => {
    if (!obraSel) return null;
    return obras.find((o) => o.obra === obraSel);
  }, [obras, obraSel]);

  // Exportar XLSX profissional
  const [exportando, setExportando] = useState(false);
  const exportarXlsx = useCallback(async () => {
    if (!data || itemsFiltrados.length === 0) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, adicionarRodapeISO, adicionarLegenda, downloadWorkbook, CORES,
      } = await import("@/lib/excel-relatorio");

      const setores = data.setoresOrdem || [];
      // Colunas: Nº | Item | Descrição | Grupo | (Status + Plan + Prod + Saldo) por setor
      const totalColunas = 4 + setores.length * 3;

      const clienteNome = obraInfo?.op?.cliente || "";
      const filtrosAtivos = [
        setorFiltro && `Setor: ${setorFiltro}`,
        grupoFiltro && `Grupo: ${grupoFiltro}`,
        statusFiltro !== "todos" && `Status: ${statusFiltro === "pendente" ? "Pendentes" : "Finalizados"}`,
        buscaDebounced && `Busca: "${buscaDebounced}"`,
      ].filter(Boolean).join("  |  ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Controle de Producao — ${data.obra}${clienteNome ? ` — ${clienteNome}` : ""}`,
        subtitulo: filtrosAtivos || undefined,
        nomePlanilha: `Producao ${data.obra}`,
        codigoDoc: "REL-PRD-004",
        totalColunas,
        kpis: [
          `Peso Total: ${fmtKg(data.kpis.pesoTotalKg)}  |  Produzido: ${fmtKg(data.kpis.pesoProduzidoKg)} (${data.kpis.pctGeral}%)  |  Faltante: ${fmtKg(data.kpis.pesoFaltanteKg)}  |  Pecas: ${data.kpis.itensUnicos}`,
          ...data.setoresResumo.map((s) =>
            `${s.setor}: ${s.pct}% — ${fmtKg(s.produzido)}/${fmtKg(s.planejado)} — ${s.finalizados}/${s.total} itens (${s.pendentes} pendentes)`
          ),
        ],
      });

      // Largura das colunas
      const colWidths = [5, 32, 24, 8];
      for (const s of setores) {
        colWidths.push(14, 14, 14); // Plan(kg) | Prod(kg) | Saldo(kg)
      }
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      // Header da tabela
      let row = linhaInicio;
      const headers = ["Nº", "Item", "Descricao", "Grupo"];
      for (const s of setores) {
        headers.push(`${s} Plan(kg)`, `${s} Prod(kg)`, `${s} Saldo(kg)`);
      }
      adicionarHeaderTabela(ws, row, headers);
      row++;

      // Totais acumulados por setor
      const totais = {};
      for (const s of setores) {
        totais[s] = { plan: 0, prod: 0, saldo: 0 };
      }

      // Linhas de dados
      itemsFiltrados.forEach((item, idx) => {
        const valores = [idx + 1, item.item, item.descItem || "", item.grupo || ""];
        const fontColors = {};
        const alinhamento = { 0: "center", 3: "center" };

        for (let si = 0; si < setores.length; si++) {
          const s = setores[si];
          const d = item.setores[s];
          const baseCol = 4 + si * 3;
          alinhamento[baseCol] = "right";
          alinhamento[baseCol + 1] = "right";
          alinhamento[baseCol + 2] = "right";

          if (d) {
            valores.push(
              parseFloat((d.pesoPlanejado || 0).toFixed(1)),
              parseFloat((d.pesoProduzido || 0).toFixed(1)),
              parseFloat((d.saldoRestante || 0).toFixed(1))
            );
            totais[s].plan += d.pesoPlanejado || 0;
            totais[s].prod += d.pesoProduzido || 0;
            totais[s].saldo += d.saldoRestante || 0;

            // Cor do saldo: vermelho se > 0 (pendente), verde se zerado
            if ((d.saldoRestante || 0) > 0) {
              fontColors[baseCol + 2] = "D32F2F";
            } else if (d.status?.includes("Finalizado")) {
              fontColors[baseCol + 2] = "2E7D32";
            }
          } else {
            valores.push("", "", "");
          }
        }

        const fillColor = idx % 2 === 1 ? "F8FAFC" : undefined;
        adicionarLinhaTabela(ws, row, valores, { fillColor, alinhamento, fontColors });
        row++;
      });

      // Linha de totais
      const totaisValores = ["", "TOTAL", `${itemsFiltrados.length} pecas`, ""];
      for (const s of setores) {
        totaisValores.push(
          parseFloat(totais[s].plan.toFixed(1)),
          parseFloat(totais[s].prod.toFixed(1)),
          parseFloat(totais[s].saldo.toFixed(1))
        );
      }
      adicionarLinhaTotais(ws, row, totaisValores);
      row += 2;

      // Legenda
      adicionarLegenda(ws, row, [
        { cor: "2E7D32", label: "Saldo 0 = Finalizado" },
        { cor: "D32F2F", label: "Saldo > 0 = Pendente" },
        { cor: "666", label: "Celula vazia = Item nao passa por este setor" },
      ], totalColunas);
      row += 2;

      // Rodapé ISO
      adicionarRodapeISO(ws, row, totalColunas, {
        elaboradoPor: "PCP / Producao",
      });

      // Congelar painel no header
      ws.views = [{ state: "frozen", ySplit: linhaInicio, xSplit: 2 }];

      const fileName = `Controle_Producao_${data.obra}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadWorkbook(workbook, fileName);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      alert("Erro ao gerar planilha: " + e.message);
    } finally {
      setExportando(false);
    }
  }, [data, itemsFiltrados, obraInfo, setorFiltro, grupoFiltro, statusFiltro, buscaDebounced]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-torg-blue" />
        <span className="ml-3 text-torg-gray">Carregando obras...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
            <Factory className="text-torg-blue" size={28} />
            Controle de Produção por OP
          </h1>
          <p className="text-torg-gray text-sm mt-1">
            Acompanhe o status de cada peça por setor e identifique itens pendentes
          </p>
        </div>
        {data && (
          <button
            onClick={exportarXlsx}
            disabled={exportando}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          >
            {exportando ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-torg-blue" />
            ) : (
              <Download size={16} />
            )}
            {exportando ? "Gerando..." : "Exportar Planilha"}
          </button>
        )}
      </div>

      {/* Seletor de OP */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-xs font-medium text-torg-gray mb-1">Selecionar OP</label>
            <select
              value={obraSel}
              onChange={(e) => {
                setObraSel(e.target.value);
                setSetorFiltro("");
                setGrupoFiltro("");
                setStatusFiltro("todos");
                setBusca("");
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
            >
              <option value="">— Selecione uma OP —</option>
              {obras.map((o) => (
                <option key={o.obra} value={o.obra}>
                  {o.obra} {o.op ? `— ${o.op.cliente || o.op.obra}` : ""} ({fmtPct(o.pct)} • {fmtKg(o.planejadoKg)} • {o.pecas || "?"} peças)
                </option>
              ))}
            </select>
          </div>

          {data && (
            <>
              <div className="min-w-[160px]">
                <label className="block text-xs font-medium text-torg-gray mb-1">Setor</label>
                <select
                  value={setorFiltro}
                  onChange={(e) => setSetorFiltro(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                >
                  <option value="">Todos os setores</option>
                  {(data.setoresOrdem || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {data.grupos?.length > 1 && (
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-torg-gray mb-1">Grupo</label>
                  <select
                    value={grupoFiltro}
                    onChange={(e) => setGrupoFiltro(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  >
                    <option value="">Todos</option>
                    {data.grupos.map((g) => (
                      <option key={g} value={g}>Grupo {g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-torg-gray mb-1">Status</label>
                <select
                  value={statusFiltro}
                  onChange={(e) => { setStatusFiltro(e.target.value); setPagina(0); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="pendente">Pendentes</option>
                  <option value="finalizado">Finalizados</option>
                </select>
              </div>

              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-torg-gray mb-1">Buscar peça</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
                    placeholder="Item ou descrição..."
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  />
                  {busca && (
                    <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Loading detail */}
      {loadingDetail && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-torg-blue" />
          <span className="ml-3 text-torg-gray text-sm">Carregando dados da OP...</span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {erro}
          <button onClick={() => setErro(null)} className="ml-2 underline">Fechar</button>
        </div>
      )}

      {/* Sem OP selecionada */}
      {!obraSel && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Factory size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray">Selecione uma OP para visualizar o controle de produção</p>
          <p className="text-gray-400 text-sm mt-1">{obras.length} OPs disponíveis no Syneco</p>
        </div>
      )}

      {/* Dados da OP */}
      {data && !loadingDetail && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Peso Total (Corte)"
              value={fmtKg(data.kpis.pesoTotalKg)}
              icon={<Package size={20} className="text-torg-blue" />}
              sub={`${data.kpis.itensUnicos} peças únicas`}
            />
            <KpiCard
              label="Produzido"
              value={fmtKg(data.kpis.pesoProduzidoKg)}
              icon={<CheckCircle2 size={20} className="text-green-500" />}
              sub={fmtPct(data.kpis.pctGeral) + " do total"}
              destaque="green"
            />
            <KpiCard
              label="Faltante"
              value={fmtKg(data.kpis.pesoFaltanteKg)}
              icon={<Clock size={20} className="text-amber-500" />}
              sub={fmtPct(100 - data.kpis.pctGeral) + " restante"}
              destaque={data.kpis.pesoFaltanteKg > 0 ? "amber" : "green"}
            />
            <KpiCard
              label="Progresso Geral"
              value={fmtPct(data.kpis.pctGeral)}
              icon={<BarChart3 size={20} className="text-torg-blue" />}
              barra={data.kpis.pctGeral}
            />
          </div>

          {/* Resumo por setor */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-torg-dark mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-torg-blue" />
              Progresso por Setor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.setoresResumo.map((s) => {
                const cor = SETOR_CORES[s.setor] || { bg: "bg-gray-50", text: "text-gray-700", bar: "bg-gray-500", border: "border-gray-200" };
                return (
                  <button
                    key={s.setor}
                    onClick={() => setSetorFiltro(setorFiltro === s.setor ? "" : s.setor)}
                    className={`p-3 rounded-lg border transition-all text-left ${
                      setorFiltro === s.setor
                        ? `${cor.bg} ${cor.border} border-2 ring-2 ring-offset-1 ring-${cor.bar.replace("bg-", "")}/30`
                        : `${cor.bg} ${cor.border} hover:shadow-md`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${cor.text}`}>{s.setor}</span>
                      <span className={`text-lg font-bold ${cor.text}`}>{s.pct}%</span>
                    </div>
                    <div className="w-full bg-white/60 rounded-full h-2 mb-2">
                      <div className={`${cor.bar} h-2 rounded-full transition-all`} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{fmtKg(s.produzido)} / {fmtKg(s.planejado)}</span>
                      <span>{s.finalizados}/{s.total} itens</span>
                    </div>
                    {s.pendentes > 0 && (
                      <div className="mt-1.5 text-xs text-amber-600 font-medium">
                        {s.pendentes} pendente{s.pendentes > 1 ? "s" : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabela de peças */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-torg-dark">
                  Peças {setorFiltro && `— ${setorFiltro}`}
                </h3>
                <span className="text-xs text-torg-gray bg-gray-100 px-2 py-0.5 rounded-full">
                  {itemsFiltrados.length} {itemsFiltrados.length === 1 ? "item" : "itens"}
                </span>
              </div>
              {totalPaginas > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    disabled={pagina === 0}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    ←
                  </button>
                  <span className="text-torg-gray text-xs">
                    {pagina + 1} / {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                    disabled={pagina >= totalPaginas - 1}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    →
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-torg-gray uppercase tracking-wider sticky left-0 bg-gray-50/60 z-10 min-w-[200px]">
                      Item
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-torg-gray uppercase tracking-wider min-w-[160px]">
                      Descrição
                    </th>
                    {data.grupos?.length > 1 && (
                      <th className="text-center px-2 py-2.5 text-xs font-medium text-torg-gray uppercase tracking-wider w-16">
                        Grupo
                      </th>
                    )}
                    {(setorFiltro ? [setorFiltro] : data.setoresOrdem || []).map((s) => (
                      <th key={s} className="text-center px-2 py-2.5 text-xs font-medium text-torg-gray uppercase tracking-wider min-w-[100px]">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itemsPaginados.length === 0 && (
                    <tr>
                      <td colSpan={20} className="text-center py-8 text-gray-400">
                        Nenhum item encontrado com os filtros selecionados
                      </td>
                    </tr>
                  )}
                  {itemsPaginados.map((item) => {
                    const setoresCols = setorFiltro ? [setorFiltro] : (data.setoresOrdem || []);
                    return (
                      <tr key={item.item} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2 text-xs font-mono text-torg-dark sticky left-0 bg-white z-10">
                          <div className="truncate max-w-[220px]" title={item.item}>
                            {item.item}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-torg-gray">
                          <div className="truncate max-w-[180px]" title={item.descItem || ""}>
                            {item.descItem || "—"}
                          </div>
                        </td>
                        {data.grupos?.length > 1 && (
                          <td className="px-2 py-2 text-center">
                            {item.grupo && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-bold bg-torg-blue/10 text-torg-blue">
                                {item.grupo}
                              </span>
                            )}
                          </td>
                        )}
                        {setoresCols.map((s) => {
                          const d = item.setores[s];
                          if (!d) {
                            return (
                              <td key={s} className="px-2 py-2 text-center text-gray-300 text-xs">
                                —
                              </td>
                            );
                          }
                          const badge = STATUS_BADGE[d.status] || STATUS_BADGE["Não Inicializada"];
                          return (
                            <td key={s} className="px-2 py-2 text-center">
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                                <span>{badge.icon}</span>
                                <span>{(d.pesoProduzido || 0).toFixed(0)}</span>
                                <span className="text-gray-400 font-normal">/ {(d.pesoPlanejado || 0).toFixed(0)}</span>
                              </div>
                              {d.saldoRestante > 0 && (
                                <div className="text-[10px] text-amber-600 mt-0.5">
                                  falta {d.saldoRestante.toFixed(1)} kg
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação inferior */}
            {totalPaginas > 1 && (
              <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-xs text-torg-gray">
                <span>
                  Mostrando {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, itemsFiltrados.length)} de {itemsFiltrados.length}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPaginas, 10) }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPagina(i)}
                      className={`w-7 h-7 rounded ${pagina === i ? "bg-torg-blue text-white font-bold" : "hover:bg-gray-100"}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  {totalPaginas > 10 && <span className="px-1">...</span>}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, sub, destaque, barra }) {
  const corFundo = destaque === "green" ? "border-green-100" : destaque === "amber" ? "border-amber-100" : "border-gray-100";
  return (
    <div className={`bg-white rounded-xl border ${corFundo} shadow-sm p-4`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-torg-gray font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-bold text-torg-dark">{value}</div>
      {sub && <div className="text-xs text-torg-gray mt-1">{sub}</div>}
      {barra !== undefined && (
        <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
          <div
            className={`h-2 rounded-full transition-all ${barra >= 100 ? "bg-green-500" : barra >= 50 ? "bg-torg-blue" : "bg-amber-500"}`}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
