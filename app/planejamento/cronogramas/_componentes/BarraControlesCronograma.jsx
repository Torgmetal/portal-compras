"use client";
import { Calendar, Copy, Download, FileDown, GanttChart, List, Loader2, RotateCcw, Weight } from "lucide-react";

// Peso importado, alternar Gantt/lista e recalcular datas.
export function BarraControlesCronograma({
  abrirCopiar,
  abrirGerar,
  cronogramaId,
  isVitor,
  readOnly,
  recalculando,
  recalcular,
  setShowImportPeso,
  setViewMode,
  temPeso,
  viewMode,
}) {
  return (
    <div className="px-4 py-2.5 bg-gray-50/40 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Weight size={13} className="text-torg-blue" />
          <span className="text-xs text-torg-gray">
            {temPeso ? "Peso importado" : "Sem peso"}
          </span>
        </div>
        <button
          onClick={() => setShowImportPeso(true)}
          className="px-3 py-1.5 text-[10px] font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5"
        >
          <Download size={11} /> {temPeso ? "Atualizar Pesos" : "Importar Peso"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        {/* Gerar datas automaticamente (início + duração + antecessoras) */}
        {!readOnly && (
          <button
            onClick={abrirGerar}
            className="px-3 py-1.5 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue-200 rounded-lg hover:bg-torg-blue-100 flex items-center gap-1.5"
            title="Gera as datas de todas as tarefas a partir de uma data de início + a duração de cada uma, seguindo as antecessoras. Mostra uma prévia antes de aplicar."
          >
            <Calendar size={11} /> Gerar Datas
          </button>
        )}
        {/* Recalcular datas */}
        <button
          onClick={recalcular}
          disabled={recalculando}
          className="px-3 py-1.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 disabled:opacity-50"
          title="Recalcula datas das tarefas baseado nas antecessoras. Tarefas atrasadas empurram as sucessoras."
        >
          {recalculando ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
          Recalcular Datas
        </button>
        {/* Exportar MS Project (.xml) — o cliente abre no Project dele pra validar */}
        <button
          onClick={() => { window.location.href = `/api/planejamento/cronogramas/${cronogramaId}/msproject`; }}
          className="px-3 py-1.5 text-[10px] font-medium text-torg-dark bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          title="Exporta este cronograma em XML do MS Project (.xml). O cliente abre no Project dele (Arquivo → Abrir → Importar) para validar/comparar."
        >
          <FileDown size={11} /> MS Project
        </button>
        {/* Copiar cronograma para outra OP — restrito ao Vitor por enquanto */}
        {!readOnly && isVitor && (
          <button
            onClick={abrirCopiar}
            className="px-3 py-1.5 text-[10px] font-medium text-torg-dark bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            title="Cria uma cópia deste cronograma vinculada a outra OP (mesma estrutura e datas)."
          >
            <Copy size={11} /> Copiar para OP
          </button>
        )}
        {/* Toggle lista / gantt */}
        <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("lista")}
            className={`px-2.5 py-1.5 text-[10px] font-medium flex items-center gap-1 transition-colors ${
              viewMode === "lista" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"
            }`}
          >
            <List size={11} /> Lista
          </button>
          <button
            onClick={() => setViewMode("gantt")}
            className={`px-2.5 py-1.5 text-[10px] font-medium flex items-center gap-1 transition-colors ${
              viewMode === "gantt" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"
            }`}
          >
            <GanttChart size={11} /> Gantt
          </button>
        </div>
      </div>
    </div>
  );
}
