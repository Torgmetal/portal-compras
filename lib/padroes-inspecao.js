import 'server-only';
import { prisma } from '@/lib/prisma';
import { camposDoRelatorioPintura } from '@/lib/plp';
import { CRITERIO_PADRAO } from '@/lib/evs-campos';

// Somente parâmetros reutilizáveis. Medições, laudos, lotes, instrumentos e peças
// nunca entram nesta memória. Um registro por campo evita perder alterações concorrentes.
const CAMPOS = {
  PINTURA: ['limpeza', 'abrasivo', 'prepProcedimento', 'rugEspec', 'espessuraMinima',
    ...['1', '2', '3'].flatMap(d => ['produto', 'fabricante', 'cor', 'metodo'].map(k => `demaos.${d}.${k}`))],
  VISUAL_SOLDA: ['tecnica', 'criterio'],
  LP: ['tipoPenetrante', 'metodo', 'penetranteMarca', 'removedor', 'revelador', 'criterio'],
  ULTRASSOM: ['acoplante', 'blocoPadrao', 'local', 'criterio', 'norma'],
};
const ler = (obj, campo) => campo.split('.').reduce((o, k) => o?.[k], obj);
function escrever(obj, campo, valor) {
  const partes = campo.split('.'); let alvo = obj;
  for (const k of partes.slice(0, -1)) { alvo[k] ??= {}; alvo = alvo[k]; }
  alvo[partes.at(-1)] = valor;
}
const normalizar = v => v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, 300);

export async function valoresIniciaisInspecao(opNumero, tipo) {
  if (!CAMPOS[tipo]) return {};
  const padroes = await prisma.padraoInspecao.findMany({ where: { opNumero, tipo } });
  let valores = {};
  let doPlp = {};
  if (tipo === 'PINTURA') {
    valores = { limpeza: 'SA2.5', abrasivo: 'Granalha' };
    const plp = await prisma.planoPintura.findUnique({ where: { opNumero } });
    doPlp = camposDoRelatorioPintura(plp);
    Object.assign(valores, doPlp);
    // Método padrão nas demãos previstas; sem PLP, começa pela primeira.
    const ordens = Object.keys(valores.demaos || {});
    valores.demaos = Object.fromEntries((ordens.length ? ordens : ['1']).map(d => [d, { metodo: 'Airless', ...valores.demaos?.[d] }]));
  } else if (tipo === 'VISUAL_SOLDA') valores = { tecnica: 'Visual direta', criterio: CRITERIO_PADRAO };
  else if (tipo === 'LP') valores = { tipoPenetrante: 'II', metodo: 'A', penetranteMarca: 'Metal-Chek', removedor: 'Água', revelador: 'Metal-Chek', criterio: 'AWS D1.1' };
  else if (tipo === 'ULTRASSOM') valores = { acoplante: 'Metilcelulose em água', blocoPadrao: 'V2', local: 'TORG METAL LTDA' };
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
