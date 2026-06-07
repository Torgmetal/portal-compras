"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Save, Loader2,
  Plus, Trash2, Target, TrendingUp, Factory, AlertCircle,
  Upload, Download,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import * as XLSX from "xlsx";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const SETOR_LABEL = {
  CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedição",
};
const SETOR_COLOR = {
  CORTE: "bg-yellow-100 text-yellow-800",
  MONTAGEM: "bg-blue-100 text-blue-800",
  SOLDA: "bg-orange-100 text-orange-800",
  ACABAMENTO: "bg-purple-100 text-purple-800",
  JATO: "bg-cyan-100 text-cyan-800",
  PINTURA: "bg-pink-100 text-pink-800",
  EXPEDIDO: "bg-emerald-100 text-emerald-800",
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().split("T")[0];
}

function getDiaDaSemana(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z");
  const dia = d.getUTCDay();
  return dia >= 1 && dia <= 5 ? dia - 1 : null; // 0=seg..4=sex, null=fim de semana
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export default function PmpClient() {
  const [semana, setSemana] = useState(() => getMonday(new Date()));
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  // Linhas editáveis: array de { opNumero, setor, dias: [pç,pç,pç,pç,pç], pesoTotal }
  const [linhas, setLinhas] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Nova linha
  const [novaOp, setNovaOp] = useState("");
  const [novoSetor, setNovoSetor] = useState("CORTE");

  // Import
  const fileRef = useRef(null);

  // ── Buscar dados ────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/pcp/pmp?semana=${semana}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setDados(data);

      // Montar linhas a partir das metas existentes
      const map = {}; // key = "opNumero|setor" → { dias: [5] }
      for (const m of data.metas) {
        const key = `${m.opNumero}|${m.setor}`;
        if (!map[key]) map[key] = { opNumero: m.opNumero, setor: m.setor, dias: [0, 0, 0, 0, 0], obs: "" };
        const idx = getDiaDaSemana(m.data.split("T")[0]);
        if (idx !== null) {
          map[key].dias[idx] = m.metaPecas;
          if (m.observacao) map[key].obs = m.observacao;
        }
      }
      setLinhas(Object.values(map));
      setDirty(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Navegar semanas ─────────────────────────────────────────
  const semanaAnterior = () => setSemana(addDays(semana, -7));
  const semanaSeguinte = () => setSemana(addDays(semana, 7));
  const semanaAtual = () => setSemana(getMonday(new Date()));

  // ── Editar célula ───────────────────────────────────────────
  const editarCelula = (linhaIdx, diaIdx, valor) => {
    setLinhas((prev) => {
      const next = [...prev];
      next[linhaIdx] = { ...next[linhaIdx], dias: [...next[linhaIdx].dias] };
      next[linhaIdx].dias[diaIdx] = Math.max(0, parseInt(valor) || 0);
      return next;
    });
    setDirty(true);
  };

  // ── Adicionar linha ─────────────────────────────────────────
  const adicionarLinha = () => {
    if (!novaOp) return;
    const existe = linhas.some((l) => l.opNumero === novaOp && l.setor === novoSetor);
    if (existe) return;
    setLinhas((prev) => [...prev, { opNumero: novaOp, setor: novoSetor, dias: [0, 0, 0, 0, 0], obs: "" }]);
    setDirty(true);
  };

  // ── Remover linha ───────────────────────────────────────────
  const removerLinha = (idx) => {
    setLinhas((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  // ── Importar planilha ────────────────────────────────────────
  const importarPlanilha = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Encontrar header (primeira linha que contém "OP" e "Setor")
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = (rows[i] || []).map((c) => String(c || "").trim().toUpperCase());
          if (row.includes("OP") && row.includes("SETOR")) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          alert("Planilha sem cabeçalho válido. A primeira linha deve conter: OP | Setor | Seg | Ter | Qua | Qui | Sex");
          return;
        }

        const header = (rows[headerIdx] || []).map((c) => String(c || "").trim().toUpperCase());
        const colOP = header.indexOf("OP");
        const colSetor = header.indexOf("SETOR");
        const colSeg = header.findIndex((h) => h === "SEG" || h === "SEGUNDA");
        const colTer = header.findIndex((h) => h === "TER" || h === "TERCA" || h === "TERÇA");
        const colQua = header.findIndex((h) => h === "QUA" || h === "QUARTA");
        const colQui = header.findIndex((h) => h === "QUI" || h === "QUINTA");
        const colSex = header.findIndex((h) => h === "SEX" || h === "SEXTA");

        // Se não encontrou dias individuais, tenta pegar colunas 2-6 como dias
        const colsDias = [colSeg, colTer, colQua, colQui, colSex];
        const temDias = colsDias.every((c) => c >= 0);
        const diasCols = temDias ? colsDias : [2, 3, 4, 5, 6];

        const opsValidas = new Set((dados?.ops || []).map((o) => o.numero));
        const novasLinhas = [];
        let ignoradas = 0;

        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[colOP]) continue;

          const opStr = String(row[colOP]).trim().replace(/^OP\s*/i, "");
          const setorStr = String(row[colSetor] || "").trim().toUpperCase();

          if (!opStr || !SETORES.includes(setorStr)) { ignoradas++; continue; }
          if (!opsValidas.has(opStr)) { ignoradas++; continue; }

          // Verificar duplicata com linhas existentes
          const jaExiste = linhas.some((l) => l.opNumero === opStr && l.setor === setorStr);
          const jaNova = novasLinhas.some((l) => l.opNumero === opStr && l.setor === setorStr);
          if (jaExiste || jaNova) { ignoradas++; continue; }

          const dias = diasCols.map((c) => Math.max(0, parseInt(row[c]) || 0));
          novasLinhas.push({ opNumero: opStr, setor: setorStr, dias, obs: "" });
        }

        if (novasLinhas.length === 0) {
          alert(`Nenhuma linha válida encontrada.${ignoradas > 0 ? ` ${ignoradas} linha(s) ignorada(s) (OP não encontrada ou setor inválido).` : ""}`);
          return;
        }

        setLinhas((prev) => [...prev, ...novasLinhas]);
        setDirty(true);
        const msg = `${novasLinhas.length} linha(s) importada(s) com sucesso!`;
        alert(ignoradas > 0 ? `${msg}\n${ignoradas} linha(s) ignorada(s).` : msg);
      } catch (err) {
        alert("Erro ao ler a planilha: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    // Limpar input para permitir reimportar mesmo arquivo
    e.target.value = "";
  };

  // ── Baixar modelo de planilha ──────────────────────────────
  const baixarModelo = () => {
    const header = ["OP", "Setor", "Seg", "Ter", "Qua", "Qui", "Sex"];
    const exemplo = [
      ["82", "CORTE", 10, 15, 12, 8, 20],
      ["82", "SOLDA", 5, 10, 8, 6, 12],
      ["83", "MONTAGEM", 20, 20, 20, 20, 20],
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...exemplo]);
    ws["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PMP");
    XLSX.writeFile(wb, "modelo-pmp.xlsx");
  };

  // ── Salvar ──────────────────────────────────────────────────
  const salvar = async () => {
    setSalvando(true);
    try {
      const metas = [];
      for (const l of linhas) {
        for (let d = 0; d < 5; d++) {
          metas.push({
            data: addDays(semana, d),
            setor: l.setor,
            opNumero: l.opNumero,
            metaPecas: l.dias[d],
            metaPesoKg: 0, // TODO: calcular pelo peso médio da peça
            observacao: l.obs || null,
          });
        }
      }
      const res = await fetch("/api/pcp/pmp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metas }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setDirty(false);
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  // ── Calcular realizado por OP+setor ─────────────────────────
  const getRealizadoSetor = (opNumero, setor) => {
    if (!dados?.realizado?.[opNumero]) return { pecas: 0, pesoKg: 0 };
    // Realizado = peças que já passaram por este setor (status >= setor no pipeline)
    const idxSetor = SETORES.indexOf(setor);
    let pecas = 0, pesoKg = 0;
    for (const [status, val] of Object.entries(dados.realizado[opNumero])) {
      const idxStatus = SETORES.indexOf(status);
      if (idxStatus >= idxSetor) {
        pecas += val.pecas;
        pesoKg += val.pesoKg;
      }
    }
    return { pecas, pesoKg };
  };

  // ── Dias da semana com datas ────────────────────────────────
  const diasComData = DIAS_SEMANA.map((label, i) => ({
    label,
    data: addDays(semana, i),
    fmt: fmtDate(addDays(semana, i)),
  }));

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-torg-blue" size={32} />
        <span className="ml-3 text-torg-gray">Carregando PMP...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-600 font-medium">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 bg-torg-blue text-white rounded-lg text-sm">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Target size={24} className="text-torg-blue" /> PMP — Plano Mestre de Produção
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Defina metas diárias por OP e setor. A visão semanal totaliza automaticamente.
          </p>
        </div>
        <button
          onClick={salvar}
          disabled={salvando || !dirty}
          className="px-4 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold text-sm flex items-center gap-2 disabled:opacity-50 shadow-sm"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar
        </button>
      </div>

      {/* Navegação da semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between">
        <button onClick={semanaAnterior} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <CalendarDays size={18} className="text-torg-blue" />
          <span className="text-sm font-semibold text-torg-dark">
            Semana de {fmtDate(semana)} a {fmtDate(addDays(semana, 4))}
          </span>
          <button
            onClick={semanaAtual}
            className="px-2 py-0.5 text-[10px] bg-torg-blue-50 text-torg-blue rounded font-medium hover:bg-torg-blue-100"
          >
            Hoje
          </button>
        </div>
        <button onClick={semanaSeguinte} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Adicionar linha + importar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Plus size={14} className="text-torg-gray" />
        <select
          value={novaOp}
          onChange={(e) => setNovaOp(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white min-w-[140px]"
        >
          <option value="">Selecionar OP...</option>
          {dados?.ops?.map((op) => (
            <option key={op.numero} value={op.numero}>
              OP {op.numero} — {op.cliente}
            </option>
          ))}
        </select>
        <select
          value={novoSetor}
          onChange={(e) => setNovoSetor(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          {SETORES.map((s) => (
            <option key={s} value={s}>{SETOR_LABEL[s]}</option>
          ))}
        </select>
        <button
          onClick={adicionarLinha}
          disabled={!novaOp}
          className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
        >
          Adicionar meta
        </button>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={importarPlanilha}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
        >
          <Upload size={13} /> Importar planilha
        </button>
        <button
          onClick={baixarModelo}
          className="px-3 py-1.5 border border-gray-300 text-torg-gray text-xs rounded-lg hover:bg-gray-50 font-medium flex items-center gap-1.5"
        >
          <Download size={13} /> Baixar modelo
        </button>
      </div>

      {/* Tabela principal */}
      {linhas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-12">
          <Factory size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma meta definida para esta semana.</p>
          <p className="text-xs text-gray-400 mt-1">Use o seletor acima para adicionar uma OP + setor.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase w-20">OP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase w-24">Setor</th>
                  {diasComData.map((d) => (
                    <th key={d.data} className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">
                      <div>{d.label}</div>
                      <div className="text-[9px] font-normal text-gray-400">{d.fmt}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase bg-blue-50 w-16">
                    Total
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase bg-emerald-50 w-20">
                    Realizado
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase bg-gray-50 w-12">
                    %
                  </th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {linhas.map((l, idx) => {
                  const totalMeta = l.dias.reduce((s, v) => s + v, 0);
                  const real = getRealizadoSetor(l.opNumero, l.setor);
                  const pct = totalMeta > 0 ? Math.round((real.pecas / totalMeta) * 100) : 0;
                  const pctColor = pct >= 100 ? "text-emerald-600 bg-emerald-50" : pct >= 60 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";

                  return (
                    <tr key={`${l.opNumero}-${l.setor}`} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-mono text-torg-blue font-medium">{fmtOP(l.opNumero)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${SETOR_COLOR[l.setor]}`}>
                          {SETOR_LABEL[l.setor]}
                        </span>
                      </td>
                      {l.dias.map((v, d) => (
                        <td key={d} className="px-1 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            value={v || ""}
                            onChange={(e) => editarCelula(idx, d, e.target.value)}
                            placeholder="—"
                            className="w-14 text-center px-1 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue focus:border-torg-blue tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-torg-dark bg-blue-50/30 tabular-nums">
                        {totalMeta}
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums bg-emerald-50/30">
                        {real.pecas}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pctColor}`}>
                          {totalMeta > 0 ? `${pct}%` : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removerLinha(idx)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
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

      {dirty && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
          <AlertCircle size={14} />
          Alterações não salvas. Clique em <strong>Salvar</strong> para confirmar.
        </div>
      )}
    </div>
  );
}
