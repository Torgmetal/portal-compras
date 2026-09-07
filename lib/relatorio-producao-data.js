import 'server-only';
import {prisma} from './prisma';
import {SO_FABRICACAO} from './lista-pecas';
import {resumirProducao,numeroOpRelatorio} from './relatorio-producao-resumo';
export async function carregarResumoProducao(){
 const ops=await prisma.oP.findMany({select:{id:true,numero:true,obra:true,cliente:true,status:true}});
 const ids=ops.filter(o=>!['ENCERRADA','CANCELADA'].includes(o.status)).map(o=>o.id);
 const [pecas,grupos,sync]=await Promise.all([
  prisma.pecaConjunto.findMany({where:{...SO_FABRICACAO,OR:[{opId:{in:ids}},{opId:null}]},select:{opId:true,opNumero:true,marca:true,qte:true,pesoTotalKg:true,tipoPeca:true,descricao:true,perfil:true,material:true,pesoUnitKg:true,status:true,_count:{select:{conjuntoCroquis:true}}}}),
  prisma.mesOrdem.groupBy({by:['opId','obra','item','setor'],where:{OR:[{opId:{in:ids}},{opId:null}]},_sum:{produzidoUn:true}}),
  prisma.mesSyncLog.findFirst({where:{sucesso:true},orderBy:{criadoEm:'desc'},select:{criadoEm:true}}),
 ]);
 const resumo=resumirProducao(ops,pecas,grupos.map(g=>({...g,produzidoUn:g._sum.produzidoUn})));
 const finalizadas=new Set([...ops.filter(o=>['ENCERRADA','CANCELADA'].includes(o.status)).map(o=>numeroOpRelatorio(o.numero)),...resumo.filter(o=>o.concluida).map(o=>numeroOpRelatorio(o.numero))].filter(n=>n!==null));
 const finalizadasIds=[...ops.filter(o=>['ENCERRADA','CANCELADA'].includes(o.status)).map(o=>o.id),...resumo.filter(o=>o.concluida).map(o=>o.opId)];
 return {finalizadasIds,ops:resumo.filter(o=>!o.concluida&&o.pctGeral!=null),finalizadas,sincronizadoEm:sync?.criadoEm||null,geradoEm:new Date().toISOString()};
}
