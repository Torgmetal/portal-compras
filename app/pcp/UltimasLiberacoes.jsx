'use client';
import {useState} from 'react';
import Link from 'next/link';
import {BellRing,ArrowUpRight,ChevronDown} from 'lucide-react';
import {fmtOP} from '@/lib/utils';
import {ultimasLiberacoesPcp,historicoLiberacoesPcp,NOMES_SETORES_LIBERACAO} from '@/lib/pcp-ultimas-liberacoes';
export default function UltimasLiberacoes({ops,onAbrir}){
 const [todas,setTodas]=useState(false);
 const [verHist,setVerHist]=useState(false);
 const lista=ultimasLiberacoesPcp(ops);
 const hist=historicoLiberacoesPcp(ops);
 if(!lista.length&&!hist.length)return null;
 return <section className="rounded-xl border border-torg-blue-100 bg-white overflow-hidden" aria-label="Últimas liberações do Planejamento">
  {lista.length>0&&<><div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark"><BellRing size={16} className="text-torg-orange"/> Últimas liberações do Planejamento</h2><p className="mt-1 text-xs text-torg-gray">Confira as novas peças por OP e setor. O agendamento é feito aqui no PCP.</p></div><span className="text-xs text-torg-gray">Mais recentes primeiro</span></div>
  <div className="divide-y divide-gray-100">{(todas?lista:lista.slice(0,4)).map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-torg-blue">{fmtOP(l.opNumero)}</b><span className="text-xs font-medium text-torg-dark">{(l.setores||[]).map(k=>NOMES_SETORES_LIBERACAO[k]||k).join(' · ')}</span>{/* ⚠ o que FALTA agendar, não o total do dia da liberação: a 105 de 01/09 tinha 1.166 gravadas e 41 peças de verdade na lista (Vitor, 08/09/2026: "ainda fica aparecendo as peças mesmo depois de importadas"). */}
     {(l.semDia??l.totalPecas)!=null&&<span className="text-xs text-torg-gray">{Number(l.semDia??l.totalPecas).toLocaleString('pt-BR')} peça(s) sem dia{l.total!=null&&l.total!==l.semDia?` · ${Number(l.total-l.semDia).toLocaleString('pt-BR')} já agendada(s)`:''}</span>}</div><p className="mt-1 text-xs text-torg-gray break-words">{l.frente||l.obra} · Liberado em {new Date(l.liberadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}{l.liberadoPorNome?` por ${l.liberadoPorNome}`:''}</p></div>
   {onAbrir?<button className="inline-flex items-center gap-1 text-xs font-semibold text-torg-blue" onClick={()=>onAbrir(l.opId,l.setores?.[0])}>Ver peças <ArrowUpRight size={14}/></button>:<Link className="inline-flex items-center gap-1 text-xs font-semibold text-torg-blue" href="/pcp/producao">Abrir programação <ArrowUpRight size={14}/></Link>}
  </div>)}</div>
  {lista.length>4&&<button className="w-full border-t border-gray-100 px-4 py-2 text-xs font-medium text-torg-blue hover:bg-torg-blue-50" onClick={()=>setTodas(!todas)}>{todas?'Mostrar menos':`Ver todas as ${lista.length} liberações ativas`}</button>}</>}
  {/* ⚠ O HISTÓRICO fica recolhido: já agendado não precisa de espaço na tela, mas some do aviso e
      não pode sumir da vista — a peça pode continuar sem ser produzida. */}
  {hist.length>0&&<div className={lista.length?'border-t border-gray-100':''}>
   <button className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-torg-gray hover:bg-gray-50" onClick={()=>setVerHist(!verHist)}>
    <span>Histórico · {hist.length} liberação(ões) já agendada(s){hist.some(h=>h.naoFeitas>0)?` — ${hist.reduce((s2,h)=>s2+(h.naoFeitas||0),0)} peça(s) ainda por produzir`:''}</span>
    <ChevronDown size={14} className={verHist?'rotate-180 transition':'transition'}/>
   </button>
   {verHist&&<div className="divide-y divide-gray-50 bg-gray-50/40">{hist.map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-xs text-torg-blue">{fmtOP(l.opNumero)}</b><span className="text-[11px] text-torg-dark">{(l.setores||[]).map(k=>NOMES_SETORES_LIBERACAO[k]||k).join(' · ')}</span><span className="text-[11px] text-torg-gray">{l.orfa?'—':`${Number(l.total??l.totalPecas??0).toLocaleString('pt-BR')} peças agendadas`}</span>{l.noTerceiro>0&&<span className="text-[11px] font-medium text-torg-orange">{Number(l.noTerceiro).toLocaleString('pt-BR')} no terceiro</span>}</div>
     <p className="mt-0.5 text-[11px] text-torg-gray">Liberado em {new Date(l.liberadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}{l.liberadoPorNome?` por ${l.liberadoPorNome}`:''}</p></div>
    <span className={`text-[11px] font-semibold ${l.orfa||(l.total===0&&l.noTerceiro>0)?'text-torg-gray':l.naoFeitas>0?'text-torg-orange':'text-emerald-600'}`}>{l.orfa?'peças reimportadas — vínculo perdido':l.naoFeitas>0?`faltam ${l.naoFeitas} produzir`:l.total===0&&l.noTerceiro>0?'está no terceiro':'tudo produzido'}</span>
   </div>)}</div>}
  </div>}
 </section>;
}
