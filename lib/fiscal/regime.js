// ─── O REGIME DA TORG, DECLARADO — E CONFERIDO CONTRA AS NOTAS ───────────────
//
// ⚠⚠ ISTO É UM FATO DECLARADO, NÃO UMA INFERÊNCIA. Matheus (22/09/2026): *"base PIS/COFINS da TORG
// é LUCRO REAL, então é 1,65 e 7,6"*. A diferença importa: o portal não "descobriu" o regime
// olhando notas — alguém que responde por isso afirmou, e as notas serviram de CONFERÊNCIA. Um
// regime deduzido de histórico herdaria o erro do histórico, que é exatamente o que a NF-e 973
// prova ser possível (22 itens com o CST de IPI errado).
//
// ⚠⚠ E É POR ISSO QUE O ESCOPO DO MÓDULO NÃO É VIOLADO. A proibição do briefing é *"não aplicar PIS
// 1,65% e COFINS 7,6% a TODAS as operações"* — contra a SUPOSIÇÃO, não contra o regime declarado. A
// alíquota básica do regime continua sendo a REGRA GERAL: exportação, suspensão, alíquota zero e
// monofásico são exceções que o portal NÃO detecta, e a tela diz isso em cada simulação.
//
// ⚠ Quando o regime mudar, muda AQUI — com quem declarou e quando. Espalhado pelo código, a
// mudança seria uma caçada.

export const REGIME = {
  nome: "Lucro Real",
  // CRT 3 = Regime Normal. É o que sai no XML de toda NF-e da TORG.
  crt: "3",
  declaradoPor: "Matheus (Torg Metal)",
  declaradoEm: "2026-09-22",
  /**
   * ⚠ A CONFERÊNCIA, com número e nota — para quem ler daqui a um ano saber que não foi chute.
   * Medido em 22/09/2026 nos XMLs das NF-e 959, 973 e 979: CRT 3 no emitente, PIS e COFINS com
   * CST 01 em 100% dos itens, e o total batendo ao centavo contra o valor dos produtos.
   */
  conferidoEm: [
    { nf: "973", itens: 24, base: 222769.58, pis: 3675.70, cofins: 16930.50 },
    { nf: "979", itens: 1, base: 87482.91, pis: 1443.47, cofins: 6648.70 },
    { nf: "959", itens: 1, base: 145573.00, pis: 2401.95, cofins: 11063.55 },
  ],
};

/**
 * PIS E COFINS DA REGRA GERAL DO REGIME.
 *
 * ⚠⚠ CST 01 É "OPERAÇÃO TRIBUTÁVEL COM ALÍQUOTA BÁSICA" — é a regra geral do não-cumulativo, e é o
 * que as três notas conferidas trazem em todos os itens. Não é "o que costuma dar certo": é o
 * tratamento padrão do regime, do qual as outras situações são exceção nomeada.
 */
