import { prepararOpDaLqc } from './lqc-op';

// A disputa por um orçamento e a criação da OP devem confirmar ou desfazer juntas.
export async function criarOpComOrigemLqc(prisma, {estudoId, atualizadoEm, userId, dadosConfirmados = {}, previaConferida = null}, criar) {
  return prisma.$transaction(async tx => {
    const estudo = await tx.estudoFabricacao.findUnique({where:{id:estudoId},include:{orcamento:true}});
    if (!estudo) throw new Error('LQC não encontrada.');
    if (new Date(estudo.updatedAt).toISOString() !== atualizadoEm) throw new Error('A LQC mudou. Reabra a prévia antes de criar a OP.');
    if (previaConferida && (previaConferida.estudoId !== estudo.id || previaConferida.atualizadoEm !== new Date(estudo.updatedAt).toISOString() || previaConferida.valorContrato !== (estudo.orcamento?.valor > 0 ? estudo.orcamento.valor : null))) throw new Error('O orçamento mudou. Reabra a prévia.');
    const previa = previaConferida || prepararOpDaLqc(estudo);
    const op = await criar(tx, previa);
    const vinculo = await tx.orcamento.updateMany({where:{id:previa.orcamentoId,opId:null},
      data:{opId:op.id,status:'FECHADA',dataFechamento:estudo.orcamento.dataFechamento || new Date()}});
    if (vinculo.count !== 1) throw new Error('Este orçamento já foi vinculado a outra OP.');
    await tx.auditLog.create({data:{userId,action:'create_op_from_lqc',entity:'OP',entityId:op.id,
      diff:{estudoId,conferencia:previa.conferencia || null,arquivo:previa.estudoArquivo || null,orcamentoId:previa.orcamentoId,antes:{opId:null},depois:{opId:op.id,numero:op.numero,...dadosConfirmados}}}});
    return op;
  }, {isolationLevel:'Serializable'});
}
