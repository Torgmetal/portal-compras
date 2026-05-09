"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Plus, Loader2, AlertCircle, X, Upload,
  Package, Pencil, Trash2, FileSpreadsheet, CheckCircle2, FileText,
} from "lucide-react";
import { fmtSemana, isoWeekString } from "@/lib/semana";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const diaSemana = (d) => {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return dias[new Date(d).getDay()];
};

export default function ProducaoClient({ ops, semanas, semanaAtual, producoes }) {
  const router = useRouter();
  const [modalProd, setModalProd] = useState(null);
  const [modalImport, setModalImport] = useState(false);

  // Agrega producao por semana
  const producaoPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) map[s.semana] = { ...s, prevKg: 0, realKg: 0, items: [] };
    for (const p of producoes) {
      const k = p.semana;
      if (!map[k]) continue;
      map[k].prevKg += p.pesoPrevistoKg || 0;
      map[k].realKg += p.pesoRealizadoKg || 0;
      map[k].items.push(p);
    }
    return Object.values(map);
  }, [producoes, semanas]);

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
    for (const p of producoes) {
      if (noMesAtual(p.dataInicio)) {
        prevKg += p.pesoPrevistoKg || 0;
        realKg += p.pesoRealizadoKg || 0;
      }
    }
    return { prevKg, realKg };
  }, [producoes]);

  const maxKg = Math.max(
    ...producaoPorSemana.map((s) => Math.max(s.prevKg, s.realKg)),
    1
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Painel de Produção
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            PCP — pesos previstos × realizados de estruturas, planejados pela equipe de produção.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalImport(true)}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <Upload size={16} /> Importar planilha
          </button>
          <button
            onClick={() => setModalProd("novo")}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Produção semanal
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Peso previsto (semana)"
          value={fmtKg(kpiSemana.prevKg)}
          color="bg-torg-blue-700"
          Icon={Package}
        />
        <KpiCard
          label="Peso realizado (semana)"
          value={fmtKg(kpiSemana.realKg)}
          subtitle={`${aderencia.toFixed(1)}% aderência`}
          color={aderencia >= 90 ? "bg-torg-blue" : aderencia >= 70 ? "bg-torg-orange" : "bg-red-500"}
          Icon={Activity}
        />
        <KpiCard
          label="Peso previsto (mês)"
          value={fmtKg(kpiMes.prevKg)}
          color="bg-torg-blue"
          Icon={Package}
        />
        <KpiCard
          label="Peso realizado (mês)"
          value={fmtKg(kpiMes.realKg)}
          subtitle={kpiMes.prevKg > 0 ? `${((kpiMes.realKg / kpiMes.prevKg) * 100).toFixed(1)}% aderência` : ""}
          color="bg-torg-orange"
          Icon={Activity}
        />
      </div>

      {/* Gráfico: peso previsto × realizado por semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Pesos por semana</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            <span className="inline-block w-3 h-2 bg-torg-blue-700 align-middle mr-1" /> Previsto
            <span className="inline-block w-3 h-2 bg-torg-orange align-middle ml-3 mr-1" /> Realizado
          </p>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-4">
            {producaoPorSemana.map((s) => {
              const prevPct = (s.prevKg / maxKg) * 100;
              const realPct = (s.realKg / maxKg) * 100;
              const isAtual = s.semana === semanaAtual;
              return (
                <div key={s.semana} className={`grid grid-cols-12 gap-3 items-center ${isAtual ? "bg-torg-blue-50/30 -mx-6 px-6 py-2" : ""}`}>
                  <div className="col-span-3 sm:col-span-2 text-xs">
                    <p className={`font-semibold ${isAtual ? "text-torg-blue" : "text-torg-dark"} font-mono`}>{s.semana}</p>
                    {isAtual && <p className="text-[10px] text-torg-blue">atual</p>}
                  </div>
                  <div className="col-span-9 sm:col-span-10 space-y-1">
                    <Bar pct={prevPct} color="bg-torg-blue-700" label={`Prev: ${fmtKg(s.prevKg)}`} />
                    <Bar pct={realPct} color="bg-torg-orange" label={`Real: ${fmtKg(s.realKg)}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabela: Lançamentos diários do PCP */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Lançamentos diários do PCP</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Pesos previstos vs realizados por dia e por OP. Cada linha pode ser editada.
          </p>
        </div>
        {producoes.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum lançamento ainda. Clique em "+ Produção semanal" pra começar.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dia</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Semana</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prev (kg)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Real (kg)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">% ader.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...producoes].sort((a, b) => (new Date(a.data) < new Date(b.data) ? 1 : -1)).map((p) => {
                  const ader = p.pesoPrevistoKg > 0 ? (p.pesoRealizadoKg / p.pesoPrevistoKg) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-torg-dark font-medium">{fmtData(p.data)}</td>
                      <td className="px-4 py-2 text-xs text-torg-gray">{diaSemana(p.data)}</td>
                      <td className="px-4 py-2 text-xs font-mono text-torg-gray">{p.semana}</td>
                      <td className="px-4 py-2 text-xs font-mono text-torg-blue">{p.op?.numero || "—"}</td>
                      <td className="px-4 py-2 text-right text-torg-gray tabular-nums">{fmtKg(p.pesoPrevistoKg)}</td>
                      <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(p.pesoRealizadoKg)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                        p.pesoPrevistoKg === 0 ? "text-torg-gray" :
                        ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"
                      }`}>
                        {p.pesoPrevistoKg === 0 ? "—" : `${ader.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setModalProd(p)}
                          className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
                          <Pencil size={12} /> Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    if (file.size > 10 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 10MB).");
      return;
    }
    setErro("");
    setItens([]);
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch("/api/producao/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, fileName: file.name }),
      });
      const data = await resp.json();
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

