import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {requireRole} from '@/lib/session';
import {fasesReferenciasSchema,EDITORES_FASES,LEITORES_FASES} from '@/lib/fases-referencias';
export const dynamic='force-dynamic';
const auth=e=>NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});
const select={id:true,fasesReferencias:true,updatedAt:true};
const resposta=(op,user)=>({tabela:op.fasesReferencias||{empresas:['Cliente'],fases:[]},versao:op.updatedAt.toISOString(),podeEditar:user.tipo==='ADMIN'||(user.modulos||[]).some(m=>EDITORES_FASES.includes(m))});
export async function GET(_req,{params}){
 let user;try{user=await requireRole(LEITORES_FASES);}catch(e){return auth(e);}
 try{const op=await prisma.oP.findUnique({where:{id:params.id},select});
 return op?NextResponse.json(resposta(op,user),{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'OP não encontrada.'},{status:404});
 }catch{return NextResponse.json({error:'Não foi possível carregar as fases.'},{status:500});}
}
export async function PUT(req,{params}){
 let user;try{user=await requireRole(EDITORES_FASES);}catch(e){return auth(e);}
 const parsed=z.object({tabela:fasesReferenciasSchema,versao:z.string().datetime()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Dados inválidos.'},{status:400});
 try{
 const op=await prisma.oP.findUnique({where:{id:params.id},select});
 if(!op)return NextResponse.json({error:'OP não encontrada.'},{status:404});
 const depois=await prisma.$transaction(async tx=>{
 const r=await tx.oP.updateMany({where:{id:op.id,updatedAt:new Date(parsed.data.versao)},data:{fasesReferencias:parsed.data.tabela}});
 if(r.count!==1)throw Error('CONFLITO');
 await tx.auditLog.create({data:{userId:user.id,action:'OP_FASES_REFERENCIAS',entity:'OP',entityId:op.id,diff:{antes:op.fasesReferencias,depois:parsed.data.tabela}}});
 return tx.oP.findUnique({where:{id:op.id},select});
 });
 return NextResponse.json(resposta(depois,user));
 }catch(e){return NextResponse.json({error:e.message==='CONFLITO'?'A OP mudou desde a consulta. Cancele a edição e carregue novamente antes de salvar.':'Não foi possível salvar as fases.'},{status:e.message==='CONFLITO'?409:500});}
}
