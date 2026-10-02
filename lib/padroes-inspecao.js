import 'server-only';
import { prisma } from '@/lib/prisma';
import { camposDoRelatorioPintura, PLP_PADRAO } from '@/lib/plp';
import { CAMPOS_DEMAO_DA_OBRA } from '@/lib/pintura-campos';
import { CRITERIO_PADRAO } from '@/lib/evs-campos';
import { MATERIAL_PADRAO, APARELHAGEM_PADRAO_US } from '@/lib/us-campos';
import { PADRAO_SAIS } from '@/lib/sais-campos';
import { PADRAO_POEIRA } from '@/lib/poeira-campos';
import { PADRAO_PULLOFF } from '@/lib/pulloff-campos';
import { PADRAO_RECEBIMENTO } from '@/lib/recebimento-tinta-campos';
import { dadosDaObra } from '@/lib/planos-aceite';

const JUNTA_SOLDADA = ['eps', 'rqs', 'processoSolda', 'metalAdicao', 'tipoJunta'];

// Somente parâmetros reutilizáveis. Medições, laudos, lotes, instrumentos e peças
// nunca entram nesta memória. Um registro por campo evita perder alterações concorrentes.
const CAMPOS = {
  // ⚠ os campos da demão vêm de CAMPOS_DEMAO_DA_OBRA: é por eles que a trava de assinatura sabe o que
  // o relatório já nasce trazendo — a lista não pode divergir daqui.
  PINTURA: ['limpeza', 'abrasivo', 'prepProcedimento', 'rugEspec', 'espessuraMinima',
    ...['1', '2', '3'].flatMap(d => CAMPOS_DEMAO_DA_OBRA.map(k => `demaos.${d}.${k}`))],
  // ⚠ a JUNTA SOLDADA (EPS, RQS, processo, metal de adição, tipo de junta) é escolha da obra, como o
  // penetrante: faltava nos relatórios da OP-102 (Vitor, 23/09/2026), e o próximo nasce com ela.
  VISUAL_SOLDA: ['tecnica', 'criterio', ...JUNTA_SOLDADA],
  LP: ['tipoPenetrante', 'metodo', 'penetranteMarca', 'removedor', 'revelador', 'criterio', ...JUNTA_SOLDADA],
  ULTRASSOM: ['acoplante', 'blocoPadrao', 'local', 'criterio', 'norma'],
  // sais e poeira (02/10/2026): documento, pedido, a aparelhagem e o critério da obra — nunca as leituras
  SAIS: ['documentoReferencia', 'ordemCompra', 'volumeAgua', 'areaCelula', 'requisito',
    'aparelho', 'apModelo', 'apTag', 'termometro', 'tmModelo', 'tmTag'],
  POEIRA: ['documentoReferencia', 'ordemCompra', 'fitaAdesiva', 'ampliacao'],
  // pull-off e recebimento de tintas (02/10/2026): o mesmo — escolhas da obra, nunca leituras nem lotes
  PULL_OFF: ['documentoReferencia', 'ordemCompra', 'normas', 'adesivo', 'aparelho', 'apModelo', 'pistao'],
  RECEBIMENTO_TINTA: ['contrato', 'localEquipamento', 'norma'],
};
const ler = (obj, campo) => campo.split('.').reduce((o, k) => o?.[k], obj);
function escrever(obj, campo, valor) {
  const partes = campo.split('.'); let alvo = obj;
  for (const k of partes.slice(0, -1)) { alvo[k] ??= {}; alvo = alvo[k]; }
  alvo[partes.at(-1)] = valor;
}
// ⚠ 500, o que as telas aceitam no documento de referência: com 300, o próximo relatório nascia cortado
const normalizar = v => v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, 500);

