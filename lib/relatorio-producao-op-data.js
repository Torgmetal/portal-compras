import 'server-only';
import {prisma} from './prisma';
import {detalharProducaoOp} from './relatorio-producao-op';

export async function carregarProducaoOp(opId){
 const op=await prisma.oP.findUnique({where:{id:opId},select:{id:true,numero:true,obra:true,cliente:true}});
 if(!op)return null;
 const numeros=[...new Set([String(op.numero),String(Number(op.numero)),String(op.numero).padStart(3,'0')])];
 const vinculo={OR:[{opId:op.id},{opId:null,opNumero:{in:numeros}}]};
 const [pecas,ordens,listas,portal,pasta,baixas,sync]=await Promise.all([
  prisma.pecaConjunto.findMany({where:vinculo,select:{id:true,opId:true,opNumero:true,marca:true,descricao:true,qte:true,tipoPeca:true,fonte:true,naLPC:true,naLE:true,status:true,material:true,perfil:true,comprimentoMm:true,pesoUnitKg:true,pesoTotalKg:true,areaPinturaM2:true,observacao:true,conjuntoCroquis:{select:{croquiId:true,qtdNoConjunto:true}}}}),
  prisma.mesOrdem.groupBy({by:['opId','obra','item','setor'],where:{OR:[{opId:op.id},{opId:null}]},_sum:{produzidoUn:true},_max:{dataFim:true}}),
  prisma.listaExpedicao.findMany({where:vinculo,select:{opId:true,opNumero:true,frente:true,marcasJson:true}}),
  prisma.romaneioPrevio.findMany({where:{opId:op.id,emitidoEm:{not:null},status:{not:'CANCELADO'}},select:{opId:true,numero:true,emitidoEm:true,status:true,itens:true}}),
  prisma.romaneio.findMany({where:{opId:op.id},select:{opId:true,numero:true,itens:{select:{qtd:true,pecaConjunto:{select:{marca:true}}}}}}),
  prisma.baixaExpedicao.findMany({where:{opId:op.id},select:{opId:true,marca:true,qtd:true,motivo:true}}),
  prisma.mesSyncLog.findFirst({where:{sucesso:true},orderBy:{criadoEm:'desc'},select:{criadoEm:true}}),
 ]);
 return detalharProducaoOp({op,pecas,ordens:ordens.map(o=>({...o,produzidoUn:o._sum.produzidoUn,dataFim:o._max.dataFim})),listas,portal,pasta,baixas,sincronizadoEm:sync?.criadoEm||null});
}
