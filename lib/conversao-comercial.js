// ─── TAXA DE CONVERSÃO: A DEFINIÇÃO É DA TORG, NÃO MINHA ──────────────────────
// Vitor (30/08/2026): "a taxa de conversão está sendo calculada corretamente?".
//
// Não estava — e o erro foi meu. Eu tinha trocado a conta por `fechadas ÷ (fechadas + perdidas)`
// achando que era mais justa, porque proposta ainda em aberto não é derrota. O raciocínio é
// defensável e a definição é ERRADA: a Torg mede outra coisa, e mede há tempo.
//
// ⚠⚠ O PADRÃO ESTÁ NA `RELATÓRIO_PROPOSTAS_<ano>.xlsx`, aba "Indicadores", indicador
// "1 - TAXA DE CONVERSÃO", linha GERAL:
//
//        TAXA DE CONVERSÃO = Orçamentos Fechados ÷ Orçamentos Enviados, no MÊS
//
// e existe em duas moedas — por QUANTIDADE (indicador 1) e por VALOR em R$ (indicador 2), cada
// uma ainda aberta por porte (até 1,2M / 1,2–10M / 10–50M / mais de 50M).
//
// Em 2026 até agosto: 269 enviados, 41 fechados → **15,2%**. Minha versão dava 41,2% — quase o
// triplo. Indicador inflado em três vezes numa tela de diretoria é pior que indicador ausente.
//
// ⚠ NUMERADOR E DENOMINADOR SÃO COORTES DIFERENTES, e isso é de propósito. A proposta enviada em
// janeiro pode fechar em junho: o mês conta o que ENTROU e o que FECHOU naquele mês, não o destino
// de uma safra. É medida de fluxo, e é assim que o Comercial acompanha desde antes do portal.
//
// ⚠ E A META É "MIN 15%" (`lib/indicadores-iso.js`): trocar a conta mudaria o significado da meta
// sem ninguém decidir isso.

/** A proposta foi ENVIADA dentro do período? É a data de envio que manda. */
const enviadaEm = (o, dentro) => !!o.dataEnvio && dentro(new Date(o.dataEnvio));

/**
 * A proposta FECHOU dentro do período?
 *
 * ⚠ pela data de FECHAMENTO, não pelo status sozinho: "fechou em julho" é uma pergunta sobre
 * quando, e status não tem data. Duas fechadas de 2026 (249-26 e 261-26) estão sem a data — elas
 * entram no total do ano, mas não em mês nenhum, e é por isso que o portal fecha em 14,8% onde a
 * planilha diz 15,2%.
 */
const fechadaEm = (o, dentro) =>
  o.status === "FECHADA" && !!o.dataFechamento && dentro(new Date(o.dataFechamento));

/**
 * Conversão no padrão da Torg.
 *
 * @param {Array}   orcamentos  lista completa (sem filtro de período — o filtro é o `dentro`)
 * @param {Function} dentro     (Date) => boolean, o recorte do período
 * @returns {{ enviados, fechados, pct, valorEnviado, valorFechado, pctValor }}
 */
export function conversaoComercial(orcamentos = [], dentro = () => true) {
  let enviados = 0, fechados = 0, valorEnviado = 0, valorFechado = 0;
  for (const o of orcamentos) {
    if (enviadaEm(o, dentro)) { enviados++; valorEnviado += Number(o.valor) || 0; }
    if (fechadaEm(o, dentro)) { fechados++; valorFechado += Number(o.valor) || 0; }
  }
  return {
    enviados, fechados,
    // ⚠ sem enviados no período não existe taxa — devolve null, e a tela mostra "—".
    // Zero por cento diria "não vendemos nada", quando o certo é "não houve proposta".
    pct: enviados > 0 ? Math.round((fechados / enviados) * 1000) / 10 : null,
    valorEnviado, valorFechado,
    pctValor: valorEnviado > 0 ? Math.round((valorFechado / valorEnviado) * 1000) / 10 : null,
  };
}

/** Meta ISO do indicador (lib/indicadores-iso.js): mínimo de 15%. */
export const META_CONVERSAO = 15;
