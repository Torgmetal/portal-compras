import {CONJUNTO_MONTAVEL} from './prontidao-conjunto';
import {chavesDasPecas,pecasDosLotes} from './liberacao-pecas';

export function conjuntosLiberadosMontagem(libs,conjuntos){
 const ids=pecasDosLotes(libs,conjuntos).ids;
 const inteiras=libs.filter(l=>!(Array.isArray(l.pecaIds)&&l.pecaIds.length)&&!(Array.isArray(l.pecaMarcas)&&l.pecaMarcas.length));
 for(const c of conjuntos)if(inteiras.some(l=>l.frente===c.opNumero))ids.add(c.id);
 return ids;
}

// Liberar peças é independente de agendar. O PCP conserva datas e bancadas.
export async function liberarMontagemSemData(prisma,{opId,ids,user,agora}){
 return prisma.$transaction(async tx=>{
  // Serializa liberações da mesma OP para não duplicar seleções concorrentes.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`liberar-montagem:${opId}`}))`;
  const conjuntos=await tx.pecaConjunto.findMany({where:{opId,id:{in:ids},...CONJUNTO_MONTAVEL},select:{id:true,opId:true,opNumero:true,marca:true,qte:true,pesoTotalKg:true}});
  const libs=await tx.liberacaoProducao.findMany({where:{opId,status:{in:['LIBERADA','EM_PRODUCAO']},setores:{array_contains:['MONTAGEM']}},select:{frente:true,pecaIds:true,pecaMarcas:true}});
  const jaLiberados=conjuntosLiberadosMontagem(libs,conjuntos);
  const novas=conjuntos.filter(c=>!jaLiberados.has(c.id));
  const frentes=new Map();
  for(const c of novas){const k=c.opNumero||'';if(!frentes.has(k))frentes.set(k,[]);frentes.get(k).push(c);}
  const op=novas.length?await tx.oP.findUnique({where:{id:opId},select:{numero:true}}):null;
  const liberacoes=[];
  for(const [frente,pecas] of frentes){
   const l=await tx.liberacaoProducao.create({data:{opId,opNumero:op?.numero||frente,frente,setores:['MONTAGEM'],prioridade:'MEDIA',status:'LIBERADA',dataProgramada:null,
    pecaIds:pecas.map(c=>c.id),pecaMarcas:chavesDasPecas(pecas),totalPecas:pecas.reduce((n,c)=>n+(Number(c.qte)||0),0),totalKg:pecas.reduce((n,c)=>n+(Number(c.pesoTotalKg)||0),0),
    liberadoEm:agora,liberadoPorId:user.id,liberadoPorNome:user.name||null}});
   liberacoes.push(l.id);
  }
  if(novas.length)await tx.auditLog.create({data:{userId:user.id,action:'MONTAGEM_LIBERAR',entity:'LiberacaoProducao',entityId:opId,diff:{liberacoes,ids:novas.map(c=>c.id),setores:['MONTAGEM'],dataProgramada:null}}});
  return {ok:true,atualizados:novas.length,liberacoes,afetados:novas.map(c=>({id:c.id,liberadaParaPcp:true})),avisos:novas.length<ids.length?['Itens já liberados ou fora da lista de conjuntos desta OP não foram duplicados.']:[]};
 });
}
