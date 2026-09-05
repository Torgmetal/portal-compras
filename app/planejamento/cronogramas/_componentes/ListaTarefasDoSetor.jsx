"use client";
import { corDaArea } from "@/lib/cronograma-area-cor";
import { Check, ChevronDown, ChevronRight, Layers, Loader2, Pencil, Plus } from "lucide-react";
import { AntecessorasPicker } from "./AntecessorasPicker";
import { ReorderTarefas } from "./ReorderTarefas";

// As tarefas do setor, com o modo de reordenar.
export function ListaTarefasDoSetor({
  addNaArea,
  addingTask,
  adicionarTarefa,
  allTarefas,
  areas,
  areasCollapsed,
  areasExistentes,
  dept,
  gruposArea,
  linhaTarefa,
  moverLocal,
  newTaskAntecessoras,
  newTaskArea,
  newTaskDuracao,
  newTaskFim,
  newTaskInicio,
  newTaskName,
  ordemLocal,
  readOnly,
  renomearArea,
  reordenando,
  salvandoOrdem,
  salvarOrdem,
  savingTask,
  setAddingTask,
  setNewTaskAntecessoras,
  setNewTaskArea,
  setNewTaskDuracao,
  setNewTaskFim,
  setNewTaskInicio,
  setNewTaskName,
  setReordenando,
  tasks,
  temAreas,
  tipoDias,
  toggleArea,
}) {
  return (
    <div className="ml-6 space-y-1">
      {reordenando ? (
        <>
          <div className="flex items-center gap-2 px-1 pb-1 flex-wrap">
            <span className="text-[11px] text-torg-blue font-medium">Mova com ↑ ↓ e clique em <b>Salvar ordem</b>. O Gantt e o MS Project atualizam depois de salvar.</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setReordenando(false)} className="text-[11px] text-torg-gray hover:text-torg-dark px-2 py-1">Cancelar</button>
              <button onClick={salvarOrdem} disabled={salvandoOrdem} className="text-[11px] font-semibold text-white bg-torg-blue hover:bg-torg-blue-700 px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1">
                {salvandoOrdem ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />} Salvar ordem
              </button>
            </div>
          </div>
          <ReorderTarefas ordem={ordemLocal} onMove={moverLocal} areas={areas} />
        </>
      ) : (
      <>
      {!temAreas
        ? tasks.map((t) => linhaTarefa(t))
        : gruposArea.map(([area, ts]) => {
            if (!area) return (
              <div key="__sem_area__" className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-torg-gray/70 px-1 pt-1">Sem área</p>
                {ts.map((t) => linhaTarefa(t))}
              </div>
            );
            const cor = corDaArea(area, areas);
            return (
              <div key={area} className="rounded-lg border" style={{ borderColor: cor.border + "55", backgroundColor: cor.bg + "22" }}>
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <button onClick={() => toggleArea(area)} className="text-torg-gray hover:text-torg-blue">
                    {areasCollapsed.has(area) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <span className="text-[11px] font-bold rounded px-2 py-0.5 flex items-center gap-1 border" style={{ backgroundColor: cor.bg, borderColor: cor.border, color: cor.text }}>
                    <Layers size={10} /> {area}
                  </span>
                  <span className="text-[10px] text-torg-gray">{ts.length} tarefa{ts.length > 1 ? "s" : ""}</span>
                  {!readOnly && (
                    <>
                      <button onClick={() => renomearArea(area)} title="Renomear área (renomeia em todas as tarefas)" className="text-torg-gray hover:text-torg-blue p-0.5"><Pencil size={11} /></button>
                      <button onClick={() => addNaArea(area)} title="Adicionar tarefa nesta área" className="text-torg-gray hover:text-torg-blue p-0.5"><Plus size={12} /></button>
                    </>
                  )}
                </div>
                {!areasCollapsed.has(area) && (
                  <div className="ml-3 pl-2 border-l space-y-1 pb-1" style={{ borderColor: cor.border + "77" }}>
                    {ts.map((t) => linhaTarefa(t))}
                  </div>
                )}
              </div>
            );
          })}
      {tasks.length === 0 && (
        <p className="text-xs text-torg-gray italic py-2">Nenhuma tarefa neste departamento.</p>
      )}

      {/* Adicionar tarefa */}
      {!readOnly && (!addingTask ? (
        <button
          onClick={() => setAddingTask(true)}
          className="flex items-center gap-1 text-[10px] text-torg-gray hover:text-torg-blue py-1 px-2 rounded hover:bg-gray-50 transition-colors"
        >
          <Plus size={10} /> Adicionar tarefa
        </button>
      ) : (
        <div className="rounded-lg border border-torg-blue/30 bg-torg-blue-50/30 p-2.5 space-y-2">
          <input
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            placeholder="Nome da tarefa..."
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-white"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTaskName.trim()) adicionarTarefa();
              if (e.key === "Escape") { setAddingTask(false); setNewTaskName(""); setNewTaskInicio(""); setNewTaskFim(""); setNewTaskArea(""); }
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-torg-gray">Início:</span>
              <input type="date" value={newTaskInicio} onChange={(e) => setNewTaskInicio(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-torg-gray">Fim:</span>
              <input type="date" value={newTaskFim} onChange={(e) => setNewTaskFim(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-torg-gray">Duração:</span>
              <input type="number" min={0} max={9999} value={newTaskDuracao || ""} onChange={(e) => setNewTaskDuracao(Math.max(0, parseInt(e.target.value) || 0))} className="w-14 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-center" placeholder="0" />
              <span className="text-[9px] text-torg-gray">{(tipoDias || "DU") === "DU" ? "DU" : "DC"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-torg-gray">Área:</span>
            <input
              value={newTaskArea}
              onChange={(e) => setNewTaskArea(e.target.value)}
              list={`areas-add-${dept}`}
              placeholder="A, B, Galpão… (opcional)"
              className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white w-44"
            />
            <datalist id={`areas-add-${dept}`}>
              {areasExistentes.map((a) => <option key={a} value={a} />)}
            </datalist>
            <span className="text-[9px] text-torg-gray">agrupa dentro do setor</span>
          </div>
          {/* Antecessoras na criação */}
          <AntecessorasPicker
            tarefaId={null}
            allTarefas={allTarefas}
            selecionadas={newTaskAntecessoras}
            onChange={setNewTaskAntecessoras}
            compact
            areaAtual={newTaskArea}
          />
          <div className="flex items-center gap-1 justify-end">
              <button
                onClick={() => { setAddingTask(false); setNewTaskName(""); setNewTaskInicio(""); setNewTaskFim(""); setNewTaskDuracao(0); setNewTaskAntecessoras([]); setNewTaskArea(""); }}
                className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark"
              >
                Cancelar
              </button>
              <button
                onClick={adicionarTarefa}
                disabled={savingTask || !newTaskName.trim()}
                className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium"
              >
                {savingTask ? "..." : "Adicionar"}
              </button>
          </div>
        </div>
      ))}
      </>
      )}
    </div>
  );
}
