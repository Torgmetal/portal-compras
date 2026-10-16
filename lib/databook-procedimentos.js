import 'server-only';
import { comTravaDeCron } from './cron-trava';
import { prisma } from './prisma';
import { estaFechado } from './databook-revisao';
import { importarProcedimentos, ultimaRevisaoProcedimentos, numeroDoProcedimento } from './importar-procedimentos';
import { whereProcedimentos, procedimentoCasaSecao, ehPdf } from './databook-secoes';

// Atualiza os vínculos antes de iniciar a geração. Nunca no meio de um job (cursor por anexo).
export async function sincronizarProcedimentosDataBook(id, { userId = null, finalizar = null } = {}) {
  const resultado = await comTravaDeCron(prisma, `databook-procedimentos:${id}`, async () => {
    const sincronizacao = await atualizarVinculos(id, userId);
    return finalizar ? finalizar(sincronizacao) : sincronizacao;
  });
  if (resultado === null) throw new Error("Já há uma atualização dos procedimentos deste Data Book em andamento.");
  return resultado;
}

async function atualizarVinculos(id, userId) {
  const book = await prisma.dataBookQualidade.findUnique({ where: { id }, include: { secoes: { include: { documentos: true } } } });
  if (!book || estaFechado(book)) return { alterados: 0 };
  const job = await prisma.dataBookGeracao.findFirst({ where: { dataBookId: id, revisao: book.revisao, status: { in: ['NA_FILA','GERANDO'] } } });
  if (job) throw new Error('Aguarde terminar a geração antes de atualizar os procedimentos.');
  const importacao = await importarProcedimentos({ userId });
  if (importacao.erro || importacao.semPdf.length) throw new Error(importacao.erro || `Procedimentos vigentes sem PDF: ${importacao.semPdf.join(', ')}`);
  const vigentes = ultimaRevisaoProcedimentos((await prisma.documentoQualidade.findMany({ where: whereProcedimentos() })).filter(ehPdf));
  const ids = book.secoes.flatMap(s=>s.documentos.map(d=>d.documentoId));
  const vinculados = ids.length ? await prisma.documentoQualidade.findMany({ where: { id: { in: ids } } }) : [];
  const porId = new Map(vinculados.map(d=>[d.id,d]));
  let alterados = 0;
  await prisma.$transaction(async tx=>{
    for (const s of book.secoes) {
      if (s.estado === 'NA') continue;
      const aplicaveis = vigentes.filter(d=>procedimentoCasaSecao(d.nome,s.numero));
      const numeros = new Map(aplicaveis.map(d=>[numeroDoProcedimento(d),d.id]));
      const remover = s.documentos.filter(v=>{
        const d = porId.get(v.documentoId); const novo = d && numeros.get(numeroDoProcedimento(d));
        return novo && novo !== v.documentoId;
      }).map(v=>v.documentoId);
      const adicionar = aplicaveis.filter(d=>!s.documentos.some(v=>v.documentoId===d.id));
      if (!remover.length && !adicionar.length) continue;
      if (remover.length) await tx.dataBookSecaoDoc.deleteMany({where:{secaoId:s.id,documentoId:{in:remover}}});
      if (adicionar.length) await tx.dataBookSecaoDoc.createMany({data:adicionar.map(d=>({secaoId:s.id,documentoId:d.id})),skipDuplicates:true});
      await tx.dataBookSecao.update({where:{id:s.id},data:{estado:'ANEXADO'}});
      await tx.auditLog.create({data:{userId,action:'ATUALIZAR_PROCEDIMENTOS_DATABOOK',entity:'DataBookSecao',entityId:s.id,diff:{removidos:remover,adicionados:adicionar.map(d=>({id:d.id,nome:d.nome}))}}});
      alterados++;
    }
  });
  return {alterados};
}
