"use client";
import { useState } from "react";
import { fmtOP } from "@/lib/utils";
import { Check, ChevronRight, Loader2, Milestone, Pencil, RefreshCw, X } from "lucide-react";
import { CronogramaExpandido } from "./CronogramaExpandido";
import { fmtData } from "../_lib/formatos";

export function SoloView({ soloCrono, soloId, detail, loadingDetail, onBack, onRefresh, onRenamed }) {
  // Calcula atrasados a partir das tarefas reais (não do summary que pode estar desatualizado)
  const atrasadosReal = detail?.tarefas
    ? detail.tarefas.filter((t) => !t.isSummary && t.dataFimPrevista && new Date(t.dataFimPrevista) < new Date() && t.percentualRealizado < 100).length
    : (soloCrono?.atrasados || 0);
  const [editingTitulo, setEditingTitulo] = useState(false);
  const [tituloEdit, setTituloEdit] = useState("");
  const [savingTitulo, setSavingTitulo] = useState(false);

  const startEdit = () => {
    setTituloEdit(soloCrono?.titulo || "");
    setEditingTitulo(true);
  };

  const salvarTitulo = async () => {
    const novo = tituloEdit.trim();
    if (!novo || novo === soloCrono?.titulo) {
      setEditingTitulo(false);
      return;
    }
    setSavingTitulo(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${soloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: novo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao salvar");
      }
      setEditingTitulo(false);
      onRenamed(); // recarrega lista pra pegar titulo novo
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingTitulo(false);
    }
  };

  // Vincular o cronograma a uma OP aberta (passa a seguir Syneco/peso da obra).
  const [vincOpen, setVincOpen] = useState(false);
  const [vincOps, setVincOps] = useState(null);
  const [vincSel, setVincSel] = useState("");
  const [vincSaving, setVincSaving] = useState(false);
  const abrirVincular = async () => {
    setVincOpen(true);
    if (vincOps === null) {
      try { const r = await fetch("/api/planejamento/cronogramas/manual"); const j = await r.json(); setVincOps(j.ops || []); }
      catch { setVincOps([]); }
    }
  };
  const vincularOp = async () => {
    if (!vincSel) return;
    setVincSaving(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${soloId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vincularOpId: vincSel }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Erro ao vincular"); }
      setVincOpen(false); setVincSel(""); onRenamed();
    } catch (e) { alert(e.message); } finally { setVincSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100"
          title="Voltar para lista"
        >
          <ChevronRight size={18} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {soloCrono ? (
              <>
                <h2 className="text-xl sm:text-2xl font-extrabold text-torg-dark tracking-tight shrink-0">
                  {fmtOP(soloCrono.opNumero)}
                </h2>
                {editingTitulo ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="text"
                      value={tituloEdit}
                      onChange={(e) => setTituloEdit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvarTitulo();
                        if (e.key === "Escape") setEditingTitulo(false);
                      }}
                      className="flex-1 min-w-0 text-sm font-medium text-torg-dark px-2 py-1 border border-torg-blue rounded-lg outline-none focus:ring-2 focus:ring-torg-blue/30"
                      autoFocus
                      disabled={savingTitulo}
                    />
                    <button
                      onClick={salvarTitulo}
                      disabled={savingTitulo}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-50"
                      title="Salvar"
                    >
                      {savingTitulo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingTitulo(false)}
                      className="p-1.5 text-torg-gray hover:bg-gray-100 rounded-lg"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm text-torg-dark font-medium truncate">{soloCrono.titulo}</span>
                    <button
                      onClick={startEdit}
                      className="p-1 text-torg-gray hover:text-torg-blue hover:bg-gray-100 rounded shrink-0"
                      title="Editar nome"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
                {!editingTitulo && soloCrono.op && <span className="text-xs text-torg-gray shrink-0">({soloCrono.op.cliente})</span>}
                {!editingTitulo && !soloCrono.op && (
                  <div className="relative shrink-0">
                    <button onClick={abrirVincular} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2 py-1 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50" title="Vincular a uma OP aberta pra o cronograma seguir o Syneco/peso da obra">
                      <Milestone size={12} /> Vincular à OP
                    </button>
                    {vincOpen && (
                      <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-80">
                        <p className="text-[10px] text-torg-gray mb-1.5 font-medium">Escolha a OP aberta pra vincular:</p>
                        <select value={vincSel} onChange={(e) => setVincSel(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mb-2 bg-white">
                          <option value="">{vincOps === null ? "Carregando…" : "Selecione…"}</option>
                          {(vincOps || []).map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}{o.obra ? ` (${o.obra})` : ""}</option>)}
                        </select>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setVincOpen(false)} className="text-xs text-torg-gray px-2 py-1 rounded hover:bg-gray-100">Cancelar</button>
                          <button onClick={vincularOp} disabled={!vincSel || vincSaving} className="text-xs text-white bg-torg-blue px-2.5 py-1 rounded disabled:opacity-40 inline-flex items-center gap-1">{vincSaving && <Loader2 size={12} className="animate-spin" />} Vincular</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <h2 className="text-xl font-extrabold text-torg-dark tracking-tight">Cronograma</h2>
            )}
          </div>
          {soloCrono && (
            <p className="text-xs text-torg-gray mt-0.5">
              {fmtData(soloCrono.dataInicio)} — {fmtData(soloCrono.dataFim)}
              {atrasadosReal > 0 && (
                <span className="ml-2 text-red-600 font-semibold">{atrasadosReal} atrasado{atrasadosReal > 1 ? "s" : ""}</span>
              )}
            </p>
          )}
        </div>
        <button onClick={onRefresh} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <CronogramaExpandido
          detail={detail}
          loadingDetail={loadingDetail}
          onRefreshDetail={onRefresh}
          cronogramaId={soloId}
          onDeleted={onBack}
          onEncerrado={onBack}
          opStatus={soloCrono?.op?.status}
        />
      </div>
    </div>
  );
}
