import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/session';
import {carregarResumoProducao} from '@/lib/relatorio-producao-data';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(){
 try{await requireRole(['ADMIN','PCP','PLANEJAMENTO','PRODUCAO']);}catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});}
 try{const {ops,sincronizadoEm,geradoEm}=await carregarResumoProducao();return NextResponse.json({ops,sincronizadoEm,geradoEm});}
 catch{ return NextResponse.json({error:'Não foi possível carregar o status geral da produção.'},{status:500});}
}
