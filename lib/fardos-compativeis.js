import 'server-only';
import { prisma } from '@/lib/prisma';
import { casarPerfilComOmie } from '@/lib/casar-omie';
import { DO_CMR, ORDEM_FIFO_CMR } from '@/lib/cmr-origens';

// Cada descrição é validada pela mesma regra do POST. Escolher apenas o melhor
// nome descartava outros recebimentos do mesmo perfil, inclusive de outras OPs.
export async function buscarFardosCompativeis(perfil) {
  const nomes = await prisma.documentoQualidade.findMany({
    where: { categoria: 'MATERIAL', ...DO_CMR },
    distinct: ['nome'], select: { nome: true },
  });
  const compativeis = nomes.filter(({nome}) => nome && casarPerfilComOmie(perfil, [{codigo: null, descricao: nome}])).map(({nome}) => nome);
  if (!compativeis.length) return [];
  const linhas = await prisma.documentoQualidade.findMany({
    where: { categoria: 'MATERIAL', ...DO_CMR, nome: {in: compativeis}, importRef: {not: null} },
    select: {id: true, importRef: true, nome: true, opNumero: true, dataRecebimento: true, pesoKg: true, numeroCorrida: true},
    orderBy: [...ORDEM_FIFO_CMR, {id: 'asc'}],
  });
  return linhas.filter(l => l.importRef?.trim()).map(l => ({
    id: l.id, r: l.importRef, descricao: l.nome, opNumero: l.opNumero || null,
    recebidoEm: l.dataRecebimento?.toISOString().slice(0,10) || null,
    pesoKg: l.pesoKg == null ? null : Number(l.pesoKg), corrida: l.numeroCorrida || null,
  }));
}
