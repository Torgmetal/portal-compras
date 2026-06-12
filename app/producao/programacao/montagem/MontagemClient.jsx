"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench, ChevronDown, ChevronUp, Filter, Search, CheckCircle2, Download,
  Loader2, AlertCircle, ArrowRight, X, Package, Undo2,
} from "lucide-react";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, adicionarLegenda,
  downloadWorkbook, CORES,
} from "@/lib/excel-relatorio";
import { fmtOP } from "@/lib/utils";
import { MAQUINA_LABEL, MAQUINA_COR } from "@/lib/maquina-corte";

const STATUS_LABEL = {
  PENDENTE: "Pendente", CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

const PRONTIDAO_LABEL = {
  PRONTO: "Montagem total — 100% cortado",
  LIBERAVEL: "Montagem parcial liberada — ≥ metade",
  NAO_MONTAGEM: "Não dá montagem — corte abaixo da metade",
  PODE_MONTAR: "Pode montar (100% ou ≥ metade)",
  PARCIAL: "Aguardando corte",
  PENDENTE: "Sem corte",
  MONTADO: "Conjuntos montados",
};

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

const fmtMm = (v) => {
  if (v == null || v === 0) return "—";
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mm`;
};

// Prontidão do conjunto para MONTAGEM (regra do Vitor):
//   PRONTO    = todos os croquis 100% cortados
//   LIBERAVEL = todos os croquis com PELO MENOS METADE cortada — a montagem
//               pode começar antes de terminar todos os cortes
//   PARCIAL   = tem corte feito, mas algum croqui abaixo da metade
//   PENDENTE  = nada cortado
// podeLiberar = PRONTO ou LIBERAVEL.
function calcularProntidao(conjunto) {
  const croquis = conjunto.conjuntoCroquis || [];
  if (croquis.length === 0) {
    return { pronto: false, liberavel: false, podeLiberar: false, total: 0, atendidos: 0, pct: 0, itens: [], categoria: "PENDENTE" };
  }

  let total = 0;
  let atendidos = 0;
  let comMetade = 0;
  let comAlgo = 0;
  const itens = [];

  for (const rel of croquis) {
    const c = rel.croqui;
    if (!c) continue;
    const necessario = (c.qte || 1);
    const produzido = c.qteProduzida || 0;
    const ok = produzido >= necessario;
    const metade = produzido >= necessario / 2; // pelo menos metade cortada
    total++;
    if (ok) atendidos++;
    if (metade) comMetade++;
    if (produzido > 0) comAlgo++;
    itens.push({
      marca: c.marca,
      descricao: c.descricao,
      material: c.material,
      qte: necessario,
      qteProduzida: produzido,
      falta: Math.max(0, necessario - produzido),
      ok,
      metade,
      status: c.status,
      maquina: c.maquina,
      comprimentoMm: c.comprimentoMm,
      pesoUnitKg: c.pesoUnitKg,
    });
  }

  const pct = total > 0 ? Math.round((atendidos / total) * 100) : 0;
  const pronto = atendidos === total && total > 0;
  const liberavel = !pronto && total > 0 && comMetade === total;
  const podeLiberar = pronto || liberavel;
  const categoria = pronto ? "PRONTO" : liberavel ? "LIBERAVEL" : comAlgo > 0 ? "PARCIAL" : "PENDENTE";
  return { pronto, liberavel, podeLiberar, total, atendidos, pct, itens, categoria };
}

export default function MontagemClient({ conjuntosIniciais, userRole }) {
  const router = useRouter();
  const [conjuntos, setConjuntos] = useState(conjuntosIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("CORTE");
  const [filtroProntidao, setFiltroProntidao] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [expandidos, setExpandidos] = useState(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  // OPs disponíveis (que têm conjuntos)
  const opsDisponiveis = useMemo(() => {
    const set = new Set(conjuntos.map((c) => c.opNumero));
    return [...set].sort();
  }, [conjuntos]);

  // Enriquecer conjuntos com dados de prontidão
  const conjuntosEnriquecidos = useMemo(() => {
    return conjuntos.map((c) => ({
      ...c,
      prontidao: calcularProntidao(c),
    }));
  }, [conjuntos]);

  // Filtrar
  const filtrados = useMemo(() => {
    return conjuntosEnriquecidos.filter((c) => {
      if (filtroOp && c.opNumero !== filtroOp) return false;
      if (filtroStatus && c.status !== filtroStatus) return false;
      if (filtroProntidao === "MONTADO") {
        if (c.status !== "MONTAGEM") return false;
      } else if (filtroProntidao === "PODE_MONTAR") {
        if (!c.prontidao.podeLiberar) return false; // 100% ou ≥ metade (card de KPI)
      } else if (filtroProntidao === "NAO_MONTAGEM") {
        if (c.prontidao.podeLiberar) return false; // abaixo da metade / sem corte
      } else if (filtroProntidao && c.prontidao.categoria !== filtroProntidao) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (
          !c.marca.toLowerCase().includes(q) &&
          !(c.descricao || "").toLowerCase().includes(q) &&
          !c.opNumero.toLowerCase().includes(q) &&
          !(c.op?.cliente || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [conjuntosEnriquecidos, filtroOp, filtroStatus, filtroProntidao, busca]);

  // Contadores
  const totalAguardando = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "CORTE").length, [conjuntosEnriquecidos]);
  const totalProntos = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "CORTE" && c.prontidao.podeLiberar).length, [conjuntosEnriquecidos]);
  const totalEmMontagem = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "MONTAGEM").length, [conjuntosEnriquecidos]);

  // Peso total dos conjuntos filtrados
  const pesoFiltrados = useMemo(() => filtrados.reduce((s, c) => s + (c.pesoTotalKg || 0), 0), [filtrados]);

  // Toggle expand
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
    if (filtroStatus === "CORTE") {
      const prontos = filtrados.filter((c) => c.prontidao.podeLiberar && c.status === "CORTE");
      if (prontos.every((c) => selecionados.has(c.id))) {
        setSelecionados(new Set());
      } else {
        setSelecionados(new Set(prontos.map((c) => c.id)));
      }
    } else if (filtroStatus === "MONTAGEM") {
      const emMontagem = filtrados.filter((c) => c.status === "MONTAGEM");
      if (emMontagem.every((c) => selecionados.has(c.id))) {
        setSelecionados(new Set());
      } else {
        setSelecionados(new Set(emMontagem.map((c) => c.id)));
      }
    }
  };

  // Liberar para montagem
  async function liberarSelecionados() {
    if (selecionados.size === 0) return;
    setLiberando(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados] }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setConjuntos((prev) =>
        prev.map((c) => (selecionados.has(c.id) && c.status === "CORTE" ? { ...c, status: "MONTAGEM" } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao liberar: " + e.message);
    } finally {
      setLiberando(false);
    }
  }

  // Reverter montagem
  async function reverterSelecionados() {
    if (selecionados.size === 0) return;
    setRevertendo(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados], reverter: true }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setConjuntos((prev) =>
        prev.map((c) => (selecionados.has(c.id) && c.status === "MONTAGEM" ? { ...c, status: "CORTE" } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao reverter: " + e.message);
    } finally {
      setRevertendo(false);
    }
  }

  // Exportar relatório padrão ISO
  async function exportarRelatorio() {
    const filtrosAtivos = [
      filtroOp ? `OP ${filtroOp}` : null,
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroProntidao ? PRONTIDAO_LABEL[filtroProntidao] : null,
    ].filter(Boolean);
    const tituloFiltro = filtrosAtivos.length > 0 ? filtrosAtivos.join(" · ") : "Todos os conjuntos";

    const totalPecas = filtrados.reduce((s, c) => s + (c.qte || 1), 0);
    const totalCroquis = filtrados.reduce((s, c) => s + (c.prontidao.total || 0), 0);
    const totalAtendidos = filtrados.reduce((s, c) => s + (c.prontidao.atendidos || 0), 0);
    const totalPeso = filtrados.reduce((s, c) => s + (c.pesoTotalKg || 0), 0);
    const pctGeral = totalCroquis > 0 ? Math.round((totalAtendidos / totalCroquis) * 100) : 0;

    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: "Programacao de Montagem",
      subtitulo: tituloFiltro,
      kpis: [
        `Total: ${filtrados.length} conjuntos (${totalPecas} pc)  |  Croquis: ${totalAtendidos}/${totalCroquis} cortados (${pctGeral}%)  |  Peso: ${(totalPeso / 1000).toFixed(1)} t`,
      ],
      totalColunas: 12,
      nomePlanilha: "Montagem",
      codigoDoc: "REL-PRD-004",
    });

    ws.columns = [
      { width: 8 }, { width: 14 }, { width: 30 }, { width: 14 },
      { width: 7 }, { width: 11 }, { width: 11 }, { width: 11 },
      { width: 10 }, { width: 10 }, { width: 12 }, { width: 14 },
    ];

    let row = linhaInicio;
    const headers = ["OP", "Marca", "Descricao", "Material", "Qte", "Comp.", "Peso", "Maquina", "Produzido", "Falta", "Situacao", "Status"];
    adicionarHeaderTabela(ws, row, headers);
    row++;

    for (const c of filtrados) {
      const { prontidao } = c;
      const fillColor = prontidao.pronto ? CORES.LIGHT_GREEN : prontidao.atendidos > 0 ? CORES.LIGHT_ORANGE : undefined;
      const faltam = prontidao.total - prontidao.atendidos;

      // Linha do CONJUNTO (negrito, destaque)
      adicionarLinhaTabela(ws, row, [
        fmtOP(c.opNumero),
        c.marca,
        c.descricao || "",
        c.material || "",
        c.qte || 1,
        "",
        c.pesoTotalKg ? Number(c.pesoTotalKg.toFixed(1)) : 0,
        "",
        `${prontidao.atendidos}/${prontidao.total}`,
        faltam,
        prontidao.pronto ? "Pronto" : prontidao.liberavel ? "Pode montar" : `${prontidao.pct}%`,
        STATUS_LABEL[c.status] || c.status,
      ], {
        fillColor,
        alinhamento: { 4: "right", 5: "right", 6: "right", 8: "right", 9: "right", 10: "right" },
      });
      // Negrito em toda a linha do conjunto
      for (let col = 1; col <= 12; col++) {
        const cell = ws.getCell(row, col);
        cell.font = { name: "Arial", size: 9, bold: true, color: { argb: CORES.TORG_DARK } };
      }
      ws.getCell(row, 9).font = { name: "Arial", size: 9, bold: true, color: { argb: prontidao.pronto ? "16A34A" : prontidao.atendidos > 0 ? "EA580C" : "9CA3AF" } };
      ws.getCell(row, 10).font = { name: "Arial", size: 9, bold: true, color: { argb: faltam === 0 ? "16A34A" : "EA580C" } };
      row++;

      // Linhas dos CROQUIS (indentados, fonte menor)
      for (const item of prontidao.itens) {
        const croquiFill = item.ok ? "E8F5E9" : undefined;
        adicionarLinhaTabela(ws, row, [
          "",
          `  ${item.marca}`,
          item.descricao || "",
          item.material || "",
          item.qte,
          item.comprimentoMm ? `${item.comprimentoMm} mm` : "",
          item.pesoUnitKg ? Number(Number(item.pesoUnitKg).toFixed(1)) : 0,
          item.maquina ? (MAQUINA_LABEL[item.maquina] || item.maquina) : "",
          item.qteProduzida,
          item.falta === 0 ? "✓" : `-${item.falta}`,
          item.ok ? "OK" : "Falta",
          "",
        ], {
          fillColor: croquiFill,
          alinhamento: { 4: "right", 5: "right", 6: "right", 8: "right", 9: "right", 10: "right" },
        });
        // Estilo croqui: cinza, fonte 8
        for (let col = 1; col <= 12; col++) {
          const cell = ws.getCell(row, col);
          cell.font = { name: "Arial", size: 8, color: { argb: "576D7E" } };
        }
        ws.getCell(row, 2).font = { name: "Arial", size: 8, bold: true, color: { argb: "576D7E" } };
        ws.getCell(row, 9).font = { name: "Arial", size: 8, bold: true, color: { argb: item.ok ? "16A34A" : item.qteProduzida > 0 ? "EA580C" : "9CA3AF" } };
        ws.getCell(row, 10).font = { name: "Arial", size: 8, bold: true, color: { argb: item.falta === 0 ? "16A34A" : "EA580C" } };
        ws.getCell(row, 11).font = { name: "Arial", size: 8, bold: true, color: { argb: item.ok ? "16A34A" : "EA580C" } };
        row++;
      }
    }

    row++;
    adicionarLegenda(ws, row, [
      { cor: CORES.LIGHT_GREEN, label: "Verde = 100% croquis cortados (pronto para montar)" },
      { cor: CORES.LIGHT_ORANGE, label: "Laranja = parcialmente cortado" },
      { cor: "FFFFFF", label: "Branco = nenhum croqui cortado" },
      { cor: "E8F5E9", label: "Croqui verde claro = croqui ja cortado" },
    ], 12);

    const filtroDesc = [
      filtroOp ? `OP-${filtroOp}` : "Todas-OPs",
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroProntidao ? PRONTIDAO_LABEL[filtroProntidao] : null,
    ].filter(Boolean).join("_");

    const nomeArquivo = `Torg_Montagem_${filtroDesc || "Todas"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    await downloadWorkbook(workbook, nomeArquivo);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Wrench size={24} className="text-blue-600" /> Programação de Montagem
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Conjuntos aguardando montagem. Um conjunto só pode ser montado quando todos os seus croquis estiverem cortados.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => { setFiltroStatus("CORTE"); setFiltroProntidao(""); setSelecionados(new Set()); }}
          className={`rounded-xl p-3 text-left transition-all bg-orange-50 text-orange-700 ${filtroStatus === "CORTE" && !filtroProntidao ? "ring-2 ring-offset-1 ring-orange-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Aguardando</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalAguardando}</p>
          <p className="text-[10px] opacity-70">conjuntos no corte</p>
        </button>
        <button
          onClick={() => { setFiltroStatus("CORTE"); setFiltroProntidao("PODE_MONTAR"); setSelecionados(new Set()); }}
          className={`rounded-xl p-3 text-left transition-all bg-emerald-50 text-emerald-700 ${filtroProntidao === "PODE_MONTAR" ? "ring-2 ring-offset-1 ring-emerald-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Prontos p/ montar</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalProntos}</p>
          <p className="text-[10px] opacity-70">100% ou ≥ metade cortados</p>
        </button>
        <button
          onClick={() => { setFiltroStatus("MONTAGEM"); setFiltroProntidao(""); setSelecionados(new Set()); }}
          className={`rounded-xl p-3 text-left transition-all bg-blue-50 text-blue-700 ${filtroStatus === "MONTAGEM" ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Em montagem</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalEmMontagem}</p>
          <p className="text-[10px] opacity-70">liberados</p>
        </button>
        <button
          onClick={() => { setFiltroStatus(""); setFiltroProntidao(""); setSelecionados(new Set()); }}
          className={`rounded-xl p-3 text-left transition-all bg-gray-50 text-torg-gray ${filtroStatus === "" && !filtroProntidao ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Total</p>
          <p className="text-2xl font-extrabold tabular-nums">{conjuntos.length}</p>
          <p className="text-[10px] opacity-70">conjuntos importados</p>
        </button>
      </div>

      {/* Filtros — mesmo layout do Corte */}
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
        {/* sem seletor de setor: a aba já é o setor — os cards acima alternam
            entre Aguardando (corte) e Em montagem */}
        <select
          value={filtroProntidao}
          onChange={(e) => { setFiltroProntidao(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Situação</option>
          <option value="PRONTO">Montagem total — 100% cortado</option>
          <option value="LIBERAVEL">Montagem parcial liberada — ≥ metade</option>
          <option value="NAO_MONTAGEM">Não dá montagem — corte abaixo da metade</option>
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
          title="Exportar conjuntos filtrados para Excel"
        >
          <Download size={13} /> Exportar
        </button>
        {(filtroOp || filtroProntidao || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setFiltroProntidao(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}

        {/* Ações em lote inline */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-torg-gray font-medium">
              {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </span>
            {filtroStatus === "CORTE" && (
              <button
                onClick={liberarSelecionados}
                disabled={liberando}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {liberando ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                Liberar Montagem
              </button>
            )}
            {filtroStatus === "MONTAGEM" && (
              <button
                onClick={reverterSelecionados}
                disabled={revertendo}
                className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {revertendo ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Reverter para Corte
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info: total filtrado */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-torg-gray">
          {filtrados.length} conjunto{filtrados.length !== 1 ? "s" : ""} · {fmtKg(pesoFiltrados)}
        </span>
        {filtroStatus === "CORTE" && filtrados.filter((c) => c.prontidao.podeLiberar).length > 0 && (
          <button
            onClick={selecionarTodos}
            className="text-[11px] text-torg-blue hover:underline font-medium"
          >
            Selecionar todos que podem montar ({filtrados.filter((c) => c.prontidao.podeLiberar).length})
          </button>
        )}
        {filtroStatus === "MONTAGEM" && filtrados.length > 0 && (
          <button
            onClick={selecionarTodos}
            className="text-[11px] text-torg-blue hover:underline font-medium"
          >
            Selecionar todos ({filtrados.length})
          </button>
        )}
      </div>

      {/* Resultado vazio */}
      {filtrados.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">
            {conjuntos.length === 0
              ? "Nenhum conjunto importado. Importe uma LPC na aba de Corte."
              : "Nenhum conjunto no filtro selecionado."}
          </p>
        </div>
      )}

      {/* Lista de conjuntos */}
      {filtrados.length > 0 && (
        <div className="space-y-2">
          {filtrados.map((c) => {
            const { prontidao } = c;
            const isExpanded = expandidos.has(c.id);
            const isSelected = selecionados.has(c.id);
            const pesoTotal = c.pesoTotalKg || 0;
            const podeSelecionar = filtroStatus === "CORTE" ? prontidao.podeLiberar : c.status === "MONTAGEM";

            return (
              <div key={c.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                isSelected ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-100"
              }`}>
                {/* Header do conjunto */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!podeSelecionar}
                    onChange={() => toggleSelecionado(c.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                  />

                  {/* Info principal */}
                  <button onClick={() => toggleExpandido(c.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-torg-dark font-mono">{c.marca}</span>
                        <span className="text-xs text-torg-blue font-mono">{fmtOP(c.opNumero)}</span>
                        {c.op?.cliente && (
                          <span className="text-[10px] text-torg-gray truncate max-w-[150px]">{c.op.cliente}</span>
                        )}
                      </div>
                      {c.descricao && (
                        <p className="text-[11px] text-torg-gray mt-0.5 truncate">{c.descricao}</p>
                      )}
                    </div>

                    {/* Progresso dos croquis */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          {prontidao.pronto ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              <CheckCircle2 size={10} /> Pronto
                            </span>
                          ) : prontidao.liberavel ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700"
                              title="Todos os croquis com pelo menos metade cortada — a montagem pode começar">
                              <CheckCircle2 size={10} /> Pode montar · ≥ ½
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <AlertCircle size={10} /> {prontidao.atendidos}/{prontidao.total} croquis
                            </span>
                          )}
                          {c.status === "MONTAGEM" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              <Wrench size={10} /> Em montagem
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-torg-gray mt-0.5">
                          {c.qte} pç · {fmtKg(pesoTotal)}
                        </p>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${prontidao.pct === 100 ? "bg-emerald-500" : prontidao.liberavel ? "bg-cyan-500" : prontidao.pct > 0 ? "bg-amber-400" : "bg-gray-300"}`}
                          style={{ width: `${prontidao.pct}%` }}
                        />
                      </div>

                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                </div>

                {/* Detalhe dos croquis (expandido) */}
                {isExpanded && prontidao.itens.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50/60">
                          <tr>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Croqui</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descricao</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Comp.</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Maquina</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Necessario</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Produzido</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Falta</th>
                            <th className="px-4 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {prontidao.itens.map((item, i) => (
                            <tr key={i} className={item.ok ? "bg-emerald-50/30" : ""}>
                              <td className="px-4 py-1.5 font-mono font-semibold text-torg-dark">{item.marca}</td>
                              <td className="px-4 py-1.5 text-torg-gray max-w-[180px] truncate" title={item.descricao}>{item.descricao || "—"}</td>
                              <td className="px-4 py-1.5 text-torg-gray">{item.material || "—"}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-torg-gray">{fmtMm(item.comprimentoMm)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-torg-gray">{fmtKg(item.pesoUnitKg)}</td>
                              <td className="px-4 py-1.5">
                                {item.maquina ? (
                                  <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${MAQUINA_COR[item.maquina]?.bg || "bg-gray-100"} ${MAQUINA_COR[item.maquina]?.text || "text-gray-600"}`}>
                                    {MAQUINA_LABEL[item.maquina] || item.maquina}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums font-medium text-torg-dark">{item.qte}</td>
                              <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${item.ok ? "text-emerald-600" : item.qteProduzida > 0 ? "text-orange-600" : "text-gray-400"}`}>
                                {item.qteProduzida}
                              </td>
                              <td className={`px-4 py-1.5 text-right tabular-nums font-bold ${item.falta === 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {item.falta === 0 ? "✓" : `-${item.falta}`}
                              </td>
                              <td className="px-4 py-1.5 text-center">
                                {item.ok ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 size={9} /> OK
                                  </span>
                                ) : item.metade ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700"
                                    title="Pelo menos metade cortada — suficiente pra liberar a montagem">
                                    ≥ ½
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                    Falta
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
