// A FICHA DE CADA EPS DA CASA — processo, arame e o RQPS que a qualificou.
//
// Vitor (23/09/2026), sobre os relatórios da OP-102: "está faltando preencher Metal de adição,
// Processo de soldagem, EPS, RQS e tipo de junta". Quatro dos cinco saem da MESMA escolha: a EPS
// define o processo e o metal de adição, e cada EPS tem o seu RQPS, de mesmo número. Escolher a EPS
// preenche os outros três — digitados à mão, relatório por relatório, é como um sai FCAW com arame
// de GMAW.
//
// Fonte: a "EPS Resumida.pdf" e o cabeçalho de cada EPS ("EPS Nº 002/2025", "RQPS SUPORTE Nº
// 002/2025"), na pasta Qualidade / Workspace / EPS + RQPS — conferidos em 23/09/2026. As EPS são
// digitalizadas (imagem), por isso a ficha é transcrita aqui e não lida do PDF.
//
// ⚠ QUAIS EPS EXISTEM continua vindo da pasta (`listarEPS`, lib/soldagem.js); esta tabela só completa
// as que conhece. EPS nova aparece no seletor com o que o nome do arquivo diz, e os campos seguem
// digitáveis até ela entrar aqui.
// ⚠ O TIPO DE JUNTA NÃO SAI DA EPS: as cinco cobrem topo e ângulo. É do relatório — a junta ensaiada.

export const FICHAS_EPS = Object.freeze({
  "01": { numero: "001/2025", processo: "GMAW", metalAdicao: "ER70S-6", material: "chapas e perfis laminados" },
  "02": { numero: "002/2025", processo: "FCAW", metalAdicao: "E71T-1C", material: "chapas e perfis laminados" },
  "03": { numero: "003/2025", processo: "GMAW", metalAdicao: "ER70S-6", material: "multinorma, barras e perfis em geral" },
  "04": { numero: "004/2025", processo: "SMAW", metalAdicao: "E7018", material: "todos os materiais" },
  "05": { numero: "005/2025", processo: "FCAW", metalAdicao: "E71T-1C", material: "multinorma, barras e perfis em geral" },
});

/** A junta ensaiada — as cinco EPS cobrem as duas. */
export const TIPOS_JUNTA = ["Topo", "Ângulo", "Topo e ângulo"];

/** "EPS-RQPS 02" → "02" */
function numeroDoCodigo(codigo) {
  const m = String(codigo || "").match(/(\d{1,3})\s*$/);
  return m ? m[1].padStart(2, "0") : null;
}

/** A EPS da pasta completada com a ficha (processo, número do documento, arame, RQPS). */
export function completarEps(e) {
  const ficha = FICHAS_EPS[numeroDoCodigo(e?.codigo)];
  if (!ficha) return e;
  return {
    ...e,
    processo: e.processo || ficha.processo,
    numero: ficha.numero,
    metalAdicao: ficha.metalAdicao,
    material: ficha.material,
    rqs: `RQPS ${ficha.numero}`,
  };
}

/** Como a EPS sai no relatório: o número do documento ("EPS 002/2025"); sem ficha, o código da pasta. */
export const rotuloEps = (e) => (e?.numero ? `EPS ${e.numero}` : e?.codigo || "");

/** A opção do seletor — número, processo, arame e para que material (002 e 005 são ambas FCAW). */
export const descricaoEps = (e) => [rotuloEps(e), e?.processo, e?.metalAdicao, e?.material].filter(Boolean).join(" · ");

/** As EPS gravadas no relatório: "EPS 001/2025, EPS 004/2025" → ["EPS 001/2025", "EPS 004/2025"]. */
export const partesEps = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);

/**
 * O que se grava no relatório para as EPS escolhidas — UMA OU MAIS.
 *
 * ⚠⚠ UM RELATÓRIO PODE TER MAIS DE UMA EPS. O EVS-102-001 tem juntas de GMAW (Daniel, Christian) e de
 * SMAW (Adailson): cabeçalho com uma EPS só estaria errado. Cada campo lista o que as escolhidas
 * definem, sem repetir — 002 e 005 são ambas FCAW com E71T-1C, e saem "FCAW", não "FCAW, FCAW".
 * Só o que a EPS define; nunca o tipo de junta. Sem nenhuma EPS, os três derivados se esvaziam
 * junto: ficariam sem origem. EPS de fora da lista (digitada antes) é mantida e não mexe nos outros.
 */
export function camposDaSelecao(rotulos, lista) {
  const escolhidas = [...new Set((rotulos || []).filter(Boolean))];
  if (!escolhidas.length) return { eps: "", rqs: "", processoSolda: "", metalAdicao: "" };
  const fichas = escolhidas.map((r) => (lista || []).find((e) => rotuloEps(e) === r)).filter(Boolean);
  const juntar = (k) => [...new Set(fichas.map((e) => e[k]).filter(Boolean))].join(", ");
  return {
    eps: escolhidas.join(", "),
    ...(fichas.length ? { rqs: juntar("rqs"), processoSolda: juntar("processo"), metalAdicao: juntar("metalAdicao") } : {}),
  };
}
