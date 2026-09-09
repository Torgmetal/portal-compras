'use client';
import {useState} from 'react';
import {X, Loader2} from 'lucide-react';
import {resumoVaga} from '@/lib/rh-vagas-quantidades';

export default function RegistrarContratacao({vaga,onClose,onSaved}) {
  const resumo=resumoVaga(vaga);
  const [quantidade,setQuantidade]=useState('1');
  const [nome,setNome]=useState('');
  const [erro,setErro]=useState('');
  const [salvando,setSalvando]=useState(false);
  const n=Number(quantidade);
  const valido=Number.isInteger(n)&&n>0&&n<=resumo.abertas;
  async function salvar(e) {
    e.preventDefault(); if(!valido||salvando)return;
    setSalvando(true);setErro('');
    try {
      const res=await fetch(`/api/rh/vagas/${vaga.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantidadeContratada:n,versaoEsperada:vaga.updatedAt,funcionarioContratadoNome:nome.trim()||null})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Não foi possível registrar a contratação.');
      onSaved(data.data,n);
    }catch(e){setErro(e.message);}finally{setSalvando(false);}
  }
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <form onSubmit={salvar} role="dialog" aria-modal="true" aria-labelledby="titulo-contratacao" className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
      <header className="p-5 border-b border-gray-100 flex items-start gap-3"><div><h3 id="titulo-contratacao" className="font-bold text-torg-dark">Registrar contratação</h3><p className="text-sm text-torg-gray mt-1">{vaga.titulo}</p></div><button type="button" aria-label="Fechar" disabled={salvando} onClick={onClose} className="ml-auto p-1 text-torg-gray"><X size={20}/></button></header>
      <div className="p-5 space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-torg-gray flex flex-wrap gap-x-4 gap-y-2"><span><b className="text-torg-dark">{resumo.total}</b> previstas</span><span><b className="text-emerald-700">{resumo.preenchidas}</b> preenchidas</span><span><b className="text-torg-blue">{resumo.abertas}</b> em aberto</span></div>
        <label className="block text-sm font-medium text-torg-dark">Quantas pessoas foram contratadas agora?<input autoFocus type="number" min="1" max={resumo.abertas} step="1" required disabled={salvando} value={quantidade} onChange={e=>setQuantidade(e.target.value)} className="mt-2 block w-full rounded-lg border border-gray-200 px-3 py-2 text-base"/></label>
        <label className="block text-sm text-torg-gray">Nome(s) dos contratados — opcional<textarea rows={2} disabled={salvando} maxLength={500} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Um nome por linha" className="mt-2 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"/></label>
        <p aria-live="polite" className={`rounded-lg px-3 py-3 text-sm ${valido?'bg-blue-50 text-torg-dark':'bg-amber-50 text-amber-800'}`}>{!valido?`Informe de 1 a ${resumo.abertas} pessoa(s).`:n===resumo.abertas?'Todas as vagas serão preenchidas e este pedido será encerrado.':`Após esta baixa, ${resumo.abertas-n} ${resumo.abertas-n === 1 ? "vaga continuará" : "vagas continuarão"} em aberto para recrutamento.`}</p>
        {erro&&<p role="alert" className="text-sm text-red-700">{erro}</p>}
      </div>
      <footer className="border-t border-gray-100 px-5 py-4 flex justify-end gap-2"><button type="button" disabled={salvando} onClick={onClose} className="rounded-lg px-4 py-2 border border-gray-200 text-sm text-torg-gray">Cancelar</button><button type="submit" disabled={!valido||salvando} className="rounded-lg px-4 py-2 bg-torg-blue text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">{salvando&&<Loader2 size={14} className="animate-spin"/>}{salvando?'Salvando…':'Confirmar contratação'}</button></footer>
    </form>
  </div>;
}
