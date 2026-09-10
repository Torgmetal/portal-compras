import 'server-only';
import { prisma } from './prisma';
import { SO_FABRICACAO } from './lista-pecas';
import { OP_VIVA } from './op-viva';
import { prontidaoDoGantt } from './gantt-prontidao';
import { pecasNoTerceiro } from './fora-da-fabrica';

export async function lerProntidaoGantt(ids, banco = prisma) {
  if (!ids.length) return new Map();
  const conjuntos = await banco.pecaConjunto.findMany({
    where: { id: { in: [...new Set(ids)] }, tipoPeca: 'CONJUNTO', ...SO_FABRICACAO, ...OP_VIVA },
    select: { id: true, marca: true, status: true, terceirizado: true, terceirizadoRecebidoEm: true,
      conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true, corteConcluidoEm: true, baixaSetores: true } } } } },
  });
  return new Map(conjuntos.map(c => [c.id, { ...prontidaoDoGantt(c), marca: c.marca,
    fora: !!c.terceirizado && !c.terceirizadoRecebidoEm }]));
}

export async function conferirEntradaMontagem(blocos, banco = prisma) {
  const montagem = blocos.filter(b => ['MONTAGEM', 'SOLDA'].includes(b.setor));
  if (!montagem.length) return;
  const prontidao = await lerProntidaoGantt(montagem.flatMap(b => b.ids), banco);
  const foraDaFabrica = await pecasNoTerceiro(banco);
  for (const b of montagem) for (const id of b.ids) {
    const p = prontidao.get(id);
    if (!p) throw new Error('Seleção contém conjunto fora da LPC ativa. Atualize o quadro.');
    // O despacho também pode registrar terceirização antes de existir romaneio.
    // As duas fontes bloqueiam a programação até o recebimento ser conferido.
    if (foraDaFabrica.has(id) || p.fora) {
      throw new Error(`${p.marca}: conjunto ainda no terceiro. Confira o recebimento antes de programar.`);
    }
    if (!p.total) throw new Error(`${p.marca}: marca sem subpeças/croquis. Após o corte, programe no Jato; não passa por Montagem ou Solda.`);
    if (b.setor === 'MONTAGEM' && b.recurso && !p.pronto) throw new Error(`${p.marca}: ${p.motivo}. Mantenha na fila sem bancada e libere somente os conjuntos aptos.`);
  }
}
