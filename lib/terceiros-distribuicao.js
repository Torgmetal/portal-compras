import {DESTINOS_TERCEIRO} from './terceiros-retorno';

// O destino geral recebe o restante; só as exceções precisam de distribuição manual.
export function itensRetornoSelecionados(linhas, destinoGeral) {
  const selecionadas = linhas.filter(l => l.selecionada);
  if (!selecionadas.length) throw new Error('Selecione ao menos uma marca recebida.');
  if (!DESTINOS_TERCEIRO.includes(destinoGeral)) throw new Error('Escolha o destino de todo o retorno.');
  return selecionadas.flatMap(l => {
    const qte = Number(l.qte);
    if (l.saldo == null || !Number.isInteger(qte) || qte <= 0 || qte > l.saldo) {
      throw new Error(`Confira a quantidade recebida de ${l.marca}: saldo de ${l.saldo ?? 'quantidade desconhecida'} peças.`);
    }
    const destinos = new Set([destinoGeral]);
    const extras = (l.dividir ? l.distribuicao : []).map(d => {
      const n = Number(d.qte);
      if (!Number.isInteger(n) || n <= 0 || !DESTINOS_TERCEIRO.includes(d.destino)) {
        throw new Error(`Informe a quantidade e o outro setor de ${l.marca}.`);
      }
      if (destinos.has(d.destino)) throw new Error(`Escolha setores diferentes na separação de ${l.marca}.`);
      destinos.add(d.destino);
      return {marca: l.marca, qte: n, destino: d.destino};
    });
    const restante = qte - extras.reduce((s, d) => s + d.qte, 0);
    if (restante < 0) throw new Error(`A separação de ${l.marca} excede as ${qte} peças recebidas.`);
    return [...(restante > 0 ? [{marca: l.marca, qte: restante, destino: destinoGeral}] : []), ...extras];
  });
}
