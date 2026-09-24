import 'server-only';
import { prisma } from '@/lib/prisma';

export const MOTIVO_RELATORIO_PENDENTE = 'O relatório precisa estar aprovado e com todas as assinaturas da revisão atual concluídas para entrar no Data Book.';

export function relatorioLiberado(rel, envio) {
  return !!(rel && rel.status === 'EMITIDO' && rel.resultadoInspecao === 'APROVADO'
    && rel.envioAssinaturaId && envio?.id === rel.envioAssinaturaId
    && envio.status === 'CONCLUIDO' && envio.revisao === rel.revisao
    && envio.assinaturas?.length && envio.assinaturas.every(a => a.assinadoEm && !a.revisaoPedidaEm));
}

export async function conferirRelatorioLiberado(rel) {
  if (!rel?.envioAssinaturaId) return false;
  const envio = await prisma.envioAssinatura.findUnique({
    where: { id: rel.envioAssinaturaId },
    include: { assinaturas: { select: { assinadoEm: true, revisaoPedidaEm: true } } },
  });
  return relatorioLiberado(rel, envio);
}

// Consulta em lote e falha fechada. Inclui cópias de relatórios buscadas no servidor:
// mudar a origem do anexo não pode contornar a aprovação do relatório da mesma OP.
export async function filtrarRelatoriosLiberados(docs) {
  if (!docs.length) return docs;
  const ids = docs.map(d => d.id).filter(Boolean);
  const ops = [...new Set(docs.map(d => d.opNumero).filter(Boolean))];
  const rels = await prisma.relatorioInspecao.findMany({
    where: { OR: [{ documentoId: { in: ids } }, { opNumero: { in: ops } }] },
    select: { id: true, codigo: true, documentoId: true, opNumero: true, status: true,
      resultadoInspecao: true, revisao: true, envioAssinaturaId: true },
  });
  const envios = await prisma.envioAssinatura.findMany({
    where: { id: { in: [...new Set(rels.map(r => r.envioAssinaturaId).filter(Boolean))] } },
    include: { assinaturas: { select: { assinadoEm: true, revisaoPedidaEm: true } } },
  });
  const porEnvio = new Map(envios.map(e => [e.id, e]));
  return docs.filter(d => {
    const codigo = String(d.numeroDocumento || d.nome || d.arquivoNome || '').match(/^([A-Z]{2,5}-\d{2,4}-\d{2,4})(?:\b|_)/)?.[1];
    let ref = null, revisaoUrl = null;
    try { const url = new URL(d.arquivoUrl, 'https://portal.invalid'); revisaoUrl = url.searchParams.get('revisao'); ref = url.pathname.match(/^\/api\/qualidade\/inspecoes\/([^/]+)\/pdf\/?$/)?.[1]; } catch {}
    const rel = rels.find(r => (d.id && r.documentoId === d.id)
      || (r.opNumero === d.opNumero && ((codigo && r.codigo === codigo) || (ref && r.id === ref))));
    if (!rel) return d.origem !== 'inspecao_campo' && !ref;
    // Uma cópia de revisão anterior não herda as assinaturas da revisão vigente.
    const rev = String(d.nome || d.arquivoNome || '').match(/\bR(\d{2})\b/);
    if ((rev && Number(rev[1]) !== rel.revisao) || (revisaoUrl != null && (!/^\d+$/.test(revisaoUrl) || Number(revisaoUrl) !== rel.revisao))) return false;
    return relatorioLiberado(rel, porEnvio.get(rel.envioAssinaturaId));
  });
}
