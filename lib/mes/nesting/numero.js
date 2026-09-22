// ⚠⚠ OS DOIS SOFTWARES ESCREVEM NÚMERO DE JEITO DIFERENTE, E ISSO ERA UM ERRO SILENCIOSO (achado
// do Codex, 13/09/2026). O TubesT escreve `679,60` (vírgula decimal); a Libellula, `9.53` (ponto).
// A minha primeira versão tinha uma conta para cada leitor, e a do TubesT apagava TODO ponto: um
// relatório que saísse em `679.60` viraria **67960** — barra 100× mais comprida, sem erro nenhum.
//
// ⚠⚠ E ADIVINHAR NÃO RESOLVE, PORQUE A AMBIGUIDADE É REAL: `1.352` é o peso 1,352 kg de uma peça
// da Libellula, e `1.500` é mil e quinhentos milímetros. A MESMA string, dois números. Por isso
// quem chama DIZ a convenção — e quem chama sabe, porque sabe de qual software é o arquivo.

const SEPARADOR = { ",": /\./g, ".": /,/g };

/**
 * @param {string} valor
 * @param {","|"."} [decimal] a convenção do arquivo. Sem ela, vale o ÚLTIMO separador, e ponto
 *   sozinho é tratado como decimal — o palpite menos destrutivo dos dois.
 */
export function numeroLocal(valor, decimal) {
  const t = String(valor ?? "").trim();
  if (!t || !/\d/.test(t)) return null;

  if (decimal) {
    return Number(t.replace(SEPARADOR[decimal], "").replace(decimal, "."));
  }
  const usado = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  return Number(t.replace(SEPARADOR[usado], "").replace(usado, "."));
}

/** Os dois leitores, já com a convenção do seu software. */
export const numeroTubesT = (v) => numeroLocal(v, ",");
export const numeroLibellula = (v) => numeroLocal(v, ".");
