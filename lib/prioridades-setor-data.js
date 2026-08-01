// Carregamento comum da TV de Prioridades por setor: cronogramas ativos → OPs + datas,
// peças (LPC/LE) + Syneco + vínculos conjunto→croqui, já com o "corte forçado" resolvido.
// Usado tanto pela visão geral (lanes) quanto pela tela de um setor só (com detalhe de peças).
import { prisma } from "./prisma";
import { normalizeSetorSyneco } from "./syneco-dia";
import { mapaSetorReal, croquisCortadosPorConjunto } from "./prioridades-setor";

// Escolhe a fonte de peças da OP: LPC inteira (conjuntos+croquis+avulsas) se existir;
// senão a LE tratando cada peça como solo (sem estrutura pra saber quem monta/solda).
function selecionarUniverso(pecas) {
  const lpc = pecas.filter((p) => p.fonte === "LPC_IMPORT");
  if (lpc.length) return lpc;
  return pecas.filter((p) => p.fonte === "LE_IMPORT").map((p) => ({ ...p, tipoPeca: null, croquiCount: 0 }));
}

// Retorna { porObra, now }. Cada item de porObra tem { opId, opNumero, obra, cliente,
// refCliente, entrega(Date|null), universo(peças com corteForcado), realMap(Map) }.
export async function carregarPrioridadesPorObra() {
  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: {
      id: true, opNumero: true, titulo: true, dataFim: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true } },
      tarefas: { where: { isSummary: false, departamento: "EXPEDICAO" }, select: { dataFimPrevista: true } },
    },
  });

  const obras = [];
  const opIds = [];
  for (const c of cronos) {
    if (!c.op?.id) continue;
    const fins = c.tarefas.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => new Date(d));
    const entrega = fins.length ? new Date(Math.max(...fins)) : (c.dataFim ? new Date(c.dataFim) : null);
    obras.push({ opId: c.op.id, opNumero: c.op.numero || c.opNumero, obra: c.op.obra || c.titulo || c.opNumero, cliente: c.op.cliente || null, refCliente: c.op.refCliente || null, entrega });
    opIds.push(c.op.id);
  }
  if (!opIds.length) return { porObra: [], now: new Date() };

  const pecasRaw = await prisma.pecaConjunto.findMany({
    where: { opId: { in: opIds } },
    select: {
      opId: true, marca: true, tipoPeca: true, pesoTotalKg: true, status: true, fonte: true,
      qte: true, qteProduzida: true, corteConcluidoEm: true, prioridade: true, ordemCampo: true,
      _count: { select: { conjuntoCroquis: true } },
    },
  });
  const pecasPorOp = new Map();
  for (const p of pecasRaw) {
    const arr = pecasPorOp.get(p.opId) || [];
    arr.push({
      marca: p.marca, tipoPeca: p.tipoPeca, pesoTotalKg: p.pesoTotalKg, status: p.status, fonte: p.fonte,
      qte: p.qte, qteProduzida: p.qteProduzida, corteConcluidoEm: p.corteConcluidoEm,
      prioridade: p.prioridade, ordemCampo: p.ordemCampo, croquiCount: p._count.conjuntoCroquis,
    });
    pecasPorOp.set(p.opId, arr);
  }

  const syn = await prisma.mesOrdem.groupBy({
    by: ["opId", "item", "setor"],
    where: { opId: { in: opIds }, produzidoUn: { gt: 0 } },
    _sum: { produzidoUn: true },
  });
  const synPorOp = new Map();
  for (const l of syn) {
    const arr = synPorOp.get(l.opId) || [];
    arr.push({ item: l.item, setor: l.setor });
    synPorOp.set(l.opId, arr);
  }

  const links = await prisma.conjuntoCroqui.findMany({
    where: { conjunto: { opId: { in: opIds } } },
    select: { conjunto: { select: { opId: true, marca: true } }, croqui: { select: { marca: true } } },
  });
  const linksPorOp = new Map();
  for (const l of links) {
    const arr = linksPorOp.get(l.conjunto.opId) || [];
    arr.push({ conj: l.conjunto.marca, croqui: l.croqui.marca });
    linksPorOp.set(l.conjunto.opId, arr);
  }

  // Datas necessárias por setor (Solicitação de Produção): datasSetor keyed por
  // CORTE/MONTAGEM/SOLDA/ACABAMENTO/JATO/PINTURA/EXPEDICAO → "YYYY-MM-DD".
  const opNumeros = obras.map((o) => o.opNumero);
  const solics = await prisma.solicitacaoProducao.findMany({
    where: { OR: [{ opId: { in: opIds } }, { opNumero: { in: opNumeros } }] },
    select: { opId: true, opNumero: true, datasSetor: true },
  });
  const solPorOpId = new Map();
  const solPorNum = new Map();
  for (const s of solics) {
    if (s.opId) solPorOpId.set(s.opId, s.datasSetor || {});
    if (s.opNumero) solPorNum.set(s.opNumero, s.datasSetor || {});
  }

  const porObra = obras.map((o) => {
    const pecas = pecasPorOp.get(o.opId) || [];
    const realMap = mapaSetorReal(synPorOp.get(o.opId) || [], normalizeSetorSyneco);
    const cortados = croquisCortadosPorConjunto(pecas, realMap, linksPorOp.get(o.opId) || []);
    const universo = selecionarUniverso(pecas).map((p) => (p.tipoPeca === "CROQUI" && cortados.has(p.marca) ? { ...p, corteForcado: true } : p));
    const datasSetor = solPorOpId.get(o.opId) || solPorNum.get(o.opNumero) || {};
    return { ...o, universo, realMap, datasSetor };
  });

  return { porObra, now: new Date() };
}
