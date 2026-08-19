// Carregamento comum da TV de Prioridades por setor: cronogramas ativos → OPs + datas,
// peças (LPC/LE) + Syneco + vínculos conjunto→croqui, já com o "corte forçado" resolvido.
// Usado tanto pela visão geral (lanes) quanto pela tela de um setor só (com detalhe de peças).
import { prisma } from "./prisma";
import { normalizeSetorSyneco } from "./syneco-dia";
import { mapaSetorReal, croquisCortadosPorConjunto, datasSetorDoCronograma } from "./prioridades-setor";
import { ehItemComprado } from "./item-comprado";
import { ehLinhaLixo } from "./pecas-producao";

// Escolhe a fonte de peças da OP: LPC inteira (conjuntos+croquis+avulsas) se existir;
// senão a LE tratando cada peça como solo (sem estrutura pra saber quem monta/solda).
// Em qualquer caso remove os ITENS COMPRADOS (parafuso/porca/arruela/… sem estrutura de
// fabricação) — não são feitos por nós, não entram nas raias de produção. (Regra do Vitor.)
function selecionarUniverso(pecas) {
  const lpc = pecas.filter((p) => p.fonte === "LPC_IMPORT");
  const base = lpc.length ? lpc : pecas.filter((p) => p.fonte === "LE_IMPORT").map((p) => ({ ...p, tipoPeca: null, croquiCount: 0 }));
  // Fora: linha "TOTAL.:" do import da LE (peso da lista inteira somado numa peça só) e os itens
  // comprados. Sem o primeiro, a OP-060 aparecia com 153 t fantasma na fila.
  return base.filter((p) => !ehLinhaLixo(p) && !ehItemComprado(p));
}

