// QUAIS ABAS DA OP CADA PESSOA VÊ.
//
// Vitor (21/08/2026): "para o usuário adm@torg.com.br liberar as abas de Obra onde tem as
// informações das obras, e para o usuário financeiro@torg.com.br liberar a aba resumo, obra e
// financeiro".
//
// A regra é por MÓDULO, não por pessoa — senão toda contratação vira um chamado. A Pamela vê a
// Obra porque tem RH; a Eduarda vê resumo/obra/financeiro porque tem FINANCEIRO. Quem entrar
// depois nos mesmos módulos já entra enxergando o mesmo.
//
// ⚠ O conjunto de um usuário é a UNIÃO dos seus módulos. A Eduarda tem FINANCEIRO + REQUISICOES +
// RH: união = resumo, obra, financeiro.
//
// ⚠ Módulo não listado aqui cai no conjunto OPERACIONAL, que é exatamente o que o portal já
// mostrava a todo mundo antes desta mudança. Assim ninguém perde aba que já usava — o efeito é só
// somar o que faltava e apertar onde o Vitor pediu.

export const ABAS_OP = ["resumo", "obra", "engenharia", "planejamento", "compras", "producao", "qualidade", "portal", "terceiros", "expedicao", "financeiro"];

/** O que o portal mostrava a quem não vê dinheiro. É o piso de quem não está no mapa. */
const OPERACIONAL = ["obra", "engenharia", "planejamento", "compras", "producao", "qualidade", "portal", "terceiros", "expedicao"];

const POR_MODULO = {
  COMERCIAL: ABAS_OP,
  FINANCEIRO: ["resumo", "obra", "financeiro"],
  // quem cuida de gente vê a obra pra saber o que está rodando, e só
  RH: ["obra"],
  REQUISICOES: ["obra"],
};

/**
 * As abas que este usuário pode ver no detalhe da OP.
 *
 * @param {{tipo?:string, modulos?:Array}} user
 * @param {{isDiretoria?:boolean}} opts
 * @returns {string[]} chaves de VISTAS, na ordem de ABAS_OP
 */
export function abasDaOP(user, { isDiretoria = false } = {}) {
  if (!user) return [];
  if (user.tipo === "ADMIN" || isDiretoria) return [...ABAS_OP];

  // ⚠ na sessão o módulo é string; no banco é objeto { modulo }. Esta função é chamada dos dois
  // lados, então aceita as duas formas — já mordeu antes.
  const mods = (user.modulos || []).map((m) => (typeof m === "string" ? m : m?.modulo)).filter(Boolean);
  if (!mods.length) return ["obra"];

  const vistas = new Set();
  for (const m of mods) for (const a of POR_MODULO[m] || OPERACIONAL) vistas.add(a);
  return ABAS_OP.filter((a) => vistas.has(a));
}
