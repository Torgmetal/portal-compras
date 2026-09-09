// Preserva a evidência e os dados técnicos anteriores antes de qualquer correção/importação.
export function historicoBoletim(atual) {
  if (!atual) return [];
  const { historicoBoletins, ...versao } = atual;
  return [...(Array.isArray(historicoBoletins) ? historicoBoletins : []), JSON.parse(JSON.stringify(versao))];
}
