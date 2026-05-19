"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Activity, Plus, Loader2, AlertCircle, X, Upload,
  Package, Pencil, Trash2, FileSpreadsheet, CheckCircle2, FileText,
  Cloud, RefreshCw, XCircle, Calendar, ChevronDown, ChevronUp, TrendingUp,
} from "lucide-react";
import { fmtSemana, isoWeekString } from "@/lib/semana";

// Periodos pre-definidos para o seletor (em dias relativos a hoje)
const PERIODOS = [
  { id: "ytd",   label: "Ano (YTD)",      desc: "1 jan ate hoje" },
  { id: "30",    label: "Últimos 30 dias", desc: "" },
  { id: "90",    label: "Últimos 90 dias", desc: "" },
  { id: "mes",   label: "Mês atual",       desc: "" },
  { id: "anterior", label: "Mês anterior", desc: "" },
  { id: "tudo",  label: "Tudo",            desc: "Sem filtro de data" },
];

function calcularRangePeriodo(periodoId) {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  let inicio;
  switch (periodoId) {
    case "ytd":
      inicio = new Date(hoje.getFullYear(), 0, 1);
      break;
    case "30":
      inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 30);
      break;
    case "90":
      inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 90);
      break;
    case "mes":
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      break;
    case "anterior": {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999);
      return { inicio, fim };
    }
    case "tudo":
    default:
      return { inicio: new Date(2020, 0, 1), fim: hoje };
  }
  return { inicio, fim: hoje };
}

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const diaSemana = (d) => {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return dias[new Date(d).getDay()];
};

const SETORES_ORDEM = ["Corte", "Montagem", "Solda", "Acabamento", "Jato", "Pintura", "Expedicao"];
const SETOR_LABEL = {
  Corte: "Corte",
  Montagem: "Montagem",
  Solda: "Solda",
  Acabamento: "Acabamento",
  Jato: "Jato",
  Pintura: "Pintura",
  Expedicao: "Expedição",
  __manual__: "Lançamentos manuais",
};

