"use client";
import { useState, useMemo } from "react";
import {
  Filter, Search, CheckCircle2, Download, Loader2,
  ArrowRight, X, Package, Undo2, AlertTriangle,
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

const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

/**
 * Componente genérico para setores do pipeline de produção.
 * Mostra os conjuntos que ESTÃO no setor (sem croquis — croqui é unidade do
 * corte), permite avançar para o próximo setor ou reverter.
 *
 * Regras (Vitor, 2026-06-12):
 *  - saiu do setor (status além, ou apontamento completo + próximo iniciado)
 *    → fora da lista, conta só no "Total geral";
 *  - apontamento completo e próximo NÃO iniciado → indicador "Concluídos"
 *    (pronto para o próximo setor), segue na lista;
 *  - adiantado (apontou aqui com status anterior) → aparece, sem seleção.
 *
 * @param {Object} props
 * @param {Array} props.pecasIniciais - Conjuntos do setor em diante + adiantados
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
  // apontamento do Syneco: { [marca]: { produzido, planejado, dataFim } }
  apontamentos = {},
  apontamentosProximo = {},
  // furo de lançamento: { [marca]: { apontado, gargalos: [{ setor, produzido }] } }
  furos = {},
}) {
  const Icon = ICON_MAP[setorAtual] || Package;
  const [pecas, setPecas] = useState(pecasIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [avancando, setAvancando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  const labelAtual = STATUS_LABEL[setorAtual] || setorAtual;
  const labelProximo = STATUS_LABEL[setorProximo] || setorProximo;
  const labelAnterior = STATUS_LABEL[setorAnterior] || setorAnterior;
  const idxAtual = ORDEM.indexOf(setorAtual);

  // Total esperado do conjunto neste setor (planejado do Syneco ou qte da LPC)
  const totalDe = (p) => {
    const ap = apontamentos[p.marca];
    return ap?.planejado > 0 ? ap.planejado : (p.qte || 1);
  };
  const concluiuSetor = (p) => {
    const prod = apontamentos[p.marca]?.produzido || 0;
    return prod > 0 && prod >= totalDe(p);
  };
  // Saiu do setor: o pipeline já avançou, ou o setor terminou e o próximo já
  // começou a apontar — não aparece na lista, fica só no Total geral
  const saiuDoSetor = (p) =>
    ORDEM.indexOf(p.status) > idxAtual ||
    (concluiuSetor(p) && (apontamentosProximo[p.marca]?.produzido || 0) > 0);

  // OPs disponíveis
  const opsDisponiveis = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  // Lista = quem está no setor agora (inclui adiantados; exclui quem saiu)
  const filtradas = useMemo(() => {
    return pecas.filter((p) => {
      if (saiuDoSetor(p)) return false;
      if (p.status !== setorAtual && (apontamentos[p.marca]?.produzido || 0) === 0) return false;
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
  }, [pecas, filtroOp, busca, setorAtual, apontamentos, apontamentosProximo]);

  // Só quem está NESTE setor pode ser selecionado/movido (adiantados não)
  const selecionaveis = useMemo(() => filtradas.filter((p) => p.status === setorAtual), [filtradas, setorAtual]);

  // Contadores
  const noSetor = useMemo(() => pecas.filter((p) => !saiuDoSetor(p)), [pecas, apontamentos, apontamentosProximo]);
  const prontos = useMemo(() => noSetor.filter((p) => concluiuSetor(p)), [noSetor, apontamentos]);
  const totalNoSetor = noSetor.length;
  const pesoNoSetor = useMemo(() => noSetor.reduce((s, p) => s + (p.pesoTotalKg || 0), 0), [noSetor]);
  const pesoFiltradas = useMemo(() => filtradas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0), [filtradas]);

  // Furos de lançamento (apontado aqui > setor anterior no Syneco) ainda no setor
  const comFuro = useMemo(() => noSetor.filter((p) => furos[p.marca]), [noSetor, furos]);

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
        <div className="rounded-xl p-3 bg-emerald-50 text-emerald-700"
          title={`Apontamento de ${labelAtual.toLowerCase()} concluído no Syneco, aguardando ${labelProximo.toLowerCase()}`}>
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Concluídos → {labelProximo}</p>
          <p className="text-2xl font-extrabold tabular-nums">{prontos.length}</p>
          <p className="text-[10px] opacity-70">prontos para {labelProximo.toLowerCase()}</p>
        </div>
        <div className="rounded-xl p-3 bg-gray-50 text-torg-gray"
          title="No setor + os que já avançaram (registro do que passou por aqui)">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Total geral</p>
          <p className="text-2xl font-extrabold tabular-nums">{pecas.length}</p>
          <p className="text-[10px] opacity-70">{pecas.length - totalNoSetor} já avançaram</p>
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

      {/* Alerta de furo de lançamento no Syneco */}
      {comFuro.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs text-red-800 space-y-1">
            <p className="font-semibold">
              Furo de apontamento no Syneco — {comFuro.length} conjunto{comFuro.length > 1 ? "s" : ""} com mais
              unidades apontadas em {labelAtual.toLowerCase()} do que nos setores anteriores
            </p>
            {comFuro.map((p) => {
              const f = furos[p.marca];
              return (
                <p key={p.id} className="tabular-nums">
                  <span className="font-mono font-bold">{p.marca}</span>
                  {" — "}{labelAtual} {f.apontado}, mas {f.gargalos.map((g) => `${g.setor} tem ${g.produzido}`).join(" · ")}
                </p>
              );
            })}
            <p className="text-red-600">
              Ajuste os lançamentos no Syneco (término não apontado ou lançado no setor errado) — o portal reflete na próxima sincronização.
            </p>
          </div>
        </div>
      )}

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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((p) => {
                  const isSelected = selecionados.has(p.id);
                  const apont = apontamentos[p.marca];
                  const total = totalDe(p);
                  const adiantada = p.status !== setorAtual;
                  const furo = furos[p.marca];

                  return (
                    <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
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
                        {furo && (
                          <span className="ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 inline-flex items-center gap-1"
                            title={`Apontadas ${furo.apontado} unidades em ${labelAtual.toLowerCase()}, mas ${furo.gargalos.map((g) => `${g.setor} tem ${g.produzido}`).join(" · ")} — ajustar os lançamentos no Syneco`}>
                            <AlertTriangle size={9} /> furo de apontamento
                          </span>
                        )}
                        {!furo && adiantada && (
                          <span className="ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700"
                            title={`O Syneco já apontou unidades neste setor, mas o conjunto ainda não foi liberado de ${STATUS_LABEL[p.status] || p.status} no portal`}>
                            adiantado · {STATUS_LABEL[p.status] || p.status}
                          </span>
                        )}
                        {!furo && !adiantada && concluiuSetor(p) && (
                          <span className="ml-1.5 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                            title={`Apontamento de ${labelAtual.toLowerCase()} concluído — pronto para ${labelProximo.toLowerCase()}`}>
                            pronto → {labelProximo}
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
                            apont.produzido >= total ? "text-emerald-600"
                              : apont.produzido > 0 ? "text-amber-600" : "text-gray-400"
                          }`}>
                            {apont.produzido}/{total}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-torg-gray text-[11px] truncate max-w-[120px]">{p.op?.cliente || "—"}</td>
                    </tr>
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
