import { expect, it } from 'vitest';
import { pendenciasParaAssinatura } from '@/lib/qualidade-campo';

// as três verificações do modelo marcadas (obrigatórias desde 02/10/2026): cada teste olha só o que é dele
const VERIF = { dimensional: 'APROVADO', alinhamento: 'APROVADO', acabamento: 'APROVADO' };
const relatorio = (tipo = 'PRE_MONTAGEM') => ({
  tipo, resultados: { ...VERIF },
  linhas: [{ letra: 'A', projetoMm: 1000, encontradoMm: 1001 }],
});

it('libera pré-montagem para assinatura sem quantitativo no cabeçalho ou nas linhas', () => {
  expect(pendenciasParaAssinatura(relatorio())).toEqual([]);
});
it('mantém o quantitativo obrigatório no dimensional', () => {
  expect(pendenciasParaAssinatura(relatorio('DIMENSIONAL'))).toContain('Quantitativo (QUANT.) não informado.');
});
it('continua exigindo as dimensões de projeto e encontrada na pré-montagem', () => {
  const rel = relatorio(); rel.linhas = [{ letra: 'A' }];
  expect(pendenciasParaAssinatura(rel)).toEqual([
    'Dimensão encontrada em branco na cota A.',
    'Dimensão de projeto em branco na(s) cota(s) A.',
  ]);
});
it('continua exigindo ao menos uma cota na pré-montagem', () => {
  expect(pendenciasParaAssinatura({ ...relatorio(), linhas: [] })).toEqual([
    'Nenhuma cota marcada — o relatório não diz o que foi conferido.',
  ]);
});
it('preserva a quantidade quando já foi informada', () => {
  const rel = relatorio(); rel.resultados = { ...VERIF, qtdPeca: { P1: 3 } };
  expect(pendenciasParaAssinatura(rel)).toEqual([]);
  expect(rel.resultados.qtdPeca.P1).toBe(3);
});
it('dimensional e pré-montagem: as três verificações do modelo precisam estar marcadas', () => {
  for (const tipo of ['DIMENSIONAL', 'PRE_MONTAGEM']) {
    const rel = relatorio(tipo); rel.resultados = { qtdPeca: { P1: 1 }, alinhamento: 'APROVADO' };
    expect(pendenciasParaAssinatura(rel)).toContain('Marque aprovado ou reprovado em: dimensional, acabamento.');
  }
});
it('aprovado com uma verificação reprovada é pendência — o documento diria duas coisas', () => {
  const rel = relatorio('PRE_MONTAGEM'); rel.resultadoInspecao = 'APROVADO'; rel.resultados = { ...VERIF, acabamento: 'REPROVADO' };
  expect(pendenciasParaAssinatura(rel)).toContain('Resultado APROVADO com acabamento reprovado — confira o resultado.');
  rel.resultadoInspecao = 'REPROVADO';
  expect(pendenciasParaAssinatura(rel)).toEqual([]);
});