export const PIS_COFINS = [
  { tributo: "PIS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 1.65 },
  { tributo: "COFINS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 7.60 },
];

/**
 * ⚠⚠ AS EXCEÇÕES QUE O PORTAL NÃO DETECTA, ditas por nome. Um número sem esta lista vira carimbo;
 * com ela, vira ponto de partida que a pessoa sabe quando questionar.
 */
export const RESSALVAS_PIS_COFINS = [
  "Exportação e equiparadas não são tributadas (CST 08) — o portal não sabe se a operação é de exportação.",
  "Remessa e retorno de industrialização costumam ter tratamento próprio; a nota que apenas movimenta não é receita.",
  "Produto monofásico, com alíquota zero ou suspensão tem CST próprio e fundamento próprio.",
];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ⚠⚠ A OPERAÇÃO GERA RECEITA? PIS E COFINS INCIDEM SOBRE RECEITA, E REMESSA NÃO É RECEITA.
 *
 * Achado do Codex (22/09/2026): bastava um valor positivo para o simulador devolver 1,65% e 7,6% —
 * inclusive numa remessa para industrialização, num retorno e até com o CFOP em branco. As
 * ressalvas diziam o certo e o número dizia o contrário; para um operador que não é contador, o
 * número ganha.
 *
 * ⚠ O corte é por FAMÍLIA do CFOP, não por código: venda e industrialização cobrada são receita;
 * remessa, retorno e simples faturamento movimentam ou antecipam, mas não são a receita daquela
 * saída. "Outras saídas" fica de fora porque é o balde do que não se enquadrou — e balde não
 * responde pergunta.
 */
const FAMILIAS_DE_RECEITA = new Set(["Venda", "Industrialização"]);

/**
 * ⚠⚠ A FAMÍLIA DIZ QUE HÁ RECEITA; ELA NÃO DIZ QUE A RECEITA É **DESTA** NOTA (achado do Codex,
 * 23/09/2026). O 5.116/6.116 é a **saída física do que já foi faturado** por entrega futura: a
 * receita pode ter sido reconhecida lá atrás, no simples faturamento (5.922/6.922). Aplicar a
 * alíquota básica aqui corre o risco de **contar duas vezes**.
 *
 * ⚠⚠ E EU TINHA "CONSERTADO" ISSO SÓ NO CENÁRIO — o caminho que só aparece quando NÃO há valor
 * digitado. Com valor, `estimarPisCofins` seguia devolvendo CST 01 e a ficha escondia a ressalva
 * inteira. É a mesma metade errada que já consertei uma vez no Ex TIPI: arrumei o texto e deixei
 * o número.
 *
 * ⚠ Aqui o portal NÃO escolhe outro CST — ele se abstém e diz por quê. Em qual das duas notas a
 * receita é reconhecida é decisão da contabilidade.
 */
const RECEITA_JA_PODE_TER_SIDO_RECONHECIDA = new Set(["5116", "6116"]);

export const ehReceita = (cfop) =>
  Boolean(cfop && FAMILIAS_DE_RECEITA.has(cfop.familia) && !RECEITA_JA_PODE_TER_SIDO_RECONHECIDA.has(cfop.codigo));

/**
 * A estimativa sobre o valor digitado.
 *
 * ⚠⚠ É O QUE A NOTA DECLARA, NÃO A BASE DE APURAÇÃO (achado do Codex). A apuração do PIS/COFINS no
 * não-cumulativo é mensal, sobre a receita bruta com exclusões — entre elas o ICMS destacado, desde
 * o RE 574.706 do STF. O que sai aqui é a conta por item, do jeito que o Omie preenche a nota e do
 * jeito que as três NF-e conferidas trazem. Serve para o operador conferir o que vai no documento;
 * não serve para prever quanto a empresa vai recolher no mês.
 *
 * @param {number} valor
 * @param {{familia:string, codigoFormatado:string}|null} cfop  a operação escolhida
 */
export function estimarPisCofins(valor, cfop = null) {
  const base = r2(valor);
  if (!(base > 0)) return null;
  if (!cfop) return { indisponivel: true, motivo: "Escolha o CFOP: PIS e COFINS incidem sobre receita, e é a operação que diz se há receita." };
  if (RECEITA_JA_PODE_TER_SIDO_RECONHECIDA.has(cfop.codigo)) {
    return {
      indisponivel: true,
      motivo: `O CFOP ${cfop.codigoFormatado} é a saída física do que já foi faturado por entrega futura (5.922/6.922). `
            + "A receita pode ter sido reconhecida naquela nota — aplicar a alíquota básica aqui corre o risco de contar duas vezes. "
            + "Em qual das duas a receita é reconhecida é decisão da contabilidade.",
    };
  }
  if (!ehReceita(cfop)) {
    return {
      indisponivel: true,
      motivo: `O CFOP ${cfop.codigoFormatado} é de ${cfop.familia.toLowerCase()} — a operação movimenta mercadoria, não registra receita da saída. `
            + "PIS e COFINS incidem sobre receita, então a alíquota básica do regime não se aplica aqui sem antes identificar qual é a receita.",
    };
  }
  return {
    regime: REGIME.nome,
    base,
    baseNota: "É o que a nota DECLARA, item a item, sobre o valor dos produtos — do jeito que as três NF-e conferidas trazem. Não é a base de apuração mensal, que tem exclusões próprias (entre elas o ICMS destacado).",
    linhas: PIS_COFINS.map((t) => ({ ...t, valor: r2(base * t.aliquota / 100) })),
    ressalvas: RESSALVAS_PIS_COFINS,
  };
}
