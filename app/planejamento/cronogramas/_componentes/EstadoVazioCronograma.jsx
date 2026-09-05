"use client";
import { GanttChart, Plus } from "lucide-react";

// Sem tarefas ainda: convite pra criar a primeira ou importar.
export function EstadoVazioCronograma({
  readOnly,
  setAddingGlobal,
}) {
  return (
    <div className="py-8 text-center">
      <GanttChart size={28} className="mx-auto text-gray-300 mb-2" />
      <p className="text-sm text-torg-gray mb-1">Cronograma vazio.</p>
      {!readOnly ? (
        <>
          <p className="text-xs text-torg-gray mb-4">Adicione as tarefas de cada departamento.</p>
          <button
            onClick={() => setAddingGlobal(true)}
            className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Adicionar Tarefa
          </button>
        </>
      ) : (
        <p className="text-xs text-torg-gray">Nenhuma tarefa registrada neste cronograma.</p>
      )}
    </div>
  );
}
