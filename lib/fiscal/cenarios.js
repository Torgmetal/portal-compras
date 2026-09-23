import { CST_ICMS, CST_PIS_COFINS, porCst } from "@/lib/fiscal/cst";

// ─── OS CENÁRIOS PRINCIPAIS DA TORG ──────────────────────────────────────────
//
// ⚠⚠ CANDIDATOS, NÃO ESCOLHA. Matheus (23/09/2026): *"precisamos ter uma base completa de tudo e
// os cenários principais"*. O que este arquivo faz é reduzir a tabela inteira aos códigos que
// FAZEM SENTIDO naquele tipo de operação, cada um com o que precisa ser provado — e dizer quando
// há um caminho claramente mais comum. Não é o portal preenchendo o CST: é ele parando de mostrar
// onze opções iguais quando só três cabem.
//
// ⚠⚠ E "MAIS COMUM" NÃO É "CERTO". Uma remessa para industrialização normalmente corre com
// suspensão (CST 50) — mas a suspensão tem condições e prazo, e a nota que a declara sem atendê-las
// é uma nota errada. Por isso `provavel` vem sempre junto de `exige`, e a tela mostra os dois.
//
// ⚠ O corte é por FAMÍLIA do CFOP, não por código: é o mesmo critério que o PIS/COFINS e o ICMS já
// usam no simulador, e um mapa por código apodreceria a cada CFOP novo.

const comTabela = (tabela, codigos, provavel) => codigos.map((c) => {
  const v = porCst(tabela, c);
  return { cst: c, rotulo: v?.rotulo ?? null, exige: v?.exige ?? [], nota: v?.nota ?? null, provavel: c === provavel };
});

/**
 * ⚠⚠ CADA CENÁRIO DIZ POR QUE AQUELES CÓDIGOS, e a justificativa é o que permite discordar dela.
 * Uma lista sem motivo é um chute com aparência de regra.
 */
export const CENARIOS = {
  Venda: {
    resumo: "Venda de produção própria — há receita e, em regra, circulação tributada.",
    icms: { candidatos: comTabela(CST_ICMS, ["00", "20", "10", "40", "41"], "00"),
      porque: "Venda de mercadoria industrializada é o caso típico de tributação integral; redução de base, ST e isenção dependem de dispositivo específico para o produto e o destino." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["01", "06", "07"], "01"),
      porque: "Há receita de venda. A alíquota básica é a regra geral do regime; zero e isenção exigem dispositivo próprio." },
  },
  Industrialização: {
    resumo: "A TORG cobra pelo processo aplicado sobre material de terceiro — há receita de serviço industrial.",
    icms: { candidatos: comTabela(CST_ICMS, ["00", "51", "20", "41"], null),
      porque: "A parcela cobrada pode ser tributada, diferida ou ter redução conforme a disciplina paulista da industrialização por conta de terceiros (RICMS/SP, arts. 402 a 409). Não há um caminho único." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["01", "08"], "01"),
      porque: "O valor da industrialização é receita; o que apenas retorna ao encomendante não é." },
  },
  Remessa: {
    resumo: "Movimenta mercadoria sem transferir propriedade — não é receita.",
    icms: { candidatos: comTabela(CST_ICMS, ["50", "41", "00"], "50"),
      porque: "A remessa para industrialização corre com suspensão do ICMS (RICMS/SP, art. 402), que tem condições e prazo de retorno. Remessas de outra natureza podem não se enquadrar." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["08", "09"], "08"),
      porque: "Movimentar mercadoria não é auferir receita — PIS e COFINS incidem sobre receita." },
  },
  Retorno: {
    resumo: "Devolve ao encomendante o que era dele — não é venda nem receita.",
    icms: { candidatos: comTabela(CST_ICMS, ["50", "41"], "50"),
      porque: "É a contrapartida da remessa suspensa: o retorno encerra a suspensão nas condições do RICMS/SP, arts. 402 a 409." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["08"], "08"),
      porque: "O material sempre foi do encomendante; devolvê-lo não gera receita." },
  },
  "Entrega futura": {
    resumo: "Fatura sem a mercadoria sair, ou entrega o que já foi faturado.",
    icms: { candidatos: comTabela(CST_ICMS, ["41", "00"], null),
      porque: "O simples faturamento não é fato gerador do ICMS; a saída física posterior é. Qual das duas notas está sendo emitida muda o código." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["01", "08"], null),
      porque: "A receita é reconhecida numa das duas notas, não nas duas — e é isso que decide o código de cada uma." },
  },
  "Outras saídas": {
    resumo: "Operação que não se enquadra nas anteriores.",
    icms: { candidatos: comTabela(CST_ICMS, ["41", "50", "00", "90"], null),
      porque: "Sem saber qual é a operação de verdade, não há como estreitar. ⚠⚠ Se ela couber num CFOP específico, usar o 5.949/6.949 esconde a operação de quem for auditar." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["08", "01", "49"], null),
      porque: "Depende de haver receita na operação — que é justamente o que o CFOP genérico não diz." },
  },
};

/** ⚠ Família desconhecida devolve `null`, não um cenário genérico: inventar candidato para uma
 *  operação que o portal não conhece é o oposto do ponto deste arquivo. */
export const cenarioDaFamilia = (familia) => CENARIOS[familia] ?? null;
