"use client";
import {useState} from "react";

export default function QuantidadesPecas({pecas, onChange, disabled}) {
  const [editando, setEditando] = useState({});
  return <section className="my-3 space-y-2" aria-label="Quantidades das peças">
    <p className="text-sm text-torg-gray">Quantidade da lista. Toque em Alterar se inspecionar uma quantidade diferente.</p>
    {pecas.map((p,i) => <div key={p.marca} className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="font-mono text-sm font-semibold break-all text-torg-dark">{p.marca}</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        {editando[p.marca] || p.quantidade === "" ? <label className="text-sm">Quantidade<input aria-label={`Quantidade de ${p.marca}`} type="number" inputMode="numeric" min="1" step="1" max="1000000" value={p.quantidade} disabled={disabled} onChange={e=>onChange(pecas.map((v,n)=>n===i?{...v,quantidade:e.target.value}:v))} className="block w-28 min-h-11 border-2 border-gray-200 rounded-lg px-2 text-base" /></label> : <span className="text-base font-semibold">{p.quantidade} peças</span>}
        <button type="button" disabled={disabled} onClick={()=>setEditando(v=>({...v,[p.marca]:!v[p.marca]}))} className="min-h-11 px-3 text-torg-blue font-semibold">{editando[p.marca]?"Concluir":"Alterar"}</button>
      </div>
    </div>)}
    <p className="text-sm font-semibold text-torg-dark">{pecas.length} marcas · {pecas.reduce((s,p)=>s+(Number(p.quantidade)||0),0)} peças</p>
  </section>;
}
