import 'server-only';
import {RECURSOS} from '@/app/pcp/producao/_gantt/recursos';
import {prisma} from './prisma';
export async function programarRetornos(blocos,user){
 const grupos=new Map();
 for(const b of blocos)for(const id of b.ids){
  const [tipo,romId,retId,index]=id.split(':');
  if(tipo!=='retorno'||!romId||!retId||!/^\d+$/.test(index))throw Error('Identificação de retorno inválida.');
  if(!grupos.has(romId))grupos.set(romId,[]);
  grupos.get(romId).push({retId,index:Number(index),b});
 }
 let total=0;
 await prisma.$transaction(async tx=>{
  for(const [id,movimentos] of grupos){
   const rom=await tx.romaneioTerceiro.findUnique({where:{id}});
   if(!rom||rom.status==='CANCELADO')throw Error('A remessa não está disponível.');
   const retornos=JSON.parse(JSON.stringify(rom.retornos||[]));
   for(const {retId,index,b} of movimentos){
    const item=retornos.find(r=>r.id===retId)?.itens?.[index];
    if(!RECURSOS[b.setor]?.some(r=>r.k===b.recurso))throw Error('Recurso inválido para este setor.');
    if(!item||item.destino!==b.setor)throw Error('Confira o setor de destino do retorno antes de programar.');
    if(b.recurso==null)delete item.programacao;
    else item.programacao={dia:b.dia,recurso:b.recurso,por:user.id,em:new Date().toISOString()};total++;
   }
   const updated=await tx.romaneioTerceiro.updateMany({where:{id,updatedAt:rom.updatedAt},data:{retornos}});
   if(updated.count!==1)throw Error('Remessa alterada por outra pessoa. Recarregue antes de programar.');
   await tx.auditLog.create({data:{userId:user.id,action:'PROGRAMAR_RETORNO_TERCEIRO',entity:'RomaneioTerceiro',entityId:id,diff:{movimentos:movimentos.map(m=>({retorno:m.retId,item:m.index,dia:m.b.dia,recurso:m.b.recurso}))}}});
  }
 });
 return {total,porSetor:Object.fromEntries([...new Set(blocos.map(b=>b.setor))].map(s=>[s,blocos.filter(b=>b.setor===s).reduce((a,b)=>a+b.ids.length,0)]))};
}