export async function valoresIniciaisInspecao(opNumero, tipo) {
  if (!CAMPOS[tipo]) return {};
  const padroes = await prisma.padraoInspecao.findMany({ where: { opNumero, tipo } });
  let valores = {};
  let doPlp = {};
  if (tipo === 'PINTURA') {
    // ⚠ O PROCEDIMENTO DA PREPARAÇÃO também nasce no padrão do PO-05, como o grau e o abrasivo. Só o
    // PLP o preenchia, e OP sem PLP (089, 071, 085, 103) mandava o RIP para assinatura com o campo em
    // branco — o assinante devolveu os RIP-089-002 e 003 por isso (29/09/2026). O PLP que diz o
    // método prevalece logo abaixo; o snapshot do especificado (`doPlp`) não ganha este padrão.
    valores = { limpeza: 'SA2.5', abrasivo: 'Granalha', prepProcedimento: PLP_PADRAO.preparoMetodo };
    const plp = await prisma.planoPintura.findUnique({ where: { opNumero } });
    doPlp = camposDoRelatorioPintura(plp);
    Object.assign(valores, doPlp);
    // Método padrão nas demãos previstas; sem PLP, começa pela primeira.
    const ordens = Object.keys(valores.demaos || {});
    valores.demaos = Object.fromEntries((ordens.length ? ordens : ['1']).map(d => [d, { metodo: 'Airless', ...valores.demaos?.[d] }]));
  } else if (tipo === 'VISUAL_SOLDA') valores = { tecnica: 'Visual direta', criterio: CRITERIO_PADRAO };
  else if (tipo === 'LP') valores = { tipoPenetrante: 'II', metodo: 'A', penetranteMarca: 'Metal-Chek', removedor: 'Água', revelador: 'Metal-Chek', criterio: 'AWS D1.1' };
  // ⚠ Vitor (22/09/2026): "o 2 MHz é fixo, isso não muda; o modelo do aparelho e do cabeçote é
  // sempre o mesmo, pode deixar fixo". O relatório nasce com a aparelhagem da casa preenchida —
  // inclusive os números de série, que são do equipamento e não da inspeção.
  // ⚠⚠ O ÂNGULO REAL (`cbAngulo`) NÃO ENTRA: ele é MEDIDO no bloco padrão. Preencher um valor
  // medido é o mesmo erro de já dar a peça por conferida — o inspetor tem de ler e digitar.
  else if (tipo === 'ULTRASSOM') valores = {
    acoplante: 'Metilcelulose em água', blocoPadrao: 'V2', local: 'TORG METAL LTDA',
    norma: 'AWS D1.1', criterio: 'AWS D1.1', material: MATERIAL_PADRAO,
    ...APARELHAGEM_PADRAO_US,
  };
  // ⚠ SAIS E POEIRA: a "ordem de compra" do modelo é o PEDIDO DO CLIENTE, que o Kick Off já guarda
  // (o mesmo dado dos planos de aceite). Falhar a leitura não pode impedir a criação: fica em branco.
  else if (tipo === 'SAIS' || tipo === 'POEIRA') {
    const obra = await dadosDaObra(prisma, opNumero).catch(() => null);
    valores = { ...(tipo === 'SAIS' ? PADRAO_SAIS : PADRAO_POEIRA), ...(obra?.pedidoCliente ? { ordemCompra: obra.pedidoCliente } : {}) };
  }
  // ⚠ PULL-OFF (02/10/2026): o aparelho é o que o RIP da obra já registrou no pull-off (não está no mapa de
  // calibração), e o esquema nasce do PLP — só quando a soma das demãos FECHA com o total do plano: assim
  // se sabe que o número é por demão, e não acumulado (dúvida que já existe na micragem da pintura).
  else if (tipo === 'PULL_OFF') {
    const [obra, plp, rips] = await Promise.all([
      dadosDaObra(prisma, opNumero).catch(() => null),
      prisma.planoPintura.findUnique({ where: { opNumero } }).catch(() => null),
      prisma.relatorioInspecao.findMany({ where: { opNumero, tipo: 'PINTURA' }, orderBy: { createdAt: 'desc' }, take: 20, select: { resultados: true } }).catch(() => []),
    ]);
    const demaos = (Array.isArray(plp?.demaos) ? [...plp.demaos] : []).sort((a, b) => (a?.ordem || 0) - (b?.ordem || 0)).slice(0, 3);
    // ⚠ demão SEM espessura não é zero (Number(null) === 0 fechava a soma e o esquema nascia com "0")
    const mins = demaos.map(d => (d?.espessuraMin == null || String(d.espessuraMin).trim() === '' ? NaN : Number(d.espessuraMin)));
    const porDemao = mins.length && mins.every(Number.isFinite) && plp?.espessuraTotal != null
      && Math.abs(mins.reduce((s, v) => s + v, 0) - Number(plp.espessuraTotal)) <= 1;
    const equipRip = (rips || []).map(r => String(r?.resultados?.pullOffEquip || '').trim()).find(v => v && v.toUpperCase() !== 'N/A');
    valores = {
      ...PADRAO_PULLOFF,
      ...(obra?.pedidoCliente ? { ordemCompra: obra.pedidoCliente } : {}),
      ...(porDemao ? { esquema: mins.map(String) } : {}),
      ...(equipRip ? { aparelho: equipRip } : {}),
    };
  }
  // ⚠ RECEBIMENTO DE TINTAS: o "contrato" do modelo é o pedido do cliente do Kick Off, como a ordem de compra
  else if (tipo === 'RECEBIMENTO_TINTA') {
    const obra = await dadosDaObra(prisma, opNumero).catch(() => null);
    valores = { ...PADRAO_RECEBIMENTO, ...(obra?.pedidoCliente ? { contrato: obra.pedidoCliente } : {}) };
  }
  // Snapshot do PLP antes das escolhas; permite mostrar divergência sem reescrever o plano.
  const especificado = JSON.parse(JSON.stringify(doPlp));
  const herdados = [];
  for (const p of padroes || []) if (CAMPOS[tipo].includes(p.campo)) {
    escrever(valores, p.campo, normalizar(p.valor)); herdados.push(p.campo);
  }
  return { ...valores, padroesInspecao: { versao: 1, campos: herdados, plp: especificado } };
}

/** Salva relatório, somente escolhas alteradas e auditoria na mesma transação. */
export async function salvarInspecaoComPadroes(rel, dados, userId) {
  const mudancas = [];
  if (dados.resultados) for (const campo of CAMPOS[rel.tipo] || []) {
    const depois = ler(dados.resultados, campo);
    if (depois === undefined) continue;
    const antes = normalizar(ler(rel.resultados, campo));
    const valor = normalizar(depois);
    if (antes !== valor) mudancas.push({ campo, antes, depois: valor });
  }
  if (!mudancas.length) return prisma.relatorioInspecao.update({ where: { id: rel.id }, data: dados });
  return prisma.$transaction(async tx => {
    const atualizado = await tx.relatorioInspecao.update({ where: { id: rel.id }, data: dados });
    for (const m of mudancas) {
      const chave = { opNumero: rel.opNumero, tipo: rel.tipo, campo: m.campo };
      const valor = { valor: m.depois, relatorioId: rel.id, userId };
      await tx.padraoInspecao.upsert({ where: { opNumero_tipo_campo: chave }, create: { ...chave, ...valor }, update: valor });
    }
    await tx.auditLog.create({ data: { userId, action: 'ALTERAR_PADRAO_INSPECAO', entity: 'RelatorioInspecao', entityId: rel.id,
      diff: { opNumero: rel.opNumero, tipo: rel.tipo, mudancas } } });
    return atualizado;
  });
}
