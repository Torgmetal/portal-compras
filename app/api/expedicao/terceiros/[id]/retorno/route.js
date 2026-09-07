import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { z } from 'zod';
import { SETOR_SYNECO } from '@/lib/produzido-setor';
import { randomUUID } from 'crypto';
import { validarRetorno, statusRetorno, DESTINOS_TERCEIRO } from '@/lib/terceiros-retorno';
export const runtime='nodejs';
const ROLES=['ADMIN','EXPEDICAO','PRODUCAO','COMERCIAL','ALMOXARIFADO','PCP','PLANEJAMENTO','COMPRAS'];
const schema=z.object({data:z.string().date(),observacao:z.string().max(1000).nullable().optional(),
  documentoHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),chave:z.string().uuid(),
  itens:z.array(z.object({marca:z.string().min(1),qte:z.number().int().positive(),destino:z.enum(DESTINOS_TERCEIRO)})).min(1).max(2000)});
async function executar(req, params, desfazer) {
  let user;
  try {user=await requireRole(ROLES);}catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});}
  try {
    const body=desfazer ? null : schema.parse(await req.json());
    const retornoId=new URL(req.url).searchParams.get('retornoId');
    if(desfazer&&!retornoId)throw Error('Informe o retorno a desfazer.');
    const romaneio=await prisma.$transaction(async tx=>{
      const rom=await tx.romaneioTerceiro.findUnique({where:{id:params.id}});
      if(!rom)throw Error('Romaneio não encontrado.');
      let retornos=Array.isArray(rom.retornos)?rom.retornos:[];
      if(desfazer){
        if(!retornos.some(r=>r.id===retornoId))throw Error('Retorno não encontrado.');
        if(retornos.find(r=>r.id===retornoId)?.itens?.some(i=>i.programacao))throw Error('Remova a programação deste retorno antes de desfazer o recebimento.');
        retornos=retornos.filter(r=>r.id!==retornoId);
      }else{
        if(retornos.some(r=>r.chave===body.chave))return rom;
        if(body.documentoHash&&retornos.some(r=>r.documentoHash===body.documentoHash))throw Error('Este documento já foi registrado nesta remessa. Confira o histórico.');
        const itens=validarRetorno(rom,body.itens);
        if(!rom.opRefId)throw Error('Vincule a OP desta remessa antes de receber para a produção.');
        // Serializa recebimentos da mesma OP, inclusive em romaneios diferentes.
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${rom.opRefId}))) AS lock_op`;
        const anteriores=await tx.romaneioTerceiro.findMany({where:{opRefId:rom.opRefId,status:{not:'CANCELADO'}},select:{retornos:true}});
        const producao=await tx.mesOrdem.groupBy({by:['item','setor'],where:{opId:rom.opRefId,item:{in:itens.map(i=>i.marca)}},_sum:{produzidoUn:true}});
        for(const item of itens){
          const produzido=producao.find(p=>p.item===item.marca&&p.setor===(SETOR_SYNECO[item.destino]||'Expedição'));
          const reservado=anteriores.flatMap(r=>(r.retornos||[]).flatMap(ret=>ret.itens||[])).filter(i=>i.marca===item.marca&&i.destino===item.destino&&i.producaoInicio!=null).reduce((m,i)=>Math.max(m,i.producaoInicio+i.qte),0);
          item.producaoInicio=Math.max(Number(produzido?._sum.produzidoUn)||0,reservado);
        }
        retornos=[...retornos,{id:randomUUID(),chave:body.chave,documentoHash:body.documentoHash||null,data:body.data+'T12:00:00.000Z',itens,
          pesoKg:itens.reduce((a,i)=>a+i.pesoTotal,0),observacao:body.observacao||null,porNome:user.name||null,porId:user.id}];
      }
      const data={retornos,pesoRetornadoKg:retornos.reduce((a,r)=>a+(Number(r.pesoKg)||0),0),status:statusRetorno({...rom,retornos})};
      const update=await tx.romaneioTerceiro.updateMany({where:{id:rom.id,updatedAt:rom.updatedAt},data});
      if(update.count!==1)throw Error('A remessa foi atualizada por outra pessoa. Recarregue e confira o saldo.');
      await tx.auditLog.create({data:{userId:user.id,action:desfazer?'DESFAZER_RETORNO_TERCEIRO':'RETORNO_ROMANEIO_TERCEIRO',entity:'RomaneioTerceiro',entityId:rom.id,diff:{retornoId,quantidadeRetornos:retornos.length}}});
      return tx.romaneioTerceiro.findUnique({where:{id:rom.id}});
    },{timeout:15000});
    return NextResponse.json({success:true,romaneio});
  }catch(e){return NextResponse.json({error:e.issues?.[0]?.message||e.message},{status:400});}
}
export const POST=(req,{params})=>executar(req,params,false);
export const DELETE=(req,{params})=>executar(req,params,true);
