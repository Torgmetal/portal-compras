"use client";
import { useEffect, useState } from 'react';
import { FileText, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export default function PropostaObraConsulta({ opId }) {
 const [proposta,setProposta]=useState(null);
 const [loading,setLoading]=useState(true);
 const [erro,setErro]=useState('');
 const [aberta,setAberta]=useState(false);
 const [tentativa,setTentativa]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setErro('');setProposta(null);setAberta(false);
  fetch(`/api/comercial/op/${opId}/proposta-consulta`,{cache:'no-store',signal:controller.signal})
   .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível carregar a proposta.');return j;})
   .then(j=>{if(!controller.signal.aborted)setProposta(j.proposta);})
   .catch(e=>{if(!controller.signal.aborted)setErro(e.message);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[opId,tentativa]);
 return <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" aria-label="Proposta da obra">
  <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
   <div className="min-w-0"><h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><FileText size={18} className="text-torg-blue" /> Proposta da obra</h3>
    {proposta&&<p className="mt-1 text-sm text-torg-gray break-all">{proposta.nome}</p>}
   </div>
   {proposta&&!proposta.pendente&&<button type="button" onClick={()=>setAberta(v=>!v)} aria-expanded={aberta} aria-controls="leitor-proposta-obra" className="inline-flex items-center gap-2 rounded-lg border border-torg-blue px-3 py-2 text-sm font-medium text-torg-blue hover:bg-blue-50">{aberta?<ChevronUp size={16}/>:<ChevronDown size={16}/>} {aberta?'Fechar consulta':'Visualizar proposta'}</button>}
  </div>
  {loading&&<p className="px-5 pb-5 text-sm text-torg-gray flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin"/> Consultando a proposta no servidor…</p>}
  {erro&&<div className="px-5 pb-5"><p className="text-sm text-red-700" role="alert">{erro}</p><button type="button" onClick={()=>setTentativa(v=>v+1)} className="mt-3 text-sm text-torg-blue flex items-center gap-2"><RefreshCw size={14}/> Tentar novamente</button></div>}
  {!loading&&!erro&&!proposta&&<p className="px-5 pb-5 text-sm text-torg-gray">Nenhuma proposta técnica ou comercial localizada nas propostas vinculadas ou na pasta desta obra.</p>}
  {proposta&&!proposta.pendente&&<p className="px-5 pb-4 text-xs text-torg-gray">{proposta.tipo==='TECNICA'?'Proposta técnica':'Proposta comercial · conteúdo técnico'} · Revisão {String(proposta.revisao).padStart(2,'0')} · Consulta sem informações financeiras</p>}
  {proposta?.pendente&&<p className="px-5 pb-5 text-sm text-amber-800">Proposta localizada. Esta versão ainda precisa de preparação e conferência para consulta sem valores financeiros.</p>}
  {aberta&&proposta&&!proposta.pendente&&<div id="leitor-proposta-obra" className="border-t border-gray-100">
   <div className="px-5 py-3 bg-blue-50/50 text-sm text-torg-gray">Conteúdo técnico para consulta, sem informações financeiras. A diagramação e as imagens do documento original não são reproduzidas. A proposta pode abranger mais itens que esta OP; confira o escopo contratado em Informações da obra.</div>
   <article className="max-w-4xl mx-auto px-5 py-6 space-y-7">
    {proposta.secoes.map((s,i)=><section key={`${s.titulo}-${i}`}><h4 className="text-base font-semibold text-torg-dark mb-3">{s.titulo}</h4><div className="space-y-2">{s.paragrafos.map((p,j)=><p key={j} className="text-sm leading-relaxed text-torg-gray whitespace-pre-wrap break-words">{p}</p>)}</div></section>)}
   </article>
  </div>}
 </section>;
}
