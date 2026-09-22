"use client";
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export default function PecasInformadasEditor({ pecas, onChange, disabled, quantidadesLista = {} }) {
  const listaId = useId();
  const [busca, setBusca] = useState("");
  const [retirada, setRetirada] = useState(null);
  const selecionadas = new Set(pecas.map(p => p.marca.trim().toUpperCase()));
  const disponiveis = Object.keys(quantidadesLista).filter(m => !selecionadas.has(m.toUpperCase()) && m.toUpperCase().includes(busca.trim().toUpperCase()));
  const incluir = marca => onChange([...pecas, { marca, quantidade: quantidadesLista[marca] || "" }]);
  const alterar = (i, campo, valor) => onChange(pecas.map((p, n) => n === i ? { ...p, [campo]: valor } : p));
  const pendentes = pecas.filter(p => !Number.isInteger(Number(p.quantidade)) || Number(p.quantidade) <= 0).length;
  const total = pecas.reduce((s, p) => s + (Number(p.quantidade) > 0 ? Number(p.quantidade) : 0), 0);
  return <fieldset disabled={disabled} className="mt-2 min-w-0 max-w-2xl">
    <datalist id={listaId}>{Object.keys(quantidadesLista).map(marca => <option key={marca} value={marca} />)}</datalist>
    <div className="mb-3 rounded-xl border border-gray-200 p-3">
      <label className="block text-sm font-semibold text-torg-dark">Buscar peça da OP
        <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite a marca para adicionar" className="block mt-1 w-full min-h-11 border rounded-lg px-3 text-base" />
      </label>
      {busca.trim() && <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
        {disponiveis.slice(0, 30).map(marca => <button key={marca} type="button" aria-label={`Adicionar ${marca} (${quantidadesLista[marca]} unidades)`} disabled={disabled || pecas.length >= 2000} onClick={() => incluir(marca)} className="flex justify-between gap-2 items-center w-full min-h-11 px-2 text-sm text-torg-blue border rounded-lg"><span>{marca} · {quantidadesLista[marca]} un.</span><span>Adicionar</span></button>)}
        {!disponiveis.length && <p className="text-sm text-torg-gray">Nenhuma marca disponível para esta busca. Ela pode já estar no relatório.</p>}
        {disponiveis.length > 30 && <p className="text-xs text-torg-gray">Refine a busca para encontrar outras marcas.</p>}
      </div>}
    </div>
    {retirada && <div className="mb-2 flex items-center justify-between gap-2 text-sm bg-amber-50 rounded-lg p-2"><span>{retirada.marca || "Linha vazia"} retirada da seleção.</span><button type="button" disabled={disabled || pecas.length >= 2000 || selecionadas.has(retirada.marca.trim().toUpperCase())} onClick={() => { onChange([...pecas, retirada]); setRetirada(null); }} className="min-h-11 text-torg-blue px-2">Desfazer</button></div>}
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-auto max-h-80">
      <table className="w-full text-sm"><thead className="bg-gray-50 sticky top-0"><tr><th className="text-left p-2">Marca</th><th className="text-left p-2">Quantidade</th><th><span className="sr-only">Remover</span></th></tr></thead>
        <tbody className="divide-y divide-gray-50">{pecas.map((p, i) => <tr key={i}>
          <td className="p-2"><input aria-label={`Marca ${i + 1}`} value={p.marca} maxLength={40} list={listaId} onChange={e => onChange(pecas.map((p, n) => n === i ? { marca: e.target.value, quantidade: quantidadesLista[e.target.value.trim().toUpperCase()] || "" } : p))} className="w-full min-w-32 border rounded-lg px-2 py-1.5 font-mono" /></td>
          <td className="p-2"><input aria-label={`Quantidade ${i + 1}`} type="number" min="1" max="1000000" step="1" placeholder="Informar" value={p.quantidade} onChange={e => alterar(i, "quantidade", e.target.value)} className="w-28 border rounded-lg px-2 py-1.5" /></td>
          <td className="p-2"><button type="button" aria-label={`Remover peça ${i + 1}`} onClick={() => { setRetirada(p); onChange(pecas.filter((_, n) => n !== i)); }} className="min-h-11 p-2 text-red-600 inline-flex gap-1 items-center"><Trash2 size={16} /><span>Retirar</span></button></td>
        </tr>)}</tbody></table>
      {!pecas.length && <p className="p-3 text-torg-gray">Adicione as peças deste relatório.</p>}
    </div>
    <div className="flex items-center justify-between gap-3 mt-2"><button type="button" disabled={disabled || pecas.length >= 2000} onClick={() => onChange([...pecas, { marca: "", quantidade: "" }])} className="text-torg-blue text-sm inline-flex items-center gap-1"><Plus size={15} /> Adicionar manualmente</button><span className="text-sm text-torg-gray">{pecas.length} marcas · {total} unidades{pendentes ? ` · ${pendentes} sem quantidade válida` : ""}</span></div>
    <p className="text-xs text-torg-gray mt-2">Adicionar ou retirar só altera este relatório ao clicar em Salvar. As quantidades vêm das listas da OP. Altere apenas se a quantidade inspecionada for diferente e clique em Salvar. Marcas sem quantidade na lista ficam em branco.</p>
  </fieldset>;
}