// Retorna { porObra, now }. Cada item de porObra tem { opId, opNumero, obra, cliente,
// refCliente, entrega(Date|null), universo(peças com corteForcado), realMap(Map) }.
export async function carregarPrioridadesPorObra() {
  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: {
      id: true, opNumero: true, titulo: true, dataFim: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true, emProducao: true } },
      tarefas: { where: { isSummary: false }, select: { departamento: true, nome: true, dataFimPrevista: true } },
    },
  });

  const obras = [];
  const opIds = [];
  const comCronograma = new Set();
  for (const c of cronos) {
    if (!c.op?.id) continue;
    comCronograma.add(c.op.id);
    const fins = c.tarefas.filter((t) => t.departamento === "EXPEDICAO" && t.dataFimPrevista).map((t) => new Date(t.dataFimPrevista));
    const entrega = fins.length ? new Date(Math.max(...fins)) : (c.dataFim ? new Date(c.dataFim) : null);
    obras.push({ opId: c.op.id, opNumero: c.op.numero || c.opNumero, obra: c.op.obra || c.titulo || c.opNumero, cliente: c.op.cliente || null, refCliente: c.op.refCliente || null, emProducao: !!c.op.emProducao, entrega, datasSetorCrono: datasSetorDoCronograma(c.tarefas) });
    opIds.push(c.op.id);
  }

  // OPs fixadas manualmente (rápidas, sem cronograma) — entram na TV mesmo sem cronograma.
  const vistos = new Set(opIds);
  const fixadas = await prisma.prioridadeTvOp.findMany({ select: { opId: true, opNumero: true } });
  if (fixadas.length) {
    const idsFix = fixadas.map((f) => f.opId).filter(Boolean);
    const numsFix = fixadas.map((f) => f.opNumero);
    const opsFix = await prisma.oP.findMany({ where: { OR: [{ id: { in: idsFix } }, { numero: { in: numsFix } }] }, select: { id: true, numero: true, obra: true, cliente: true, refCliente: true, emProducao: true } });
    const byId = new Map(opsFix.map((o) => [o.id, o]));
    const byNum = new Map(opsFix.map((o) => [o.numero, o]));
    for (const f of fixadas) {
      const op = (f.opId && byId.get(f.opId)) || byNum.get(f.opNumero);
      if (!op?.id || vistos.has(op.id)) continue;
      obras.push({ opId: op.id, opNumero: op.numero, obra: op.obra || op.numero, cliente: op.cliente || null, refCliente: op.refCliente || null, emProducao: !!op.emProducao, entrega: null, datasSetorCrono: {}, manual: true });
      opIds.push(op.id);
      vistos.add(op.id);
    }
  }

  // OPs enviadas pra produção (botão do PCP) — entram mesmo sem cronograma (pra nunca sumirem).
  const emProd = await prisma.oP.findMany({ where: { emProducao: true }, select: { id: true, numero: true, obra: true, cliente: true, refCliente: true } });
  for (const op of emProd) {
    if (vistos.has(op.id)) continue;
    obras.push({ opId: op.id, opNumero: op.numero, obra: op.obra || op.numero, cliente: op.cliente || null, refCliente: op.refCliente || null, emProducao: true, entrega: null, datasSetorCrono: {}, manual: true });
    opIds.push(op.id);
    vistos.add(op.id);
  }

  // OPs LIBERADAS PELA PROGRAMAÇÃO (o programador lançou no Syneco) — entram mesmo sem cronograma
  // e sem o botão "enviar para produção". Vitor (19/08): "de toda forma, se foi liberado pela
  // programação tem que aparecer nessa tela".
  //
  // Era um buraco silencioso: a OP-084 recebeu 495 ordens do Syneco às 06:07 e não aparecia em
  // lugar nenhum, porque a lista saía só de cronograma ativo + fixadas + em produção. O PCP não
  // tinha como liberar pros setores uma OP que nem abria.
  //
  // ⚠ ENCERRADA/CANCELADA fica de fora: a 078 está encerrada com 2.664 peças "em aberto" (dado
  // velho) e entupiria a TV com obra que já foi.
  const progIds = (await prisma.mesOrdem.groupBy({ by: ["opId"], where: { opId: { not: null } }, _count: { _all: true } }))
    .map((g) => g.opId)
    .filter((id) => id && !vistos.has(id));
  if (progIds.length) {
    const comAbertas = new Set(
      (await prisma.pecaConjunto.groupBy({
        by: ["opId"],
        where: { opId: { in: progIds }, destino: null, status: { notIn: ["EXPEDIDO", "CANCELADA"] } },
        _count: { _all: true },
      })).map((g) => g.opId)
    );
    // OPs DISPENSADAS à mão saem daqui. A fonte "programação" é certa (senão a OP fica invisível
    // pro PCP), mas traz de volta obra antiga que ainda tem peça em aberto no dado — a OP-064
    // voltou com 2.441 peças. Não dá pra separar por status: todas estão ABERTA. Vitor (19/08):
    // "essas OPs pode tirar o alerta por ora, vamos deixar apenas a OP-60 aparecendo".
    // Só afeta ESTA fonte: OP fixada à mão ou enviada pra produção continua entrando.
    const ocultas = new Set(
      (await prisma.prioridadeTvOculta.findMany({ select: { opNumero: true } })).map((o) => o.opNumero)
    );
    const opsProg = (await prisma.oP.findMany({
      where: { id: { in: progIds.filter((id) => comAbertas.has(id)) }, status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, obra: true, cliente: true, refCliente: true, emProducao: true },
    })).filter((op) => !ocultas.has(op.numero));
    for (const op of opsProg) {
      if (vistos.has(op.id)) continue;
      obras.push({ opId: op.id, opNumero: op.numero, obra: op.obra || op.numero, cliente: op.cliente || null, refCliente: op.refCliente || null, emProducao: !!op.emProducao, entrega: null, datasSetorCrono: {}, manual: true, porProgramacao: true });
      opIds.push(op.id);
      vistos.add(op.id);
    }
  }

  // Quem NÃO veio por cronograma fica marcado: a tela avisa pra correr e gerar o cronograma, e o
  // aviso some sozinho quando ele nascer (aí a OP passa a entrar pelo primeiro caminho).
  for (const o of obras) if (!comCronograma.has(o.opId)) o.semCronograma = true;

  if (!opIds.length) return { porObra: [], now: new Date() };

  const pecasRaw = await prisma.pecaConjunto.findMany({
    where: { opId: { in: opIds } },
    select: {
      id: true, opId: true, marca: true, descricao: true, tipoPeca: true, perfil: true, pesoTotalKg: true, status: true, fonte: true,
      qte: true, qteProduzida: true, corteConcluidoEm: true, baixaSetores: true, prioridade: true, ordemCampo: true,
      terceirizado: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true, terceiroRetornoPrevisto: true, encaminhadoSetor: true,
      _count: { select: { conjuntoCroquis: true } },
    },
  });
  const pecasPorOp = new Map();
  for (const p of pecasRaw) {
    const arr = pecasPorOp.get(p.opId) || [];
    arr.push({
      id: p.id, marca: p.marca, descricao: p.descricao, tipoPeca: p.tipoPeca, perfil: p.perfil, pesoTotalKg: p.pesoTotalKg, status: p.status, fonte: p.fonte,
      qte: p.qte, qteProduzida: p.qteProduzida, corteConcluidoEm: p.corteConcluidoEm, baixaSetores: p.baixaSetores,
      prioridade: p.prioridade, ordemCampo: p.ordemCampo, croquiCount: p._count.conjuntoCroquis,
      terceirizado: p.terceirizado, destinoTerceirizado: p.destinoTerceirizado, terceirizadoRecebidoEm: p.terceirizadoRecebidoEm, terceiroRetornoPrevisto: p.terceiroRetornoPrevisto, encaminhadoSetor: p.encaminhadoSetor,
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
    // "As duas": cronograma como base, Solicitação de Produção sobrepõe quando existir.
    const solOverride = solPorOpId.get(o.opId) || solPorNum.get(o.opNumero) || {};
    const datasSetor = { ...o.datasSetorCrono, ...solOverride };
    return { ...o, universo, realMap, datasSetor, links: linksPorOp.get(o.opId) || [] };
  });

  return { porObra, now: new Date() };
}
