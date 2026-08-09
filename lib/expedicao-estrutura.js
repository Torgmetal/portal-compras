// Classificação de itens da lista de expedição para o % de expedição da ESTRUTURA.
//
// A estrutura é medida em KG. Alguns itens NÃO entram nesse % (têm linha própria no
// cronograma e/ou são medidos por unidade): grade de piso (tem peso, mas fora), telhas,
// parafusos/fixação (sem peso), lanternim, steel deck… A lista de termos é EDITÁVEL pelo
// time (tabela ExpedicaoItemExcluido) — aqui ficam só os padrões de fallback. (Vitor 09/08)

export const TERMOS_NAO_ESTRUTURAL_PADRAO = [
  "grade de piso", "grade",
  "steel deck", "steeldeck",
  "lanternim", "lanternin",
  "telha", "cumeeira", "rufo", "calha", "cobertura",
  "parafuso", "arruela", "porca", "rebite", "chumbador", "silicone",
];

const pesoMarca = (m) => (m?.pesoTotal ?? (m?.pesoUnit || 0) * (m?.qte ?? m?.qtd ?? 1)) || 0;
const foiExpedida = (m) => !!(m?.expedidoRomaneio || m?.expedidoArquivo);

/** true se a marca conta como estrutura (a descrição não bate com nenhum termo excluído). */
export function ehEstrutura(descricao, termos) {
  const lista = termos && termos.length ? termos : TERMOS_NAO_ESTRUTURAL_PADRAO;
  const d = String(descricao || "").toLowerCase();
  return !lista.some((t) => t && d.includes(String(t).toLowerCase()));
}

/**
 * % de expedição da ESTRUTURA: itens COM peso, fora os não-estruturais (grade/steel deck…).
 * @param {Array} marcas  marcasJson da ListaExpedicao
 * @param {string[]} [termos]  termos de exclusão (default = padrão)
 * @returns {{totalKg,expedidoKg,faltanteKg,marcasFaltantes,pct}}
 */
export function progressoEstrutura(marcas, termos) {
  let totalKg = 0, expedidoKg = 0, faltanteKg = 0, marcasFaltantes = 0;
  for (const m of marcas || []) {
    const p = pesoMarca(m);
    if (p <= 0) continue; // sem peso (telha/parafuso) — não é estrutura
    if (!ehEstrutura(m.descricao, termos)) continue; // grade/steel deck/lanternim…
    totalKg += p;
    if (foiExpedida(m)) expedidoKg += p;
    else { faltanteKg += p; marcasFaltantes++; }
  }
  const pct = totalKg > 0 ? Math.round((expedidoKg / totalKg) * 100) : null;
  return { totalKg, expedidoKg, faltanteKg, marcasFaltantes, pct };
}

/** Peso das marcas (com peso) NÃO embarcadas — o faltante REAL da lista (estrutura ou não). */
export function pesoFaltanteReal(marcas) {
  let kg = 0;
  for (const m of marcas || []) if (!foiExpedida(m)) kg += pesoMarca(m);
  return kg;
}
