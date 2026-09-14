// A CHAVE de uma lista LPC no portal é a FASE (T94A, T83F), nunca o número da OP (094).
//
// ⚠⚠ OP-094 (14/09/2026): a mesma LPC entrou pela tela de Listas da Engenharia (que mandava só a OP →
// chave "094") e pela de Peças (que manda o nome do arquivo → chave "T94A"). Como a peça é única por
// (opNumero, marca), as 591 marcas ficaram DUPLICADAS — a programação do corte listava T94A-P248 duas
// vezes, "Frente T94A" e "Frente 094", e o PCP não conseguia liberar. Toda tela que importa LPC passa
// por aqui: o número da OP só vale quando nem o arquivo, nem as marcas, nem o banco dizem a fase.

/** "094", "94" → true; "T94A" → false */
export const ehSoNumero = (v) => /^\d+$/.test(String(v || "").trim());

/** Fase escrita no nome do arquivo (T94A-LPC_R01.xlsx → "T94A"), ou null. */
export const faseDoArquivo = (arquivoNome) => String(arquivoNome || "").toUpperCase().match(/T\d+[A-Z]*/)?.[0] || null;

/**
 * Chave a FORÇAR no parser: a fase do arquivo, senão a fase escolhida na tela; o número da OP nunca —
 * com null o parser detecta a fase pelas marcas (T94A-P248 → T94A).
 */
export const chaveParaOParser = ({ arquivoNome, opForcada }) => faseDoArquivo(arquivoNome) || (opForcada && !ehSoNumero(opForcada) ? String(opForcada).trim().toUpperCase() : null);

/**
 * Depois do parser: se a chave ainda é só número e a OP já tem UMA lista LPC gravada sob uma fase,
 * é ela — importar de novo sob o número duplicaria tudo. Com mais de uma fase no banco não dá para
 * adivinhar, e a chave numérica fica (a tela avisa).
 * @param {string} opNumero  chave saída do parser
 * @param {string[]} existentes  chaves LPC já gravadas para a OP (opNumero distintos)
 */
export const chaveAjustadaPeloBanco = (opNumero, existentes) => ehSoNumero(opNumero) && existentes.length === 1 && existentes[0] !== opNumero ? existentes[0] : null;
