'use client';
import {useRef,useState} from 'react';
import {Save,Undo2,SlidersHorizontal,X,Loader2,AlertTriangle} from 'lucide-react';
import EditorMontagemCarga from './EditorMontagemCarga';
const botao='min-h-11 px-3 rounded-lg border border-slate-200 text-sm font-semibold bg-white text-torg-dark disabled:opacity-40';
export default function MontagemCargaWorkspace({Visualizador,carga,malhas,madeira,selecionado,onSelecionar,onAlterar,onSalvar,onDesfazer,onCancelar,podeDesfazer,salvando,erro}){
 const [painel,setPainel]=useState(null),editor=useRef(null);
 const salvar=()=>painel==='medidas'&&editor.current?editor.current.salvar():onSalvar(carga);
 return <section aria-label="Editor de montagem da carga" className="flex-1 min-h-0 flex flex-col relative bg-slate-100">
  <div className="px-3 py-2 bg-white border-b flex gap-2 items-center shrink-0">
   <label className="flex-1 min-w-0"><span className="sr-only">Volume selecionado</span><select aria-label="Volume selecionado" value={selecionado||''} onChange={e=>onSelecionar(e.target.value)} disabled={salvando} className="w-full h-11 rounded-lg border border-slate-200 px-2 text-sm font-semibold text-torg-dark">{carga.itens.map(u=><option key={u.id} value={u.id}>Volume {u.volume} · {[...new Set(u.membros?.map(m=>m.marca)||[])].join(', ')||u.rotulo}</option>)}</select></label>
   <button className={botao} disabled={salvando} aria-expanded={painel==='medidas'} onClick={()=>setPainel(p=>p==='medidas'?null:'medidas')}><SlidersHorizontal size={17} className="inline sm:mr-1"/><span className="hidden sm:inline">Medidas e ordem</span><span className="sr-only sm:hidden">Medidas e ordem</span></button>
   {!!carga.verificacoes?.length&&<button className={`${botao} text-amber-800 border-amber-300`} aria-label={`Conferências da montagem: ${carga.verificacoes.length}`} onClick={()=>setPainel(p=>p==='avisos'?null:'avisos')}><AlertTriangle size={16} className="inline mr-1"/>{carga.verificacoes.length}</button>}
  </div>
  {erro&&<p role="alert" className="text-red-700 text-sm px-3 py-2 bg-red-50 shrink-0">{erro}</p>}
  <div className="flex-1 min-h-0 relative flex">
   <div className="flex-1 min-w-0 min-h-0"><Visualizador carga={carga} malhas={malhas} madeira={madeira} preencher volumeSelecionado={selecionado} onSelecionarVolume={onSelecionar} onAlterarMontagem={salvando?null:onAlterar} onDesfazer={onDesfazer} podeDesfazer={podeDesfazer}/></div>
   {painel&&<aside aria-label={painel==='medidas'?'Medidas e ordem':'Conferências da montagem'} className="absolute inset-y-0 right-0 z-10 w-[min(350px,100%)] lg:relative lg:w-[330px] shrink-0 flex flex-col bg-white shadow-xl border-l border-slate-200">
    <div className="flex items-center gap-2 p-3 border-b"><b className="flex-1 text-sm text-torg-dark">{painel==='medidas'?'Medidas e ordem':'Conferências da montagem'}</b><button aria-label="Fechar painel" className="h-11 w-11 rounded-lg hover:bg-slate-100" onClick={()=>setPainel(null)}><X size={18} className="mx-auto"/></button></div>
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">{painel==='medidas'?<EditorMontagemCarga apiRef={editor} carga={carga} selecionado={selecionado} onSelecionar={onSelecionar} onAlterar={onAlterar} onSalvar={onSalvar} onDesfazer={onDesfazer} onCancelar={onCancelar} podeDesfazer={podeDesfazer} salvando={salvando}/>:<><p className="text-xs text-torg-gray mb-3">Volumes fora da carroceria e possíveis sobreposições continuam sinalizados. Confira a montagem antes de gerar o PDF.</p><ul className="space-y-3 text-sm text-amber-900">{carga.verificacoes?.map((v,i)=><li key={i}>{v.texto}</li>)}</ul></>}</div>
   </aside>}
  </div>
  <footer className="shrink-0 bg-white border-t p-2 sm:px-4 flex items-center gap-2" style={{paddingBottom:'max(8px,env(safe-area-inset-bottom))'}}>
   <button className={botao} onClick={onDesfazer} disabled={!podeDesfazer||salvando}><Undo2 size={16} className="inline sm:mr-1"/><span className="hidden sm:inline">Desfazer</span><span className="sr-only sm:hidden">Desfazer</span></button>
   <button className={botao} onClick={onCancelar} disabled={salvando}>Cancelar</button>
   <p className="hidden md:block text-xs text-torg-gray">Montagem livre · alterações ainda não salvas</p>
   <button className="ml-auto min-h-11 rounded-lg bg-torg-blue text-white px-4 text-sm font-semibold disabled:opacity-50" onClick={salvar} disabled={salvando}>{salvando?<Loader2 size={16} className="inline mr-2 animate-spin"/>:<Save size={16} className="inline mr-2"/>}Salvar montagem</button>
  </footer>
 </section>;
}
