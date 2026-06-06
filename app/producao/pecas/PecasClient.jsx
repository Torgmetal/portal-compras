"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Upload, Loader2, AlertCircle, X, CheckCircle2, Search, Download,
  Package, FileSpreadsheet, ChevronDown, ChevronUp, Filter, Plus, Trash2,
  Zap, RefreshCw, Factory,
} from "lucide-react";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, adicionarRodapeISO, adicionarLegenda,
  downloadWorkbook, CORES,
} from "@/lib/excel-relatorio";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { fmtOP } from "@/lib/utils";
import { MAQUINA_LABEL, MAQUINA_COR, MAQUINAS, calcularResumoBarras, parsePerfil } from "@/lib/maquina-corte";

const STATUS_PIPELINE = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const STATUS_LABEL = {
  PENDENTE: "Pendente",
  CORTE: "Corte",
  MONTAGEM: "Montagem",
  SOLDA: "Solda",
  ACABAMENTO: "Acabamento",
  JATO: "Jato",
  PINTURA: "Pintura",
  EXPEDIDO: "Expedido",
};
const STATUS_COR = {
  PENDENTE:   { bg: "bg-gray-100",      text: "text-torg-gray",      dot: "bg-gray-400" },
  CORTE:      { bg: "bg-orange-50",     text: "text-orange-700",     dot: "bg-orange-400" },
  MONTAGEM:   { bg: "bg-yellow-50",     text: "text-yellow-700",     dot: "bg-yellow-400" },
  SOLDA:      { bg: "bg-amber-50",      text: "text-amber-700",      dot: "bg-amber-400" },
  ACABAMENTO: { bg: "bg-lime-50",       text: "text-lime-700",       dot: "bg-lime-400" },
  JATO:       { bg: "bg-cyan-50",       text: "text-cyan-700",       dot: "bg-cyan-400" },
  PINTURA:    { bg: "bg-indigo-50",     text: "text-indigo-700",     dot: "bg-indigo-400" },
  EXPEDIDO:   { bg: "bg-emerald-50",    text: "text-emerald-700",    dot: "bg-emerald-500" },
};

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

