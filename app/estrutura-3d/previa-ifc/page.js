import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ModeloObraCliente from '@/app/portal/[token]/ModeloObraCliente';

export const dynamic = 'force-dynamic';
export default async function PreviaIfc({ searchParams }) {
  // Prévia de desenvolvimento: nunca disponibilizar esta rota em produção.
  if (process.env.NODE_ENV !== 'development') notFound();
  if (searchParams.cena === '1') {
    const portal = await prisma.portalCliente.findFirst({ where: { opNumero: '089' }, select: { token:true } });
    return <main className="bg-white p-2"><ModeloObraCliente token={portal?.token || ''} /></main>;
  }
  const pc=searchParams.modo==='pc';
  return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-800">
    <div className="max-w-6xl mx-auto">
      <p className="text-xs font-bold tracking-widest text-[#006EAB]">PRÉVIA LOCAL · OP-89 · SEM PUBLICAÇÃO</p>
      <h1 className="text-2xl font-bold mt-2">Navegar pela obra no celular</h1>
      <p className="text-sm text-slate-500 mt-2">Teste os filtros, selecione uma peça e explore o modelo. No celular real, use dois dedos para mover e aproximar.</p>
      <nav className="flex gap-2 my-5">
        <a className={`px-5 py-3 rounded-xl ${!pc?'bg-[#002945] text-white':'bg-white'}`} href="?modo=celular">Celular</a>
        <a className={`px-5 py-3 rounded-xl ${pc?'bg-[#002945] text-white':'bg-white'}`} href="?modo=pc">Computador</a>
        <a className="px-5 py-3 rounded-xl bg-white" href="?cena=1">Abrir visualizador</a>
      </nav>
      <iframe title="Prévia interativa IFC" src="/estrutura-3d/previa-ifc?cena=1" allow="fullscreen" className="bg-white mx-auto border border-slate-300 shadow-xl" style={{width:pc?'100%':390,maxWidth:'100%',height:pc?850:800,borderRadius:pc?16:28}} />
    </div>
  </main>;
}
