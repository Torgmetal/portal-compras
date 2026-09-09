import 'server-only';
import { prisma } from './prisma';
import { SO_FABRICACAO } from './lista-pecas';
import { OP_VIVA } from './op-viva';
import { prontidaoDoGantt } from './gantt-prontidao';

export async function lerProntidaoGantt(ids) {
  if (!ids.length) return new Map();
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { id: { in: [...new Set(ids)] }, tipoPeca: 'CONJUNTO', ...SO_FABRICACAO, ...OP_VIVA },
    select: { id: true, marca: true, status: true, terceirizado: true, terceirizadoRecebidoEm: true,
      conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true, corteConcluidoEm: true, baixaSetores: true } } } } },
  });
  return new Map(conjuntos.map(c => [c.id, { ...prontidaoDoGantt(c), marca: c.marca,
    fora: !!c.terceirizado && !c.terceirizadoRecebidoEm }]));
}

export async function conferirEntradaMontagem(blocos) {
  const montagem = blocos.filter(b => b.setor === 'MONTAGEM');
  const prontidao = await lerProntidaoGantt(montagem.flatMap(b => b.ids));
  for (const b of montagem) for (const id of b.ids) {
    const p = prontidao.get(id);
    if (!p || p.fora) throw new Error('Seleção contém conjunto fora da LPC ativa ou ainda no terceiro. Atualize o quadro.');
    if (b.recurso && !p.pronto) throw new Error(`${p.marca}: ${p.motivo}. Mantenha na fila sem bancada e libere somente os conjuntos aptos.`);
  }
}
