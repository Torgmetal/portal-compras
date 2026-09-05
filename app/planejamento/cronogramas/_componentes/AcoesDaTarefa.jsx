"use client";
import { Loader2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { DuracaoInline } from "./ReorderTarefas";
import { fmtData } from "../_lib/formatos";

// Botoes de status, editar, registrar avanco e excluir de uma tarefa.
export function AcoesDaTarefa({
  atrasada,
  atrasoDias,
  concluida,
  deleting,
  editing,
  excluirTarefa,
  onRefresh,
  pct,
  readOnly,
  setEditing,
  setPct,
  setShowReg,
  showReg,
  t,
  tipoDias,
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] text-torg-gray whitespace-nowrap">
        {fmtData(t.dataInicioPrevista)} — {fmtData(t.dataFimPrevista)}
        {t.duracaoDias > 0 && (readOnly || t.isSummary) && (
          <span className="ml-1 text-torg-blue font-semibold" title={`Duração: ${t.duracaoDias} ${(tipoDias || "DU") === "DU" ? "dias úteis" : "dias corridos"}`}>
            ({t.duracaoDias}d)
          </span>
        )}
        {t.dataFimBase && t.dataFimPrevista && new Date(t.dataFimPrevista) > new Date(t.dataFimBase) && (
          <span className="ml-1 text-red-500 font-semibold" title={`Baseline: ${fmtData(t.dataFimBase)}`}>
            ▲{Math.ceil((new Date(t.dataFimPrevista) - new Date(t.dataFimBase)) / 86400000)}d
          </span>
        )}
      </span>

      {(t.dataInicioReal || t.dataFimReal) && (
        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap" title="Execução real (a data prevista não muda)">
          Real: {t.dataInicioReal ? fmtData(t.dataInicioReal) : "…"} — {t.dataFimReal ? fmtData(t.dataFimReal) : "em andamento"}
        </span>
      )}
      {!t.isSummary && atrasoDias > 0 && (
        <span className="text-[9px] text-white bg-red-500 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
          title={`${t.dataFimReal ? "Terminou" : concluida ? "Terminou" : "Está"} ${atrasoDias} dia(s) após o fim previsto (${fmtData(t.dataFimPrevista)})`}>
          +{atrasoDias}d atraso
        </span>
      )}

      {!readOnly && !editing && !t.isSummary && (
        <DuracaoInline tarefa={t} tipoDias={tipoDias} onSaved={onRefresh} />
      )}
      {!readOnly && !editing && !t.isSummary && (
        <button
          onClick={() => setEditing(true)}
          className="px-2 py-0.5 text-[10px] font-semibold text-torg-blue bg-torg-blue-50 border border-torg-blue-100 rounded hover:bg-torg-blue-100 flex items-center gap-1"
          title="Editar atividade — nome, datas, duração e antecessoras"
        >
          <Pencil size={10} /> Editar
        </button>
      )}
      {!readOnly && !editing ? (
        <button
          onClick={() => setEditing(true)}
          title="Clique para editar (progresso, datas, antecessoras)"
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
            concluida ? "bg-emerald-100 text-emerald-700"
            : atrasada ? "bg-red-100 text-red-700"
            : pct > 0 ? "bg-torg-blue-50 text-torg-blue"
            : "bg-gray-100 text-torg-gray"
          } hover:opacity-80 cursor-pointer`}
        >
          {pct}%
        </button>
      ) : readOnly ? (
        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
          concluida ? "bg-emerald-100 text-emerald-700"
          : atrasada ? "bg-red-100 text-red-700"
          : pct > 0 ? "bg-torg-blue-50 text-torg-blue"
          : "bg-gray-100 text-torg-gray"
        }`}>
          {pct}%
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-12 text-[10px] px-1 py-0.5 border border-gray-200 rounded text-center"
          />
          <span className="text-[10px] text-torg-gray">%</span>
        </div>
      )}

      {!readOnly && (
        <>
          <button
            onClick={() => setShowReg(!showReg)}
            className="p-0.5 text-torg-gray hover:text-torg-blue rounded"
            title="Adicionar registro"
          >
            <MessageSquarePlus size={12} />
          </button>
          <button
            onClick={excluirTarefa}
            disabled={deleting}
            className="p-0.5 text-torg-gray hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Excluir tarefa"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </>
      )}
    </div>
  );
}
