"use client";
import { Calendar, Copy, Download, GanttChart, List, Loader2, RotateCcw, SlidersHorizontal, Weight } from "lucide-react";
import { MenuAcoesCronograma } from "./MenuAcoesCronograma";

export function BarraControlesCronograma({ abrirCopiar, abrirGerar, isVitor, readOnly, recalculando, recalcular, setShowImportPeso, setViewMode, temPeso, viewMode }) {
  return <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 sm:px-5 py-4">
    <div className="flex flex-wrap items-center gap-2">
      {!readOnly && <button onClick={abrirGerar} title="Prévia das datas a partir do início, das durações e das antecessoras." className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-torg-dark hover:bg-slate-50"><Calendar size={15}/> Gerar datas</button>}
      <MenuAcoesCronograma titulo="Ferramentas" icone={SlidersHorizontal} itens={[
        {titulo:temPeso ? "Atualizar pesos" : "Importar peso",icone:Download,acao:() => setShowImportPeso(true)},
        {titulo:"Recalcular datas",descricao:"Atualizar as datas a partir das antecessoras.",icone:RotateCcw,carregando:recalculando,acao:recalcular},
        !readOnly && isVitor && {titulo:"Copiar para outra OP",icone:Copy,acao:abrirCopiar},
      ]}/>
      {recalculando && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-torg-gray"><Loader2 size={13} className="animate-spin"/> Recalculando…</span>}
    </div>
    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs text-torg-gray"><Weight size={13}/>{temPeso ? "Peso importado" : "Sem peso"}</span>
      <div role="group" aria-label="Visualização do cronograma" className="flex rounded-lg bg-slate-100 p-1">
        {[{id:"lista",titulo:"Lista",icone:List},{id:"gantt",titulo:"Gantt",icone:GanttChart}].map(({id,titulo,icone:Icon}) => <button key={id} onClick={() => setViewMode(id)} aria-pressed={viewMode === id} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === id ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}><Icon size={14}/>{titulo}</button>)}
      </div>
    </div>
  </div>;
}
