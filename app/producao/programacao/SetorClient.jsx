"use client";
import { useState, useMemo, Fragment } from "react";
import {
  Filter, Search, CheckCircle2, Download, Loader2,
  ArrowRight, X, Package, Undo2, ChevronDown, ChevronUp,
  Flame, Sparkles, Wind, Paintbrush, Truck,
} from "lucide-react";

const ICON_MAP = {
  SOLDA: Flame,
  ACABAMENTO: Sparkles,
  JATO: Wind,
  PINTURA: Paintbrush,
  EXPEDIDO: Truck,
};
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, downloadWorkbook, CORES,
} from "@/lib/excel-relatorio";
import { fmtOP } from "@/lib/utils";

const STATUS_LABEL = {
  PENDENTE: "Pendente", CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

/**
 * Componente genérico para setores do pipeline de produção.
 * Mostra peças no setor atual, permite avançar para o próximo ou reverter.
 *
 * @param {Object} props
 * @param {Array} props.pecasIniciais - Peças (CONJUNTOs) no setor atual + próximo
 * @param {string} props.setorAtual - Status atual do setor (ex: "SOLDA")
 * @param {string} props.setorAnterior - Status anterior (ex: "MONTAGEM")
 * @param {string} props.setorProximo - Próximo status (ex: "ACABAMENTO")
 * @param {string} props.titulo - Título da página
 * @param {string} props.iconColor - Classe de cor do ícone
 * @param {string} props.codigoDoc - Código ISO do relatório
 */
export default function SetorClient({
  pecasIniciais, setorAtual, setorAnterior, setorProximo,
  titulo, iconColor = "text-torg-blue", codigoDoc = "REL-PRD-005",
  // apontamento do Syneco NESTE setor: { [marca]: { produzido, planejado, dataFim } }
  apontamentos = {},
}) {
  const Icon = ICON_MAP[setorAtual] || Package;
  const [pecas, setPecas] = useState(pecasIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [avancando, setAvancando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);
  const [expandidos, setExpandidos] = useState(new Set());

  const labelAtual = STATUS_LABEL[setorAtual] || setorAtual;
  const labelProximo = STATUS_LABEL[setorProximo] || setorProximo;
  const labelAnterior = STATUS_LABEL[setorAnterior] || setorAnterior;

  // OPs disponíveis
  const opsDisponiveis = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  // Filtrar — inclui ADIANTADOS: conjuntos com apontamento Syneco > 0 neste
  // setor mesmo que o status (pipeline) ainda esteja num setor anterior
  const filtradas = useMemo(() => {
    return pecas.filter((p) => {
      const adiantada = p.status !== setorAtual && (apontamentos[p.marca]?.produzido || 0) > 0;
      if (p.status !== setorAtual && !adiantada) return false;
      if (filtroOp && p.opNumero !== filtroOp) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (
          !p.marca.toLowerCase().includes(q) &&
          !(p.descricao || "").toLowerCase().includes(q) &&
          !p.opNumero.toLowerCase().includes(q) &&
          !(p.op?.cliente || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [pecas, filtroOp, busca, setorAtual, apontamentos]);

  // Só quem está NESTE setor pode ser selecionado/movido (adiantados não)
  const selecionaveis = useMemo(() => filtradas.filter((p) => p.status === setorAtual), [filtradas, setorAtual]);

  // Contadores
  const totalNoSetor = useMemo(() => pecas.filter((p) => p.status === setorAtual).length, [pecas, setorAtual]);
  const pesoNoSetor = useMemo(() => pecas.filter((p) => p.status === setorAtual).reduce((s, p) => s + (p.pesoTotalKg || 0), 0), [pecas, setorAtual]);
  const pesoFiltradas = useMemo(() => filtradas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0), [filtradas]);

  // Toggle expand (para ver croquis do conjunto)
  const toggleExpandido = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Seleção
  const toggleSelecionado = (id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selecionarTodos = () => {
    if (selecionaveis.length > 0 && selecionaveis.every((p) => selecionados.has(p.id))) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(selecionaveis.map((p) => p.id)));
    }
  };

  // Avançar para próximo setor
  async function avancarSelecionados() {
    if (selecionados.size === 0) return;
    setAvancando(true);
    try {
      const res = await fetch("/api/producao/pecas/mover-setor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados], de: setorAtual, para: setorProximo }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setPecas((prev) =>
        prev.map((p) => (selecionados.has(p.id) && p.status === setorAtual ? { ...p, status: setorProximo } : p))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao avançar: " + e.message);
    } finally {
      setAvancando(false);
    }
  }

  // Reverter para setor anterior
  async function reverterSelecionados() {
    if (selecionados.size === 0 || !setorAnterior) return;
    setRevertendo(true);
    try {
      const res = await fetch("/api/producao/pecas/mover-setor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados], de: setorAtual, para: setorAnterior }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setPecas((prev) =>
        prev.map((p) => (selecionados.has(p.id) && p.status === setorAtual ? { ...p, status: setorAnterior } : p))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao reverter: " + e.message);
    } finally {
      setRevertendo(false);
    }
  }

  // Exportar relatório
  async function exportarRelatorio() {
    const filtrosAtivos = [filtroOp ? `OP ${filtroOp}` : null].filter(Boolean);
    const tituloFiltro = filtrosAtivos.length > 0 ? filtrosAtivos.join(" · ") : `Todas as OPs`;

    const totalPecas = filtradas.reduce((s, p) => s + (p.qte || 1), 0);
    const totalPeso = filtradas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);

    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Programacao de ${labelAtual}`,
      subtitulo: tituloFiltro,
      kpis: [`Total: ${filtradas.length} conjuntos (${totalPecas} pc)  |  Peso: ${(totalPeso / 1000).toFixed(1)} t`],
      totalColunas: 8,
      nomePlanilha: labelAtual,
      codigoDoc,
    });

    ws.columns = [
      { width: 8 }, { width: 14 }, { width: 30 }, { width: 14 },
      { width: 7 }, { width: 11 }, { width: 14 }, { width: 14 },
    ];

    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, ["OP", "Marca", "Descricao", "Material", "Qte", "Peso Total", "Cliente", "Obra"]);
    row++;
    const primeiraLinha = row;

    for (const p of filtradas) {
      adicionarLinhaTabela(ws, row, [
        fmtOP(p.opNumero),
        p.marca,
        p.descricao || "",
        p.material || "",
        p.qte || 1,
        p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : 0,
        p.op?.cliente || "",
        p.op?.obra || "",
      ], {
        alinhamento: { 4: "right", 5: "right" },
      });
      ws.getCell(row, 2).font = { name: "Arial", size: 9, bold: true, color: { argb: CORES.TORG_DARK } };
      row++;
    }

    const ultima = row - 1;
    adicionarLinhaTotais(ws, row, [
      "TOTAL", "", "", "",
      { formula: `SUM(E${primeiraLinha}:E${ultima})` },
      { formula: `SUM(F${primeiraLinha}:F${ultima})` },
      "", "",
    ]);

    const nome = `Torg_${labelAtual}_${filtroOp ? `OP-${filtroOp}` : "Todas"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    await downloadWorkbook(workbook, nome);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          {Icon && <Icon size={24} className={iconColor} />} Programação de {labelAtual}
        </h2>
        <p className="text-xs text-torg-gray mt-0.5">
          Conjuntos em {labelAtual.toLowerCase()}. Ao concluir, libere para {labelProximo}.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl p-3 bg-blue-50 text-blue-700 ring-2 ring-offset-1 ring-blue-400">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Em {labelAtual.toLowerCase()}</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalNoSetor}</p>
          <p className="text-[10px] opacity-70">{fmtKg(pesoNoSetor)}</p>
        </div>
        <div className="rounded-xl p-3 bg-emerald-50 text-emerald-700">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Concluídos → {labelProximo}</p>
          <p className="text-2xl font-extrabold tabular-nums">{pecas.filter((p) => p.status === setorProximo).length}</p>
          <p className="text-[10px] opacity-70">já avançaram</p>
        </div>
        <div className="rounded-xl p-3 bg-gray-50 text-torg-gray">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Total geral</p>
          <p className="text-2xl font-extrabold tabular-nums">{pecas.length}</p>
          <p className="text-[10px] opacity-70">conjuntos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <select
          value={filtroOp}
          onChange={(e) => { setFiltroOp(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas as OPs</option>
          {opsDisponiveis.map((op) => <option key={op} value={op}>OP {op}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Search size={12} className="text-torg-gray ml-2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca, descricao, OP ou cliente..."
            className="flex-1 px-2 py-1.5 text-xs border-0 focus:ring-0 focus:outline-none"
          />
        </div>
        <button
          onClick={exportarRelatorio}
          className="px-3 py-1.5 bg-torg-blue/10 text-torg-blue text-xs rounded-lg hover:bg-torg-blue/20 font-medium flex items-center gap-1.5"
        >
          <Download size={13} /> Exportar
        </button>
        {(filtroOp || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}

        {/* Ações em lote */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-torg-gray font-medium">
              {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={avancarSelecionados}
              disabled={avancando}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {avancando ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              Liberar → {labelProximo}
            </button>
            {setorAnterior && (
              <button
                onClick={reverterSelecionados}
                disabled={revertendo}
                className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {revertendo ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Reverter → {labelAnterior}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info + selecionar todos */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-torg-gray">
          {filtradas.length} conjunto{filtradas.length !== 1 ? "s" : ""} · {fmtKg(pesoFiltradas)}
        </span>
        {selecionaveis.length > 0 && (
          <button onClick={selecionarTodos} className="text-[11px] text-torg-blue hover:underline font-medium">
            {selecionaveis.every((p) => selecionados.has(p.id)) ? "Desmarcar todos" : `Selecionar todos (${selecionaveis.length})`}
          </button>
        )}
      </div>

      {/* Vazio */}
      {filtradas.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">
            {totalNoSetor === 0
              ? `Nenhum conjunto em ${labelAtual.toLowerCase()}. Libere peças de ${labelAnterior} primeiro.`
              : "Nenhum conjunto no filtro selecionado."}
          </p>
        </div>
      )}

      {/* Lista */}
      {filtradas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase" title="Unidades apontadas neste setor no Syneco">Apontado (Syneco)</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cliente</th>
                  {/* Expand toggle for conjuntos */}
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((p) => {
                  const isSelected = selecionados.has(p.id);
                  const isExpanded = expandidos.has(p.id);
                  const croquis = p.conjuntoCroquis || [];
                  const hasCroquis = croquis.length > 0;
                  const apont = apontamentos[p.marca];
                  const adiantada = p.status !== setorAtual;

                  return (
                    <Fragment key={p.id}>
                      <tr className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2.5">
                          {!adiantada && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelecionado(p.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-torg-blue">{fmtOP(p.opNumero)}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-torg-dark">
                          {p.marca}
                          {adiantada && (
                            <span className="ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700"
                              title={`Unidades já apontadas neste setor, mas o conjunto ainda está em ${STATUS_LABEL[p.status] || p.status}`}>
                              à frente · {STATUS_LABEL[p.status] || p.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-torg-gray max-w-[200px] truncate">{p.descricao || "—"}</td>
                        <td className="px-3 py-2.5 text-torg-gray">{p.material || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{p.qte || 1}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-torg-gray">{fmtKg(p.pesoTotalKg)}</td>
                        <td className="px-3 py-2.5 text-center">
                          {apont ? (
                            <span className={`tabular-nums font-semibold ${
                              apont.planejado > 0 && apont.produzido >= apont.planejado ? "text-emerald-600"
                                : apont.produzido > 0 ? "text-amber-600" : "text-gray-400"
                            }`}>
                              {apont.produzido}/{apont.planejado || p.qte || 1}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-torg-gray text-[11px] truncate max-w-[120px]">{p.op?.cliente || "—"}</td>
                        <td className="px-3 py-2.5">
                          {hasCroquis && (
                            <button onClick={() => toggleExpandido(p.id)} className="text-gray-400 hover:text-torg-dark">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && croquis.map((cc) => {
                        const cr = cc.croqui;
                        if (!cr) return null;
                        return (
                          <tr key={cc.id || cr.id} className="bg-gray-50/40">
                            <td></td>
                            <td className="px-3 py-1.5 text-[10px] text-gray-400">↳</td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-torg-gray">{cr.marca}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-500">{cr.descricao || "—"}</td>
                            <td></td>
                            <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-gray-500">{cr.qte || 1}</td>
                            <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-gray-400">
                              {cr.qteProduzida || 0}/{cr.qte || 1}
                            </td>
                            <td colSpan={3} className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                cr.status === "CORTE" || cr.status === "MONTAGEM" || cr.status === "SOLDA" || cr.status === "ACABAMENTO"
                                  ? "bg-blue-100 text-blue-700"
                                  : cr.status === "EXPEDIDO"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}>
                                {STATUS_LABEL[cr.status] || cr.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
