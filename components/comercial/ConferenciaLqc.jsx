'use client';
import Link from 'next/link';
const moeda = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const valor = (v,u) => v == null ? 'Não identificado' : u==='KG' ? `${v.toLocaleString('pt-BR')} kg` : moeda(v);
export default function ConferenciaLqc({previa,form}) {
 const c=previa.conferencia;
 if(!c) return null;
 const pendentes=[
  !form.refCliente && 'Número do pedido / referências do cliente',
  !form.dataInicio && 'Data de início',!form.dataFimPrevista && 'Prazo de entrega',
  !form.estoqueMaterial && 'Origem do material',!form.tipoDataBook && 'Tipo de data book',
  form.escopoQualidade == null && 'Escopo de qualidade',
 ].filter(Boolean);
 return <div className="space-y-4">
  <div className={`rounded-lg border p-3 text-sm ${c.ok?'border-green-200 bg-green-50 text-green-900':'border-amber-300 bg-amber-50 text-amber-900'}`}>
   <p className="font-semibold">{c.ok ? (previa.estudoArquivo ? 'Custos conferidos com a planilha do servidor' : 'Custos carregados do estudo definido no portal') : 'Há diferenças para conferir antes de criar a OP'}</p>
   {previa.estudoArquivo && <p className="mt-1 break-words">{previa.estudoArquivo.nome} · atualizado em {new Date(previa.estudoArquivo.modificado).toLocaleString('pt-BR')}
    {previa.estudoArquivo.webUrl && <> · <a className="underline" target="_blank" rel="noreferrer" href={previa.estudoArquivo.webUrl}>Abrir planilha</a></>}</p>}
   <p className="mt-1">Os custos definidos são preservados. Para alterá-los, <Link href={`/comercial/orcamentos/estudos/${previa.estudoId}`} className="underline">ajuste a LQC</Link> e reabra esta prévia.</p>
  </div>
  <div className="grid gap-3 sm:grid-cols-3 text-sm">
   {[['Compras e serviços externos',previa.resumoCustos.compras],['Fabricação e pintura internas',previa.resumoCustos.internos],['Custo total previsto',previa.resumoCustos.total]].map(([titulo,n])=><div key={titulo} className="p-3 bg-gray-50 rounded-lg"><p className="text-torg-gray">{titulo}</p><strong className="text-torg-dark text-lg">{moeda(n)}</strong></div>)}
  </div>
  {!!c.linhas.length && <details open={!c.ok} className="text-sm">
   <summary className="cursor-pointer font-semibold text-torg-blue">Conferência por custo e área da obra</summary>
   <div className="overflow-x-auto mt-2 rounded-lg border border-gray-100"><table className="w-full text-left"><thead className="bg-gray-50"><tr>{['Item','LQC do portal','Planilha do servidor','Conferência'].map(t=><th className="p-2 whitespace-nowrap" key={t}>{t}</th>)}</tr></thead>
    <tbody className="divide-y divide-gray-100">{c.linhas.map(l=><tr key={l.chave}><td className="p-2">{l.nome}</td><td className="p-2 whitespace-nowrap">{valor(l.portal,l.unidade)}</td><td className="p-2 whitespace-nowrap">{valor(l.planilha,l.unidade)}</td><td className="p-2">{{confere:'Confere',arredondamento:'Arredondamento de 0,01',divergente:'Divergência',ausente:'Não identificado'}[l.status]}</td></tr>)}</tbody>
   </table></div>
  </details>}
  {pendentes.length>0 && <div className="rounded-lg border border-amber-200 p-3 text-sm"><p className="font-semibold text-torg-dark">Dados a completar com o pedido de compra</p><p className="text-torg-gray mt-1">A planilha de custos não informa estes campos: {pendentes.join('; ')}. Preencha abaixo conforme o contrato desta OS.</p></div>}
 </div>;
}
