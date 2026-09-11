import { z } from 'zod';

const esquema = z.array(z.object({
  id: z.string().min(1).max(200),
  inicio: z.number().int().min(0),
  quantidade: z.number().int().positive(),
}).strict()).min(1).max(5000);

/** null na query significa protocolo antigo; JSON null não é uma seleção válida. */
export function lerFracoesExportacao(valor) {
  if (valor === null) return undefined;
  try { return esquema.parse(JSON.parse(valor)); }
  catch { throw new Error('Frações inválidas. Atualize a seleção no Gantt.'); }
}

export function validarFracoesExportacao(fracoes, pecas) {
  if (fracoes === undefined) return null;
  const resultado = esquema.safeParse(fracoes);
  if (!resultado.success) throw new Error('Frações inválidas. Atualize a seleção no Gantt.');
  const porId = new Map(pecas.map(p => [p.id, p]));
  const selecao = new Map();
  for (const f of resultado.data) {
    const p = porId.get(f.id);
    if (!p || f.inicio + f.quantidade > Math.max(1, p.qte || 1))
      throw new Error('Fração fora da quantidade ou peça não encontrada nesta OP.');
    const anteriores = selecao.get(f.id) || [];
    if (anteriores.some(a => f.inicio < a.inicio + a.quantidade && a.inicio < f.inicio + f.quantidade))
      throw new Error('Frações sobrepostas na seleção.');
    anteriores.push(f);
    selecao.set(f.id, anteriores);
  }
  return selecao;
}

/** Interseção com as unidades já apontadas, alocadas cronologicamente pelo Gantt. */
export function feitoNasFracoes(fracoes, partes) {
  return fracoes.reduce((total, f) => total + partes.reduce((s, p) => s + Math.max(0,
    Math.min(f.inicio + f.quantidade, p.inicioUnidade + p.feitoDistribuido) - Math.max(f.inicio, p.inicioUnidade)), 0), 0);
}