export default function PecasClient({ ops, pecasIniciais, userRole }) {
  const router = useRouter();
  const [pecas, setPecas] = useState(pecasIniciais);
  const [modalImport, setModalImport] = useState(false);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [modalImportLPC, setModalImportLPC] = useState(false);
  const [modalExcluirLote, setModalExcluirLote] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroMaquina, setFiltroMaquina] = useState("");
  const [filtroAtendimento, setFiltroAtendimento] = useState("");
  const [reclassificando, setReclassificando] = useState(false);
  const [modalSyneco, setModalSyneco] = useState(false);
  const [importandoSyneco, setImportandoSyneco] = useState(false);
  const [resultadoSyneco, setResultadoSyneco] = useState(null);
  const [synecoOpSelecionada, setSynecoOpSelecionada] = useState("");

  // Lista de OPs que tem pecas (pra mostrar so as relevantes no filtro)
  const opsComPecas = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  const pecasFiltradas = useMemo(() => {
    return pecas.filter((p) => {
      if (filtroOp && p.opNumero !== filtroOp) return false;
      if (filtroTipo === "CONJUNTO" && p.tipoPeca !== "CONJUNTO") return false;
      if (filtroTipo === "CROQUI" && p.tipoPeca !== "CROQUI") return false;
      if (filtroTipo === "PECA" && p.tipoPeca != null) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (filtroMaquina && p.maquina !== filtroMaquina) return false;
      if (filtroAtendimento) {
        const prod = p.qteProduzida || 0;
        const total = p.qte || 1;
        if (filtroAtendimento === "COMPLETO" && prod < total) return false;
        if (filtroAtendimento === "PARCIAL" && (prod === 0 || prod >= total)) return false;
        if (filtroAtendimento === "PENDENTE" && prod > 0) return false;
      }
      if (busca) {
        const q = busca.toLowerCase();
        if (!p.marca.toLowerCase().includes(q) && !(p.descricao || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pecas, filtroOp, filtroTipo, filtroStatus, filtroMaquina, filtroAtendimento, busca]);

  // Resumo
  const resumo = useMemo(() => {
    const r = { total: 0, pesoTotal: 0, expedidas: 0, pesoExpedido: 0, emProducao: 0, pendentes: 0 };
    for (const p of pecasFiltradas) {
      r.total += p.qte;
      r.pesoTotal += p.pesoTotalKg;
      if (p.status === "EXPEDIDO") {
        r.expedidas += p.qte;
        r.pesoExpedido += p.pesoTotalKg;
      } else if (p.status === "PENDENTE") {
        r.pendentes += p.qte;
      } else {
        r.emProducao += p.qte;
      }
    }
    return r;
  }, [pecasFiltradas]);

  // KPIs por maquina (calculado sobre pecas filtradas)
  const resumoMaquinas = useMemo(() => {
    const map = {};
    for (const maq of Object.keys(MAQUINAS)) map[maq] = { pecas: 0, peso: 0 };
    map["SEM_MAQUINA"] = { pecas: 0, peso: 0 };
    for (const p of pecasFiltradas) {
      const k = p.maquina || "SEM_MAQUINA";
      if (!map[k]) map[k] = { pecas: 0, peso: 0 };
      map[k].pecas += p.qte || 1;
      map[k].peso += p.pesoTotalKg || 0;
    }
    return map;
  }, [pecasFiltradas]);

  // Resumo de barras por maquina (somente pecas filtradas)
  const resumoBarras = useMemo(() => calcularResumoBarras(pecasFiltradas), [pecasFiltradas]);

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

  async function exportarRelatorio() {
    const filtrosAtivos = [
      filtroOp ? `OP ${filtroOp}` : null,
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroTipo === "CONJUNTO" ? "Conjuntos" : filtroTipo === "CROQUI" ? "Croquis" : filtroTipo === "PECA" ? "Peças/LE" : null,
      filtroMaquina ? MAQUINA_LABEL[filtroMaquina] : null,
      filtroAtendimento === "COMPLETO" ? "Completo" : filtroAtendimento === "PARCIAL" ? "Parcial" : filtroAtendimento === "PENDENTE" ? "Pendente" : null,
    ].filter(Boolean);
    const tituloFiltro = filtrosAtivos.length > 0 ? filtrosAtivos.join(" · ") : "Todas as OPs";

    const totalPecas = pecasFiltradas.reduce((s, p) => s + (p.qte || 1), 0);
    const totalProd = pecasFiltradas.reduce((s, p) => s + (p.qteProduzida || 0), 0);
    const totalPeso = pecasFiltradas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
    const pctGeral = totalPecas > 0 ? Math.round((totalProd / totalPecas) * 100) : 0;

    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: "Controle de Peças",
      subtitulo: tituloFiltro,
      kpis: [
        `Total: ${totalPecas} pç  |  Produzido: ${totalProd} pç (${pctGeral}%)  |  Peso: ${(totalPeso / 1000).toFixed(1)} t`,
      ],
      totalColunas: 14,
      nomePlanilha: "Peças",
    });

    ws.columns = [
      { width: 8 }, { width: 14 }, { width: 10 }, { width: 24 }, { width: 14 },
      { width: 7 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 8 },
      { width: 10 }, { width: 16 }, { width: 12 }, { width: 12 },
    ];

    let row = linhaInicio;
    const headers = ["OP", "Marca", "Tipo", "Descrição", "Material", "Qte", "Peso Unit.", "Peso Total", "Produzido", "Falta", "% Atend.", "Máquina", "Status", "Data Prod."];
    adicionarHeaderTabela(ws, row, headers);
    row++;

    for (const p of pecasFiltradas) {
      const prod = p.qteProduzida || 0;
      const total = p.qte || 1;
      const falta = Math.max(0, total - prod);
      const pct = total > 0 ? Math.round((prod / total) * 100) : 0;
      const fillColor = prod >= total ? CORES.LIGHT_GREEN : prod > 0 ? CORES.LIGHT_ORANGE : undefined;

      const fontColors = {};
      fontColors[8] = prod >= total ? "16A34A" : prod > 0 ? "EA580C" : "9CA3AF";
      fontColors[9] = falta === 0 ? "16A34A" : "EA580C";

      adicionarLinhaTabela(ws, row, [
        fmtOP(p.opNumero),
        p.marca,
        p.tipoPeca === "CONJUNTO" ? "Conjunto" : p.tipoPeca === "CROQUI" ? "Croqui" : "Peça",
        p.descricao || "",
        p.material || "",
        total,
        p.pesoUnitKg ? Number(p.pesoUnitKg.toFixed(1)) : 0,
        p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : 0,
        prod,
        falta,
        `${pct}%`,
        p.maquina ? (MAQUINA_LABEL[p.maquina] || p.maquina) : "",
        STATUS_LABEL[p.status] || p.status,
        p.dataProducao ? new Date(p.dataProducao).toLocaleDateString("pt-BR") : "",
      ], {
        fillColor,
        fontColors,
        alinhamento: { 5: "right", 6: "right", 7: "right", 8: "right", 9: "right", 10: "right" },
      });
      // Bold na marca
      ws.getCell(row, 2).font = { name: "Arial", size: 9, bold: true, color: { argb: CORES.TORG_DARK } };
      // Bold no produzido e falta
      ws.getCell(row, 9).font = { name: "Arial", size: 9, bold: true, color: { argb: fontColors[8] } };
      ws.getCell(row, 10).font = { name: "Arial", size: 9, bold: true, color: { argb: fontColors[9] } };
      row++;
    }

    adicionarLinhaTotais(ws, row, [
      "TOTAL", "", "", "", "", totalPecas, "", totalPeso.toFixed(1),
      totalProd, totalPecas - totalProd, `${pctGeral}%`, "", "", "",
    ]);
    row++;

    // Legenda
    row++;
    adicionarLegenda(ws, row, [
      { cor: CORES.LIGHT_GREEN, label: "Verde = 100% produzido" },
      { cor: CORES.LIGHT_ORANGE, label: "Laranja = parcialmente produzido" },
      { cor: "FFFFFF", label: "Branco = pendente" },
    ], 14);
    row++;

    // Rodape ISO 9001
    row++;
    adicionarRodapeISO(ws, row, 14);

    const filtroDesc = [
      filtroOp ? `OP-${filtroOp}` : "Todas-OPs",
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroAtendimento || null,
      filtroMaquina ? MAQUINA_LABEL[filtroMaquina] : null,
    ].filter(Boolean).join("_");

    const nomeArquivo = `Torg_Pecas_${filtroDesc || "Todas"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    await downloadWorkbook(workbook, nomeArquivo);
  }

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

  async function atualizarStatus(id, novoStatus) {
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.peca } : p)));
    } catch (e) {
      alert("Erro ao atualizar: " + e.message);
    }
  }

  async function deletarPeca(id) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  async function deletarLoteOp(opNumero) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/producao/pecas?op=${encodeURIComponent(opNumero)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.filter((p) => p.opNumero !== opNumero));
    } catch (e) {
      alert("Erro ao excluir lote: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  // Importar produção do Syneco (MES) → atualiza peças + cria ProducaoSemanal
  async function importarSyneco() {
    const opNum = synecoOpSelecionada || filtroOp;
    if (!opNum) {
      alert("Selecione uma OP para importar.");
      return;
    }
    setImportandoSyneco(true);
    setResultadoSyneco(null);
    try {
      const res = await fetch("/api/producao/importar-syneco-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: opNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      setResultadoSyneco(data);
      // Atualizar peças locais se houve updates
      if (data.statusUpdated > 0) {
        router.refresh();
      }
    } catch (e) {
      setResultadoSyneco({ error: e.message });
    } finally {
      setImportandoSyneco(false);
    }
  }

  function abrirModalSyneco() {
    setSynecoOpSelecionada(filtroOp || "");
    setResultadoSyneco(null);
    setModalSyneco(true);
  }

  const isAdmin = userRole === "ADMIN";

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">
            Controle de Peças
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Controle de peças e conjuntos por OP — importe LE ou LPC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalImport(true)}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> Importar LE
          </button>
          <button
            onClick={() => setModalImportLPC(true)}
            className="px-3 py-1.5 bg-torg-dark text-white text-xs rounded-lg hover:bg-torg-dark/90 font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> Importar LPC
          </button>
          <button
            onClick={abrirModalSyneco}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5"
          >
            <Factory size={14} /> Importar Syneco
          </button>
          {isAdmin && opsComPecas.length > 0 && (
            <button
              onClick={() => setModalExcluirLote(true)}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 font-medium flex items-center gap-1.5 border border-red-200"
            >
              <Trash2 size={14} /> Excluir em Lote
            </button>
          )}
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiPequeno label="Total" value={resumo.total.toLocaleString("pt-BR")} subtitle={`${pecasFiltradas.length} marcas · ${fmtKg(resumo.pesoTotal)}`} color="bg-torg-blue-50 text-torg-blue" />
        <KpiPequeno label="Pendentes" value={resumo.pendentes.toLocaleString("pt-BR")} color="bg-gray-100 text-torg-gray" />
        <KpiPequeno label="Em produção" value={resumo.emProducao.toLocaleString("pt-BR")} color="bg-orange-50 text-orange-700" />
        <KpiPequeno label="Expedidas" value={resumo.expedidas.toLocaleString("pt-BR")} subtitle={`${fmtKg(resumo.pesoExpedido)} · ${resumo.total > 0 ? ((resumo.expedidas / resumo.total) * 100).toFixed(0) : 0}%`} color="bg-emerald-50 text-emerald-700" />
      </div>

      {/* KPIs por Máquina */}
      {Object.values(resumoMaquinas).some((m) => m.pecas > 0) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-torg-dark uppercase tracking-wide flex items-center gap-1.5">
              <Zap size={13} className="text-torg-blue" /> Distribuição por Máquina
            </h3>
            {isAdmin && (
              <button
                onClick={reclassificarMaquinas}
                disabled={reclassificando}
                className="text-[11px] text-torg-blue hover:text-torg-dark flex items-center gap-1 disabled:opacity-50"
              >
                {reclassificando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Reclassificar
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(MAQUINA_LABEL).map(([k, label]) => {
              const m = resumoMaquinas[k] || { pecas: 0, peso: 0 };
              if (m.pecas === 0) return null;
              const cor = MAQUINA_COR[k] || { bg: "bg-gray-50", text: "text-gray-600" };
              return (
                <button
                  key={k}
                  onClick={() => setFiltroMaquina(filtroMaquina === k ? "" : k)}
                  className={`rounded-xl p-3 text-left transition-all ${cor.bg} ${cor.text} ${filtroMaquina === k ? "ring-2 ring-offset-1 ring-current" : ""}`}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{m.pecas.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] opacity-70">{fmtKg(m.peso)}</p>
                </button>
              );
            })}
          </div>

          {/* Resumo de barras por máquina */}
          {Object.keys(resumoBarras).length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <h4 className="text-xs font-semibold text-torg-dark uppercase tracking-wide">Barras por Máquina / Perfil</h4>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.entries(resumoBarras).map(([maq, dados]) => {
                  const perfis = Object.entries(dados.perfis).sort((a, b) => a[0].localeCompare(b[0]));
                  if (perfis.length === 0) return null;
                  const cor = MAQUINA_COR[maq] || { dot: "bg-gray-400", text: "text-gray-700" };
                  const totalBarras = perfis.reduce((s, [, pf]) => s + pf.barras, 0);
                  return (
                    <div key={maq} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${cor.dot}`} />
                        <span className="text-xs font-semibold text-torg-dark">{MAQUINA_LABEL[maq] || maq}</span>
                        <span className="text-[10px] text-torg-gray">
                          {dados.pecas} peças · {fmtKg(dados.pesoTotal)} · {totalBarras} barra{totalBarras !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                        {perfis.map(([perfil, pf]) => (
                          <div key={perfil} className="bg-gray-50 rounded px-2 py-1.5 text-[11px]">
                            <span className="font-mono font-semibold text-torg-dark">{perfil}</span>
                            <div className="flex items-center justify-between mt-0.5 text-torg-gray">
                              <span>{pf.qte} pç · {(pf.compTotalMm / 1000).toFixed(1)}m</span>
                              <span className="font-semibold text-torg-dark">{pf.barras} barra{pf.barras !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <select
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas as OPs</option>
          {opsComPecas.map((op) => <option key={op} value={op}>OP {op}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todos status</option>
          {STATUS_PIPELINE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todos tipos</option>
          <option value="CONJUNTO">Conjuntos</option>
          <option value="CROQUI">Croquis</option>
          <option value="PECA">Peças / LE</option>
        </select>
        <select
          value={filtroMaquina}
          onChange={(e) => setFiltroMaquina(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas máquinas</option>
          {Object.entries(MAQUINA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filtroAtendimento}
          onChange={(e) => setFiltroAtendimento(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Atendimento</option>
          <option value="COMPLETO">Completo</option>
          <option value="PARCIAL">Parcial</option>
          <option value="PENDENTE">Pendente</option>
        </select>
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Search size={12} className="text-torg-gray ml-2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca ou descrição..."
            className="flex-1 px-2 py-1.5 text-xs border-0 focus:ring-0 focus:outline-none"
          />
        </div>
        <button
          onClick={exportarRelatorio}
          className="px-3 py-1.5 bg-torg-blue/10 text-torg-blue text-xs rounded-lg hover:bg-torg-blue/20 font-medium flex items-center gap-1.5"
          title="Exportar peças filtradas para Excel"
        >
          <Download size={13} /> Exportar
        </button>
        {(filtroOp || filtroStatus || filtroTipo || filtroMaquina || filtroAtendimento || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setFiltroStatus(""); setFiltroTipo(""); setFiltroMaquina(""); setFiltroAtendimento(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}
        {isAdmin && filtroOp && (
          <button
            onClick={() => setConfirmDelete({ tipo: "lote", opNumero: filtroOp })}
            className="ml-auto px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 font-medium flex items-center gap-1.5 border border-red-200"
          >
            <Trash2 size={13} /> Excluir OP {filtroOp}
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {pecasFiltradas.length === 0 ? (
          <div className="text-center py-10">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">
              {pecas.length === 0
                ? "Nenhuma peça cadastrada. Clique em 'Importar LE' pra começar."
                : "Nenhuma peça no filtro selecionado."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso unit.</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso total</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Produzido</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Falta</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Status</th>
                  {isAdmin && <th className="px-3 py-2 w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pecasFiltradas.map((p) => {
                  const cor = STATUS_COR[p.status] || STATUS_COR.PENDENTE;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs font-mono text-torg-blue">{fmtOP(p.opNumero)}</td>
                      <td className="px-3 py-1.5 text-[10px] text-gray-400 tabular-nums">{p.item || ""}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs font-semibold text-torg-dark font-mono">{p.marca}</span>
                        {p.tipoPeca === "CONJUNTO" && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-torg-blue/10 text-torg-blue">CJ</span>}
                        {p.tipoPeca === "CROQUI" && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">CR</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs text-torg-gray">{p.descricao || "—"}</span>
                        {p.material && <span className="block text-[10px] text-torg-gray/60">{p.material}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark">{p.qte}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray">{fmtKg(p.pesoUnitKg)}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark font-medium">{fmtKg(p.pesoTotalKg)}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        {p.qteProduzida > 0 ? (
                          <span className={`font-medium ${p.qteProduzida >= p.qte ? "text-emerald-600" : "text-torg-blue"}`}>
                            {p.qteProduzida}/{p.qte}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        {p.qteProduzida > 0 ? (
                          p.qte - p.qteProduzida > 0 ? (
                            <span className="font-medium text-orange-600">{p.qte - p.qteProduzida}</span>
                          ) : (
                            <span className="text-emerald-500">✓</span>
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.tipoPeca === "CROQUI" || (p.tipoPeca == null && p.material) ? (
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
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={p.status}
                          onChange={(e) => atualizarStatus(p.id, e.target.value)}
                          className={`text-[11px] font-medium rounded-md border-0 px-2 py-1 focus:ring-1 focus:ring-torg-blue ${cor.bg} ${cor.text}`}
                        >
                          {STATUS_PIPELINE.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => setConfirmDelete({ tipo: "peca", id: p.id, marca: p.marca, opNumero: p.opNumero })}
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                            title="Excluir peça"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalImport && (
        <ModalImportarLE
          ops={ops}
          onClose={() => setModalImport(false)}
          onImportado={() => { setModalImport(false); router.refresh(); }}
        />
      )}

      {modalImportLPC && (
        <ModalImportarLPC
          ops={ops}
          onClose={() => setModalImportLPC(false)}
          onImportado={() => { setModalImportLPC(false); router.refresh(); }}
        />
      )}

      {/* Modal Importar Syneco */}
      {modalSyneco && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !importandoSyneco && setModalSyneco(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Factory size={18} className="text-emerald-600" />
                <h3 className="text-base font-bold text-torg-dark">Importar Produção Syneco</h3>
              </div>
              <button onClick={() => !importandoSyneco && setModalSyneco(false)} className="text-torg-gray hover:text-torg-dark">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {!resultadoSyneco && (
                <>
                  <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-800">
                    <p className="font-medium">Importa do MES Syneco (MesOrdem) apenas o setor <strong>Corte</strong>.</p>
                    <p className="mt-1 text-emerald-700">
                      Peças com produção confirmada terão status atualizado para CORTE.
                      As datas de fabricação serão registradas no Controle de Produção.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-torg-dark block mb-1">OP para importar</label>
                    <select
                      value={synecoOpSelecionada}
                      onChange={(e) => setSynecoOpSelecionada(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      disabled={importandoSyneco}
                    >
                      <option value="">Selecione uma OP...</option>
                      {opsComPecas.map((op) => (
                        <option key={op} value={op}>OP {op}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-torg-dark block mb-1">Setor</label>
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                      Corte
                    </div>
                    <p className="text-[10px] text-torg-gray mt-1">
                      Filtrando apenas o setor de Corte para evitar dados incorretos.
                    </p>
                  </div>
                </>
              )}

              {/* Resultado — KPIs de atendimento */}
              {resultadoSyneco && !resultadoSyneco.error && (
                <>
                  {/* Barra de atendimento */}
                  {resultadoSyneco.totais && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-torg-dark">Atendimento do Corte — {resultadoSyneco.obraCode}</p>
                        <span className="text-xs text-torg-gray">{resultadoSyneco.opObra}</span>
                      </div>

                      {/* Barra visual de progresso */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-torg-dark">
                            {resultadoSyneco.totais.percentualQte.toFixed(0)}% concluído
                          </span>
                          <span className="text-torg-gray">
                            {resultadoSyneco.totais.qteProduzida.toLocaleString("pt-BR")} / {resultadoSyneco.totais.qtePlanejada.toLocaleString("pt-BR")} peças
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${resultadoSyneco.totais.percentualQte >= 100 ? "bg-emerald-500" : resultadoSyneco.totais.percentualQte >= 50 ? "bg-torg-blue" : "bg-orange-400"}`}
                            style={{ width: `${Math.min(100, resultadoSyneco.totais.percentualQte)}%` }}
                          />
                        </div>
                      </div>

                      {/* KPIs */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-emerald-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Produzido</p>
                          <p className="text-xl font-extrabold text-emerald-700 tabular-nums">{resultadoSyneco.totais.qteProduzida.toLocaleString("pt-BR")}</p>
                          <p className="text-[10px] text-emerald-600">{fmtKg(resultadoSyneco.totais.pesoProduzido)}</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-orange-600">Faltam</p>
                          <p className="text-xl font-extrabold text-orange-700 tabular-nums">{resultadoSyneco.totais.qteFalta.toLocaleString("pt-BR")}</p>
                          <p className="text-[10px] text-orange-600">{fmtKg(resultadoSyneco.totais.pesoFalta)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-torg-gray">Planejado</p>
                          <p className="text-xl font-extrabold text-torg-dark tabular-nums">{resultadoSyneco.totais.qtePlanejada.toLocaleString("pt-BR")}</p>
                          <p className="text-[10px] text-torg-gray">{fmtKg(resultadoSyneco.totais.pesoPlanejado)}</p>
                        </div>
                      </div>

                      {/* Info de atualização */}
                      <div className="flex gap-2 text-[11px] flex-wrap">
                        {resultadoSyneco.statusUpdated > 0 && (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            {resultadoSyneco.statusUpdated} status atualizados
                          </span>
                        )}
                        {resultadoSyneco.diasProducao > 0 && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {resultadoSyneco.diasProducao} dia{resultadoSyneco.diasProducao > 1 ? "s" : ""} registrado{resultadoSyneco.diasProducao > 1 ? "s" : ""} no controle
                          </span>
                        )}
                        {resultadoSyneco.alreadyCut > 0 && (
                          <span className="bg-gray-100 text-torg-gray px-2 py-0.5 rounded-full">
                            {resultadoSyneco.alreadyCut} já cortadas
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tabela de detalhes por peça */}
                  {resultadoSyneco.detalhes?.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wide">Detalhamento por Peça</p>
                        <span className="text-[10px] text-torg-gray">{resultadoSyneco.detalhes.length} itens</span>
                      </div>
                      <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-50/80 sticky top-0">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-medium text-gray-500">Marca</th>
                              <th className="px-2 py-1.5 text-left font-medium text-gray-500">Descrição</th>
                              <th className="px-2 py-1.5 text-right font-medium text-gray-500">Planej.</th>
                              <th className="px-2 py-1.5 text-right font-medium text-gray-500">Produz.</th>
                              <th className="px-2 py-1.5 text-right font-medium text-gray-500">Falta</th>
                              <th className="px-2 py-1.5 text-right font-medium text-gray-500">Peso Prod.</th>
                              <th className="px-2 py-1.5 text-center font-medium text-gray-500">Status</th>
                              <th className="px-2 py-1.5 text-left font-medium text-gray-500">Data Fim</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {resultadoSyneco.detalhes.map((d, i) => {
                              const pct = d.qtePlanejada > 0 ? (d.qteProduzida / d.qtePlanejada * 100) : 0;
                              const corLinha = d.qteFalta === 0 && d.qteProduzida > 0
                                ? "bg-emerald-50/40"
                                : d.qteProduzida > 0 ? "bg-yellow-50/30" : "";
                              return (
                                <tr key={i} className={`${corLinha} hover:bg-gray-50`}>
                                  <td className="px-2 py-1 font-mono font-semibold text-torg-dark whitespace-nowrap">{d.marca}</td>
                                  <td className="px-2 py-1 text-torg-gray max-w-[120px] truncate" title={d.descricao}>{d.descricao || "—"}</td>
                                  <td className="px-2 py-1 text-right tabular-nums text-torg-dark">{d.qtePlanejada}</td>
                                  <td className="px-2 py-1 text-right tabular-nums font-semibold text-emerald-700">{d.qteProduzida}</td>
                                  <td className={`px-2 py-1 text-right tabular-nums font-semibold ${d.qteFalta > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                                    {d.qteFalta > 0 ? d.qteFalta : "✓"}
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums text-torg-gray">
                                    {d.pesoProduzido > 0 ? `${d.pesoProduzido.toFixed(1)}` : "—"}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      pct >= 100 ? "bg-emerald-100 text-emerald-700" :
                                      pct > 0 ? "bg-yellow-100 text-yellow-700" :
                                      "bg-gray-100 text-gray-500"
                                    }`}>
                                      {pct >= 100 ? "Completo" : pct > 0 ? `${pct.toFixed(0)}%` : "Pendente"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 text-torg-gray whitespace-nowrap font-mono">
                                    {d.dataFim ? d.dataFim.split("-").reverse().join("/") : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Peso por dia */}
                  {resultadoSyneco.pesosPorData && Object.keys(resultadoSyneco.pesosPorData).length > 0 && (
                    <div className="text-[11px]">
                      <p className="text-torg-dark font-medium mb-1">Peso produzido por dia (registrado no Controle de Produção):</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(resultadoSyneco.pesosPorData)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([data, peso]) => (
                            <span key={data} className="bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-mono">
                              {data.split("-").reverse().join("/")} → {peso.toFixed(1)} kg
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {resultadoSyneco.notFound?.length > 0 && (
                    <div className="text-[11px] bg-orange-50 rounded-lg p-2.5">
                      <p className="text-orange-700 font-medium">
                        {resultadoSyneco.notFound.length} item(ns) do Syneco sem peça no portal:
                      </p>
                      <p className="text-orange-600 font-mono mt-0.5">
                        {resultadoSyneco.notFound.slice(0, 15).join(", ")}
                        {resultadoSyneco.notFound.length > 15 ? ` ...+${resultadoSyneco.notFound.length - 15}` : ""}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Erro */}
              {resultadoSyneco?.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                  <p className="font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} /> Erro na importação
                  </p>
                  <p className="mt-1">{resultadoSyneco.error}</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => { setModalSyneco(false); setResultadoSyneco(null); }}
                disabled={importandoSyneco}
                className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark disabled:opacity-50"
              >
                {resultadoSyneco ? "Fechar" : "Cancelar"}
              </button>
              {!resultadoSyneco && (
                <button
                  onClick={importarSyneco}
                  disabled={importandoSyneco || !synecoOpSelecionada}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {importandoSyneco ? <Loader2 size={14} className="animate-spin" /> : <Factory size={14} />}
                  Importar Corte
                </button>
              )}
              {resultadoSyneco && !resultadoSyneco.error && (
                <button
                  onClick={() => { setModalSyneco(false); setResultadoSyneco(null); router.refresh(); }}
                  className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium"
                >
                  Atualizar Página
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalExcluirLote && (
        <ModalExcluirLote
          pecas={pecas}
          opsComPecas={opsComPecas}
          onClose={() => setModalExcluirLote(false)}
          onExcluido={(opsRemovidas) => {
            setPecas((prev) => prev.filter((p) => !opsRemovidas.includes(p.opNumero)));
            setModalExcluirLote(false);
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.tipo === "lote") deletarLoteOp(confirmDelete.opNumero);
          else if (confirmDelete?.tipo === "peca") deletarPeca(confirmDelete.id);
        }}
        titulo={confirmDelete?.tipo === "lote" ? "Excluir todas as peças da OP?" : "Excluir peça?"}
        mensagem={
          confirmDelete?.tipo === "lote"
            ? `Todas as peças da ${fmtOP(confirmDelete?.opNumero)} serão removidas permanentemente. Esta ação não pode ser desfeita.`
            : `A peça "${confirmDelete?.marca}" da ${fmtOP(confirmDelete?.opNumero)} será removida permanentemente.`
        }
        labelConfirmar="Excluir"
        variant="destrutivo"
        loading={deleting}
      />
    </div>
  );
}

function KpiPequeno({ label, value, subtitle, color }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums leading-tight mt-0.5">{value}</p>
      {subtitle && <p className="text-[10px] opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ModalExcluirLote({ pecas, opsComPecas, onClose, onExcluido }) {
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [excluindo, setExcluindo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

  // Resumo por OP
  const resumoPorOp = useMemo(() => {
    const map = {};
    for (const p of pecas) {
      if (!map[p.opNumero]) map[p.opNumero] = { total: 0, peso: 0, expedidas: 0 };
      map[p.opNumero].total += p.qte;
      map[p.opNumero].peso += p.pesoTotalKg || 0;
      if (p.status === "EXPEDIDO") map[p.opNumero].expedidas += p.qte;
    }
    return map;
  }, [pecas]);

  const toggleOp = (op) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op); else next.add(op);
      return next;
    });
  };
  const toggleTodas = () => {
    if (selecionadas.size === opsComPecas.length) setSelecionadas(new Set());
    else setSelecionadas(new Set(opsComPecas));
  };

  const totalSelecionado = useMemo(() => {
    let total = 0, peso = 0;
    for (const op of selecionadas) {
      if (resumoPorOp[op]) { total += resumoPorOp[op].total; peso += resumoPorOp[op].peso; }
    }
    return { total, peso };
  }, [selecionadas, resumoPorOp]);

  const executar = async () => {
    setErro("");
    setExcluindo(true);
    try {
      const res = await fetch("/api/producao/pecas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [...selecionadas] }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status} do servidor`); }
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      setResultado({ removidas: data.removidas, ops: [...selecionadas] });
    } catch (e) {
      setErro(e.message);
      setExcluindo(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Trash2 size={18} className="text-red-500" /> Excluir OPs em Lote
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto space-y-3">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
            </div>
          )}

          {resultado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-emerald-800">
                {resultado.removidas} peça{resultado.removidas !== 1 ? "s" : ""} removida{resultado.removidas !== 1 ? "s" : ""} de {resultado.ops.length} OP{resultado.ops.length > 1 ? "s" : ""}
              </p>
              <button
                onClick={() => onExcluido(resultado.ops)}
                className="mt-3 px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium"
              >
                Fechar
              </button>
            </div>
          ) : confirmando ? (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <AlertCircle size={16} /> Confirmar exclusão
                </p>
                <p className="text-sm text-red-700">
                  Serão excluídas <strong>{totalSelecionado.total.toLocaleString("pt-BR")} peças</strong> ({fmtKg(totalSelecionado.peso)}) de <strong>{selecionadas.size} OP{selecionadas.size > 1 ? "s" : ""}</strong>:
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[...selecionadas].sort().map((op) => (
                    <span key={op} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-mono font-medium">
                      {fmtOP(op)}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-red-600 mt-3 font-medium">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmando(false)}
                  disabled={excluindo}
                  className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={executar}
                  disabled={excluindo}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {excluindo ? "Excluindo..." : "Excluir definitivamente"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-torg-gray">
                Selecione as OPs cujas peças serão removidas. Todas as peças, conjuntos e croquis dessas OPs serão excluídos.
              </p>
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selecionadas.size === opsComPecas.length && opsComPecas.length > 0}
                    onChange={toggleTodas}
                    className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  />
                  <span className="font-medium text-torg-dark">
                    Selecionar todas ({opsComPecas.length})
                  </span>
                </label>
                {selecionadas.size > 0 && (
                  <span className="text-[10px] text-torg-gray ml-auto">
                    {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""} · {totalSelecionado.total.toLocaleString("pt-BR")} peças · {fmtKg(totalSelecionado.peso)}
                  </span>
                )}
              </div>
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {opsComPecas.map((op) => {
                  const info = resumoPorOp[op] || { total: 0, peso: 0, expedidas: 0 };
                  const temExpedidas = info.expedidas > 0;
                  return (
                    <label
                      key={op}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selecionadas.has(op) ? "bg-red-50 border border-red-200" : "hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selecionadas.has(op)}
                        onChange={() => toggleOp(op)}
                        className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                      />
                      <span className="font-mono text-sm font-semibold text-torg-dark min-w-[60px]">{fmtOP(op)}</span>
                      <span className="text-xs text-torg-gray flex-1">
                        {info.total} peça{info.total !== 1 ? "s" : ""} · {fmtKg(info.peso)}
                      </span>
                      {temExpedidas && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          {info.expedidas} expedida{info.expedidas > 1 ? "s" : ""}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!resultado && !confirmando && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between shrink-0">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            <button
              onClick={() => setConfirmando(true)}
              disabled={selecionadas.size === 0}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} /> Excluir {selecionadas.size > 0 ? `${selecionadas.size} OP${selecionadas.size > 1 ? "s" : ""}` : "selecionadas"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalImportarLE({ ops, onClose, onImportado }) {
  const fileRef = useRef(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState("");
  const [opForcada, setOpForcada] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function processar(file) {
    if (!file) return;
    setErro("");
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

      const res = await fetch("/api/producao/pecas/importar-le", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, opNumero: opForcada || null, sobrescrever }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setResultado(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Upload size={18} className="text-torg-blue" /> Importar Lista de Estrutura
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          {resultado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
              <p className="text-emerald-800 font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> {fmtOP(resultado.opNumero)} importada com sucesso
              </p>
              <ul className="text-xs text-emerald-700 space-y-1">
                <li>• {resultado.criados} {resultado.criados === 1 ? "peça nova" : "peças novas"}</li>
                <li>• {resultado.atualizados} {resultado.atualizados === 1 ? "atualizada" : "atualizadas"}</li>
                {resultado.ignorados > 0 && <li>• {resultado.ignorados} ignoradas (erro)</li>}
                <li>• Total: {resultado.qteTotal} unidades · {fmtKg(resultado.pesoTotal)}</li>
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠️ {fmtOP(resultado.opNumero)} não cadastrada no portal — peças ficaram sem vínculo</li>}
              </ul>
              <button
                onClick={onImportado}
                className="mt-3 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
              >
                Ver na lista
              </button>
            </div>
          ) : (
            <>
              <div className="bg-torg-blue-50/30 border border-torg-blue-100 rounded p-4 text-center">
                <FileSpreadsheet size={28} className="mx-auto text-torg-blue mb-2" />
                <p className="text-sm text-torg-dark font-medium mb-1">
                  Suba o arquivo de LE (xlsx FORM 21)
                </p>
                <p className="text-xs text-torg-gray mb-3">
                  O parser identifica OP, marca, qte, descrição e peso automaticamente.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="px-4 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {parsing ? "Processando..." : "Selecionar arquivo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { processar(e.target.files?.[0]); e.target.value = ""; }}
                />
                {arquivoNome && (
                  <p className="text-[11px] text-torg-gray mt-2 truncate">{arquivoNome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">
                  Forçar OP (opcional — se a planilha não tiver "OP:" no cabeçalho)
                </label>
                <input
                  type="text"
                  value={opForcada}
                  onChange={(e) => setOpForcada(e.target.value.toUpperCase())}
                  placeholder="Ex: T64K"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-torg-gray">
                <input
                  type="checkbox"
                  checked={sobrescrever}
                  onChange={(e) => setSobrescrever(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Sobrescrever — apaga peças anteriores dessa OP que foram importadas via LE antes de importar de novo. Útil se a LE foi revisada.</span>
              </label>
            </>
          )}
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalImportarLPC({ ops, onClose, onImportado }) {
  const fileRef = useRef(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState("");
  const [opForcada, setOpForcada] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function processar(file) {
    if (!file) return;
    setErro("");
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

      const res = await fetch("/api/producao/pecas/importar-lpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, opNumero: opForcada || null, sobrescrever }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Erro ${res.status} do servidor ao importar. Tente novamente.`);
      }
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setResultado(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Upload size={18} className="text-torg-dark" /> Importar LPC
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          {resultado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
              <p className="text-emerald-800 font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> {fmtOP(resultado.opNumero)} — LPC importada
              </p>
              {resultado.obra && (
                <p className="text-xs text-emerald-700 mb-2">
                  {resultado.obra}{resultado.cliente ? ` — ${resultado.cliente}` : ""}
                </p>
              )}
              <ul className="text-xs text-emerald-700 space-y-1">
                <li>• {resultado.conjuntos} {resultado.conjuntos === 1 ? "conjunto" : "conjuntos"}</li>
                <li>• {resultado.croquis} {resultado.croquis === 1 ? "croqui" : "croquis"}</li>
                {resultado.avulsas > 0 && <li>• {resultado.avulsas} {resultado.avulsas === 1 ? "peça avulsa" : "peças avulsas"}</li>}
                <li>• {resultado.relacoes} {resultado.relacoes === 1 ? "relação" : "relações"} conjunto↔croqui</li>
                <li className="pt-1 border-t border-emerald-200 mt-1">
                  {resultado.criados} {resultado.criados === 1 ? "nova" : "novas"} · {resultado.atualizados} {resultado.atualizados === 1 ? "atualizada" : "atualizadas"}
                  {resultado.ignorados > 0 && ` · ${resultado.ignorados} ignorada(s)`}
                </li>
                <li>• Peso: {Number(resultado.pesoTotal).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg · Pintura: {Number(resultado.areaTotal).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m²</li>
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠️ {fmtOP(resultado.opNumero)} não cadastrada — peças ficaram sem vínculo</li>}
              </ul>
              <button
                onClick={onImportado}
                className="mt-3 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
              >
                Ver na lista
              </button>
            </div>
          ) : (
            <>
              <div className="bg-torg-dark/5 border border-torg-dark/10 rounded p-4 text-center">
                <FileSpreadsheet size={28} className="mx-auto text-torg-dark mb-2" />
                <p className="text-sm text-torg-dark font-medium mb-1">
                  Suba o arquivo LPC (Lista de Peças por Conjunto)
                </p>
                <p className="text-xs text-torg-gray mb-3">
                  Identifica conjuntos, croquis e peças avulsas automaticamente.
                  Croquis com "-P" recebem status de preparação.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="px-4 py-1.5 bg-torg-dark text-white text-xs rounded-lg hover:bg-torg-dark/90 font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {parsing ? "Processando..." : "Selecionar arquivo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { processar(e.target.files?.[0]); e.target.value = ""; }}
                />
                {arquivoNome && (
                  <p className="text-[11px] text-torg-gray mt-2 truncate">{arquivoNome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">
                  Forçar OP (opcional — o parser detecta automaticamente pela marca)
                </label>
                <input
                  type="text"
                  value={opForcada}
                  onChange={(e) => setOpForcada(e.target.value.toUpperCase())}
                  placeholder="Ex: T82A"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-torg-gray">
                <input
                  type="checkbox"
                  checked={sobrescrever}
                  onChange={(e) => setSobrescrever(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Sobrescrever — apaga peças anteriores dessa OP que foram importadas via LPC antes de importar de novo.</span>
              </label>
            </>
          )}
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
