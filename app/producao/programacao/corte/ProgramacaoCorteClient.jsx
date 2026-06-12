"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Zap, ChevronDown, ChevronUp, Filter, Search, CheckCircle2, Download, Upload,
  Package, Loader2, AlertCircle, RefreshCw, Undo2, FileSpreadsheet, ClipboardList,
  ArrowRight, X, Trash2, Factory, PackageSearch, AlertTriangle, XCircle, Layers,
  Cloud, FileDown, FolderSearch, Folder, ArrowLeft,
} from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";
import {
  criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
  adicionarLinhaTotais, adicionarLegenda,
  downloadWorkbook, CORES,
} from "@/lib/excel-relatorio";
import { fmtOP } from "@/lib/utils";
import {
  MAQUINA_LABEL, MAQUINA_COR, MAQUINAS, PERDA_MAQUINA,
  calcularResumoBarras, parsePerfil, gerarProgramaCorte, classificarMaquina,
} from "@/lib/maquina-corte";

const STATUS_PIPELINE = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
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

const fmtMm = (v) => {
  if (v == null || v === 0) return "—";
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mm`;
};

// OP-mãe (comercial) e PARTE a partir da obra/sublista do LPC:
//   "T82A" → OP-mãe "82", parte "A";  "T82" → OP "82", parte "—".
//   Usa op.numero ("082") quando vier vinculado.
const opMaeNumero = (p) => {
  const raw = p.op?.numero || (String(p.opNumero || "").match(/\d+/) || [])[0] || "";
  return raw ? String(parseInt(raw, 10)) : "";
};
const parteDe = (p) => String(p.opNumero || "").replace(/^T?\d+/i, "").toUpperCase() || "—";
// Tipo de perfil = letras iniciais da descrição/perfil: "CH9.50X113"→"CH",
// "W200X26.6"→"W", "L1.1/2X1/8"→"L", "TUBO250X150"→"TUBO".
const tipoPerfil = (p) => {
  const s = p.descricao || p.perfil || "";
  return (String(s).match(/^[A-Za-zÀ-ÿ]+/) || [""])[0].toUpperCase() || "—";
};

export default function ProgramacaoCorteClient({ pecasIniciais, ops, userRole }) {
  const router = useRouter();
  const [pecas, setPecas] = useState(pecasIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("PENDENTE");
  const [filtroMaquina, setFiltroMaquina] = useState("");
  const [filtroAtendimento, setFiltroAtendimento] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("");
  const [filtroParte, setFiltroParte] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState(""); // "", "COM", "SEM" ou "1","2"…
  const [prioBulk, setPrioBulk] = useState(""); // prioridade a aplicar na seleção
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);
  const [marcandoConjunto, setMarcandoConjunto] = useState(false);
  const [expandido, setExpandido] = useState(new Set(Object.keys(MAQUINAS)));
  const [reclassificando, setReclassificando] = useState(false);

  // Modais de importacao
  const [modalImport, setModalImport] = useState(false);
  const [modalImportLPC, setModalImportLPC] = useState(false);
  const [modalSharepoint, setModalSharepoint] = useState(false);
  const [modalExcluirLote, setModalExcluirLote] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [modalSyneco, setModalSyneco] = useState(false);
  const [importandoSyneco, setImportandoSyneco] = useState(false);
  const [resultadoSyneco, setResultadoSyneco] = useState(null);
  const [synecoOpSelecionada, setSynecoOpSelecionada] = useState("");
  const [conferindoEstoque, setConferindoEstoque] = useState(false);
  const [resultadoEstoque, setResultadoEstoque] = useState(null);

  const isAdmin = userRole === "ADMIN";

  // OPs disponiveis
  // sublistas (T82A…) — usado pelo modal de exclusão por OP
  const opsComPecas = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  // OPs-mãe com peças (agrupa as sublistas T82A/T82B sob a OP-82) — filtro/seletor
  const opsMae = useMemo(() => {
    const map = new Map(); // key "82" → { key, cliente, marcas, pendentes, pesoPendente, partes:Set }
    for (const p of pecas) {
      const key = opMaeNumero(p);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, cliente: p.op?.cliente || "", marcas: 0, pendentes: 0, pesoPendente: 0, partes: new Set() });
      const o = map.get(key);
      o.marcas++;
      o.partes.add(parteDe(p));
      if (!o.cliente && p.op?.cliente) o.cliente = p.op.cliente;
      if (p.status === "PENDENTE") { o.pendentes++; o.pesoPendente += p.pesoTotalKg || 0; }
    }
    return [...map.values()]
      .map((o) => ({ ...o, partes: [...o.partes].sort() }))
      .sort((a, b) => Number(a.key) - Number(b.key));
  }, [pecas]);

  // Filtrar pecas
  const pecasFiltradas = useMemo(() => {
    return pecas.filter((p) => {
      if (filtroOp && opMaeNumero(p) !== filtroOp) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (filtroTipo === "CONJUNTO" && p.tipoPeca !== "CONJUNTO") return false;
      if (filtroTipo === "CROQUI" && p.tipoPeca !== "CROQUI") return false;
      if (filtroTipo === "PECA" && p.tipoPeca != null) return false;
      if (filtroPerfil && tipoPerfil(p) !== filtroPerfil) return false;
      if (filtroParte && parteDe(p) !== filtroParte) return false;
      if (filtroPrioridade === "COM" && p.prioridade == null) return false;
      if (filtroPrioridade === "SEM" && p.prioridade != null) return false;
      if (filtroPrioridade && !["COM", "SEM"].includes(filtroPrioridade) && String(p.prioridade ?? "") !== filtroPrioridade) return false;
      if (filtroMaquina && (p.maquina || "SEM_MAQUINA") !== filtroMaquina) return false;
      if (filtroAtendimento) {
        const prod = p.qteProduzida || 0;
        const total = p.qte || 1;
        if (filtroAtendimento === "COMPLETO" && prod < total) return false;
        if (filtroAtendimento === "PARCIAL" && (prod === 0 || prod >= total)) return false;
        if (filtroAtendimento === "PENDENTE" && prod > 0) return false;
      }
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
  }, [pecas, filtroOp, filtroStatus, filtroTipo, filtroPerfil, filtroParte, filtroPrioridade, filtroMaquina, filtroAtendimento, busca]);

  // Opções dos filtros novos (tipos de perfil existentes; partes da OP selecionada)
  const perfis = useMemo(
    () => [...new Set(pecas.map(tipoPerfil).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [pecas]
  );
  // Prioridades distintas existentes (para o dropdown)
  const prioridades = useMemo(
    () => [...new Set(pecas.map((p) => p.prioridade).filter((x) => x != null))].sort((a, b) => a - b),
    [pecas]
  );
  const partesDisponiveis = useMemo(() => {
    const base = filtroOp ? pecas.filter((p) => opMaeNumero(p) === filtroOp) : pecas;
    return [...new Set(base.map(parteDe))].sort();
  }, [pecas, filtroOp]);

  // Seleção em lote: marca/desmarca todas as PENDENTES atualmente filtradas
  const selecionarPendentesFiltrados = () => {
    const ids = pecasFiltradas.filter((p) => p.status === "PENDENTE").map((p) => p.id);
    setSelecionados((prev) => {
      const todos = ids.length > 0 && ids.every((id) => prev.has(id));
      const n = new Set(prev);
      if (todos) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
      return n;
    });
  };

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

  // Agrupar por PARTE (A/B/C) — vista quando uma OP-mãe está selecionada.
  // Dentro da parte: peças com prioridade MARCADA vêm primeiro (1, 2, 3…),
  // depois o resto pela sequência do item. A prioridade é manual e opcional.
  const porParte = useMemo(() => {
    const map = new Map();
    for (const p of pecasFiltradas) {
      const k = parteDe(p);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        (a.prioridade ?? 1e9) - (b.prioridade ?? 1e9) ||
        (a.item ?? 1e9) - (b.item ?? 1e9) ||
        a.marca.localeCompare(b.marca, undefined, { numeric: true })
      );
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])); // [parte, peças][]
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

  // Enviar para as máquinas (= liberar p/ corte): grava máquina + status CORTE.
  // Só envia peças PENDENTE COM máquina (sem máquina = conjunto, vai por outra ação).
  async function enviarParaMaquinas(idsAlvo) {
    const ids = (idsAlvo || [...selecionados]).filter((id) => {
      const p = pecas.find((x) => x.id === id);
      return p && p.status === "PENDENTE";
    });
    if (ids.length === 0) return;
    setLiberando(true);
    try {
      const maquinasMap = {};
      const semMaq = [];
      for (const id of ids) {
        const p = pecas.find((x) => x.id === id);
        let maq = p.maquina;
        if (!maq && p.descricao) maq = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
        if (maq) maquinasMap[id] = maq; else semMaq.push(p.marca);
      }
      const enviaveis = ids.filter((id) => maquinasMap[id]);
      if (enviaveis.length === 0) {
        alert("Nenhuma peça com máquina definida na seleção. Defina o laser (ou marque como conjunto) antes de enviar.");
        return;
      }
      const res = await fetch("/api/producao/pecas/liberar-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: enviaveis, maquinas: maquinasMap }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      const set = new Set(enviaveis);
      setPecas((prev) => prev.map((p) => (set.has(p.id) && p.status === "PENDENTE" ? { ...p, status: "CORTE", maquina: maquinasMap[p.id] || p.maquina } : p)));
      setSelecionados(new Set());
      if (semMaq.length > 0) alert(`Enviadas ${enviaveis.length}. Ficaram de fora ${semMaq.length} sem máquina (defina o laser ou marque como conjunto): ${semMaq.slice(0, 8).join(", ")}${semMaq.length > 8 ? "…" : ""}`);
    } catch (e) {
      alert("Erro ao enviar: " + e.message);
    } finally {
      setLiberando(false);
    }
  }
  const liberarSelecionados = () => enviarParaMaquinas();

  // Atribuir a máquina (laser) a todas as peças selecionadas de uma vez.
  async function atribuirMaquinaLote(maquina) {
    const ids = [...selecionados];
    if (ids.length === 0 || !maquina) return;
    try {
      const res = await fetch("/api/producao/pecas/atribuir-maquina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, maquina }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      const set = new Set(ids);
      setPecas((prev) => prev.map((p) => (set.has(p.id) ? { ...p, maquina } : p)));
    } catch (e) {
      alert("Erro ao atribuir máquina: " + e.message);
    }
  }

  // Liberar todas as pendentes de uma maquina especifica
  async function liberarMaquina(maq) {
    const pecasMaq = porMaquina[maq]?.filter((p) => p.status === "PENDENTE") || [];
    if (pecasMaq.length === 0) return;
    const idsSet = new Set(pecasMaq.map((p) => p.id));
    // Temporariamente setar selecionados e chamar liberarSelecionados
    setSelecionados(idsSet);
    // Executar inline pra evitar timing issue com setState
    setLiberando(true);
    try {
      const maquinasMap = {};
      for (const p of pecasMaq) {
        let m = p.maquina;
        if (!m && p.descricao) m = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
        if (m) maquinasMap[p.id] = m;
      }
      const res = await fetch("/api/producao/pecas/liberar-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...idsSet], maquinas: maquinasMap }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) =>
        prev.map((p) => {
          if (!idsSet.has(p.id) || p.status !== "PENDENTE") return p;
          return { ...p, status: "CORTE", maquina: maquinasMap[p.id] || p.maquina };
        })
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao liberar: " + e.message);
    } finally {
      setLiberando(false);
    }
  }

  // Liberar TODAS as pendentes visíveis
  async function liberarTodas() {
    const pendentes = pecasFiltradas.filter((p) => p.status === "PENDENTE");
    if (pendentes.length === 0) return;
    const idsSet = new Set(pendentes.map((p) => p.id));
    setLiberando(true);
    try {
      const maquinasMap = {};
      for (const p of pendentes) {
        let m = p.maquina;
        if (!m && p.descricao) m = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
        if (m) maquinasMap[p.id] = m;
      }
      const res = await fetch("/api/producao/pecas/liberar-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...idsSet], maquinas: maquinasMap }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) =>
        prev.map((p) => {
          if (!idsSet.has(p.id) || p.status !== "PENDENTE") return p;
          return { ...p, status: "CORTE", maquina: maquinasMap[p.id] || p.maquina };
        })
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

  // Atribuir como CONJUNTO — peça não é cortada, começa na montagem.
  async function marcarConjunto(ids) {
    const lista = ids || [...selecionados];
    if (lista.length === 0) return;
    setMarcandoConjunto(true);
    try {
      const res = await fetch("/api/producao/pecas/marcar-conjunto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: lista }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      // Saem da tela de corte (status MONTAGEM) — removo da lista local
      const set = new Set(lista);
      setPecas((prev) => prev.filter((p) => !set.has(p.id)));
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao marcar como conjunto: " + e.message);
    } finally {
      setMarcandoConjunto(false);
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
  // Prioridade manual em lote: define (ou limpa) a prioridade da seleção.
  async function atribuirPrioridadeLote(valor) {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    const prioridade = valor === "" || valor == null ? null : Math.max(1, parseInt(valor, 10) || 0) || null;
    const set = new Set(ids);
    setPecas((prev) => prev.map((p) => (set.has(p.id) ? { ...p, prioridade } : p))); // otimista
    try {
      const res = await fetch("/api/producao/pecas/atribuir-prioridade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, prioridade }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro");
    } catch (e) {
      alert("Erro ao salvar prioridade: " + e.message);
    }
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

  // Deletar peca individual
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

  // Deletar todas pecas de uma OP
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

  // Importar producao do Syneco
  async function importarSyneco() {
    const opNum = synecoOpSelecionada || filtroOp;
    if (!opNum) { alert("Selecione uma OP para importar."); return; }
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
      if (data.statusUpdated > 0) router.refresh();
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

  // Conferir estoque para OP selecionada
  async function conferirEstoque() {
    const opNum = filtroOp;
    if (!opNum) { alert("Selecione uma OP para conferir o estoque."); return; }
    setConferindoEstoque(true);
    setResultadoEstoque(null);
    try {
      const res = await fetch("/api/producao/pecas/conferir-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: opNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      setResultadoEstoque(data);
      // Atualizar statusEstoque local nas peças
      const statusMap = {};
      for (const c of data.conferencia) {
        statusMap[c.perfil] = c.status;
      }
      setPecas((prev) =>
        prev.map((p) => {
          if (p.opNumero !== opNum) return p;
          const st = statusMap[p.descricao || ""];
          return st ? { ...p, statusEstoque: st } : p;
        })
      );
    } catch (e) {
      alert("Erro ao conferir estoque: " + e.message);
    } finally {
      setConferindoEstoque(false);
    }
  }

  // Prepara pecas com auto-classificação para peças sem maquina
  function prepararPecas(baseCustom) {
    const base = baseCustom || (filtroOp ? pecasFiltradas : pecas);
    return base.map((p) => {
      if (p.maquina) return p;
      if (!p.descricao) return p;
      const maq = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
      return maq ? { ...p, maquina: maq } : p;
    }).filter((p) => p.maquina);
  }

  // --- BOTAO 1: Lista de Material ---
  // Lista de Material (pendentes) — padrão TORG (logo/KPIs/totais).
  // Material que SERÁ usado: só peças aguardando liberação (PENDENTE).
  async function exportarListaMaterial() {
    const basePendentes = (filtroOp ? pecasFiltradas : pecas).filter((p) => p.status === "PENDENTE");
    const pecasComMaq = prepararPecas(basePendentes);
    if (pecasComMaq.length === 0) {
      alert("Nenhuma peça pendente com perfil reconhecido para gerar a lista de material.");
      return;
    }

    const opLabel = filtroOp ? `OP-${filtroOp}` : "Todas as OPs";
    const resumo = calcularResumoBarras(pecasComMaq);

    // Monta as linhas: máquina → perfil (barras) + chapas do Laser Chapa
    const linhas = [];
    let totalBarras = 0, totalPcs = 0, totalPeso = 0;
    for (const [maq, dados] of Object.entries(resumo)) {
      const perfis = Object.entries(dados.perfis).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [perfil, pf] of perfis) {
        const pesoEstimado = pecasComMaq
          .filter((p) => p.maquina === maq && p.descricao === perfil)
          .reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
        linhas.push([
          MAQUINA_LABEL[maq] || maq,
          perfil,
          pf.tipo,
          pf.qte,
          Number((pf.compTotalMm / 1000).toFixed(1)),
          Number((pf.comprimentoBarraMm / 1000).toFixed(0)),
          pf.barraUtilMm ? Number((pf.barraUtilMm / 1000).toFixed(2)) : Number((pf.comprimentoBarraMm / 1000).toFixed(0)),
          pf.barras,
          Number(pesoEstimado.toFixed(1)),
        ]);
        totalBarras += pf.barras; totalPcs += pf.qte; totalPeso += pesoEstimado;
      }
      // Chapas desta máquina (Laser Chapa não usa barras)
      if (maq === "LASER_CHAPA") {
        const chapasPorDesc = {};
        for (const ch of pecasComMaq.filter((p) => p.maquina === "LASER_CHAPA")) {
          const desc = ch.descricao || "Chapa";
          if (!chapasPorDesc[desc]) chapasPorDesc[desc] = { qte: 0, peso: 0 };
          chapasPorDesc[desc].qte += ch.qte || 1;
          chapasPorDesc[desc].peso += ch.pesoTotalKg || 0;
        }
        for (const [desc, info] of Object.entries(chapasPorDesc)) {
          linhas.push(["Laser Chapa", desc, "CH", info.qte, "", "", "", info.qte, Number(info.peso.toFixed(1))]);
          totalPcs += info.qte; totalBarras += info.qte; totalPeso += info.peso;
        }
      }
    }

    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: "Lista de Material para Corte",
      subtitulo: `${opLabel} — peças pendentes (aguardando liberação)`,
      kpis: [
        `Peças: ${totalPcs}  |  Barras/Chapas: ${totalBarras}  |  Peso estimado: ${(totalPeso / 1000).toFixed(1)} t`,
      ],
      totalColunas: 9,
      nomePlanilha: "Lista de Material",
      codigoDoc: "REL-PRD-004",
    });

    ws.columns = [
      { width: 18 }, { width: 24 }, { width: 8 }, { width: 10 },
      { width: 16 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 14 },
    ];

    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, ["Máquina", "Perfil", "Tipo", "Qte Peças", "Comp. Total (m)", "Barra Padrão (m)", "Barra Útil (m)", "Barras Necess.", "Peso Est. (kg)"]);
    row++;
    const primeiraLinhaDados = row;
    for (const l of linhas) {
      adicionarLinhaTabela(ws, row, l, {
        alinhamento: { 3: "center", 4: "right", 5: "right", 6: "right", 7: "right", 8: "right", 9: "right" },
      });
      row++;
    }
    const ultimaLinhaDados = row - 1;
    adicionarLinhaTotais(ws, row, [
      "TOTAL", "", "",
      { formula: `SUM(D${primeiraLinhaDados}:D${ultimaLinhaDados})` },
      "", "", "",
      { formula: `SUM(H${primeiraLinhaDados}:H${ultimaLinhaDados})` },
      { formula: `SUM(I${primeiraLinhaDados}:I${ultimaLinhaDados})` },
    ]);

    const nomeArquivo = `Torg_Lista_Material_${filtroOp ? `OP-${filtroOp}` : "Todas"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    await downloadWorkbook(workbook, nomeArquivo);
  }

  // --- BOTAO 2: Programa de Corte ---
  function exportarProgramaCorte() {
    const pecasComMaq = prepararPecas();
    if (pecasComMaq.length === 0) {
      alert("Nenhuma peça com perfil reconhecido para gerar programa de corte.");
      return;
    }

    const programa = gerarProgramaCorte(pecasComMaq);
    const wb = XLSX.utils.book_new();
    const opLabel = filtroOp ? `OP ${filtroOp}` : "Todas OPs";
    const agora = `${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

    // Uma aba por maquina
    for (const [maq, dados] of Object.entries(programa)) {
      const rows = [];

      // Header
      rows.push([`PROGRAMA DE CORTE — ${dados.label.toUpperCase()}`]);
      rows.push([`${opLabel} — Gerado em ${agora}`]);
      if (dados.perda) {
        const perdas = [];
        if (dados.perda.alinhamento) perdas.push(`${dados.perda.alinhamento}mm alinhamento`);
        if (dados.perda.zonamorta) perdas.push(`${dados.perda.zonamorta}mm zona morta (mín. cortável)`);
        if (dados.perda.retalhoMinimo) perdas.push(`${dados.perda.retalhoMinimo}mm retalho mín. (peças < ${dados.perda.limiarSemRetalho}mm)`);
        if (perdas.length > 0) rows.push([`Perdas da máquina: ${perdas.join(" + ")}`]);
      }
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
        const compUtilM = grupo.barraUtilMm ? (grupo.barraUtilMm / 1000).toFixed(2) : compBarraM;
        const perdaInfo = grupo.perdaMm > 0 ? ` (Útil: ${compUtilM}m | Perda: ${grupo.perdaMm}mm)` : "";
        rows.push([`${desc} — Barra ${compBarraM}m${perdaInfo} — ${grupo.totalBarras} barra${grupo.totalBarras > 1 ? "s" : ""} — Aproveitamento ${grupo.aproveitamentoMedio.toFixed(0)}%`]);
        rows.push(["Barra", "OP", "Marca", "Comprimento (mm)", "Peso (kg)", "Útil (mm)", "Usado (mm)", "Sobra (mm)", "Aprov. %"]);

        for (const barra of grupo.barras) {
          let primeiro = true;
          for (const peca of barra.pecas) {
            rows.push([
              primeiro ? `Barra ${barra.numero}` : "",
              peca.opNumero || "",
              peca.marca,
              peca.comprimentoMm,
              peca.pesoUnitKg || "",
              primeiro ? barra.barraUtilMm : "",
              primeiro ? barra.usadoMm : "",
              primeiro ? barra.sobraMm : "",
              primeiro ? `${barra.aproveitamento.toFixed(0)}%` : "",
            ]);
            primeiro = false;
          }
        }

        // Subtotal do perfil
        const totalUsado = grupo.barras.reduce((s, b) => s + b.usadoMm, 0);
        const totalUtil = grupo.totalBarras * (grupo.barraUtilMm || grupo.comprimentoBarraMm);
        rows.push([
          `TOTAL ${desc}`,
          "",
          `${grupo.totalPecas} peças`,
          `${(totalUsado / 1000).toFixed(1)}m usado`,
          "",
          totalUtil,
          totalUsado,
          totalUtil - totalUsado,
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
      ws["!cols"] = [
        { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      ];

      const sheetName = (dados.label || maq).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    if (wb.SheetNames.length === 0) {
      alert("Nenhuma peça com perfil válido para gerar programa.");
      return;
    }

    const fileName = filtroOp
      ? `Programa_Corte_OP${filtroOp}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Programa_Corte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // Exportar relatorio no padrao ISO
  async function exportarRelatorio() {
    const filtrosAtivos = [
      filtroOp ? `OP-${filtroOp}` : null,
      filtroParte ? `Parte ${filtroParte}` : null,
      filtroPerfil ? `Perfil ${filtroPerfil}` : null,
      filtroPrioridade === "COM" ? "Com prioridade" : filtroPrioridade === "SEM" ? "Sem prioridade" : filtroPrioridade ? `Prioridade ${filtroPrioridade}` : null,
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroMaquina ? (MAQUINA_LABEL[filtroMaquina] || filtroMaquina) : null,
      filtroAtendimento === "COMPLETO" ? "Completo" : filtroAtendimento === "PARCIAL" ? "Parcial" : filtroAtendimento === "PENDENTE" ? "Pendente" : null,
    ].filter(Boolean);
    const tituloFiltro = filtrosAtivos.length > 0 ? filtrosAtivos.join(" · ") : "Todas as OPs";
    // Ordena o export por parte → prioridade → item (igual à tela)
    const pecasExport = [...pecasFiltradas].sort((a, b) =>
      parteDe(a).localeCompare(parteDe(b)) ||
      (a.prioridade ?? 1e9) - (b.prioridade ?? 1e9) ||
      (a.item ?? 1e9) - (b.item ?? 1e9) ||
      a.marca.localeCompare(b.marca, undefined, { numeric: true })
    );

    const totalPecas = pecasFiltradas.reduce((s, p) => s + (p.qte || 1), 0);
    const totalProd = pecasFiltradas.reduce((s, p) => s + (p.qteProduzida || 0), 0);
    const totalPeso = pecasFiltradas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
    const pctGeral = totalPecas > 0 ? Math.round((totalProd / totalPecas) * 100) : 0;

    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: "Programacao de Corte",
      subtitulo: tituloFiltro,
      kpis: [
        `Total: ${totalPecas} pc  |  Produzido: ${totalProd} pc (${pctGeral}%)  |  Peso: ${(totalPeso / 1000).toFixed(1)} t`,
      ],
      totalColunas: 16,
      nomePlanilha: "Corte",
      codigoDoc: "REL-PRD-003",
    });

    ws.columns = [
      { width: 8 }, { width: 14 }, { width: 24 }, { width: 14 },
      { width: 7 }, { width: 11 }, { width: 11 }, { width: 11 },
      { width: 10 }, { width: 8 }, { width: 10 }, { width: 16 },
      { width: 12 }, { width: 12 }, { width: 8 }, { width: 9 },
    ];

    let row = linhaInicio;
    const headers = ["OP", "Marca", "Descricao", "Material", "Qte", "Comp.", "Peso Unit.", "Peso Total", "Produzido", "Falta", "% Atend.", "Maquina", "Status", "Data Prod.", "Parte", "Prior."];
    adicionarHeaderTabela(ws, row, headers);
    row++;
    const primeiraLinhaDados = row;

    for (const p of pecasExport) {
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
        p.descricao || "",
        p.material || "",
        total,
        p.comprimentoMm ? `${p.comprimentoMm} mm` : "",
        p.pesoUnitKg ? Number(p.pesoUnitKg.toFixed(1)) : 0,
        p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : 0,
        prod,
        falta,
        `${pct}%`,
        p.maquina ? (MAQUINA_LABEL[p.maquina] || p.maquina) : "",
        STATUS_LABEL[p.status] || p.status,
        p.dataProducao ? new Date(p.dataProducao).toLocaleDateString("pt-BR") : "",
        parteDe(p),
        p.prioridade ?? "",
      ], {
        fillColor,
        fontColors,
        alinhamento: { 4: "right", 5: "right", 6: "right", 7: "right", 8: "right", 9: "right", 10: "right", 15: "center", 16: "center" },
      });
      ws.getCell(row, 2).font = { name: "Arial", size: 9, bold: true, color: { argb: CORES.TORG_DARK } };
      ws.getCell(row, 9).font = { name: "Arial", size: 9, bold: true, color: { argb: fontColors[8] } };
      ws.getCell(row, 10).font = { name: "Arial", size: 9, bold: true, color: { argb: fontColors[9] } };
      row++;
    }

    const ultimaLinhaDados = row - 1;
    adicionarLinhaTotais(ws, row, [
      "TOTAL", "", "", "",
      { formula: `SUM(E${primeiraLinhaDados}:E${ultimaLinhaDados})` },
      "",
      "",
      { formula: `SUM(H${primeiraLinhaDados}:H${ultimaLinhaDados})` },
      { formula: `SUM(I${primeiraLinhaDados}:I${ultimaLinhaDados})` },
      { formula: `SUM(J${primeiraLinhaDados}:J${ultimaLinhaDados})` },
      { formula: `IF(E${row}=0,"0%",ROUND(I${row}/E${row}*100,0)&"%")` },
      "", "", "", "", "",
    ]);
    row++;

    row++;
    adicionarLegenda(ws, row, [
      { cor: CORES.LIGHT_GREEN, label: "Verde = 100% produzido" },
      { cor: CORES.LIGHT_ORANGE, label: "Laranja = parcialmente produzido" },
      { cor: "FFFFFF", label: "Branco = pendente" },
    ], 14);

    const filtroDesc = [
      filtroOp ? `OP-${filtroOp}` : "Todas-OPs",
      filtroStatus ? STATUS_LABEL[filtroStatus] : null,
      filtroMaquina ? (MAQUINA_LABEL[filtroMaquina] || filtroMaquina) : null,
    ].filter(Boolean).join("_");

    const nomeArquivo = `Torg_Corte_${filtroDesc || "Todas"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    await downloadWorkbook(workbook, nomeArquivo);
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
        <div className="flex items-center gap-2">
          <button
            onClick={exportarListaMaterial}
            className="px-3 py-1.5 border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5"
            title="Material das peças PENDENTES (aguardando liberação) — barras/chapas por máquina, padrão TORG"
          >
            <ClipboardList size={14} /> Lista de Material
          </button>
          <button
            onClick={() => setModalSharepoint(true)}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
            title="Busca a lista (LPC) da pasta da OP no SharePoint — pega a revisão mais recente"
          >
            <Cloud size={14} /> Buscar lista (SharePoint)
          </button>
          {isAdmin && opsComPecas.length > 0 && (
            <button
              onClick={() => setModalExcluirLote(true)}
              className="px-3 py-1.5 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-50 font-medium flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Excluir peças por OP
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

      {/* Alerta de conferência de estoque */}
      {resultadoEstoque && resultadoEstoque.conferencia && (
        <div className={`rounded-xl border p-4 space-y-3 ${
          resultadoEstoque.resumo.indisponivel > 0
            ? "bg-red-50 border-red-200"
            : resultadoEstoque.resumo.parcial > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"
        }`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm font-semibold flex items-center gap-2 ${
              resultadoEstoque.resumo.indisponivel > 0
                ? "text-red-800"
                : resultadoEstoque.resumo.parcial > 0
                  ? "text-amber-800"
                  : "text-emerald-800"
            }`}>
              <PackageSearch size={16} />
              Conferência de Estoque — OP {resultadoEstoque.opNumero}
            </p>
            <div className="flex items-center gap-3 text-xs font-medium">
              {resultadoEstoque.resumo.disponivel > 0 && (
                <span className="text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={12} /> {resultadoEstoque.resumo.disponivel} disponível
                </span>
              )}
              {resultadoEstoque.resumo.parcial > 0 && (
                <span className="text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={12} /> {resultadoEstoque.resumo.parcial} parcial
                </span>
              )}
              {resultadoEstoque.resumo.indisponivel > 0 && (
                <span className="text-red-700 flex items-center gap-1">
                  <XCircle size={12} /> {resultadoEstoque.resumo.indisponivel} indisponível
                </span>
              )}
              <button onClick={() => setResultadoEstoque(null)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200/50">
                  <th className="text-left py-1.5 px-2 font-medium">Perfil</th>
                  <th className="text-left py-1.5 px-2 font-medium">Máquina</th>
                  <th className="text-right py-1.5 px-2 font-medium">Barras necessárias</th>
                  <th className="text-right py-1.5 px-2 font-medium">Barras em estoque</th>
                  <th className="text-right py-1.5 px-2 font-medium">Falta</th>
                  <th className="text-center py-1.5 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {resultadoEstoque.conferencia.map((c, i) => {
                  const falta = Math.max(0, c.barrasNecessarias - c.barrasDisponiveis);
                  return (
                    <tr key={i} className="border-b border-gray-100/50">
                      <td className="py-1.5 px-2 font-mono font-semibold text-torg-dark">{c.perfil}</td>
                      <td className="py-1.5 px-2 text-torg-gray">{MAQUINA_LABEL[c.maquina] || c.maquina}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium">{c.barrasNecessarias}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium">{c.barrasDisponiveis}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${falta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {falta > 0 ? `-${falta}` : "✓"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.status === "DISPONIVEL" ? "bg-emerald-100 text-emerald-700" :
                          c.status === "PARCIAL" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {c.status === "DISPONIVEL" ? "Disponível" : c.status === "PARCIAL" ? "Parcial" : "Indisponível"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {resultadoEstoque.resumo.indisponivel === 0 && resultadoEstoque.resumo.parcial === 0 && (
            <p className="text-xs text-emerald-700 font-medium">
              ✓ Todos os perfis possuem barras disponíveis em estoque. Pronto para produção!
            </p>
          )}
          {resultadoEstoque.resumo.indisponivel > 0 && (
            <p className="text-xs text-red-700 font-medium">
              ⚠ {resultadoEstoque.resumo.indisponivel} perfil(is) sem estoque — providencie a compra antes de liberar para produção.
            </p>
          )}
        </div>
      )}

      {/* Ação principal — Liberar para Produção */}
      {filtroStatus === "PENDENTE" && totalPendentes > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={16} /> Pronto para liberar?
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Após verificar as planilhas e os perfis, clique para confirmar a programação e enviar para produção.
            </p>
          </div>
          <button
            onClick={liberarTodas}
            disabled={liberando}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-semibold flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            {liberando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Liberar {pecasFiltradas.filter((p) => p.status === "PENDENTE").length} Peças para Produção
          </button>
        </div>
      )}

      {/* Resumo de barras por máquina / perfil */}
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

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <select
          value={filtroOp}
          onChange={(e) => { setFiltroOp(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas as OPs</option>
          {opsMae.map((op) => <option key={op.key} value={op.key}>OP-{op.key}{op.cliente ? ` · ${op.cliente}` : ""}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => { setFiltroStatus(e.target.value); setSelecionados(new Set()); }}
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
          <option value="PECA">Avulsas</option>
        </select>
        <select
          value={filtroParte}
          onChange={(e) => { setFiltroParte(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas as partes</option>
          {partesDisponiveis.map((pt) => <option key={pt} value={pt}>Parte {pt}</option>)}
        </select>
        <select
          value={filtroPrioridade}
          onChange={(e) => { setFiltroPrioridade(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
          title="Filtrar pela prioridade marcada"
        >
          <option value="">Toda prioridade</option>
          <option value="COM">Com prioridade</option>
          <option value="SEM">Sem prioridade</option>
          {prioridades.map((n) => <option key={n} value={String(n)}>Prioridade {n}</option>)}
        </select>
        <select
          value={filtroPerfil}
          onChange={(e) => { setFiltroPerfil(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
          title="Tipo de perfil (CH = chapa, W = perfil W, L = cantoneira, TUBO…)"
        >
          <option value="">Todos os perfis</option>
          {perfis.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={filtroMaquina}
          onChange={(e) => { setFiltroMaquina(e.target.value); setSelecionados(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas maquinas</option>
          {Object.entries(MAQUINA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="SEM_MAQUINA">Sem maquina</option>
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
        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Search size={12} className="text-torg-gray ml-2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca, descricao ou material..."
            className="flex-1 px-2 py-1.5 text-xs border-0 focus:ring-0 focus:outline-none"
          />
        </div>
        <button
          onClick={selecionarPendentesFiltrados}
          className="px-3 py-1.5 border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5"
          title="Marca/desmarca todas as peças pendentes do filtro atual"
        >
          <CheckCircle2 size={13} /> Selecionar pendentes
        </button>
        <button
          onClick={exportarRelatorio}
          className="px-3 py-1.5 bg-torg-blue/10 text-torg-blue text-xs rounded-lg hover:bg-torg-blue/20 font-medium flex items-center gap-1.5"
          title="Exportar pecas filtradas para Excel"
        >
          <Download size={13} /> Exportar
        </button>
        {(filtroOp || filtroTipo || filtroPerfil || filtroParte || filtroPrioridade || filtroMaquina || filtroAtendimento || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setFiltroTipo(""); setFiltroPerfil(""); setFiltroParte(""); setFiltroPrioridade(""); setFiltroMaquina(""); setFiltroAtendimento(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}

        {/* Acoes em lote */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-[11px] text-torg-gray font-medium">
              {selecionados.size} selecionada{selecionados.size > 1 ? "s" : ""}
            </span>
            {/* Prioridade da seleção de uma vez */}
            <div className="flex items-center gap-1 border border-torg-blue-200 rounded-lg pl-2 pr-1 py-0.5 bg-white">
              <span className="text-[11px] text-torg-gray">Prior.</span>
              <input type="number" min="1" value={prioBulk}
                onChange={(e) => setPrioBulk(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && prioBulk) { atribuirPrioridadeLote(prioBulk); setPrioBulk(""); } }}
                placeholder="nº" className="w-12 text-center text-xs px-1 py-1 border-0 focus:ring-0 focus:outline-none tabular-nums" />
              <button onClick={() => { if (prioBulk) { atribuirPrioridadeLote(prioBulk); setPrioBulk(""); } }} disabled={!prioBulk}
                className="px-2 py-1 bg-torg-blue text-white text-[11px] rounded-md font-medium disabled:opacity-40">definir</button>
              <button onClick={() => atribuirPrioridadeLote("")} title="Tirar a prioridade das selecionadas"
                className="px-1.5 py-1 text-[11px] text-torg-gray hover:text-torg-dark">limpar</button>
            </div>
            {/* Indicar a máquina (laser) da seleção de uma vez */}
            <select
              value=""
              onChange={(e) => { if (e.target.value) atribuirMaquinaLote(e.target.value); e.target.value = ""; }}
              className="px-2 py-1.5 border border-torg-blue-200 rounded-lg text-xs bg-white text-torg-blue font-medium"
              title="Definir a máquina de todas as peças selecionadas"
            >
              <option value="">Atribuir máquina…</option>
              {Object.entries(MAQUINA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {filtroStatus === "PENDENTE" && (
              <button
                onClick={liberarSelecionados}
                disabled={liberando}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {liberando ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                Enviar para as máquinas
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

      {/* Conteúdo: sem OP → seletor de OPs; com OP → por parte (A/B/C) */}
      {!filtroOp ? (
        opsMae.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">Nenhuma peça importada. Use “Buscar lista (SharePoint)” acima.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-semibold text-torg-dark mb-1">Escolha a OP para programar</p>
            <p className="text-xs text-torg-gray mb-4">Avalie por parte (A/B/C) e envie para as máquinas com critério — nada é solto de uma vez.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {opsMae.map((op) => (
                <button key={op.key} onClick={() => { setFiltroOp(op.key); setSelecionados(new Set()); }}
                  className="text-left border border-gray-100 rounded-xl p-4 hover:border-torg-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-torg-blue text-lg">OP-{op.key}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-torg-gray">{op.partes.length} parte(s)</span>
                  </div>
                  {op.cliente && <p className="text-xs text-torg-gray truncate">{op.cliente}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {op.partes.map((pt) => <span key={pt} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-blue">{pt}</span>)}
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between text-xs">
                    <span className="text-torg-gray">{op.marcas} marcas</span>
                    <span className="text-orange-700 font-semibold">{op.pendentes} a enviar · {fmtKg(op.pesoPendente)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      ) : pecasFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma peça no filtro selecionado desta OP.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {porParte.map(([parte, pcs]) => {
            const pendentesParte = pcs.filter((p) => p.status === "PENDENTE");
            const selDaParte = pcs.filter((p) => selecionados.has(p.id) && p.status === "PENDENTE");
            const pesoParte = pcs.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
            const todosPendSel = pendentesParte.length > 0 && pendentesParte.every((p) => selecionados.has(p.id));
            return (
              <div key={parte} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap bg-gray-50/40">
                  <span className="text-sm font-extrabold text-torg-dark">Parte {parte}</span>
                  <span className="text-[11px] text-torg-gray">{pcs.length} marcas · {fmtKg(pesoParte)}</span>
                  {pendentesParte.length > 0
                    ? <span className="text-[11px] text-orange-700 font-medium">{pendentesParte.length} a enviar</span>
                    : <span className="text-[11px] text-emerald-700 font-medium">tudo enviado</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {pendentesParte.length > 0 && (
                      <button onClick={() => setSelecionados((prev) => { const n = new Set(prev); if (todosPendSel) pendentesParte.forEach((p) => n.delete(p.id)); else pendentesParte.forEach((p) => n.add(p.id)); return n; })}
                        className="text-[11px] text-torg-blue hover:underline">{todosPendSel ? "limpar" : "selecionar pendentes"}</button>
                    )}
                    <button onClick={() => enviarParaMaquinas(selDaParte.length ? selDaParte.map((p) => p.id) : pendentesParte.map((p) => p.id))}
                      disabled={liberando || pendentesParte.length === 0}
                      className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50">
                      {liberando ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                      Enviar para as máquinas{selDaParte.length ? ` (${selDaParte.length})` : ""}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          {pendentesParte.length > 0 && (
                            <input type="checkbox" checked={todosPendSel}
                              onChange={() => setSelecionados((prev) => { const n = new Set(prev); if (todosPendSel) pendentesParte.forEach((x) => n.delete(x.id)); else pendentesParte.forEach((x) => n.add(x.id)); return n; })}
                              title="Selecionar todas as pendentes desta parte" />
                          )}
                        </th>
                        <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-14" title="Prioridade — selecione as peças e defina em lote acima">Prior.</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Comp.</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pcs.map((p) => {
                        const semMaq = !p.maquina;
                        return (
                          <tr key={p.id} className={`hover:bg-gray-50 ${selecionados.has(p.id) ? "bg-torg-blue-50/40" : ""}`}>
                            <td className="px-3 py-1.5">
                              {p.status === "PENDENTE" && <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} />}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {p.prioridade
                                ? <span className="inline-block min-w-[20px] text-xs font-bold tabular-nums text-torg-blue bg-torg-blue-50 border border-torg-blue-200 rounded px-1.5 py-0.5">{p.prioridade}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-xs font-semibold text-torg-dark whitespace-nowrap">{p.marca}
                              {p.tipoPeca && <span className="ml-1 text-[9px] px-1 py-px rounded bg-amber-50 text-amber-700">{p.tipoPeca === "CONJUNTO" ? "CONJ" : "CR"}</span>}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-torg-gray max-w-[180px] truncate" title={p.descricao}>{p.descricao || "—"}</td>
                            <td className="px-3 py-1.5 text-xs text-torg-gray">{p.material || "—"}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{p.qte}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray">{fmtMm(p.comprimentoMm)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums font-medium">{fmtKg(p.pesoTotalKg)}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <select value={p.maquina || ""} onChange={(e) => atualizarMaquina(p.id, e.target.value)}
                                  className={`text-[11px] font-medium rounded-md border px-2 py-1 ${semMaq ? "border-orange-200 bg-orange-50 text-orange-600" : "border-gray-200 bg-white text-torg-dark"}`}>
                                  <option value="">{semMaq ? "Sem laser…" : "—"}</option>
                                  {Object.entries(MAQUINA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                {semMaq && (p.status === "PENDENTE" || p.status === "CORTE") && (
                                  <button onClick={() => marcarConjunto([p.id])} disabled={marcandoConjunto} title="Não corta — começa na montagem"
                                    className="text-[10px] text-torg-blue border border-torg-blue-200 rounded px-1.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50">Conjunto</button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.status === "PENDENTE" ? "bg-orange-50 text-orange-700" : p.status === "CORTE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                                {STATUS_LABEL[p.status] || p.status}
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
          })}
        </div>
      )}

      {/* --- Modais --- */}
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
                  {resultadoSyneco.totais && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-torg-dark">Atendimento do Corte — {resultadoSyneco.obraCode}</p>
                        <span className="text-xs text-torg-gray">{resultadoSyneco.opObra}</span>
                      </div>

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

      {modalSharepoint && (
        <ModalImportarSharepoint
          onClose={() => setModalSharepoint(false)}
          onImportado={() => router.refresh()}
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

/* ========================================================================
   Componentes modais auxiliares
   ======================================================================== */

function ModalExcluirLote({ pecas, opsComPecas, onClose, onExcluido }) {
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [excluindo, setExcluindo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

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
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠ {fmtOP(resultado.opNumero)} não cadastrada no portal — peças ficaram sem vínculo</li>}
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
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠ {fmtOP(resultado.opNumero)} não cadastrada — peças ficaram sem vínculo</li>}
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


/* ─── Modal: buscar/importar a lista (LPC) da pasta da OP no SharePoint ──────
   Você escolhe a OP (as finalizadas ficam de fora) → busca rápida (server-side)
   dos LPC dela por obra/revisão → importa mesclando (preserva o progresso;
   avisa conflitos). Não varre a árvore inteira (era lento e estourava). */
function ModalImportarSharepoint({ onClose, onImportado }) {
  const [ops, setOps] = useState(null);
  const [carregandoOps, setCarregandoOps] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);       // pasta da OP expandida
  const [obrasPorOp, setObrasPorOp] = useState({}); // pasta → { carregando, obras, erro }
  const [importando, setImportando] = useState(null); // `${pasta}|${obra}`
  const [resultados, setResultados] = useState({});   // obra → resultado
  const [base, setBase] = useState("");               // caminho base das OPs
  const [browser, setBrowser] = useState(null);       // { opPasta } navegador aberto
  const [nav, setNav] = useState(null);               // { carregando, atual, pastas, lpcs, erro }
  const [salvando, setSalvando] = useState(false);

  // 1) lista as pastas de OP
  const listar = async () => {
    setCarregandoOps(true); setErro("");
    try {
      const res = await fetch("/api/producao/pecas/importar-lpc-revisao");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao listar as OPs");
      setOps(data.ops || []); setBase(data.base || "");
    } catch (e) { setErro(e.message); }
    finally { setCarregandoOps(false); }
  };
  useEffect(() => { listar(); }, []);

  // 2) busca os LPC de uma OP (ao expandir) — recarrega se forçado
  const abrirOp = async (pasta, forcar = false) => {
    if (!forcar && aberta === pasta) { setAberta(null); return; }
    setAberta(pasta);
    if (!forcar && obrasPorOp[pasta]?.obras) return; // já carregado
    setObrasPorOp((p) => ({ ...p, [pasta]: { carregando: true } }));
    try {
      const res = await fetch(`/api/producao/pecas/importar-lpc-revisao?op=${encodeURIComponent(pasta)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao buscar os LPC");
      setObrasPorOp((p) => ({ ...p, [pasta]: { obras: data.obras || [], pastaSalva: data.pastaSalva || null } }));
    } catch (e) {
      setObrasPorOp((p) => ({ ...p, [pasta]: { erro: e.message } }));
    }
  };

  // ── Navegador de pastas ──────────────────────────────────────────────
  const navegar = async (path) => {
    setNav({ carregando: true, atual: path });
    try {
      const res = await fetch(`/api/producao/pecas/importar-lpc-revisao?browse=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao abrir a pasta");
      setNav({ atual: data.atual, pastas: data.pastas || [], lpcs: data.lpcs || [] });
    } catch (e) { setNav({ atual: path, erro: e.message }); }
  };
  const abrirBrowser = (opPasta) => {
    setBrowser({ opPasta, raiz: `${base}/${opPasta}` });
    navegar(`${base}/${opPasta}`);
  };
  const salvarPastaAtual = async () => {
    if (!browser || !nav?.atual) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/producao/pecas/importar-lpc-revisao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar-pasta", opPasta: browser.opPasta, pastaPath: nav.atual }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Falha ao salvar");
      setOps((prev) => prev.map((o) => o.pasta === browser.opPasta ? { ...o, pastaSalva: nav.atual } : o));
      const op = browser.opPasta;
      setBrowser(null); setNav(null);
      await abrirOp(op, true); // recarrega os LPC da pasta salva
    } catch (e) { setNav((n) => ({ ...n, erro: e.message })); }
    finally { setSalvando(false); }
  };

  // 3) importa uma obra
  const importar = async (pasta, obra, permitirDowngrade = false) => {
    setImportando(`${pasta}|${obra}`); setErro("");
    try {
      const res = await fetch("/api/producao/pecas/importar-lpc-revisao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pasta, obra, permitirDowngrade }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.downgrade && !permitirDowngrade) {
          if (confirm(`O SharePoint tem R${String(data.revDisponivel).padStart(2, "0")}, abaixo da carregada R${String(data.revAtual).padStart(2, "0")}.\n\nRebaixar mesmo assim?`)) {
            return await importar(pasta, obra, true);
          }
          return;
        }
        throw new Error(data.error || "Falha ao importar");
      }
      setResultados((prev) => ({ ...prev, [obra]: data }));
      setObrasPorOp((p) => ({
        ...p,
        [pasta]: { obras: (p[pasta]?.obras || []).map((o) => o.obra === obra ? { ...o, revAtual: data.revisao, novidade: false } : o) },
      }));
      onImportado?.();
    } catch (e) { setErro(`${obra}: ${e.message}`); }
    finally { setImportando(null); }
  };

  const opsFiltradas = (ops || []).filter((o) => !busca || o.pasta.toLowerCase().includes(busca.toLowerCase()));
  const fmtR = (n) => `R${String(n).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !importando && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Cloud size={18} className="text-torg-blue" />
          <h3 className="font-semibold text-torg-dark">Buscar lista (LPC) do SharePoint</h3>
          <button onClick={listar} disabled={carregandoOps} className="ml-auto text-xs text-torg-blue hover:underline disabled:opacity-50 inline-flex items-center gap-1">
            <RefreshCw size={12} className={carregandoOps ? "animate-spin" : ""} /> Atualizar
          </button>
          <button onClick={onClose} disabled={!!importando} className="text-torg-gray hover:text-torg-dark ml-2"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-50">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar OP… (as finalizadas não aparecem)"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <p className="text-[11px] text-torg-gray mt-1.5">Escolha a OP que quer subir — abra para ver as listas (por obra/revisão) e importe só o que precisar.</p>
        </div>

        <div className="px-5 py-3 overflow-y-auto">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
            </div>
          )}

          {browser ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => { setBrowser(null); setNav(null); }} className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1">
                  <ArrowLeft size={13} /> Voltar às OPs
                </button>
                <span className="text-sm font-semibold text-torg-dark truncate">{browser.opPasta}</span>
              </div>
              <p className="text-[11px] text-torg-gray mb-2">
                Navegue até a pasta que contém os LPC desta OP e clique em <strong>Usar esta pasta</strong>. Fica salvo — os próximos imports vão direto nela.
              </p>
              {/* caminho atual + subir */}
              <div className="flex items-center gap-2 mb-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <Cloud size={13} className="text-torg-gray shrink-0" />
                <span className="text-[11px] font-mono text-torg-gray flex-1 truncate" title={nav?.atual}>
                  …/{(nav?.atual || browser.raiz).split("/").slice(-1)[0]}
                </span>
                {nav?.atual && nav.atual !== browser.raiz && (
                  <button onClick={() => navegar(nav.atual.split("/").slice(0, -1).join("/"))}
                    className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-0.5"><ChevronUp size={12} /> subir</button>
                )}
              </div>

              {nav?.carregando ? (
                <div className="py-8 text-center"><Loader2 size={20} className="animate-spin text-torg-blue mx-auto" /></div>
              ) : nav?.erro ? (
                <p className="text-xs text-red-600 py-3">{nav.erro}</p>
              ) : (
                <div className="space-y-1">
                  {(nav?.pastas || []).map((sub) => (
                    <button key={sub.path} onClick={() => navegar(sub.path)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-gray-50 text-left">
                      <Folder size={14} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-torg-dark truncate">{sub.nome}</span>
                      <ChevronDown size={13} className="text-torg-gray ml-auto -rotate-90 shrink-0" />
                    </button>
                  ))}
                  {(nav?.pastas || []).length === 0 && <p className="text-[11px] text-torg-gray px-2 py-1">Sem subpastas aqui.</p>}

                  {/* LPC encontrados nesta pasta */}
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {(nav?.lpcs || []).length > 0 ? (
                      <>
                        <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">{nav.lpcs.length} lista(s) LPC aqui</p>
                        <div className="flex flex-wrap gap-1">
                          {nav.lpcs.slice(0, 12).map((l) => (
                            <span key={l.obra} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{l.obra} {fmtR(l.rev)}</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-torg-gray">Nenhum LPC diretamente nesta pasta — desça até a pasta certa.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => { setBrowser(null); setNav(null); }} className="px-3 py-1.5 text-xs text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button onClick={salvarPastaAtual} disabled={salvando || !(nav?.lpcs || []).length}
                  title={!(nav?.lpcs || []).length ? "Esta pasta não tem LPC — navegue até a pasta com as listas" : ""}
                  className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50">
                  {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Usar esta pasta
                </button>
              </div>
            </div>
          ) : carregandoOps && !ops ? (
            <div className="py-10 text-center"><Loader2 size={22} className="animate-spin text-torg-blue mx-auto" /><p className="text-sm text-torg-gray mt-2">Listando as OPs…</p></div>
          ) : opsFiltradas.length === 0 ? (
            <div className="py-10 text-center"><Cloud size={30} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-torg-gray">Nenhuma OP encontrada.</p></div>
          ) : (
            <div className="space-y-1.5">
              {opsFiltradas.map((op) => {
                const det = obrasPorOp[op.pasta];
                const isOpen = aberta === op.pasta;
                return (
                  <div key={op.pasta} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button onClick={() => abrirOp(op.pasta)} className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50 text-left">
                      {isOpen ? <ChevronUp size={15} className="text-torg-gray shrink-0" /> : <ChevronDown size={15} className="text-torg-gray shrink-0" />}
                      <span className="text-sm font-medium text-torg-dark truncate">{op.pasta}</span>
                      {det?.carregando && <Loader2 size={13} className="animate-spin text-torg-blue ml-auto shrink-0" />}
                      {det?.obras && <span className="ml-auto text-[11px] text-torg-gray shrink-0">{det.obras.length} lista(s)</span>}
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-2">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                          <span className="text-[11px] text-torg-gray flex-1 truncate">
                            {(det?.pastaSalva ?? op.pastaSalva)
                              ? <>Pasta salva: <span className="font-mono text-torg-dark" title={det?.pastaSalva ?? op.pastaSalva}>…/{(det?.pastaSalva ?? op.pastaSalva).split("/").slice(-1)[0]}</span></>
                              : "Sem pasta salva — usando a busca automática."}
                          </span>
                          <button onClick={() => abrirBrowser(op.pasta)}
                            className="text-[11px] text-torg-blue border border-torg-blue-200 rounded-md px-2 py-1 font-medium hover:bg-torg-blue-50 inline-flex items-center gap-1">
                            <FolderSearch size={12} /> Procurar pasta
                          </button>
                        </div>
                        {det?.carregando ? (
                          <p className="text-xs text-torg-gray py-2 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Buscando os LPC…</p>
                        ) : det?.erro ? (
                          <p className="text-xs text-red-600 py-2">{det.erro}</p>
                        ) : !det?.obras || det.obras.length === 0 ? (
                          <p className="text-xs text-torg-gray py-2">Nenhum LPC nesta OP.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {det.obras.map((o) => {
                              const r = resultados[o.obra];
                              const imp = importando === `${op.pasta}|${o.obra}`;
                              return (
                                <div key={o.obra} className="bg-white border border-gray-100 rounded-md px-3 py-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-torg-dark text-sm">{o.obra}</span>
                                    <span className="text-[11px] text-torg-gray font-mono truncate max-w-[180px]" title={o.arquivo}>{o.arquivo}</span>
                                    <span className="text-xs text-torg-gray">
                                      {o.revAtual == null ? <>nova · <strong className="text-torg-dark">{fmtR(o.revDisponivel)}</strong></>
                                        : <>{fmtR(o.revAtual)} → <strong className={o.novidade ? "text-emerald-600" : "text-torg-dark"}>{fmtR(o.revDisponivel)}</strong></>}
                                    </span>
                                    {o.novidade && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">nova</span>}
                                    <button onClick={() => importar(op.pasta, o.obra)} disabled={!!importando}
                                      className="ml-auto px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                                      {imp ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                                      {o.revAtual == null ? "Importar" : o.novidade ? "Atualizar" : "Reimportar"}
                                    </button>
                                  </div>
                                  {r && (
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-50 text-[11px]">
                                      <div className="flex flex-wrap gap-x-3 text-torg-gray">
                                        <span className="text-emerald-700">+{r.adicionadas?.length || 0}</span>
                                        <span className="text-red-600">−{r.removidas?.length || 0}</span>
                                        <span>{r.mantidas || 0} mantidas</span>
                                        <span className="text-torg-dark font-medium">{r.totalNovo} marcas</span>
                                        {r.opEncontrada
                                          ? <span className="text-emerald-700 font-medium">↳ OP {r.opCadastrada}</span>
                                          : <span className="text-amber-600">OP não cadastrada no comercial</span>}
                                      </div>
                                      {r.conflitos?.length > 0 && (
                                        <div className="mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-amber-800">
                                          <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} /> {r.conflitos.length} conflito(s) — peça já em produção (mantida, decida):</p>
                                          <ul className="mt-0.5">
                                            {r.conflitos.slice(0, 6).map((c) => (
                                              <li key={c.marca} className="font-mono">{c.marca} — {c.tipo === "REMOVIDA_PRODUZIDA" ? `saiu da revisão, já em ${c.status}` : `qtd ${c.de}→${c.para}, já em ${c.status}`}</li>
                                            ))}
                                            {r.conflitos.length > 6 && <li className="text-amber-600">+{r.conflitos.length - 6} mais…</li>}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-torg-gray">
          <span>Importa mesclando: adiciona novas, remove as que saíram (só se não produzidas), mantém o resto. Conflitos ficam para você decidir.</span>
          <button onClick={onClose} disabled={!!importando} className="px-3 py-1.5 text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Fechar</button>
        </div>
      </div>
    </div>
  );
}
