'use client';
import {useState} from 'react';
import Link from 'next/link';
import {BellRing,ArrowUpRight} from 'lucide-react';
import {fmtOP} from '@/lib/utils';
import {ultimasLiberacoesPcp,NOMES_SETORES_LIBERACAO} from '@/lib/pcp-ultimas-liberacoes';
export default function UltimasLiberacoes({ops,onAbrir}){
 const [todas,setTodas]=useState(false);
 const lista=ultimasLiberacoesPcp(ops);
 if(!lista.length)return null;
 return <section className="rounded-xl border border-torg-blue-100 bg-white overflow-hidden" aria-label="Últimas liberações do Planejamento">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark"><BellRing size={16} className="text-torg-orange"/> Últimas liberações do Planejamento</h2><p className="mt-1 text-xs text-torg-gray">Confira as novas peças por OP e setor. O agendamento é feito aqui no PCP.</p></div><span className="text-xs text-torg-gray">Mais recentes primeiro</span></div>
  <div className="divide-y divide-gray-100">{(todas?lista:lista.slice(0,4)).map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-torg-blue">{fmtOP(l.opNumero)}</b><span className="text-xs font-medium text-torg-dark">{(l.setores||[]).map(k=>NOMES_SETORES_LIBERACAO[k]||k).join(' · ')}</span>{l.totalPecas!=null&&<span className="text-xs text-torg-gray">{Number(l.totalPecas).toLocaleString('pt-BR')} peças</span>}</div><p className="mt-1 text-xs text-torg-gray break-words">{l.frente||l.obra} · Liberado em {new Date(l.liberadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}{l.liberadoPorNome?` por ${l.liberadoPorNome}`:''}</p></div>
   {onAbrir?<button className="inline-flex items-center gap-1 text-xs font-semibold text-torg-blue" onClick={()=>onAbrir(l.opId,l.setores?.[0])}>Ver peças <ArrowUpRight size={14}/></button>:<Link className="inline-flex items-center gap-1 text-xs font-semibold text-torg-blue" href="/pcp/producao">Abrir programação <ArrowUpRight size={14}/></Link>}
  </div>)}</div>
  {lista.length>4&&<button className="w-full border-t border-gray-100 px-4 py-2 text-xs font-medium text-torg-blue hover:bg-torg-blue-50" onClick={()=>setTodas(!todas)}>{todas?'Mostrar menos':`Ver todas as ${lista.length} liberações ativas`}</button>}
 </section>;
}
