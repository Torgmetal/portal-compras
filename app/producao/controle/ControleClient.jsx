"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  CalendarDays, Users, Clock, Target, Weight, Plus, Trash2, Check,
  ChevronLeft, ChevronRight, Save, Loader2, Search, X, ClipboardList,
  TrendingUp, AlertCircle, Upload, FileSpreadsheet, Download,
  Activity, ChevronDown as ChevronDownIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import { fmtOP } from "@/lib/utils";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const SETOR_LABELS = {
  CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição",
};
const SETOR_COLORS = {
  CORTE: "bg-red-100 text-red-700", MONTAGEM: "bg-blue-100 text-blue-700",
  SOLDA: "bg-orange-100 text-orange-700", ACABAMENTO: "bg-purple-100 text-purple-700",
  JATO: "bg-cyan-100 text-cyan-700", PINTURA: "bg-green-100 text-green-700",
  EXPEDICAO: "bg-teal-100 text-teal-700",
};

function fmtData(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function fmtDataFull(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function hoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getWeekDays(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const days = [];
  for (let i = 0; i < 6; i++) { // seg a sab
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    days.push(dd.toISOString().slice(0, 10));
  }
  return days;
}

export default function ControleClient({ ops, pecasDisponiveis: pecasInicial, userRole, isAdmin }) {
  const [dataSelecionada, setDataSelecionada] = useState(hoje());
  const [setorSelecionado, setSetorSelecionado] = useState("CORTE");
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPecaModal, setShowPecaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importando, setImportando] = useState(false);
  const [buscaPeca, setBuscaPeca] = useState("");
  const [opFiltro, setOpFiltro] = useState("");
  const [filtroChecklist, setFiltroChecklist] = useState("todas");
  const [pecasDisponiveis, setPecasDisponiveis] = useState(pecasInicial);
  const fileInputRef = useRef(null);

  // Syneco — apontamentos do dia
  const [synecoDia, setSynecoDia] = useState(null);
  const [synecoLoading, setSynecoLoading] = useState(false);
  const [synecoExpandido, setSynecoExpandido] = useState(false);

  // PRODUCAO pode checar peças (não só admin)
  const podeChecar = isAdmin || userRole === "PRODUCAO";

  // Form state
  const [form, setForm] = useState({
    pesoMetaKg: 0,
    pesoRealizadoKg: 0,
    produtividadeEstimada: null,
    qtdPessoas: 0,
    horasNormais: 8.8,
    horasExtrasProjetadas: 0,
    horasExtrasRealizadas: null,
    observacao: "",
  });

  const weekDays = useMemo(() => getWeekDays(dataSelecionada), [dataSelecionada]);

  // Carrega registros da semana
  const fetchSemana = useCallback(async () => {
    setLoading(true);
    try {
      const de = weekDays[0];
      const ate = weekDays[weekDays.length - 1];
      const res = await fetch(`/api/producao/controle?de=${de}&ate=${ate}`);
      const data = await res.json();
      setRegistros(data.registros || []);
    } catch (e) {
      console.error("Erro ao carregar:", e);
    } finally {
      setLoading(false);
    }
  }, [weekDays]);

  useEffect(() => { fetchSemana(); }, [fetchSemana]);

  // Carregar apontamentos Syneco do dia selecionado
  useEffect(() => {
    let cancel = false;
    const fetchSyneco = async () => {
      setSynecoLoading(true);
      try {
        const res = await fetch(`/api/producao/controle/apontamentos-dia?data=${dataSelecionada}`);
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (!cancel) setSynecoDia(d);
      } catch {
        if (!cancel) setSynecoDia(null);
      } finally {
        if (!cancel) setSynecoLoading(false);
      }
    };
    fetchSyneco();
    return () => { cancel = true; };
  }, [dataSelecionada]);

  // Registro do dia+setor selecionado
  const registroAtual = useMemo(() => {
    return registros.find(
      (r) => r.data?.slice(0, 10) === dataSelecionada && r.setor === setorSelecionado
    );
  }, [registros, dataSelecionada, setorSelecionado]);

  // Sync form quando muda registro
  useEffect(() => {
    if (registroAtual) {
      setForm({
        pesoMetaKg: registroAtual.pesoMetaKg || 0,
        pesoRealizadoKg: registroAtual.pesoRealizadoKg || 0,
        produtividadeEstimada: registroAtual.produtividadeEstimada,
        qtdPessoas: registroAtual.qtdPessoas || 0,
        horasNormais: registroAtual.horasNormais || 8.8,
        horasExtrasProjetadas: registroAtual.horasExtrasProjetadas || 0,
        horasExtrasRealizadas: registroAtual.horasExtrasRealizadas,
        observacao: registroAtual.observacao || "",
      });
    } else {
      setForm({
        pesoMetaKg: 0, pesoRealizadoKg: 0, produtividadeEstimada: null,
        qtdPessoas: 0, horasNormais: 8.8, horasExtrasProjetadas: 0,
        horasExtrasRealizadas: null, observacao: "",
      });
    }
  }, [registroAtual]);

  // Salvar registro diário
  const salvar = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/producao/controle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataSelecionada, setor: setorSelecionado, ...form }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Erro ao salvar");
        return false;
      }
      await fetchSemana();
      return true;
    } catch (e) {
      alert("Erro: " + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Adicionar peças ao planejamento
  const adicionarPecas = async (pecaIds) => {
    if (!registroAtual) {
      // Cria registro primeiro
      await salvar();
      // Espera um tick pro estado atualizar
      setTimeout(() => adicionarPecasAoRegistro(pecaIds), 500);
      return;
    }
    await adicionarPecasAoRegistro(pecaIds);
  };

  const adicionarPecasAoRegistro = async (pecaIds) => {
    // Recarrega pra pegar o id atualizado
    const de = weekDays[0];
    const ate = weekDays[weekDays.length - 1];
    const resGet = await fetch(`/api/producao/controle?de=${de}&ate=${ate}`);
    const dataGet = await resGet.json();
    const reg = (dataGet.registros || []).find(
      (r) => r.data?.slice(0, 10) === dataSelecionada && r.setor === setorSelecionado
    );
    if (!reg) { alert("Salve o registro do dia antes de adicionar peças"); return; }

    const res = await fetch("/api/producao/controle/pecas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producaoDiariaId: reg.id, pecaIds, action: "add" }),
    });
    if (res.ok) {
      await fetchSemana();
      setShowPecaModal(false);
    }
  };

  const removerPeca = async (pecaPlanejamentoId) => {
    await fetch("/api/producao/controle/pecas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pecaPlanejamentoId, action: "remove" }),
    });
    await fetchSemana();
  };

  const toggleConcluida = async (pecaPlanejamentoId) => {
    await fetch("/api/producao/controle/pecas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pecaPlanejamentoId, action: "toggle-concluida" }),
    });
    await fetchSemana();
  };

  // Palavras-chave para detectar a linha real de cabeçalho
  const HEADER_KEYWORDS = [
    "marca", "peca", "peça", "codigo", "código", "cod", "tag",
    "descricao", "descrição", "desc", "nome", "item", "conjunto", "tipo",
    "op", "ordem",
    "qte", "qtd", "quantidade", "quant", "qt", "un", "unid",
    "peso", "kg",
    "preço", "preco", "valor", "r$",
  ];

  // Import planilha Excel
  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Lê como array de arrays para encontrar o header real
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (allRows.length < 2) { alert("Planilha vazia"); return; }

        // Encontra a linha de cabeçalho — procura a primeira linha que contém
        // pelo menos 2 palavras-chave conhecidas
        let headerIdx = 0;
        for (let i = 0; i < Math.min(allRows.length, 20); i++) {
          const row = allRows[i];
          if (!Array.isArray(row) || row.length === 0) continue;
          const hits = row.filter((cell) => {
            if (cell == null || String(cell).trim() === "") return false;
            const val = String(cell).toLowerCase().trim();
            return HEADER_KEYWORDS.some((kw) => val.includes(kw));
          }).length;
          if (hits >= 2) { headerIdx = i; break; }
        }

        // Monta JSON usando a linha detectada como header
        const headers = allRows[headerIdx].map((h, idx) => {
          const val = String(h || "").trim();
          return val || `_COL_${idx}`;
        });
        const dataRows = [];
        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const raw = allRows[i];
          if (!Array.isArray(raw) || raw.every((c) => c === "" || c == null)) continue;
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = raw[idx] ?? ""; });
          dataRows.push(obj);
        }
        if (dataRows.length === 0) { alert("Nenhuma linha de dados encontrada"); return; }

        // Detecta colunas por keyword
        const cols = headers.filter((h) => !h.startsWith("_COL_"));
        const findCol = (nomes) => cols.find((c) => nomes.some((n) => c.toLowerCase().includes(n.toLowerCase())));
        const colMarca = findCol(["marca", "peca", "peça", "codigo", "código", "cod", "tag"]);
        const colDesc = findCol(["descricao", "descrição", "desc", "nome", "item", "conjunto", "tipo"]);
        const colOP = findCol(["op", "ordem", "n° op", "nº op", "numero op", "número op"]);
        const colQte = findCol(["qte", "qtd", "quantidade", "quant", "qt", "un", "unid"]);
        const colPesoUnit = findCol(["peso unit", "peso unitario", "peso unitário", "pesounit", "kg/un", "kg unit"]);
        const colPesoTotal = findCol(["peso total", "pesototal", "peso (kg)", "kg total", "peso"]);
        const colPrecoUnit = findCol(["preço unit", "preco unit", "preco_unit", "valor unit", "R$/un", "unitario", "unitário", "valor un"]);
        const colPrecoTotal = findCol(["preço total", "preco total", "preco_total", "valor total", "R$ total", "total r$"]);

        setImportData({
          rows: dataRows,
          colMarca: colMarca || cols[0] || headers[0],
          colDesc: colDesc || "",
          colOP: colOP || "",
          colQte: colQte || "",
          colPesoUnit: colPesoUnit || "",
          colPesoTotal: colPesoTotal || "",
          colPrecoUnit: colPrecoUnit || "",
          colPrecoTotal: colPrecoTotal || "",
          fileName: file.name,
          headerRow: headerIdx + 1, // pra mostrar ao usuário (1-indexed)
        });
        setShowImportModal(true);
      } catch (err) {
        alert("Erro ao ler planilha: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Recarrega peças disponíveis (após importação)
  const recarregarPecas = async () => {
    try {
      const res = await fetch("/api/producao/controle/pecas-disponiveis");
      if (res.ok) {
        const data = await res.json();
        setPecasDisponiveis(data.pecas || []);
      }
    } catch { /* silencioso */ }
  };

  const executarImport = async () => {
    if (!importData) return;
    setImportando(true);
    try {
      // Monta rows limpos — só os campos mapeados
      const { colMarca, colDesc, colOP, colQte, colPesoUnit, colPesoTotal, colPrecoUnit, colPrecoTotal } = importData;
      const rowsLimpos = importData.rows.map((row) => ({
        marca: String(row[colMarca] ?? ""),
        desc: colDesc ? String(row[colDesc] ?? "") : "",
        op: colOP ? String(row[colOP] ?? "") : "",
        qte: colQte ? row[colQte] : "",
        pesoUnit: colPesoUnit ? row[colPesoUnit] : "",
        pesoTotal: colPesoTotal ? row[colPesoTotal] : "",
        precoUnit: colPrecoUnit ? row[colPrecoUnit] : "",
        precoTotal: colPrecoTotal ? row[colPrecoTotal] : "",
      }));

      // Envia para API — só cadastra peças, sem vincular a dia
      const res = await fetch("/api/producao/controle/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsLimpos, setor: setorSelecionado }),
      });

      const text = await res.text();
      let result;
      try { result = JSON.parse(text); } catch {
        alert("Resposta inválida do servidor (status " + res.status + ")");
        return;
      }
      if (!res.ok) { alert(result.error || "Erro ao importar"); return; }

      alert(`Importação concluída!\n\n${result.criadas} peças novas cadastradas\n${result.jaExistiam} já existiam no sistema\n\nUse "Adicionar peças" para selecionar as peças de cada dia.`);
      setShowImportModal(false);
      setImportData(null);
      // Recarrega a lista de peças disponíveis
      await recarregarPecas();
    } catch (e) {
      console.error("Erro na importação:", e);
      alert("Erro: " + (e?.message || "Falha inesperada"));
    } finally {
      setImportando(false);
    }
  };

  // Download planilha modelo para importação
  const downloadModelo = () => {
    const wsData = [
      ["MARCA", "DESCRIÇÃO", "OP", "QTE", "PESO UNIT (KG)", "PESO TOTAL (KG)", "PREÇO UNIT (R$)", "PREÇO TOTAL (R$)"],
      ["MK-001", "Viga principal 6m", "OP-2025-001", 4, 30.125, 120.5, 350.00, 1400.00],
      ["MK-002", "Placa base 300x300", "OP-2025-001", 8, 5.65, 45.2, 125.50, 1004.00],
      ["MK-003", "Tirante diagonal L=2.5m", "OP-2025-002", 12, 3.0, 36.0, 89.90, 1078.80],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 18 }, // MARCA
      { wch: 32 }, // DESCRIÇÃO
      { wch: 18 }, // OP
      { wch: 8 },  // QTE
      { wch: 16 }, // PESO UNIT
      { wch: 16 }, // PESO TOTAL
      { wch: 16 }, // PREÇO UNIT
      { wch: 16 }, // PREÇO TOTAL
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_importacao_producao.xlsx");
  };

  // Peças planejadas do dia/setor atual
  const pecasPlanejadas = registroAtual?.pecasPlanejadas || [];
  const pecasPlanejadasIds = new Set(pecasPlanejadas.map((p) => p.pecaConjuntoId));

  // Peças filtradas no modal
  const pecasFiltradas = useMemo(() => {
    return pecasDisponiveis.filter((p) => {
      if (pecasPlanejadasIds.has(p.id)) return false;
      if (opFiltro && p.opNumero !== opFiltro) return false;
      if (buscaPeca) {
        const q = buscaPeca.toLowerCase();
        return (
          p.marca?.toLowerCase().includes(q) ||
          p.descricao?.toLowerCase().includes(q) ||
          p.opNumero?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [pecasDisponiveis, pecasPlanejadasIds, opFiltro, buscaPeca]);

  // KPIs da semana por setor
  const kpisSemana = useMemo(() => {
    const regSetor = registros.filter((r) => r.setor === setorSelecionado);
    const pesoMeta = regSetor.reduce((s, r) => s + (r.pesoMetaKg || 0), 0);
    const pesoReal = regSetor.reduce((s, r) => s + (r.pesoRealizadoKg || 0), 0);
    const totalPecas = regSetor.reduce((s, r) => s + (r.pecasPlanejadas?.length || 0), 0);
    const concluidas = regSetor.reduce(
      (s, r) => s + (r.pecasPlanejadas?.filter((p) => p.concluida).length || 0), 0
    );
    return { pesoMeta, pesoReal, totalPecas, concluidas, aderencia: pesoMeta > 0 ? (pesoReal / pesoMeta) * 100 : 0 };
  }, [registros, setorSelecionado]);

  // Capacidade estimada
  const capacidadeEstimada = form.produtividadeEstimada && form.qtdPessoas
    ? form.produtividadeEstimada * form.qtdPessoas * (form.horasNormais + form.horasExtrasProjetadas)
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <ClipboardList size={24} className="text-torg-blue" />
          Controle de Produção
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Planejamento diário por setor — metas, equipe, horas extras e peças a fabricar.
        </p>
      </div>

      {/* Seletor de setor */}
      <div className="flex gap-1.5 flex-wrap">
        {SETORES.map((s) => {
          const regCount = registros.filter((r) => r.setor === s).length;
          return (
            <button
              key={s}
              onClick={() => setSetorSelecionado(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                setorSelecionado === s
                  ? "bg-torg-blue text-white shadow-sm"
                  : "bg-white border border-gray-200 text-torg-gray hover:bg-gray-50"
              }`}
            >
              {SETOR_LABELS[s]}
              {regCount > 0 && (
                <span className={`ml-1 text-[10px] ${setorSelecionado === s ? "text-white/70" : "text-torg-blue"}`}>
                  ({regCount}d)
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Navegador de semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setDataSelecionada(addDays(dataSelecionada, -7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-torg-gray"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-torg-dark">{fmtDataFull(dataSelecionada)}</p>
            <p className="text-[10px] text-torg-gray mt-0.5">
              Semana de {fmtData(weekDays[0])} a {fmtData(weekDays[weekDays.length - 1])}
            </p>
          </div>
          <button
            onClick={() => setDataSelecionada(addDays(dataSelecionada, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-torg-gray"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {weekDays.map((d) => {
            const isHoje = d === hoje();
            const isSel = d === dataSelecionada;
            const reg = registros.find((r) => r.data?.slice(0, 10) === d && r.setor === setorSelecionado);
            const temDados = !!reg;
            const temPecas = (reg?.pecasPlanejadas?.length || 0) > 0;
            return (
              <button
                key={d}
                onClick={() => setDataSelecionada(d)}
                className={`py-2 px-1 rounded-lg text-center transition-all text-xs ${
                  isSel
                    ? "bg-torg-blue text-white shadow-sm ring-2 ring-torg-blue/30"
                    : isHoje
                    ? "bg-torg-blue-50 text-torg-blue border border-torg-blue-200"
                    : temDados
                    ? "bg-gray-50 text-torg-dark border border-gray-200"
                    : "bg-white text-torg-gray border border-gray-100 hover:bg-gray-50"
                }`}
              >
                <p className="font-medium">{fmtData(d).split(",")[0]}</p>
                <p className={`text-[10px] ${isSel ? "text-white/80" : "text-torg-gray"}`}>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                </p>
                {temDados && (
                  <div className="flex gap-0.5 justify-center mt-1">
                    {reg.pesoMetaKg > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? "bg-white/60" : "bg-torg-blue"}`} />}
                    {temPecas && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? "bg-white/60" : "bg-torg-orange"}`} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs da semana */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Meta semana", value: `${(kpisSemana.pesoMeta / 1000).toFixed(1)}t`, icon: Target, color: "text-torg-blue" },
          { label: "Realizado", value: `${(kpisSemana.pesoReal / 1000).toFixed(1)}t`, icon: Weight, color: kpisSemana.aderencia >= 80 ? "text-emerald-600" : "text-amber-600" },
          { label: "Peças plan.", value: kpisSemana.totalPecas, icon: ClipboardList, color: "text-torg-dark" },
          { label: "Concluídas", value: `${kpisSemana.concluidas}/${kpisSemana.totalPecas}`, icon: Check, color: "text-emerald-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
            <kpi.icon size={20} className={kpi.color} />
            <div>
              <p className="text-[10px] text-torg-gray uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-lg font-extrabold tabular-nums ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Apontamentos Syneco do dia */}
      {(() => {
        if (synecoLoading) return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-3 text-sm text-torg-gray">
            <Loader2 size={16} className="animate-spin" /> Carregando apontamentos Syneco...
          </div>
        );
        if (!synecoDia) return null;

        const setorData = synecoDia.resumoDia?.[setorSelecionado] || { totalKg: 0, totalUn: 0, count: 0 };
        const metaSetor = synecoDia.metas?.[setorSelecionado];
        const realizadoMes = synecoDia.realizadoMes?.[setorSelecionado] || { kg: 0, un: 0 };
        const metaMensal = metaSetor?.valorMensal || 0;
        const metaDiaria = metaMensal > 0 ? metaMensal / (synecoDia.diasUteis || 22) : 0;
        const pctDia = metaDiaria > 0 ? Math.min((setorData.totalKg / metaDiaria) * 100, 100) : 0;
        const pctMes = metaMensal > 0 ? Math.min((realizadoMes.kg / metaMensal) * 100, 100) : 0;

        // Apontamentos do dia filtrados pelo setor selecionado
        const apontSetor = (synecoDia.apontamentos || []).filter(
          (a) => a.setorNormalizado === setorSelecionado
        );

        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
                <Activity size={16} className="text-torg-orange" />
                Syneco — {SETOR_LABELS[setorSelecionado]} — {fmtData(dataSelecionada)}
              </h3>
              <span className="text-xs text-torg-gray">
                {setorData.count} apontamento{setorData.count !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Cards: meta diária vs realizado + acumulado mês */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {/* Realizado hoje */}
              <div className="border border-gray-100 rounded-lg p-3">
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Realizado hoje</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums">
                  {(setorData.totalKg / 1000).toFixed(2)}
                  <span className="text-sm font-normal text-torg-gray ml-1">t</span>
                </p>
                {metaDiaria > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-torg-gray mb-0.5">
                      <span>Meta dia: {(metaDiaria / 1000).toFixed(2)}t</span>
                      <span className={pctDia >= 80 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                        {pctDia.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pctDia >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(pctDia, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Acumulado mês */}
              <div className="border border-gray-100 rounded-lg p-3">
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Acumulado mês</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums">
                  {(realizadoMes.kg / 1000).toFixed(1)}
                  <span className="text-sm font-normal text-torg-gray ml-1">t</span>
                </p>
                {metaMensal > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-torg-gray mb-0.5">
                      <span>Meta mês: {(metaMensal / 1000).toFixed(1)}t</span>
                      <span className={pctMes >= 60 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                        {pctMes.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pctMes >= 60 ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(pctMes, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Unidades */}
              <div className="border border-gray-100 rounded-lg p-3">
                <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Peças hoje</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums">
                  {Math.round(setorData.totalUn)}
                  <span className="text-sm font-normal text-torg-gray ml-1">un</span>
                </p>
                <p className="text-xs text-torg-gray mt-1">
                  Mês: {Math.round(realizadoMes.un)} un
                </p>
              </div>
            </div>

            {/* Lista de apontamentos do dia */}
            {apontSetor.length > 0 && (
              <div>
                <button
                  onClick={() => setSynecoExpandido(!synecoExpandido)}
                  className="flex items-center gap-1 text-xs font-medium text-torg-blue hover:underline mb-2"
                >
                  <ChevronDownIcon size={14} className={`transition-transform ${synecoExpandido ? "rotate-180" : ""}`} />
                  {synecoExpandido ? "Ocultar detalhes" : `Ver ${apontSetor.length} apontamentos`}
                </button>

                {synecoExpandido && (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Hora</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Obra</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Item</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Operação</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Máquina</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Operador</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Peso (kg)</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Qtd</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {apontSetor.map((a) => (
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-torg-gray tabular-nums whitespace-nowrap">
                                {new Date(a.dataInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-3 py-1.5 font-mono font-medium text-torg-dark">{a.obra}</td>
                              <td className="px-3 py-1.5 text-torg-dark max-w-[200px] truncate" title={a.descricaoItem}>
                                {a.descricaoItem || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-torg-gray">{a.operacao || "—"}</td>
                              <td className="px-3 py-1.5 text-torg-gray">{a.maquina || "—"}</td>
                              <td className="px-3 py-1.5 text-torg-gray">{a.operador || "—"}</td>
                              <td className="px-3 py-1.5 text-right font-semibold text-torg-dark tabular-nums">
                                {(a.produzidoKg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">
                                {a.produzidoUn || 0}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  a.status === "Finalizado" ? "bg-emerald-100 text-emerald-700"
                                  : a.status === "Produzindo" ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-600"
                                }`}>
                                  {a.status || "—"}
                                </span>
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

            {apontSetor.length === 0 && setorData.count === 0 && (
              <p className="text-xs text-torg-gray text-center py-3">
                Nenhum apontamento do Syneco para {SETOR_LABELS[setorSelecionado]} neste dia.
              </p>
            )}
          </div>
        );
      })()}

      {/* Formulário do dia */}
      {isAdmin ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
              <CalendarDays size={16} className="text-torg-blue" />
              {SETOR_LABELS[setorSelecionado]} — {fmtData(dataSelecionada)}
              {registroAtual && <span className="text-[10px] text-emerald-600 font-normal ml-1">(salvo)</span>}
            </h3>
            <button
              onClick={salvar}
              disabled={saving}
              className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Target size={12} className="inline mr-1" />Peso meta (kg)
              </label>
              <input
                type="number"
                value={form.pesoMetaKg || ""}
                onChange={(e) => setForm({ ...form, pesoMetaKg: Number(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Weight size={12} className="inline mr-1" />Peso realizado (kg)
              </label>
              <input
                type="number"
                value={form.pesoRealizadoKg || ""}
                onChange={(e) => setForm({ ...form, pesoRealizadoKg: Number(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <TrendingUp size={12} className="inline mr-1" />Produtividade (kg/p/h)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.produtividadeEstimada ?? ""}
                onChange={(e) => setForm({ ...form, produtividadeEstimada: e.target.value ? Number(e.target.value) : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="ex: 12.5"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Users size={12} className="inline mr-1" />Qtd pessoas
              </label>
              <input
                type="number"
                value={form.qtdPessoas || ""}
                onChange={(e) => setForm({ ...form, qtdPessoas: Number(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Clock size={12} className="inline mr-1" />Horas normais
              </label>
              <input
                type="number"
                step="0.1"
                value={form.horasNormais || ""}
                onChange={(e) => setForm({ ...form, horasNormais: Number(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="8.8"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Clock size={12} className="inline mr-1" />HE projetadas
              </label>
              <input
                type="number"
                step="0.5"
                value={form.horasExtrasProjetadas || ""}
                onChange={(e) => setForm({ ...form, horasExtrasProjetadas: Number(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-torg-gray uppercase tracking-wide block mb-1">
                <Clock size={12} className="inline mr-1" />HE realizadas
              </label>
              <input
                type="number"
                step="0.5"
                value={form.horasExtrasRealizadas ?? ""}
                onChange={(e) => setForm({ ...form, horasExtrasRealizadas: e.target.value ? Number(e.target.value) : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                placeholder="—"
              />
            </div>
            {capacidadeEstimada && (
              <div className="flex items-end">
                <div className="bg-torg-blue-50 rounded-lg px-3 py-2 w-full">
                  <p className="text-[10px] text-torg-blue uppercase tracking-wide">Capacidade estimada</p>
                  <p className="text-lg font-extrabold text-torg-blue tabular-nums">
                    {capacidadeEstimada.toFixed(0)} kg
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Observação */}
          <div className="mt-3">
            <input
              type="text"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
              placeholder="Observação do dia (opcional)"
            />
          </div>
        </div>
      ) : (
        /* Visualização para não-admin */
        registroAtual && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-torg-dark mb-3">
              {SETOR_LABELS[setorSelecionado]} — {fmtData(dataSelecionada)}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><span className="text-torg-gray text-xs">Meta:</span> <span className="font-semibold">{registroAtual.pesoMetaKg} kg</span></div>
              <div><span className="text-torg-gray text-xs">Realizado:</span> <span className="font-semibold">{registroAtual.pesoRealizadoKg} kg</span></div>
              <div><span className="text-torg-gray text-xs">Pessoas:</span> <span className="font-semibold">{registroAtual.qtdPessoas}</span></div>
              <div><span className="text-torg-gray text-xs">HE:</span> <span className="font-semibold">{registroAtual.horasExtrasProjetadas}h</span></div>
            </div>
            {registroAtual.observacao && (
              <p className="text-xs text-torg-gray mt-2 italic">{registroAtual.observacao}</p>
            )}
          </div>
        )
      )}

      {/* Peças planejadas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-torg-dark">
                Peças do dia ({pecasPlanejadas.length})
              </h3>
              <p className="text-[10px] text-torg-gray mt-0.5">
                {podeChecar ? "Clique no checkbox para marcar peça produzida" : "Peças programadas para fabricação"}
              </p>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={downloadModelo}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-torg-gray text-xs font-medium rounded-lg hover:bg-gray-50 hover:text-torg-dark inline-flex items-center gap-1"
                  title="Baixar planilha modelo para importação"
                >
                  <Download size={14} /> Modelo
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1"
                >
                  <Upload size={14} /> Importar planilha
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileImport} className="hidden" />
                <button
                  onClick={() => {
                    if (!registroAtual) { salvar().then(() => setShowPecaModal(true)); }
                    else { setShowPecaModal(true); }
                  }}
                  className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Adicionar peças
                </button>
              </div>
            )}
          </div>

          {/* Barra de progresso */}
          {pecasPlanejadas.length > 0 && (() => {
            const total = pecasPlanejadas.length;
            const done = pecasPlanejadas.filter((p) => p.concluida).length;
            const pct = total > 0 ? (done / total) * 100 : 0;
            return (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-torg-gray">Progresso do dia</span>
                  <span className={`font-semibold tabular-nums ${pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-torg-blue" : "text-torg-gray"}`}>
                    {done}/{total} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-torg-blue" : "bg-amber-400"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Filtro rápido */}
          {pecasPlanejadas.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {[
                { key: "todas", label: "Todas" },
                { key: "pendentes", label: `Pendentes (${pecasPlanejadas.filter((p) => !p.concluida).length})` },
                { key: "concluidas", label: `Concluídas (${pecasPlanejadas.filter((p) => p.concluida).length})` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFiltroChecklist(f.key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    filtroChecklist === f.key
                      ? "bg-torg-blue text-white"
                      : "bg-gray-100 text-torg-gray hover:bg-gray-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {pecasPlanejadas.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-torg-gray text-sm">Nenhuma peça planejada para este dia</p>
            {isAdmin && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-torg-gray">Importe uma planilha ou adicione peças manualmente</p>
                <button onClick={downloadModelo} className="text-torg-blue hover:underline text-xs inline-flex items-center gap-1">
                  <Download size={12} /> Baixar planilha modelo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qte</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">R$ Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">R$ Total</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  {isAdmin && <th className="px-4 py-2 w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pecasPlanejadas
                  .filter((pp) => {
                    if (filtroChecklist === "pendentes") return !pp.concluida;
                    if (filtroChecklist === "concluidas") return pp.concluida;
                    return true;
                  })
                  .map((pp) => {
                  const peca = pp.pecaConjunto;
                  return (
                    <tr
                      key={pp.id}
                      className={`transition-colors ${pp.concluida ? "bg-emerald-50/30" : "hover:bg-gray-50"} ${podeChecar ? "cursor-pointer" : ""}`}
                      onClick={podeChecar ? () => toggleConcluida(pp.id) : undefined}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => podeChecar && toggleConcluida(pp.id)}
                          disabled={!podeChecar}
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            pp.concluida
                              ? "bg-emerald-500 border-emerald-500 text-white scale-110"
                              : podeChecar
                              ? "border-gray-300 hover:border-torg-blue hover:bg-torg-blue-50"
                              : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          {pp.concluida && <Check size={14} strokeWidth={3} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-torg-blue">{fmtOP(peca?.opNumero)}</td>
                      <td className={`px-4 py-2.5 text-xs font-mono font-semibold ${pp.concluida ? "text-torg-gray line-through" : "text-torg-dark"}`}>{peca?.marca}</td>
                      <td className={`px-4 py-2.5 text-xs ${pp.concluida ? "text-torg-gray/60 line-through" : "text-torg-gray"}`}>{peca?.descricao || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">{peca?.qte}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {peca?.pesoUnitKg ? peca.pesoUnitKg.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium">
                        {peca?.pesoTotalKg?.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {peca?.precoUnitario ? peca.precoUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium">
                        {peca?.precoTotal ? peca.precoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          pp.concluida ? "bg-emerald-100 text-emerald-700" : SETOR_COLORS[peca?.status] || "bg-gray-100 text-gray-600"
                        }`}>
                          {pp.concluida ? "Concluída" : peca?.status || "—"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => removerPeca(pp.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
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

        {/* Resumo peso das peças */}
        {pecasPlanejadas.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs">
            <span className="text-torg-gray">
              {pecasPlanejadas.filter((p) => p.concluida).length}/{pecasPlanejadas.length} concluídas
            </span>
            <div className="flex gap-4 text-torg-dark font-semibold tabular-nums">
              <span>Peso: {pecasPlanejadas.reduce((s, p) => s + (p.pecaConjunto?.pesoTotalKg || 0), 0).toFixed(1)} kg</span>
              {pecasPlanejadas.some((p) => p.pecaConjunto?.precoTotal > 0) && (
                <span>Valor: {pecasPlanejadas.reduce((s, p) => s + (p.pecaConjunto?.precoTotal || 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de seleção de peças */}
      {showPecaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPecaModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-torg-dark">Selecionar peças para {fmtData(dataSelecionada)}</h3>
              <button onClick={() => setShowPecaModal(false)} className="text-torg-gray hover:text-torg-dark">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100 flex gap-3">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={buscaPeca}
                  onChange={(e) => setBuscaPeca(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
                  placeholder="Buscar por marca, descrição..."
                  autoFocus
                />
              </div>
              <select
                value={opFiltro}
                onChange={(e) => setOpFiltro(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[120px]"
              >
                <option value="">Todas OPs</option>
                {ops.map((op) => (
                  <option key={op.id} value={op.numero}>{fmtOP(op.numero)} — {op.cliente}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto">
              {pecasFiltradas.length === 0 ? (
                <div className="p-8 text-center text-torg-gray">
                  <AlertCircle size={32} className="mx-auto text-gray-300 mb-2" />
                  <p>Nenhuma peça encontrada</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pecasFiltradas.slice(0, 100).map((p) => (
                      <tr key={p.id} className="hover:bg-torg-blue-50/30 cursor-pointer" onClick={() => adicionarPecas([p.id])}>
                        <td className="px-4 py-2 text-xs font-mono text-torg-blue">{fmtOP(p.opNumero)}</td>
                        <td className="px-4 py-2 text-xs font-mono font-semibold">{p.marca}</td>
                        <td className="px-4 py-2 text-xs text-torg-gray">{p.descricao || "—"}</td>
                        <td className="px-4 py-2 text-right text-xs tabular-nums">{p.pesoTotalKg?.toFixed(1)} kg</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SETOR_COLORS[p.status] || "bg-gray-100 text-gray-600"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Plus size={14} className="text-torg-blue" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pecasFiltradas.length > 100 && (
                <p className="text-center text-xs text-torg-gray py-3">
                  Mostrando 100 de {pecasFiltradas.length} — refine a busca
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de importação de planilha */}
      {showImportModal && importData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowImportModal(false); setImportData(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
                <FileSpreadsheet size={20} className="text-torg-blue" />
                Importar planilha — {importData.fileName}
              </h3>
              <button onClick={() => { setShowImportModal(false); setImportData(null); }} className="text-torg-gray hover:text-torg-dark">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs text-torg-gray mb-2">
                {importData.rows.length} linhas encontradas{importData.headerRow > 1 ? ` (cabeçalho detectado na linha ${importData.headerRow})` : ""}. Confirme o mapeamento das colunas:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { key: "colMarca", label: "Marca/Código" },
                  { key: "colDesc", label: "Descrição" },
                  { key: "colOP", label: "OP" },
                  { key: "colQte", label: "Quantidade" },
                  { key: "colPesoUnit", label: "Peso Unit (kg)" },
                  { key: "colPesoTotal", label: "Peso Total (kg)" },
                  { key: "colPrecoUnit", label: "Preço Unit (R$)" },
                  { key: "colPrecoTotal", label: "Preço Total (R$)" },
                ].map((col) => (
                  <div key={col.key}>
                    <label className="text-[10px] text-torg-gray uppercase block mb-0.5">{col.label}</label>
                    <select
                      value={importData[col.key]}
                      onChange={(e) => setImportData({ ...importData, [col.key]: e.target.value })}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                    >
                      <option value="">— não mapear —</option>
                      {Object.keys(importData.rows[0]).filter((c) => !c.startsWith("_COL_")).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">#</th>
                    {importData.colMarca && <th className="px-3 py-1.5 text-left font-medium text-gray-500">Marca</th>}
                    {importData.colDesc && <th className="px-3 py-1.5 text-left font-medium text-gray-500">Descrição</th>}
                    {importData.colOP && <th className="px-3 py-1.5 text-left font-medium text-gray-500">OP</th>}
                    {importData.colQte && <th className="px-3 py-1.5 text-right font-medium text-gray-500">Qte</th>}
                    {importData.colPesoUnit && <th className="px-3 py-1.5 text-right font-medium text-gray-500">Peso Unit</th>}
                    {importData.colPesoTotal && <th className="px-3 py-1.5 text-right font-medium text-gray-500">Peso Total</th>}
                    {importData.colPrecoUnit && <th className="px-3 py-1.5 text-right font-medium text-gray-500">R$ Unit</th>}
                    {importData.colPrecoTotal && <th className="px-3 py-1.5 text-right font-medium text-gray-500">R$ Total</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importData.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      {importData.colMarca && <td className="px-3 py-1.5 font-mono font-semibold">{row[importData.colMarca]}</td>}
                      {importData.colDesc && <td className="px-3 py-1.5 text-torg-gray">{row[importData.colDesc]}</td>}
                      {importData.colOP && <td className="px-3 py-1.5 font-mono text-torg-blue">{row[importData.colOP]}</td>}
                      {importData.colQte && <td className="px-3 py-1.5 text-right tabular-nums">{row[importData.colQte]}</td>}
                      {importData.colPesoUnit && <td className="px-3 py-1.5 text-right tabular-nums">{row[importData.colPesoUnit]}</td>}
                      {importData.colPesoTotal && <td className="px-3 py-1.5 text-right tabular-nums">{row[importData.colPesoTotal]}</td>}
                      {importData.colPrecoUnit && <td className="px-3 py-1.5 text-right tabular-nums">{row[importData.colPrecoUnit]}</td>}
                      {importData.colPrecoTotal && <td className="px-3 py-1.5 text-right tabular-nums">{row[importData.colPrecoTotal]}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {importData.rows.length > 50 && (
                <p className="text-center text-xs text-torg-gray py-2">Mostrando 50 de {importData.rows.length} linhas</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <div className="text-xs text-torg-gray">
                <p>As peças serão cadastradas no sistema. Use <strong>"Adicionar peças"</strong> para selecionar quais vão em cada dia.</p>
                <button onClick={downloadModelo} className="text-torg-blue hover:underline mt-1 inline-flex items-center gap-1">
                  <Download size={12} /> Baixar planilha modelo
                </button>
              </div>
              <button
                onClick={executarImport}
                disabled={importando || !importData.colMarca}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importando ? "Cadastrando..." : `Cadastrar ${importData.rows.length} peças`}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-torg-gray border border-gray-200">
          <Loader2 size={14} className="animate-spin" /> Carregando...
        </div>
      )}
    </div>
  );
}
