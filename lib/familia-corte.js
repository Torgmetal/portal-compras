/* A FAMÍLIA DO MATERIAL, para quem o classificador NÃO manda direto para uma máquina.
 *
 * ⚠⚠ Vitor (08/09/2026): "ferro redondo vamos usar no de cantoneira ou de tubo, aí cabe a nós
 * selecionarmos para onde vamos. Nesse caso não quero que já programe direto, quero que crie barras
 * para colocarmos em máquinas que temos disponibilidade".
 *
 * Ou seja: há material que NÃO tem máquina certa — tem duas, e quem escolhe é quem olha a fila do
 * dia. Mandar automático seria decidir por ele; jogar tudo num monte "sem máquina" seria pior
 * ainda, porque aí ele não consegue arrastar o ferro redondo sem levar junto a chapa e o resto.
 *
 * A saída é a do meio: cada família vira a SUA barra na raia sem máquina, pronta para ser arrastada
 * inteira para o laser que estiver livre.
 *
 * ⚠ Isto NÃO é uma máquina e não deve virar uma. É rótulo de agrupamento — o dia em que alguém
 * mapear "ferro redondo → tubo" de forma fixa, o lugar disso é lib/lqs.js, não aqui.
 */

// ⚠ O FERRO CHATO SAIU DAQUI em 08/09/2026: Vitor definiu "laser cantoneira também", então ele tem
// máquina certa e o lugar dele é o classificador (lib/lqs.js). Família é só para o que NÃO tem.
const FAMILIAS = [
  { rx: /^fr\s?[øo0]/i, nome: "Ferro redondo" },
  { rx: /^br\s?[øo0]/i, nome: "Barra redonda" },
  { rx: /^bq\s?\d|barra\s?quadrada/i, nome: "Barra quadrada" },
];

/** Nome da família do perfil, ou null quando não se reconhece nem a família. */
export function familiaDoPerfil(perfil) {
  const p = String(perfil || "").trim();
  if (!p) return null;
  return FAMILIAS.find((f) => f.rx.test(p))?.nome || null;
}