export default function ProducaoClient({ ops, semanas, semanaAtual, producoes }) {
  const router = useRouter();
  const [modalProd, setModalProd] = useState(null);
  const [modalImport, setModalImport] = useState(false);
  // Setor selecionado pra filtrar exibicao. Default: Expedicao.
  const [setorFiltro, setSetorFiltro] = useState("Expedicao");
  // Periodo selecionado. Default: YTD (ano corrente).
  const [periodo, setPeriodo] = useState("ytd");
  const rangePeriodo = useMemo(() => calcularRangePeriodo(periodo), [periodo]);

  // Identifica setores que tem dados no banco
  const setoresDisponiveis = useMemo(() => {
    const set = new Set();
    let temManual = false;
    for (const p of producoes) {
      if (p.setor) set.add(p.setor);
      else temManual = true;
    }
    const ordenados = SETORES_ORDEM.filter((s) => set.has(s));
    if (temManual) ordenados.push("__manual__");
    return ordenados;
  }, [producoes]);

  // Producoes filtradas pelo setor + periodo
  const producoesFiltradas = useMemo(() => {
    const ini = rangePeriodo.inicio.getTime();
    const fim = rangePeriodo.fim.getTime();
    let lista;
    if (setorFiltro === "__manual__") lista = producoes.filter((p) => !p.setor);
    else lista = producoes.filter((p) => p.setor === setorFiltro);
    return lista.filter((p) => {
      const t = new Date(p.data).getTime();
      return t >= ini && t <= fim;
    });
  }, [producoes, setorFiltro, rangePeriodo]);

  // Agrega producao por semana (filtrada por setor + periodo).
  // So' inclui semanas que tem overlap com o periodo selecionado.
  const producaoPorSemana = useMemo(() => {
    const ini = rangePeriodo.inicio.getTime();
    const fim = rangePeriodo.fim.getTime();
    const map = {};
    for (const s of semanas) {
      const sIni = new Date(s.dataInicio).getTime();
      const sFim = new Date(s.dataFim).getTime();
      if (sFim < ini || sIni > fim) continue; // semana fora do periodo
      map[s.semana] = { ...s, prevKg: 0, realKg: 0, items: [] };
    }
    for (const p of producoesFiltradas) {
      const k = p.semana;
      if (!map[k]) continue;
      map[k].prevKg += p.pesoPrevistoKg || 0;
      map[k].realKg += p.pesoRealizadoKg || 0;
      map[k].items.push(p);
    }
    return Object.values(map);
  }, [producoesFiltradas, semanas, rangePeriodo]);

  // Comparacao por setor (totais do periodo selecionado, com TODOS os setores)
  const comparacaoSetores = useMemo(() => {
    const ini = rangePeriodo.inicio.getTime();
    const fim = rangePeriodo.fim.getTime();
    const map = {};
    for (const s of SETORES_ORDEM) map[s] = { setor: s, prev: 0, real: 0, dias: 0 };
    for (const p of producoes) {
      if (!p.setor || !map[p.setor]) continue;
      const t = new Date(p.data).getTime();
      if (t < ini || t > fim) continue;
      map[p.setor].prev += p.pesoPrevistoKg || 0;
      map[p.setor].real += p.pesoRealizadoKg || 0;
      if (p.pesoRealizadoKg > 0) map[p.setor].dias++;
    }
    return Object.values(map);
  }, [producoes, rangePeriodo]);

  // KPIs do periodo selecionado
  const kpiPeriodo = useMemo(() => {
    const prevTotal = producoesFiltradas.reduce((s, p) => s + (p.pesoPrevistoKg || 0), 0);
    const realTotal = producoesFiltradas.reduce((s, p) => s + (p.pesoRealizadoKg || 0), 0);
    const dias = new Set(producoesFiltradas.filter(p => p.pesoRealizadoKg > 0).map(p => new Date(p.data).toISOString().slice(0, 10))).size;
    const aderencia = prevTotal > 0 ? (realTotal / prevTotal) * 100 : 0;
    const mediaDiariaReal = dias > 0 ? realTotal / dias : 0;
    return { prevTotal, realTotal, dias, aderencia, mediaDiariaReal };
  }, [producoesFiltradas]);

  // KPIs da semana atual
  const kpiSemana = producaoPorSemana.find((s) => s.semana === semanaAtual) || { prevKg: 0, realKg: 0 };
  const aderencia = kpiSemana.prevKg > 0 ? (kpiSemana.realKg / kpiSemana.prevKg) * 100 : 0;

  // KPIs do mes
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const noMesAtual = (data) => {
    const d = new Date(data);
    return d.getFullYear() === ano && d.getMonth() === mes;
  };
  const kpiMes = useMemo(() => {
    let prevKg = 0, realKg = 0;
    for (const p of producoesFiltradas) {
      if (noMesAtual(p.dataInicio)) {
        prevKg += p.pesoPrevistoKg || 0;
        realKg += p.pesoRealizadoKg || 0;
      }
    }
    return { prevKg, realKg };
  }, [producoesFiltradas]);

  const maxKg = Math.max(
    ...producaoPorSemana.map((s) => Math.max(s.prevKg, s.realKg)),
    1
  );

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Cabecalho compacto */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">
            Painel de Produção
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            PCP — peso previsto × realizado por setor da fábrica.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalImport(true)}
            className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> Importar planilha
          </button>
          <button
            onClick={() => setModalProd("novo")}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
          >
            <Plus size={14} /> Lançar produção
          </button>
        </div>
      </div>

      {/* Card de Sync com SharePoint (compact) */}
      <SharepointSyncCard />

      {/* Toolbar unificada: periodo + setor */}
      <Toolbar
        periodo={periodo} onChangePeriodo={setPeriodo} range={rangePeriodo}
        setorFiltro={setorFiltro} onChangeSetor={setSetorFiltro}
        setoresDisponiveis={setoresDisponiveis}
      />

      {/* Hero KPI: 1 card grande com tudo o que importa */}
      <HeroKpi kpi={kpiPeriodo} setor={setorFiltro} kpiSemana={kpiSemana} />

      {/* Funil dos setores (compacto) */}
      <FunilSetores
        comparacao={comparacaoSetores}
        setorFiltro={setorFiltro}
        onSelect={setSetorFiltro}
        setoresDisponiveis={setoresDisponiveis}
      />

      {/* Evolucao semanal (so' semanas no periodo, max 26 semanas) */}
      <EvolucaoSemanal
        producaoPorSemana={producaoPorSemana}
        semanaAtual={semanaAtual}
        setorLabel={SETOR_LABEL[setorFiltro] || setorFiltro}
      />

      {/* Tabela: Lançamentos diários (colapsavel) */}
      <TabelaLancamentosColapsavel
        producoes={producoesFiltradas}
        setorLabel={SETOR_LABEL[setorFiltro] || setorFiltro}
        onEdit={setModalProd}
      />

      {modalProd && (
        <ModalProducao ops={ops} semanas={semanas}
          item={modalProd === "novo" ? null : modalProd}
          onClose={() => setModalProd(null)}
          onSaved={() => { setModalProd(null); router.refresh(); }} />
      )}
      {modalImport && (
        <ModalImportarPCP ops={ops}
          onClose={() => setModalImport(false)}
          onSaved={() => { setModalImport(false); router.refresh(); }} />
      )}
    </div>
  );
}

