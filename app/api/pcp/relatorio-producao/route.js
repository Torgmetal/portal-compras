import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/session';
import {carregarResumoProducao} from '@/lib/relatorio-producao-data';
import {carregarProducaoOp} from '@/lib/relatorio-producao-op-data';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req){
 try{await requireRole(['ADMIN','PCP','PLANEJAMENTO','PRODUCAO']);}catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});}
 try{
  const opId=new URL(req.url).searchParams.get('opId');
  if(opId){const dados=await carregarProducaoOp(opId);return dados?NextResponse.json(dados):NextResponse.json({error:'OP não encontrada.'},{status:404});}
  const {ops,sincronizadoEm,geradoEm}=await carregarResumoProducao();return NextResponse.json({ops,sincronizadoEm,geradoEm});
 }
 catch{ return NextResponse.json({error:'Não foi possível carregar o status geral da produção.'},{status:500});}
}
