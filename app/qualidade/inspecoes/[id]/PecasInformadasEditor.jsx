"use client";
import { Plus, Trash2 } from "lucide-react";

export default function PecasInformadasEditor({ pecas, onChange, disabled }) {
  const alterar = (i, campo, valor) => onChange(pecas.map((p, n) => n === i ? { ...p, [campo]: valor } : p));
  const pendentes = pecas.filter(p => !Number.isInteger(Number(p.quantidade)) || Number(p.quantidade) <= 0).length;
  const total = pecas.reduce((s, p) => s + (Number(p.quantidade) > 0 ? Number(p.quantidade) : 0), 0);
  return <fieldset disabled={disabled} className="mt-2 min-w-0 max-w-2xl">
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-auto max-h-80">
      <table className="w-full text-sm"><thead className="bg-gray-50 sticky top-0"><tr><th className="text-left p-2">Marca</th><th className="text-left p-2">Quantidade</th><th><span className="sr-only">Remover</span></th></tr></thead>
        <tbody className="divide-y divide-gray-50">{pecas.map((p, i) => <tr key={i}>
          <td className="p-2"><input aria-label={`Marca ${i + 1}`} value={p.marca} maxLength={40} onChange={e => alterar(i, "marca", e.target.value)} className="w-full min-w-32 border rounded-lg px-2 py-1.5 font-mono" /></td>
          <td className="p-2"><input aria-label={`Quantidade ${i + 1}`} type="number" min="1" max="1000000" step="1" placeholder="Informar" value={p.quantidade} onChange={e => alterar(i, "quantidade", e.target.value)} className="w-28 border rounded-lg px-2 py-1.5" /></td>
          <td className="p-2"><button type="button" aria-label={`Remover peça ${i + 1}`} onClick={() => onChange(pecas.filter((_, n) => n !== i))} className="p-2 text-red-600"><Trash2 size={16} /></button></td>
        </tr>)}</tbody></table>
      {!pecas.length && <p className="p-3 text-torg-gray">Adicione as peças deste relatório.</p>}
    </div>
    <div className="flex items-center justify-between gap-3 mt-2"><button type="button" disabled={disabled || pecas.length >= 2000} onClick={() => onChange([...pecas, { marca: "", quantidade: 1 }])} className="text-torg-blue text-sm inline-flex items-center gap-1"><Plus size={15} /> Adicionar peça</button><span className="text-sm text-torg-gray">{pecas.length} marcas · {total} unidades{pendentes ? ` · ${pendentes} sem quantidade válida` : ""}</span></div>
    <p className="text-xs text-torg-gray mt-2">Confira as quantidades e clique em Salvar. Quantidades antigas não registradas por peça ficam em branco.</p>
  </fieldset>;
}
