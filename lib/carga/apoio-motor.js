// O apoio que o MOTOR conferiu no aço real (caibros e calços, lib/carga/perfil-apoio.js) só vale enquanto nem o
// volume nem os que o sustentam saíram do lugar. A tela e a rota da montagem manual não têm a malha do IFC: se
// alguém arrastou ou girou um volume no editor, volta a conferência conservadora pela caixa envolvente.
//
// ⚠ Sem isto, a primeira edição de uma carga acusaria "sem apoio" e "sobreposição" em todo volume encaixado pelo
// aço — a coluna de cima desencontrada da de baixo tem a caixa (550 × 550 da chapa de base) cruzando a outra.
const girado = (u) => !!u.rotacaoManual && !!(u.rotacaoManual.x || u.rotacaoManual.y || u.rotacaoManual.z);

/** O volume está onde o motor o pôs, sem giro manual. */
export function noLugarDoMotor(u) {
  const p = u?.posMotor;
  return !!p && !girado(u) && Math.abs(u.x - p[0]) <= 1 && Math.abs(u.y - p[1]) <= 1 && Math.abs(u.z - p[2]) <= 1;
}

/**
 * Caibros do motor para desenhar/confiar, ou null se o volume ou um dos apoios dele foi mexido.
 * @param {object} u  volume da carga
 * @param {Map<string, object>} porId  volumes da carga por id
 */
export function caibrosDoMotor(u, porId) {
  if (!u?.caibros?.length || !u.apoioMotor || !noLugarDoMotor(u)) return null;
  for (const id of u.apoioMotor.sobre || []) if (!noLugarDoMotor(porId.get(id))) return null;
  return u.caibros;
}
