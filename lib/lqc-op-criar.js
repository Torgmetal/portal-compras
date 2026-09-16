import { prepararOpDaLqc } from './lqc-op';

// A disputa por um orçamento e a criação da OP devem confirmar ou desfazer juntas.
export async function criarOpComOrigemLqc(prisma, {estudoId, atualizadoEm, userId, dadosConfirmados = {}}, criar) {
  return prisma.$transaction(async tx => {
    const estudo = await tx.estudoFabricacao.findUnique({where:{id:estudoId},include:{orcamento:true}});
    if (!estudo) throw new Error('LQC não encontrada.');
    if (new Date(estudo.updatedAt).toISOString() !== atualizadoEm) throw new Error('A LQC mudou. Reabra a prévia antes de criar a OP.');
    const previa = prepararOpDaLqc(estudo);
    const op = await criar(tx, previa);
    const vinculo = await tx.orcamento.updateMany({where:{id:previa.orcamentoId,opId:null},
      data:{opId:op.id,status:'FECHADA',dataFechamento:estudo.orcamento.dataFechamento || new Date()}});
    if (vinculo.count !== 1) throw new Error('Este orçamento já foi vinculado a outra OP.');
    await tx.auditLog.create({data:{userId,action:'create_op_from_lqc',entity:'OP',entityId:op.id,
      diff:{estudoId,orcamentoId:previa.orcamentoId,antes:{opId:null},depois:{opId:op.id,numero:op.numero,...dadosConfirmados}}}});
    return op;
  }, {isolationLevel:'Serializable'});
}
