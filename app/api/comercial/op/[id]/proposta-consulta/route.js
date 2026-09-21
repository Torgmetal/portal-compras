import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { consultarPropostaDaObra } from '@/lib/proposta-obra-sharepoint';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(_req,{params}){
 try{await requireRole(['ADMIN','COMERCIAL','ENGENHARIA','PLANEJAMENTO','PCP','PRODUCAO','QUALIDADE','COMPRAS','EXPEDICAO','FINANCEIRO','ALMOXARIFADO']);}
 catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});}
 const op=await prisma.oP.findUnique({where:{id:params.id},select:{id:true,numero:true,propostas:true,orcamentoPasta:true}});
 if(!op)return NextResponse.json({error:'OP não encontrada.'},{status:404});
 try{return NextResponse.json({proposta:await consultarPropostaDaObra(op)},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'Não foi possível preparar a consulta desta proposta. Verifique o arquivo e a disponibilidade do SharePoint.'},{status:422,headers:{'Cache-Control':'private, no-store'}});}
}