// Modal de importação de planilha/PDF/imagem
function ModalImportarPCP({ ops, onClose, onSaved }) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef(null);

  const opMap = useMemo(() => Object.fromEntries(ops.map((o) => [o.numero, o.id])), [ops]);

  async function uploadFile(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 50MB).");
      return;
    }
    setErro("");
    setItens([]);
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const isPlanilha =
        /\.(xlsx|xls|csv)$/i.test(file.name) ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        file.type === "text/csv";

      let resp;
      if (isPlanilha) {
        // Parse client-side: evita o limite de 4.5MB do Vercel pra body
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
        if (rows.length === 0) {
          setErro("Planilha vazia ou primeira aba sem dados.");
          return;
        }
        resp = await fetch("/api/producao/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
      } else {
        // PDF/imagem: continua com base64 pra IA processar
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        resp = await fetch("/api/producao/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64, mimeType: file.type, fileName: file.name }),
        });
      }

      const txt = await resp.text();
      let data;
      try {
        data = JSON.parse(txt);
      } catch {
        throw new Error(
          resp.status === 413
            ? "Arquivo muito grande pro servidor. Tente um menor."
            : `Servidor retornou resposta inválida (HTTP ${resp.status}). ${txt.slice(0, 120)}`
        );
      }
      if (!resp.ok) throw new Error(data.error || "Erro ao processar arquivo");
      if (!data.itens || data.itens.length === 0) {
        setErro("Nenhum item extraído. Verifique o formato do arquivo.");
        return;
      }
      setItens(data.itens);
    } catch (e) {
      setErro(e.message);
    } finally {
      setParsing(false);
    }
  }

  function setLinha(i, k, v) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function removerLinha(i) {
    setItens((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setErro("");
    const validos = itens.filter((it) => it.data && (it.pesoPrevistoKg > 0 || it.pesoRealizadoKg > 0));
    if (validos.length === 0) {
      return setErro("Nenhum item válido pra importar (precisa de data e algum peso).");
    }
    setSalvando(true);
    try {
      const payload = {
        itens: validos.map((it) => ({
          data: it.data,
          pesoPrevistoKg: Number(it.pesoPrevistoKg) || 0,
          pesoRealizadoKg: Number(it.pesoRealizadoKg) || 0,
          valorPrevisto: 0,
          valorRealizado: 0,
          opId: it.opId || null,
          observacao: it.observacao || null,
        })),
      };
      const resp = await fetch("/api/producao/semanal/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao salvar");
      alert(`✓ ${data.criados} criados, ${data.atualizados} atualizados`);
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Upload size={18} className="text-torg-blue" /> Importar planejamento PCP
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* Upload area */}
          <div className="bg-torg-blue-50/30 border border-torg-blue-100 rounded-lg p-5 text-center">
            <FileSpreadsheet size={32} className="mx-auto text-torg-blue mb-2" />
            <p className="text-sm text-torg-dark font-medium mb-1">
              Suba uma planilha (xlsx), PDF ou imagem do PCP
            </p>
            <p className="text-xs text-torg-gray mb-4">
              Excel: colunas <strong>Semana</strong>, <strong>OP</strong> (opcional), <strong>Peso Previsto</strong>, <strong>Peso Realizado</strong>.<br />
              PDF/imagem: a IA extrai os pesos automaticamente.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {parsing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {parsing ? "Lendo..." : arquivoNome ? "Trocar arquivo" : "Selecionar arquivo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/pdf,image/*"
              className="hidden"
              onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            {arquivoNome && (
              <p className="text-xs text-torg-gray mt-2 inline-flex items-center gap-1">
                <FileText size={12} /> {arquivoNome}
              </p>
            )}
          </div>

          {/* Preview editável */}
          {itens.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-sm font-medium text-torg-dark">
                  <CheckCircle2 size={14} className="inline text-torg-blue mr-1" />
                  {itens.length} {itens.length === 1 ? "linha extraída" : "linhas extraídas"} — confira antes de salvar
                </p>
                <p className="text-[11px] text-torg-gray">
                  Linhas com OP em vermelho não foram encontradas — vão ficar como "geral"
                </p>
              </div>
              <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">#</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Prev (kg)</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Real (kg)</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {itens.map((it, i) => {
                      const opNotFound = it.opNumero && !it.opId;
                      return (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-2 py-1.5">
                            <input type="date" value={it.data || ""}
                              onChange={(e) => setLinha(i, "data", e.target.value)}
                              className="w-32 border border-gray-200 rounded px-1.5 py-1 text-xs" />
                          </td>
                          <td className="px-2 py-1.5">
                            <select value={it.opId || ""}
                              onChange={(e) => setLinha(i, "opId", e.target.value || null)}
                              className={`border rounded px-1.5 py-1 text-xs bg-white ${opNotFound ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                              <option value="">— Geral —</option>
                              {ops.map((o) => (
                                <option key={o.id} value={o.id}>{o.numero}</option>
                              ))}
                            </select>
                            {opNotFound && (
                              <p className="text-[10px] text-red-600 mt-0.5" title={`OP ${it.opNumero} não cadastrada`}>
                                {it.opNumero}?
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" step="0.01" min="0"
                              value={it.pesoPrevistoKg || ""}
                              onChange={(e) => setLinha(i, "pesoPrevistoKg", parseFloat(e.target.value) || 0)}
                              className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" step="0.01" min="0"
                              value={it.pesoRealizadoKg || ""}
                              onChange={(e) => setLinha(i, "pesoRealizadoKg", parseFloat(e.target.value) || 0)}
                              className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums" />
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => removerLinha(i)} className="text-red-400 hover:text-red-600">
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando || itens.length === 0}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar {itens.length > 0 ? `${itens.length} ${itens.length === 1 ? "linha" : "linhas"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// Análise diária — gráfico dia a dia + KPIs dos últimos 30 dias
function AnaliseDiaria({ producoes }) {
  const [dias, setDias] = useState(30); // 14 ou 30

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = hoje.toISOString().slice(0, 10);

  // Constrói array com cada dia (mesmo sem lançamento)
  const dataset = useMemo(() => {
    const map = {};
    for (const p of producoes) {
      const k = new Date(p.data).toISOString().slice(0, 10);
      if (!map[k]) map[k] = { data: k, prevKg: 0, realKg: 0, count: 0 };
      map[k].prevKg += p.pesoPrevistoKg || 0;
      map[k].realKg += p.pesoRealizadoKg || 0;
      map[k].count += 1;
    }
    const out = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      out.push(map[k] || { data: k, prevKg: 0, realKg: 0, count: 0 });
    }
    return out;
  }, [producoes, dias]);

  // KPIs
  const kpis = useMemo(() => {
    const comPrev = dataset.filter((d) => d.prevKg > 0);
    const comReal = dataset.filter((d) => d.realKg > 0);
    const totalPrev = dataset.reduce((s, d) => s + d.prevKg, 0);
    const totalReal = dataset.reduce((s, d) => s + d.realKg, 0);

    let melhorDia = null, piorDia = null;
    for (const d of comReal) {
      if (!melhorDia || d.realKg > melhorDia.realKg) melhorDia = d;
      if (!piorDia || d.realKg < piorDia.realKg) piorDia = d;
    }

    const mediaPrev = comPrev.length > 0 ? totalPrev / comPrev.length : 0;
    const mediaReal = comReal.length > 0 ? totalReal / comReal.length : 0;
    const aderencia = totalPrev > 0 ? (totalReal / totalPrev) * 100 : 0;

    return { totalPrev, totalReal, mediaPrev, mediaReal, melhorDia, piorDia, aderencia, diasComProducao: comReal.length };
  }, [dataset]);

  const maxKg = Math.max(...dataset.map((d) => Math.max(d.prevKg, d.realKg)), 1);

  // Análise por dia da semana (média)
  const porDiaSemana = useMemo(() => {
    const dias = [
      { dia: "Segunda", idx: 1 },
      { dia: "Terça", idx: 2 },
      { dia: "Quarta", idx: 3 },
      { dia: "Quinta", idx: 4 },
      { dia: "Sexta", idx: 5 },
      { dia: "Sábado", idx: 6 },
    ];
    return dias.map((d) => {
      const items = dataset.filter((x) => new Date(x.data + "T12:00:00").getDay() === d.idx && x.prevKg > 0);
      const prev = items.reduce((s, x) => s + x.prevKg, 0);
      const real = items.reduce((s, x) => s + x.realKg, 0);
      return {
        ...d,
        prevKg: items.length > 0 ? prev / items.length : 0,
        realKg: items.length > 0 ? real / items.length : 0,
        ader: prev > 0 ? (real / prev) * 100 : 0,
        n: items.length,
      };
    });
  }, [dataset]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark">Análise diária</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Comportamento da produção dia a dia. Útil pra identificar dias parados, picos e variações na semana.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30, 60].map((n) => (
            <button
              key={n}
              onClick={() => setDias(n)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                dias === n
                  ? "bg-torg-blue text-white"
                  : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
              }`}
            >
              {n} dias
            </button>
          ))}
        </div>
      </div>

      {/* KPIs do período */}
      <div className="px-6 py-4 bg-torg-blue-50/30 border-b border-torg-blue-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide">Aderência geral</p>
          <p className={`text-lg font-extrabold tabular-nums ${
            kpis.aderencia >= 90 ? "text-torg-blue" : kpis.aderencia >= 70 ? "text-torg-orange-700" : "text-red-600"
          }`}>
            {kpis.totalPrev > 0 ? `${kpis.aderencia.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-torg-gray">{fmtKg(kpis.totalReal)} de {fmtKg(kpis.totalPrev)}</p>
        </div>
        <div>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide">Média diária</p>
          <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtKg(kpis.mediaReal)}</p>
          <p className="text-[10px] text-torg-gray">Previsto: {fmtKg(kpis.mediaPrev)}</p>
        </div>
        <div>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide">Melhor dia</p>
          <p className="text-lg font-extrabold text-torg-blue tabular-nums">{kpis.melhorDia ? fmtKg(kpis.melhorDia.realKg) : "—"}</p>
          {kpis.melhorDia && (
            <p className="text-[10px] text-torg-gray">{fmtData(kpis.melhorDia.data)} · {diaSemana(kpis.melhorDia.data + "T12:00:00")}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide">Dias com produção</p>
          <p className="text-lg font-extrabold text-torg-dark tabular-nums">{kpis.diasComProducao} <span className="text-xs text-torg-gray font-medium">/ {dias}</span></p>
          <p className="text-[10px] text-torg-gray">{(kpis.diasComProducao / dias * 100).toFixed(0)}% dos dias</p>
        </div>
      </div>

      {/* Gráfico dia a dia */}
      <div className="px-6 py-5">
        <div className="space-y-2">
          {dataset.map((d) => {
            const ds = new Date(d.data + "T12:00:00");
            const dia = ds.getDay();
            const isFds = dia === 0 || dia === 6;
            const isHoje = d.data === hojeStr;
            const prevPct = (d.prevKg / maxKg) * 100;
            const realPct = (d.realKg / maxKg) * 100;
            const ader = d.prevKg > 0 ? (d.realKg / d.prevKg) * 100 : 0;

            return (
              <div key={d.data} className={`grid grid-cols-12 gap-2 items-center text-xs ${isHoje ? "bg-torg-blue-50/40 -mx-6 px-6 py-1 rounded" : ""} ${isFds ? "opacity-50" : ""}`}>
                <div className="col-span-3 sm:col-span-2">
                  <p className={`font-medium ${isHoje ? "text-torg-blue" : "text-torg-dark"}`}>
                    {fmtData(d.data)}
                  </p>
                  <p className="text-[10px] text-torg-gray">{diaSemana(d.data + "T12:00:00")}{isHoje && " · hoje"}</p>
                </div>
                <div className="col-span-7 sm:col-span-8 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                      <div className="h-full bg-torg-blue-700" style={{ width: `${prevPct}%` }} />
                    </div>
                    <span className="text-[10px] text-torg-gray w-20 text-right tabular-nums">{d.prevKg > 0 ? fmtKg(d.prevKg) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                      <div className="h-full bg-torg-orange" style={{ width: `${realPct}%` }} />
                    </div>
                    <span className="text-[10px] text-torg-gray w-20 text-right tabular-nums">{d.realKg > 0 ? fmtKg(d.realKg) : "—"}</span>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  {d.prevKg > 0 ? (
                    <span className={`text-[10px] font-bold ${
                      ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"
                    }`}>
                      {ader.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-torg-gray text-center mt-3">
          <span className="inline-block w-3 h-2 bg-torg-blue-700 align-middle mr-1" /> Previsto
          <span className="inline-block w-3 h-2 bg-torg-orange align-middle ml-3 mr-1" /> Realizado · finais de semana acinzentados
        </p>
      </div>

      {/* Análise por dia da semana */}
      <div className="border-t border-gray-100">
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-torg-dark">Comportamento por dia da semana (média)</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dia</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Média prev.</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Média real.</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Aderência</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">N° dias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porDiaSemana.map((d) => (
                <tr key={d.idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-torg-dark font-medium">{d.dia}</td>
                  <td className="px-4 py-2 text-right text-torg-gray tabular-nums">{d.n > 0 ? fmtKg(d.prevKg) : "—"}</td>
                  <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{d.n > 0 ? fmtKg(d.realKg) : "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium text-xs ${
                    d.n === 0 ? "text-gray-300" :
                    d.ader >= 90 ? "text-torg-blue" :
                    d.ader >= 70 ? "text-torg-orange-700" : "text-red-600"
                  }`}>
                    {d.n > 0 ? `${d.ader.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-torg-gray text-xs">{d.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Bar({ pct, color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-torg-gray w-32 text-right tabular-nums">{label}</span>
    </div>
  );
}

function KpiCard({ label, value, subtitle, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>
        {subtitle && <p className="text-[10px] text-torg-gray truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalProducao({ ops, semanas, item, onClose, onSaved }) {
  const isEdit = !!item;
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    data: item?.data ? new Date(item.data).toISOString().slice(0, 10) : hojeStr,
    pesoPrevistoKg: item?.pesoPrevistoKg ?? 0,
    pesoRealizadoKg: item?.pesoRealizadoKg ?? 0,
    opId: item?.opId || "",
    observacao: item?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const semanaCalculada = form.data ? isoWeekString(new Date(form.data + "T12:00:00")) : "";
  const diaCalculado = form.data ? diaSemana(form.data + "T12:00:00") : "";

  const submit = async () => {
    setErro("");
    if (!form.data) return setErro("Escolha a data.");
    setSalvando(true);
    try {
      const payload = {
        data: form.data,
        pesoPrevistoKg: Number(form.pesoPrevistoKg) || 0,
        pesoRealizadoKg: Number(form.pesoRealizadoKg) || 0,
        valorPrevisto: 0,
        valorRealizado: 0,
        opId: form.opId || null,
        observacao: form.observacao || null,
      };
      const res = isEdit
        ? await fetch(`/api/producao/semanal/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pesoPrevistoKg: payload.pesoPrevistoKg, pesoRealizadoKg: payload.pesoRealizadoKg,
              opId: payload.opId, observacao: payload.observacao,
            }),
          })
        : await fetch(`/api/producao/semanal`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  const excluir = async () => {
    if (!isEdit || !window.confirm("Excluir lançamento?")) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/producao/semanal/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) { setErro(e.message); setExcluindo(false); }
  };

  const ader = Number(form.pesoPrevistoKg) > 0
    ? (Number(form.pesoRealizadoKg) / Number(form.pesoPrevistoKg)) * 100 : 0;

  return (
    <Modal titulo={isEdit ? "Editar produção" : "Nova produção diária"} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data *</label>
            <input type="date" value={form.data} disabled={isEdit}
              onChange={(e) => set("data", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue disabled:bg-gray-50" />
            {form.data && (
              <p className="text-[10px] text-torg-gray mt-1">
                {diaCalculado} · semana <span className="font-mono">{semanaCalculada}</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
            <select value={form.opId} onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Sem OP (geral) —</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso previsto (kg)</label>
            <input type="number" step="0.01" min="0" value={form.pesoPrevistoKg || ""}
              onChange={(e) => set("pesoPrevistoKg", e.target.value)} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso realizado (kg)</label>
            <input type="number" step="0.01" min="0" value={form.pesoRealizadoKg || ""}
              onChange={(e) => set("pesoRealizadoKg", e.target.value)} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
        </div>
        {Number(form.pesoPrevistoKg) > 0 && (
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3 text-sm flex items-center justify-between">
            <span className="text-torg-gray">Aderência:</span>
            <span className={`font-bold tabular-nums ${ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"}`}>
              {ader.toFixed(1)}%
            </span>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <textarea value={form.observacao} onChange={(e) => set("observacao", e.target.value)}
            rows={2} placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between flex-wrap gap-3">
        {isEdit ? (
          <button onClick={excluir} disabled={excluindo || salvando}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir
          </button>
        ) : <span />}
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={submit} disabled={salvando || excluindo}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Toolbar unificada: chips de periodo + chips de setor + range exibido
function Toolbar({ periodo, onChangePeriodo, range, setorFiltro, onChangeSetor, setoresDisponiveis }) {
  const fmtRange = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const setoresPraExibir = setoresDisponiveis.length > 0 ? setoresDisponiveis : SETORES_ORDEM;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-torg-dark min-w-fit pr-1">
          <Calendar size={14} className="text-torg-blue" />
          <span className="text-xs font-semibold uppercase tracking-wide">Período</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChangePeriodo(p.id)}
              title={p.desc}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                periodo === p.id
                  ? "bg-torg-blue text-white"
                  : "bg-gray-50 text-torg-gray hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-torg-gray ml-auto tabular-nums">
          {fmtRange(range.inicio)} → {fmtRange(range.fim)}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2">
        <div className="flex items-center gap-1.5 text-torg-dark min-w-fit pr-1">
          <Activity size={14} className="text-torg-blue" />
          <span className="text-xs font-semibold uppercase tracking-wide">Setor</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {setoresPraExibir.map((s) => (
            <button
              key={s}
              onClick={() => onChangeSetor(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                setorFiltro === s
                  ? "bg-torg-orange text-white"
                  : "bg-gray-50 text-torg-gray hover:bg-gray-100"
              }`}
            >
              {SETOR_LABEL[s] || s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Card grande com os numeros chave do periodo + setor.
function HeroKpi({ kpi, setor, kpiSemana }) {
  const cor = kpi.aderencia >= 90 ? "text-torg-blue" : kpi.aderencia >= 70 ? "text-torg-orange-700" : "text-red-600";
  const corBar = kpi.aderencia >= 90 ? "bg-torg-blue" : kpi.aderencia >= 70 ? "bg-torg-orange" : "bg-red-400";
  const semDado = kpi.prevTotal === 0 && kpi.realTotal === 0;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-5">
      {semDado ? (
        <p className="text-sm text-torg-gray text-center py-4">
          Sem produção no período selecionado pra {SETOR_LABEL[setor] || setor}.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Coluna 1: barra de aderencia */}
          <div className="sm:col-span-2">
            <p className="text-xs text-torg-gray uppercase tracking-wide">Aderência {SETOR_LABEL[setor] || setor}</p>
            <p className={`text-5xl font-extrabold tabular-nums ${cor}`}>
              {kpi.prevTotal > 0 ? `${kpi.aderencia.toFixed(1)}%` : "—"}
            </p>
            <div className="mt-3 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full ${corBar} transition-all`}
                style={{ width: `${Math.min(kpi.aderencia, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-torg-gray tabular-nums">
              <span>Realizado: <strong className="text-torg-dark">{fmtKg(kpi.realTotal)}</strong></span>
              <span>Previsto: <strong className="text-torg-dark">{fmtKg(kpi.prevTotal)}</strong></span>
            </div>
          </div>
          {/* Coluna 2: dias + media */}
          <div>
            <p className="text-xs text-torg-gray uppercase tracking-wide">Média diária</p>
            <p className="text-3xl font-bold text-torg-dark tabular-nums">{fmtKg(kpi.mediaDiariaReal)}</p>
            <p className="text-[11px] text-torg-gray mt-1">{kpi.dias} dia{kpi.dias === 1 ? "" : "s"} com produção</p>
          </div>
          {/* Coluna 3: semana atual */}
          <div>
            <p className="text-xs text-torg-gray uppercase tracking-wide">Semana atual</p>
            <p className="text-3xl font-bold text-torg-dark tabular-nums">{fmtKg(kpiSemana.realKg)}</p>
            <p className="text-[11px] text-torg-gray mt-1">
              de {fmtKg(kpiSemana.prevKg)} previsto
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Funil compacto: 7 etapas em sequencia com barra prev/real e %.
function FunilSetores({ comparacao, setorFiltro, onSelect, setoresDisponiveis }) {
  const maxPrev = Math.max(...comparacao.map((c) => c.prev), 1);
  const temDado = comparacao.some((c) => c.prev > 0 || c.real > 0);

  if (!temDado) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-5">
        <p className="text-sm text-torg-gray text-center">
          Sem dados de setor no período. Clique <strong>"Sincronizar agora"</strong> no card SharePoint pra puxar a planilha.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-torg-dark uppercase tracking-wide">Funil da produção</h3>
        <p className="text-[11px] text-torg-gray">Clique no setor pra filtrar</p>
      </div>
      <div className="px-4 py-3 space-y-1">
        {comparacao.map((c) => {
          const ader = c.prev > 0 ? (c.real / c.prev) * 100 : 0;
          const isAtual = setorFiltro === c.setor;
          const widthPrev = (c.prev / maxPrev) * 100;
          const widthReal = c.prev > 0 ? (c.real / c.prev) * 100 : 0;
          const corBar = ader >= 90 ? "bg-torg-blue" : ader >= 70 ? "bg-torg-orange" : "bg-red-400";
          return (
            <button
              key={c.setor}
              onClick={() => onSelect(c.setor)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                isAtual ? "bg-torg-blue-50 ring-1 ring-torg-blue" : "hover:bg-gray-50"
              }`}
            >
              <span className={`text-xs font-semibold w-24 shrink-0 ${isAtual ? "text-torg-blue" : "text-torg-dark"}`}>
                {SETOR_LABEL[c.setor] || c.setor}
              </span>
              <div className="flex-1 relative h-5 bg-gray-100 rounded overflow-hidden" style={{ maxWidth: `${Math.max(widthPrev, 8)}%` }}>
                <div className={`h-full ${corBar}`} style={{ width: `${Math.min(widthReal, 100)}%` }} />
              </div>
              <span className="text-[11px] text-torg-gray tabular-nums w-44 text-right shrink-0">
                {fmtKg(c.real)} / {fmtKg(c.prev)}
              </span>
              <span className={`text-sm font-bold w-12 text-right shrink-0 tabular-nums ${
                c.prev === 0 ? "text-gray-300" : ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"
              }`}>
                {c.prev > 0 ? `${ader.toFixed(0)}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Grafico de evolucao semanal: linha SVG com previsto (pontilhado) + realizado (continuo).
function EvolucaoSemanal({ producaoPorSemana, semanaAtual, setorLabel }) {
  const semanasComDado = producaoPorSemana.filter((s) => s.prevKg > 0 || s.realKg > 0);
  const semanas = semanasComDado.slice(-26);

  if (semanas.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={14} className="text-torg-blue" />
          <h3 className="text-sm font-semibold text-torg-dark uppercase tracking-wide">Evolução semanal — {setorLabel}</h3>
        </div>
        <p className="text-xs text-torg-gray text-center py-4">
          Sem produção registrada nesse setor no período. Click <strong>"Buscar histórico"</strong> pra puxar meses anteriores.
        </p>
      </div>
    );
  }

  const maxKg = Math.max(...semanas.map((s) => Math.max(s.prevKg, s.realKg)), 1);

  // SVG dimensions (viewBox responsivo — viewBox redimensiona com o container)
  const W = 800;
  const H = 280;
  const padL = 50, padR = 20, padT = 20, padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Escala
  const x = (i) => padL + (semanas.length === 1 ? plotW / 2 : (i / (semanas.length - 1)) * plotW);
  const y = (val) => padT + plotH - (val / maxKg) * plotH;

  // Paths das duas linhas
  const prevPath = semanas.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.prevKg).toFixed(1)}`).join(" ");
  const realPath = semanas.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.realKg).toFixed(1)}`).join(" ");

  // Y ticks (4 + zero)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => maxKg * p);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-torg-blue" />
          <h3 className="text-sm font-semibold text-torg-dark uppercase tracking-wide">Evolução semanal — {setorLabel}</h3>
        </div>
        <p className="text-[11px] text-torg-gray flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" className="inline-block">
              <line x1="0" y1="3" x2="22" y2="3" stroke="#9ca3af" strokeWidth="2" strokeDasharray="5,3" />
            </svg>
            Previsto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" className="inline-block">
              <line x1="0" y1="3" x2="22" y2="3" stroke="#1e40af" strokeWidth="2.5" />
            </svg>
            Realizado
          </span>
        </p>
      </div>
      <div className="px-4 py-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: "320px" }}>
          {/* Grid + labels Y */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#f3f4f6" strokeWidth="1" />
              <text x={padL - 8} y={y(t) + 4} fontSize="11" fill="#6b7280" textAnchor="end" fontFamily="ui-monospace,monospace">
                {Math.round(t / 1000)}t
              </text>
            </g>
          ))}
          {/* Eixo Y vertical */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#d1d5db" strokeWidth="1" />
          {/* Eixo X horizontal */}
          <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#d1d5db" strokeWidth="1" />

          {/* Linha previsto (pontilhada cinza) */}
          <path d={prevPath} fill="none" stroke="#9ca3af" strokeWidth="2" strokeDasharray="5,3" />
          {/* Linha realizado (continua azul) */}
          <path d={realPath} fill="none" stroke="#1e40af" strokeWidth="2.5" />

          {/* Pontos */}
          {semanas.map((s, i) => {
            const ader = s.prevKg > 0 ? (s.realKg / s.prevKg) * 100 : 0;
            const isAtual = s.semana === semanaAtual;
            const corPonto = ader >= 90 ? "#1e40af" : ader >= 70 ? "#ea580c" : "#dc2626";
            return (
              <g key={s.semana}>
                <circle cx={x(i)} cy={y(s.prevKg)} r="3" fill="#9ca3af" />
                <circle cx={x(i)} cy={y(s.realKg)} r="4" fill={corPonto}>
                  <title>{`${s.semana}: previsto ${fmtKg(s.prevKg)} | realizado ${fmtKg(s.realKg)} (${ader.toFixed(0)}%)`}</title>
                </circle>
                {isAtual && (
                  <circle cx={x(i)} cy={y(s.realKg)} r="8" fill="none" stroke={corPonto} strokeWidth="1.5" opacity="0.4" />
                )}
              </g>
            );
          })}

          {/* Labels X (semanas) */}
          {semanas.map((s, i) => {
            const isAtual = s.semana === semanaAtual;
            // Pula labels intermediarios quando tem muitas semanas pra nao sobrepor
            const step = Math.ceil(semanas.length / 14);
            if (i % step !== 0 && i !== semanas.length - 1 && !isAtual) return null;
            return (
              <text
                key={s.semana}
                x={x(i)}
                y={H - padB + 16}
                fontSize="10"
                fill={isAtual ? "#1e40af" : "#6b7280"}
                textAnchor="middle"
                fontWeight={isAtual ? "bold" : "normal"}
                fontFamily="ui-monospace,monospace"
              >
                W{s.semana.split("-W")[1]}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Tabela colapsavel (escondida por default).
function TabelaLancamentosColapsavel({ producoes, setorLabel, onEdit }) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setAberta((v) => !v)}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {aberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="text-sm font-semibold text-torg-dark">
            Lançamentos diários — {setorLabel}
          </span>
          <span className="text-[11px] text-torg-gray">({producoes.length} {producoes.length === 1 ? "linha" : "linhas"})</span>
        </div>
        <span className="text-[10px] text-torg-gray uppercase tracking-wide">
          {aberta ? "Ocultar" : "Ver detalhes"}
        </span>
      </button>
      {aberta && (
        producoes.length === 0 ? (
          <p className="px-6 py-4 text-sm text-torg-gray text-center border-t border-gray-100">
            Nenhum lançamento nesse setor no período.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Dia</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Sem.</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Prev</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Real</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Ader.</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...producoes].sort((a, b) => (new Date(a.data) < new Date(b.data) ? 1 : -1)).map((p) => {
                  const ader = p.pesoPrevistoKg > 0 ? (p.pesoRealizadoKg / p.pesoPrevistoKg) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-1.5 text-xs text-torg-dark font-medium">{fmtData(p.data)}</td>
                      <td className="px-4 py-1.5 text-xs text-torg-gray">{diaSemana(p.data)}</td>
                      <td className="px-4 py-1.5 text-xs font-mono text-torg-gray">{p.semana}</td>
                      <td className="px-4 py-1.5 text-xs font-mono text-torg-blue">{p.op?.numero || "—"}</td>
                      <td className="px-4 py-1.5 text-right text-torg-gray tabular-nums text-xs">{fmtKg(p.pesoPrevistoKg)}</td>
                      <td className="px-4 py-1.5 text-right text-torg-dark font-medium tabular-nums text-xs">{fmtKg(p.pesoRealizadoKg)}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums font-medium text-xs ${
                        p.pesoPrevistoKg === 0 ? "text-torg-gray" :
                        ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"
                      }`}>
                        {p.pesoPrevistoKg === 0 ? "—" : `${ader.toFixed(0)}%`}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <button onClick={() => onEdit(p)}
                          className="text-[10px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
                          <Pencil size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// Card que mostra o status do sync com SharePoint e permite forcar sync manual.
function SharepointSyncCard() {
  const router = useRouter();
  const [syncs, setSyncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");

  async function fetchHistorico() {
    setLoading(true);
    try {
      const res = await fetch("/api/producao/sync-sharepoint/historico");
      const data = await res.json();
      if (res.ok) setSyncs(data.syncs || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchHistorico(); }, []);

  async function sincronizarAgora(mesesAtras = 0) {
    setSincronizando(true);
    setErro("");
    try {
      const res = await fetch("/api/producao/sync-sharepoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesesAtras }),
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        setErro(data.erro || data.error || "Falha no sync");
      } else {
        router.refresh();
      }
      await fetchHistorico();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSincronizando(false);
    }
  }

  const ultimo = syncs[0];
  const diffMin = ultimo ? Math.round((Date.now() - new Date(ultimo.criadoEm).getTime()) / 60000) : null;
  const tempo = diffMin == null ? "—" :
    diffMin < 1 ? "agora" :
    diffMin < 60 ? `${diffMin} min atrás` :
    diffMin < 60 * 24 ? `${Math.round(diffMin / 60)} h atrás` :
    `${Math.round(diffMin / 60 / 24)} dias atrás`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${ultimo?.sucesso ? "bg-torg-blue-50" : ultimo && !ultimo.sucesso ? "bg-red-50" : "bg-gray-100"}`}>
            <Cloud size={18} className={ultimo?.sucesso ? "text-torg-blue" : ultimo && !ultimo.sucesso ? "text-red-600" : "text-torg-gray"} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-torg-dark flex items-center gap-2">
              SharePoint — PCP
              {loading ? null : ultimo?.sucesso ? (
                <span className="inline-flex items-center gap-1 text-[10px] bg-torg-blue-50 text-torg-blue px-1.5 py-0.5 rounded uppercase font-bold"><CheckCircle2 size={10} /> OK</span>
              ) : ultimo && !ultimo.sucesso ? (
                <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded uppercase font-bold"><XCircle size={10} /> Erro</span>
              ) : (
                <span className="text-[10px] text-torg-gray uppercase">nunca sincronizou</span>
              )}
            </p>
            <p className="text-xs text-torg-gray truncate">
              {loading ? "Carregando histórico..." :
                ultimo ? (
                  <>
                    Última: <span className="font-medium text-torg-dark">{tempo}</span>
                    {ultimo.executadoPor ? ` · ${ultimo.executadoPor.name}` : " · cron automático"}
                    {ultimo.sucesso && ` · ${ultimo.criados} criados, ${ultimo.atualizados} atualizados`}
                  </>
                ) : "Cron diário roda às 08:00 (Vercel). Você também pode disparar manualmente."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => sincronizarAgora(0)}
            disabled={sincronizando}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {sincronizando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {sincronizando ? "Sincronizando..." : "Sincronizar mês atual"}
          </button>
          <button
            onClick={() => {
              if (window.confirm("Vai baixar e parsear as planilhas dos últimos 3 meses (atual + 2 anteriores). Pode levar 30+ segundos. Continuar?")) {
                sincronizarAgora(2);
              }
            }}
            disabled={sincronizando}
            className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5 disabled:opacity-50"
            title="Sincroniza tambem meses anteriores (Marco, Abril)"
          >
            <RefreshCw size={12} /> Buscar histórico
          </button>
        </div>
      </div>
      {(erro || (ultimo && !ultimo.sucesso && ultimo.erro)) && (
        <div className="px-5 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{erro || ultimo.erro}</span>
        </div>
      )}
      {ultimo && ultimo.sucesso && ultimo.mensagem && (
        <div className="px-5 py-2 bg-torg-blue-50/40 border-t border-torg-blue-100 text-[11px] text-torg-gray font-mono truncate" title={ultimo.mensagem}>
          {ultimo.mensagem}
        </div>
      )}
    </div>
  );
}

