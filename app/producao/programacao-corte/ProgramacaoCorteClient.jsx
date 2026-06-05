"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Zap, ChevronDown, ChevronUp, Filter, Search, CheckCircle2,
  Package, Loader2, AlertCircle, RefreshCw, Undo2, FileSpreadsheet,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import {
  MAQUINA_LABEL, MAQUINA_COR, MAQUINAS,
  calcularResumoBarras, parsePerfil, gerarProgramaCorte,
} from "@/lib/maquina-corte";

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

export default function ProgramacaoCorteClient({ pecasIniciais, userRole }) {
  const router = useRouter();
  const [pecas, setPecas] = useState(pecasIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("PENDENTE");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);
  const [expandido, setExpandido] = useState(new Set(Object.keys(MAQUINAS)));
  const [reclassificando, setReclassificando] = useState(false);

  const isAdmin = userRole === "ADMIN";

  // OPs disponiveis
  const opsComPecas = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  // Filtrar pecas
  const pecasFiltradas = useMemo(() => {
    return pecas.filter((p) => {
      if (filtroOp && p.opNumero !== filtroOp) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (
          !p.marca.toLowerCase().includes(q) &&
          !(p.descricao || "").toLowerCase().includes(q) &&
          !(p.material || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [pecas, filtroOp, filtroStatus, busca]);

  // Agrupar por maquina
  const porMaquina = useMemo(() => {
    const map = {};
    for (const maq of Object.keys(MAQUINAS)) map[maq] = [];
    map["SEM_MAQUINA"] = [];
    for (const p of pecasFiltradas) {
      const k = p.maquina || "SEM_MAQUINA";
      if (!map[k]) map[k] = [];
      map[k].push(p);
    }
    return map;
  }, [pecasFiltradas]);

  // Resumo de barras
  const resumoBarras = useMemo(() => calcularResumoBarras(pecasFiltradas), [pecasFiltradas]);

  // Contadores
  const totalPendentes = useMemo(() => pecas.filter((p) => p.status === "PENDENTE").length, [pecas]);
  const totalLiberadas = useMemo(() => pecas.filter((p) => p.status === "CORTE").length, [pecas]);

  // Toggle expand
  const toggleExpandido = (maq) => {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(maq)) next.delete(maq); else next.add(maq);
      return next;
    });
  };

  // Selecao
  const toggleSelecionado = (id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selecionarTodosMaquina = (maq) => {
    const ids = porMaquina[maq]?.map((p) => p.id) || [];
    setSelecionados((prev) => {
      const next = new Set(prev);
      const todosJaSelecionados = ids.every((id) => next.has(id));
      if (todosJaSelecionados) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const selecionarTodos = () => {
    if (selecionados.size === pecasFiltradas.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(pecasFiltradas.map((p) => p.id)));
    }
  };

  // Liberar para corte
  async function liberarSelecionados() {
    if (selecionados.size === 0) return;
    setLiberando(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados] }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      // Update otimista
      setPecas((prev) =>
        prev.map((p) => (selecionados.has(p.id) && p.status === "PENDENTE" ? { ...p, status: "CORTE" } : p))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao liberar: " + e.message);
    } finally {
      setLiberando(false);
    }
  }

  // Reverter liberacao
  async function reverterSelecionados() {
    if (selecionados.size === 0) return;
    setRevertendo(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados], reverter: true }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setPecas((prev) =>
        prev.map((p) => (selecionados.has(p.id) && p.status === "CORTE" ? { ...p, status: "PENDENTE" } : p))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao reverter: " + e.message);
    } finally {
      setRevertendo(false);
    }
  }

  // Reclassificar
  async function reclassificarMaquinas() {
    setReclassificando(true);
    try {
      const res = await fetch("/api/producao/pecas/reclassificar-maquinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: filtroOp || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      alert("Erro ao reclassificar: " + e.message);
    } finally {
      setReclassificando(false);
    }
  }

  // Atualizar maquina individual
  async function atualizarMaquina(id, novaMaquina) {
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maquina: novaMaquina || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.map((p) => (p.id === id ? { ...p, maquina: novaMaquina || null } : p)));
    } catch (e) {
      alert("Erro ao atualizar máquina: " + e.message);
    }
  }

  // Gerar programa de corte e exportar como Excel
  function exportarProgramaCorte() {
    const pecasParaPrograma = filtroOp ? pecasFiltradas : pecas.filter((p) => p.maquina);
    if (pecasParaPrograma.length === 0) {
      alert("Nenhuma peça com máquina atribuída para gerar programa.");
      return;
    }

    const programa = gerarProgramaCorte(pecasParaPrograma);
    const wb = XLSX.utils.book_new();
    const opLabel = filtroOp ? `OP ${filtroOp}` : "Todas OPs";

    // Uma aba por maquina
    for (const [maq, dados] of Object.entries(programa)) {
      const rows = [];
      const cor = MAQUINA_COR[maq];
      const merges = [];

      // Header
      rows.push([`PROGRAMA DE CORTE — ${dados.label.toUpperCase()}`]);
      rows.push([`${opLabel} — Gerado em ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`]);
      rows.push([]);

      // Chapas (se houver)
      if (dados.chapas && dados.chapas.length > 0) {
        rows.push(["CHAPAS"]);
        rows.push(["OP", "Marca", "Descrição", "Qte", "Peso unit. (kg)", "Peso total (kg)"]);
        for (const ch of dados.chapas) {
          rows.push([ch.opNumero, ch.marca, ch.descricao, ch.qte || 1, ch.pesoUnitKg || 0, ch.pesoTotalKg || 0]);
        }
        const pesoChapas = dados.chapas.reduce((s, c) => s + (c.pesoTotalKg || 0), 0);
        rows.push(["", "", "TOTAL CHAPAS", dados.chapas.reduce((s, c) => s + (c.qte || 1), 0), "", pesoChapas.toFixed(1)]);
        rows.push([]);
      }

      // Perfis com barras
      const perfis = Object.entries(dados.perfis).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [desc, grupo] of perfis) {
        const compBarraM = (grupo.comprimentoBarraMm / 1000).toFixed(1);
        rows.push([`${desc} — Barra ${compBarraM}m — ${grupo.totalBarras} barra${grupo.totalBarras > 1 ? "s" : ""} — Aproveitamento ${grupo.aproveitamentoMedio.toFixed(0)}%`]);
        rows.push(["Barra", "OP", "Marca", "Comprimento (mm)", "Peso (kg)", "Usado (mm)", "Sobra (mm)", "Aprov. %"]);

        for (const barra of grupo.barras) {
          let primeiro = true;
          for (const peca of barra.pecas) {
            rows.push([
              primeiro ? `Barra ${barra.numero}` : "",
              peca.opNumero || "",
              peca.marca,
              peca.comprimentoMm,
              peca.pesoUnitKg || "",
              primeiro ? barra.usadoMm : "",
              primeiro ? barra.sobraMm : "",
              primeiro ? `${barra.aproveitamento.toFixed(0)}%` : "",
            ]);
            primeiro = false;
          }
        }

        // Subtotal do perfil
        const totalUsado = grupo.barras.reduce((s, b) => s + b.usadoMm, 0);
        const totalDisponivel = grupo.totalBarras * grupo.comprimentoBarraMm;
        rows.push([
          `TOTAL ${desc}`,
          "",
          `${grupo.totalPecas} peças`,
          `${(totalUsado / 1000).toFixed(1)}m usado`,
          "",
          totalUsado,
          totalDisponivel - totalUsado,
          `${grupo.aproveitamentoMedio.toFixed(0)}%`,
        ]);
        rows.push([]);
      }

      // Resumo geral da maquina
      const totalBarrasMaq = perfis.reduce((s, [, g]) => s + g.totalBarras, 0);
      const totalPecasMaq = perfis.reduce((s, [, g]) => s + g.totalPecas, 0);
      const mediaAprov = perfis.length > 0 ? perfis.reduce((s, [, g]) => s + g.aproveitamentoMedio, 0) / perfis.length : 0;
      rows.push([]);
      rows.push([`RESUMO ${dados.label.toUpperCase()}: ${totalPecasMaq} peças em ${totalBarrasMaq} barras — Aproveitamento médio: ${mediaAprov.toFixed(0)}%`]);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Ajustar largura das colunas
      ws["!cols"] = [
        { wch: 14 }, // Barra
        { wch: 10 }, // OP
        { wch: 14 }, // Marca
        { wch: 18 }, // Comprimento/Descricao
        { wch: 12 }, // Peso
        { wch: 12 }, // Usado
        { wch: 12 }, // Sobra
        { wch: 10 }, // Aprov
      ];

      const sheetName = (dados.label || maq).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // Se nenhuma aba foi criada
    if (wb.SheetNames.length === 0) {
      alert("Nenhuma peça com perfil válido para gerar programa.");
      return;
    }

    const fileName = filtroOp
      ? `Programa_Corte_OP${filtroOp}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Programa_Corte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Zap size={24} className="text-torg-blue" /> Programação de Corte
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Verifique a classificação automática das peças por máquina e libere para produção.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={exportarProgramaCorte}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
          >
            <FileSpreadsheet size={14} /> Gerar Programa
          </button>
          {isAdmin && (
            <button
              onClick={reclassificarMaquinas}
              disabled={reclassificando}
              className="px-3 py-1.5 bg-gray-100 text-torg-dark text-xs rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {reclassificando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Reclassificar
            </button>
          )}
        </div>
      </div>

      {/* KPIs resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFiltroStatus("PENDENTE")}
          className={`rounded-xl p-3 text-left transition-all bg-orange-50 text-orange-700 ${filtroStatus === "PENDENTE" ? "ring-2 ring-offset-1 ring-orange-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Pendentes</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalPendentes}</p>
          <p className="text-[10px] opacity-70">aguardando liberação</p>
        </button>
        <button
          onClick={() => setFiltroStatus("CORTE")}
          className={`rounded-xl p-3 text-left transition-all bg-emerald-50 text-emerald-700 ${filtroStatus === "CORTE" ? "ring-2 ring-offset-1 ring-emerald-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Liberadas</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalLiberadas}</p>
          <p className="text-[10px] opacity-70">em produção</p>
        </button>
        <button
          onClick={() => setFiltroStatus("")}
          className={`rounded-xl p-3 text-left transition-all bg-torg-blue-50 text-torg-blue ${filtroStatus === "" ? "ring-2 ring-offset-1 ring-torg-blue" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Total</p>
          <p className="text-2xl font-extrabold tabular-nums">{pecas.length}</p>
          <p className="text-[10px] opacity-70">peças com máquina</p>
        </button>
        <div className="rounded-xl p-3 bg-gray-50 text-torg-gray">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Sem máquina</p>
          <p className="text-2xl font-extrabold tabular-nums">{pecas.filter((p) => !p.maquina).length}</p>
          <p className="text-[10px] opacity-70">classificar manualmente</p>
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
          {opsComPecas.map((op) => <option key={op} value={op}>OP {op}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Search size={12} className="text-torg-gray ml-2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca, descrição ou material..."
            className="flex-1 px-2 py-1.5 text-xs border-0 focus:ring-0 focus:outline-none"
          />
        </div>
        {(filtroOp || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}

        {/* Acoes em lote */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-torg-gray font-medium">
              {selecionados.size} selecionada{selecionados.size > 1 ? "s" : ""}
            </span>
            {filtroStatus === "PENDENTE" && (
              <button
                onClick={liberarSelecionados}
                disabled={liberando}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {liberando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Liberar para Corte
              </button>
            )}
            {filtroStatus === "CORTE" && (
              <button
                onClick={reverterSelecionados}
                disabled={revertendo}
                className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {revertendo ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Reverter para Pendente
              </button>
            )}
          </div>
        )}
      </div>

      {/* Resultado vazio */}
      {pecasFiltradas.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">
            {pecas.length === 0
              ? "Nenhuma peça com material importada. Importe uma LPC no Controle de Peças."
              : "Nenhuma peça no filtro selecionado."}
          </p>
        </div>
      )}

      {/* Seções por máquina */}
      {Object.entries(MAQUINA_LABEL).map(([maq, label]) => {
        const pecasMaq = porMaquina[maq] || [];
        if (pecasMaq.length === 0) return null;
        const isExpanded = expandido.has(maq);
        const cor = MAQUINA_COR[maq];
        const pesoTotal = pecasMaq.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
        const qtdTotal = pecasMaq.reduce((s, p) => s + (p.qte || 1), 0);
        const todosSelecionados = pecasMaq.every((p) => selecionados.has(p.id));

        // Barras desta maquina
        const barrasMaq = resumoBarras[maq];
        const perfis = barrasMaq ? Object.entries(barrasMaq.perfis).sort((a, b) => a[0].localeCompare(b[0])) : [];
        const totalBarras = perfis.reduce((s, [, pf]) => s + pf.barras, 0);

        return (
          <div key={maq} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header da maquina */}
            <button
              onClick={() => toggleExpandido(maq)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-gray-50`}
            >
              <span className={`w-3 h-3 rounded-full ${cor.dot}`} />
              <span className={`text-sm font-bold ${cor.text}`}>{label}</span>
              <div className="flex items-center gap-3 ml-auto text-[11px] text-torg-gray">
                <span>{pecasMaq.length} marca{pecasMaq.length > 1 ? "s" : ""}</span>
                <span>{qtdTotal} pç</span>
                <span>{fmtKg(pesoTotal)}</span>
                {totalBarras > 0 && <span className="font-semibold text-torg-dark">{totalBarras} barra{totalBarras > 1 ? "s" : ""}</span>}
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100">
                {/* Resumo de barras por perfil */}
                {perfis.length > 0 && (
                  <div className="px-4 py-2.5 bg-gray-50/60 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-torg-dark uppercase tracking-wide mb-1.5">Barras necessárias</p>
                    <div className="flex flex-wrap gap-1.5">
                      {perfis.map(([perfil, pf]) => (
                        <div key={perfil} className={`${cor.bg} rounded px-2 py-1 text-[11px]`}>
                          <span className="font-mono font-semibold">{perfil}</span>
                          <span className="text-torg-gray ml-1.5">{pf.qte} pç</span>
                          <span className="text-torg-gray mx-1">·</span>
                          <span className="text-torg-gray">{(pf.compTotalMm / 1000).toFixed(1)}m</span>
                          <span className="text-torg-gray mx-1">→</span>
                          <span className="font-semibold">{pf.barras} barra{pf.barras > 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de pecas */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={todosSelecionados && pecasMaq.length > 0}
                            onChange={() => selecionarTodosMaquina(maq)}
                            className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Comp.</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso unit.</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso total</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                        <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pecasMaq.map((p) => {
                        const perfil = parsePerfil(p.descricao);
                        return (
                          <tr key={p.id} className={`hover:bg-gray-50 ${selecionados.has(p.id) ? "bg-torg-blue-50/30" : ""}`}>
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={selecionados.has(p.id)}
                                onChange={() => toggleSelecionado(p.id)}
                                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-xs font-mono text-torg-blue whitespace-nowrap">{fmtOP(p.opNumero)}</td>
                            <td className="px-3 py-1.5">
                              <span className="text-xs font-semibold text-torg-dark font-mono">{p.marca}</span>
                              {p.tipoPeca === "CROQUI" && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">CR</span>}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-torg-gray max-w-[200px] truncate" title={p.descricao}>
                              {p.descricao || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-torg-gray whitespace-nowrap">{p.material || "—"}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark">{p.qte}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray whitespace-nowrap">{fmtMm(p.comprimentoMm)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray">{fmtKg(p.pesoUnitKg)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark font-medium">{fmtKg(p.pesoTotalKg)}</td>
                            <td className="px-3 py-1.5">
                              <select
                                value={p.maquina || ""}
                                onChange={(e) => atualizarMaquina(p.id, e.target.value)}
                                className={`text-[11px] font-medium rounded-md border-0 px-2 py-1 focus:ring-1 focus:ring-torg-blue ${
                                  p.maquina ? (MAQUINA_COR[p.maquina]?.bg || "bg-gray-50") + " " + (MAQUINA_COR[p.maquina]?.text || "text-gray-600") : "bg-gray-50 text-gray-400"
                                }`}
                              >
                                <option value="">—</option>
                                {Object.entries(MAQUINA_LABEL).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {p.status === "CORTE" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  <CheckCircle2 size={10} /> Liberado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                                  Pendente
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer da maquina com acao em lote */}
                <div className="px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-torg-gray">
                    {pecasMaq.filter((p) => selecionados.has(p.id)).length} de {pecasMaq.length} selecionadas nesta máquina
                  </span>
                  <div className="flex gap-2">
                    {filtroStatus === "PENDENTE" && (
                      <button
                        onClick={() => {
                          const ids = pecasMaq.filter((p) => selecionados.has(p.id)).map((p) => p.id);
                          if (ids.length === 0) {
                            // Seleciona todas desta maquina e libera
                            selecionarTodosMaquina(maq);
                          }
                        }}
                        className="text-[11px] text-torg-blue hover:text-torg-dark font-medium"
                      >
                        Selecionar todas
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Secao sem maquina */}
      {(porMaquina["SEM_MAQUINA"] || []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggleExpandido("SEM_MAQUINA")}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
          >
            <span className="w-3 h-3 rounded-full bg-gray-300" />
            <span className="text-sm font-bold text-gray-500">Sem Máquina Atribuída</span>
            <div className="flex items-center gap-3 ml-auto text-[11px] text-torg-gray">
              <span>{porMaquina["SEM_MAQUINA"].length} peça{porMaquina["SEM_MAQUINA"].length > 1 ? "s" : ""}</span>
              <AlertCircle size={13} className="text-orange-400" />
              {expandido.has("SEM_MAQUINA") ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>
          {expandido.has("SEM_MAQUINA") && (
            <div className="border-t border-gray-100">
              <div className="px-4 py-2 bg-orange-50/50 border-b border-gray-100">
                <p className="text-[11px] text-orange-700">
                  Essas peças não foram classificadas automaticamente. Atribua a máquina manualmente usando o dropdown.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Comp.</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {porMaquina["SEM_MAQUINA"].map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-xs font-mono text-torg-blue">{fmtOP(p.opNumero)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-torg-dark font-mono">{p.marca}</td>
                        <td className="px-3 py-1.5 text-xs text-torg-gray max-w-[200px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                        <td className="px-3 py-1.5 text-xs text-torg-gray">{p.material || "—"}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums">{p.qte}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray">{fmtMm(p.comprimentoMm)}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums font-medium">{fmtKg(p.pesoTotalKg)}</td>
                        <td className="px-3 py-1.5">
                          <select
                            value=""
                            onChange={(e) => atualizarMaquina(p.id, e.target.value)}
                            className="text-[11px] font-medium rounded-md border border-orange-200 px-2 py-1 bg-orange-50 text-orange-600 focus:ring-1 focus:ring-torg-blue"
                          >
                            <option value="">Selecionar...</option>
                            {Object.entries(MAQUINA_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
