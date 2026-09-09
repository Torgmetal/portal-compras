"use client";
import React from 'react';
/** Mantém o vínculo de escopo dos itens antigos e permite continuar editando por área. */
export function QuantidadePorArea({modelo,areasAtivas,onChange}) {
 const areas=[...new Set([...areasAtivas,...Object.keys(modelo.porArea||{})])];
 if(!areas.length)return null;
 return <details className="mt-3 text-xs text-torg-gray"><summary className="cursor-pointer">Quantidade por área</summary>
  <div className="grid gap-3 mt-2 sm:grid-cols-2">{areas.map(area=><label key={area}>{area}{!areasAtivas.has(area)?' · fora do escopo':''}
   <input aria-label={`Quantidade de ${modelo.nome||'modelo'} na área ${area}`} type="number" min="0" step="any" value={modelo.porArea?.[area]??''}
    onChange={e=>onChange({quantidade:0,porArea:{...modelo.porArea,[area]:e.target.value}})}/>
  </label>)}</div>
  <p className="mt-2">Ao preencher por área, a quantidade acompanha as áreas ativas do Quantitativo.</p>
 </details>;
}
