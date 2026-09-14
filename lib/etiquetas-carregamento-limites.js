// ─── QUANTO CABE NUMA IMPRESSÃO ──────────────────────────────────────────────
//
// Módulo PURO, compartilhado pela tela e pela rota: a conta que decide se dá para gerar precisa ser
// a MESMA nos dois lados, senão a tela libera o botão e o servidor recusa depois de minutos.
//
// ⚠⚠ POR QUE EXISTE UM TETO. A geração custa ~12,5 ms por etiqueta em produção (medido na OP-105:
// 1.793 etiquetas em 22,5 s) e o PDF sai a ~1,9 KB por etiqueta. Marcar TUDO nas obras maiores é
// impossível por construção:
//
//     OP-067: 60.281 etiquetas → ~753 s · ~113 MB
//     OP-083: 33.119 etiquetas → ~414 s ·  ~62 MB
//
// E a Vercel documenta 4,5 MB como teto do CORPO DE RESPOSTA de uma função serverless — o que
// morde muito antes do tempo. Na prática ninguém cola 60 mil adesivos de uma vez: a impressão é
// por carregamento. O teto existe para a recusa vir na hora, e não depois da espera.

/** Teto de etiquetas por impressão — provisório, calibrado pelo tamanho e não pelo tempo. */
export const MAX_ETIQUETAS = 2000;

/**
 * Teto do arquivo, conferido nos BYTES DE VERDADE.
 *
 * ⚠⚠ A CONTAGEM ESTIMA, OS BYTES MEDEM (pedido do Codex). 2.000 páginas de poucas marcas reusam
 * muito mais imagem que 2.000 marcas de uma página cada — a média da OP-105 não vale para as
 * outras. A contagem evita gastar minutos gerando o que será recusado; a medida em bytes é a que
 * diz se cabe.
 */
export const MAX_BYTES = 4_000_000;

/**
 * Quantas etiquetas esta seleção realmente rende.
 *
 * ⚠⚠ A MARCA EM CAIXA RENDE UMA, não `qte` (e a rota contava errado até 14/09/2026: o `total` dela
 * somava as peças ignorando a caixa). Uma marca de 50 peças fechada numa caixa é UM adesivo — usar
 * a contagem crua recusaria impressões que cabem folgadas.
 */
export function contarEtiquetas(pecas, emCaixa = new Set()) {
  const naCaixa = emCaixa instanceof Set ? emCaixa : new Set(emCaixa || []);
  return (pecas || []).reduce((s, p) => {
    const qte = Math.max(1, Number(p.qte) || 1);
    return s + (p.emCaixa || naCaixa.has(p.marca) ? 1 : qte);
  }, 0);
}

/**
 * A recusa por tamanho da seleção — ou `null` quando cabe.
 *
 * ⚠ Quando UMA marca sozinha estoura o teto, "marque por partes" não resolve: a tela seleciona
 * marcas inteiras, não peças. A frase precisa dizer isso, senão manda a pessoa tentar uma coisa
 * que não existe (pedido do Codex).
 */
export function recusaPorTamanho(pecas, emCaixa) {
  const etiquetas = contarEtiquetas(pecas, emCaixa);
  if (etiquetas <= MAX_ETIQUETAS) return null;

  const maior = Math.max(...contarPorMarca(pecas, emCaixa).map((m) => m.etiquetas), 0);
  const base = `São ${fmt(etiquetas)} etiquetas de uma vez, e o limite por impressão é ${fmt(MAX_ETIQUETAS)}.`;
  if (maior > MAX_ETIQUETAS) {
    return { etiquetas, limite: MAX_ETIQUETAS, marcaIndivisivel: true,
      erro: `${base} Uma única marca já passa do limite (${fmt(maior)} peças) — imprima essa marca à parte e fale com quem cuida do portal.` };
  }
  return { etiquetas, limite: MAX_ETIQUETAS,
    erro: `${base} Filtre por frente ou marque por partes — a impressão costuma ser por carregamento, não a obra inteira.` };
}

/** A recusa por tamanho do arquivo JÁ GERADO — ou `null`. */
export function recusaPorBytes(bytes) {
  if (bytes <= MAX_BYTES) return null;
  return {
    bytes, limite: MAX_BYTES,
    erro: `O PDF ficou com ${(bytes / 1048576).toFixed(1)} MB e o limite de envio é ${(MAX_BYTES / 1048576).toFixed(1)} MB. `
        + "Marque menos marcas e gere em partes.",
  };
}

const fmt = (n) => Number(n).toLocaleString("pt-BR");
const contarPorMarca = (pecas, emCaixa) =>
  (pecas || []).map((p) => ({ marca: p.marca, etiquetas: contarEtiquetas([p], emCaixa) }));
