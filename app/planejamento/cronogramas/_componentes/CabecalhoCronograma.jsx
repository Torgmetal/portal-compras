"use client";
import { Archive, Calendar, FileDown, LockKeyhole, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { MenuAcoesCronograma } from "./MenuAcoesCronograma";

export function CabecalhoCronograma({ detail, readOnly, cronogramaId, definirDataBase, settingBase, alterarTipoDias, savingTipoDias, enviarTarefas, enviandoTarefas, abrirEnvio, encerrarCronograma, encerrando, excluirCronograma, deleting }) {
  const enviadas = !!detail.tarefasEnviadasEm;
  return <div className="border-b border-gray-200/70 bg-slate-50/50 px-4 sm:px-5 py-5">
    {readOnly && <p className="mb-4 flex items-center gap-2 text-xs font-medium text-torg-gray"><Archive size={14}/> Somente consulta</p>}
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr] gap-5 md:gap-6">
      <div>
        <p className="mb-2 text-xs font-medium text-torg-gray">Data-base</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold tabular-nums text-torg-dark">{detail.dataBase ? new Date(detail.dataBase).toLocaleDateString("pt-BR") : "Não definida"}</span>
          {!readOnly && <button onClick={definirDataBase} disabled={settingBase} className="text-xs font-medium text-torg-blue hover:underline disabled:opacity-50">{settingBase ? "Salvando…" : detail.dataBase ? "Redefinir" : "Definir"}</button>}
        </div>
        {detail.dataBase && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-torg-gray" title="Datas do cronograma travadas pela data-base"><LockKeyhole size={12}/> Datas fixadas</p>}
      </div>
      <div>
        <label htmlFor={`calendario-${cronogramaId}`} className="mb-2 flex items-center gap-1.5 text-xs font-medium text-torg-gray"><Calendar size={13}/> Calendário</label>
        {readOnly ? <p className="text-sm font-semibold text-torg-dark">{detail.tipoDias === "DC" ? "Dias corridos" : "Dias úteis"}</p> : <select id={`calendario-${cronogramaId}`} value={detail.tipoDias || "DU"} onChange={e => alterarTipoDias(e.target.value)} disabled={savingTipoDias} className="max-w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-7 text-xs font-medium text-torg-dark focus:border-torg-blue focus:outline-none disabled:opacity-50"><option value="DU">Dias úteis (seg–sex)</option><option value="DC">Dias corridos</option></select>}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-torg-gray">Tarefas para os setores</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className={`text-sm font-medium ${enviadas ? "text-emerald-700" : "text-torg-dark"}`}>{enviadas ? `Enviadas em ${new Date(detail.tarefasEnviadasEm).toLocaleDateString("pt-BR")}` : "Ainda não enviadas"}</p><p className="mt-1 text-xs text-torg-gray">{enviadas ? "Disponíveis na sequência dos setores." : "Não aparecem na sequência dos setores."}</p></div>
          {!readOnly && <button onClick={() => enviarTarefas(enviadas)} disabled={enviandoTarefas} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-torg-dark hover:bg-slate-100 disabled:opacity-50"><Send size={14}/>{enviandoTarefas ? "Aguarde…" : enviadas ? "Recolher tarefas" : "Enviar tarefas"}</button>}
        </div>
      </div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200/70 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <MenuAcoesCronograma titulo="Exportar" icone={FileDown} itens={[
          !readOnly && {titulo:"Gantt em PDF",descricao:"Para leitura e impressão.",icone:FileDown,acao:() => window.open(`/api/planejamento/cronogramas/${cronogramaId}/pdf`, "_blank")},
          {titulo:"MS Project (XML)",descricao:"Arquivo para abrir no Microsoft Project.",icone:FileDown,acao:() => {window.location.href = `/api/planejamento/cronogramas/${cronogramaId}/msproject`;}}
        ]}/>
        {!readOnly && <MenuAcoesCronograma direita titulo="Mais ações" icone={MoreHorizontal} itens={[
          {titulo:"Encerrar cronograma",descricao:"Mover para o histórico.",icone:Archive,carregando:encerrando,acao:encerrarCronograma},
          {titulo:"Excluir cronograma",descricao:"Excluir tarefas e registros.",icone:Trash2,perigo:true,carregando:deleting,acao:excluirCronograma}
        ]}/>}
      </div>
      {!readOnly && <button onClick={abrirEnvio} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-torg-blue px-4 py-2 text-xs font-semibold text-white hover:bg-torg-dark"><Send size={15}/> Enviar ao cliente</button>}
    </div>
  </div>;
}
