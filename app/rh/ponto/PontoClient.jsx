"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Clock, Loader2, AlertCircle, RefreshCw, Inbox, Upload, Save, Download,
  Lock, LockOpen, ChevronRight, Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";

const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const extenso = (c) => {
  if (!c) return "";
  const [a, m] = c.split("-");
  const N = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${N[Number(m)] || m}/${a}`;
};

const EDIT = [
  { k: "horasExtras50", label: "HE 50%" },
  { k: "horasExtras100", label: "HE 100%" },
  { k: "faltas", label: "Faltas" },
  { k: "atrasos", label: "Atrasos" },
  { k: "adicionalNoturno", label: "Ad. Not." },
  { k: "dsr", label: "DSR" },
  { k: "ajudaCusto", label: "Ajuda Custo" },
];

export default function PontoClient() {
  const { showToast } = useStore();
  const [competencia, setCompetencia] = useState(mesAtual());
  const [competencias, setCompetencias] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [ponto, setPonto] = useState(null);
  const [itens, setItens] = useState([]);
  const [dirty, setDirty] = useState(new Set());
  const [expandido, setExpandido] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setDirty(new Set());
    try {
      const r = await fetch(`/api/rh/ponto?competencia=${competencia}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setCompetencias(d.competencias || []);
      setFuncionarios(d.funcionarios || []);
      setPonto(d.ponto || null);
      setItens(d.ponto?.itens || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const importar = async (file) => {
    if (!file) return;
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/rh/ponto/importar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar");
      showToast(`Ponto de ${d.competencia} importado — ${d.casados} casados, ${d.naoCasados} a vincular`, "success");
      setCompetencia(d.competencia);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setImportando(false);
    }
  };

  const editar = (id, campo, valor) => {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: valor === "" ? 0 : Number(valor) } : it)));
    setDirty((prev) => new Set(prev).add(id));
  };
  const editarObs = (id, valor) => {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, observacao: valor } : it)));
    setDirty((prev) => new Set(prev).add(id));
  };

  const salvar = async () => {
    if (dirty.size === 0) return;
    setSalvando(true);
    try {
      const payload = itens.filter((it) => dirty.has(it.id)).map((it) => ({
        id: it.id, horasExtras50: it.horasExtras50, horasExtras100: it.horasExtras100, faltas: it.faltas,
        atrasos: it.atrasos, adicionalNoturno: it.adicionalNoturno, dsr: it.dsr, ajudaCusto: it.ajudaCusto,
        observacao: it.observacao || null,
      }));
      const r = await fetch(`/api/rh/ponto/${ponto.id}/itens`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: payload }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(new Set());
      showToast(`${payload.length} linhas salvas`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const mapear = async (itemId, funcionarioId) => {
    if (!funcionarioId) return;
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}/mapear`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, funcionarioId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao vincular");
      setItens((prev) => prev.map((it) => (it.id === itemId ? { ...it, funcionarioId, nome: d.nome } : it)));
      showToast(`Vinculado a ${d.nome}${d.gravouPis ? " (PIS gravado no cadastro)" : ""}`, "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const mudarStatus = async (status) => {
    if (status === "FECHADA" && dirty.size > 0) { showToast("Salve antes de fechar", "error"); return; }
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setPonto((p) => ({ ...p, status }));
      showToast(status === "FECHADA" ? "Competência fechada" : "Competência reaberta", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const excluirImportacao = async () => {
    if (!confirm(`Excluir a importação de ponto de ${extenso(ponto.competencia)}? Isso apaga tudo para você reimportar o arquivo.`)) return;
    try {
      const r = await fetch(`/api/rh/ponto/${ponto.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao excluir");
      showToast("Importação excluída — pode reimportar", "success");
      setPonto(null); setItens([]);
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const fechada = ponto?.status === "FECHADA";
  const naoVinculados = itens.filter((it) => !it.funcionarioId).length;

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Clock className="text-torg-blue" /> Controle de Ponto
          </h2>
          <p className="text-sm text-torg-gray mt-1">Importe o arquivo ACJEF, vincule os PIS e preencha os totais por funcionário para a contabilidade.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-torg-gray">Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
        </div>
      </div>

      {/* Import */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-torg-gray">Arquivo <strong>ACJEF (.txt)</strong> gerado no sistema de ponto (Controle de Jornadas — Portaria 1510).</p>
        <label className={`px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 cursor-pointer ${importando ? "opacity-50 pointer-events-none" : ""}`}>
          {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {importando ? "Importando…" : "Importar ACJEF"}
          <input type="file" accept=".txt,text/plain" className="hidden"
            onChange={(e) => { importar(e.target.files[0]); e.target.value = ""; }} />
        </label>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : !ponto ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray mb-1">Nenhum ponto importado para <strong>{extenso(competencia)}</strong>.</p>
          <p className="text-xs text-torg-gray">Importe o arquivo ACJEF acima para começar.</p>
          {competencias.length > 0 && (
            <div className="mt-5 text-xs text-torg-gray">Histórico: {competencias.map((c) => (
              <button key={c.competencia} onClick={() => setCompetencia(c.competencia)} className="underline hover:text-torg-blue mx-1">{c.competencia}</button>
            ))}</div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-torg-dark">{extenso(ponto.competencia)}</span>
              {ponto.empresa && <span className="text-xs text-torg-gray">{ponto.empresa}</span>}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${fechada ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"}`}>{ponto.status}</span>
              <span className="text-xs text-torg-gray">{itens.length} funcionários</span>
              {naoVinculados > 0 && <span className="text-xs text-amber-600">{naoVinculados} sem vínculo</span>}
              {dirty.size > 0 && <span className="text-xs text-amber-600">{dirty.size} não salvos</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={excluirImportacao}
                className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5"
                title="Excluir a importação para reimportar o arquivo">
                <Trash2 size={14} /> Excluir importação
              </button>
              <a href={`/api/rh/ponto/${ponto.id}/export`} className="px-3 py-2 text-xs text-torg-dark border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Download size={14} /> Exportar</a>
              {fechada ? (
                <button onClick={() => mudarStatus("ABERTA")} className="px-3 py-2 text-xs text-torg-blue border border-torg-blue-200 rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5"><LockOpen size={14} /> Reabrir</button>
              ) : (
                <button onClick={() => mudarStatus("FECHADA")} className="px-3 py-2 text-xs text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Lock size={14} /> Fechar</button>
              )}
              <button onClick={salvar} disabled={salvando || dirty.size === 0 || fechada}
                className="px-4 py-2 bg-torg-orange text-white text-xs rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="text-xs whitespace-nowrap w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Funcionário / PIS</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase">Dias</th>
                    {EDIT.map((c) => <th key={c.k} className="px-2 py-2 text-right font-medium text-gray-500 uppercase">{c.label}</th>)}
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((it) => {
                    const dias = Array.isArray(it.marcacoes) ? it.marcacoes : [];
                    return (
                      <Fragment key={it.id}>
                        <tr className="hover:bg-gray-50/50">
                          <td className="px-2 py-1">
                            {it.funcionarioId ? (
                              <div className="font-medium text-torg-dark">{it.nome}</div>
                            ) : (
                              <select defaultValue="" onChange={(e) => mapear(it.id, e.target.value)}
                                className="border border-amber-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue max-w-[220px]">
                                <option value="">— vincular funcionário —</option>
                                {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.matricula ? ` (${f.matricula})` : ""}</option>)}
                              </select>
                            )}
                            <div className="text-[10px] text-torg-gray font-mono">{it.pisArquivo}</div>
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button onClick={() => setExpandido(expandido === it.id ? null : it.id)} className="inline-flex items-center gap-0.5 text-torg-blue hover:underline">
                              <ChevronRight size={12} className={expandido === it.id ? "rotate-90 transition-transform" : "transition-transform"} /> {dias.length}
                            </button>
                          </td>
                          {EDIT.map((c) => (
                            <td key={c.k} className="px-1 py-1 text-right">
                              <input type="number" step="0.01" value={it[c.k] ?? 0} disabled={fechada}
                                onChange={(e) => editar(it.id, c.k, e.target.value)}
                                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue disabled:bg-gray-50" />
                            </td>
                          ))}
                          <td className="px-1 py-1">
                            <input type="text" value={it.observacao || ""} disabled={fechada}
                              onChange={(e) => editarObs(it.id, e.target.value)} placeholder="—"
                              className="w-40 border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-torg-blue disabled:bg-gray-50" />
                          </td>
                        </tr>
                        {expandido === it.id && (
                          <tr className="bg-gray-50/60">
                            <td colSpan={EDIT.length + 3} className="px-4 py-2">
                              <div className="flex flex-wrap gap-2">
                                {dias.length === 0 ? <span className="text-[11px] text-torg-gray">sem marcações</span> : dias.map((d, i) => (
                                  <span key={i} className="text-[10px] bg-white border border-gray-100 rounded px-1.5 py-0.5 text-torg-gray">
                                    {d.data?.slice(8)}/{d.data?.slice(5, 7)}: {(d.marcacoes || []).join(" ") || "—"}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
