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
    // ⚠ Nesta família só existem o 5.922 e o 6.922 — o simples faturamento. A saída física
    // (5.116/6.116) mora na família Venda, e o CFOP escolhido já diz qual das duas é.
    resumo: "Simples faturamento — a nota sai sem a mercadoria se mover.",
    icms: { candidatos: comTabela(CST_ICMS, ["41", "90"], null),
      porque: "O simples faturamento não acompanha saída de mercadoria, e o fato gerador do ICMS é a saída — documentada depois, no 5.116/6.116." },
    pisCofins: { candidatos: comTabela(CST_PIS_COFINS, ["01", "08"], null),
      porque: "Em qual das duas notas a receita é reconhecida é decisão da contabilidade — e é ela que define o código de cada uma." },
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

/** ⚠ Tira o destaque de "mais comum" sem mexer na lista: o candidato continua lá, só deixa de ser
 *  apresentado como o caminho — que é o certo quando o fundamento não é daquela operação. */
const semProvavel = (candidatos) => candidatos.map((c) => ({ ...c, provavel: false }));

/**
 * ⚠⚠ A FAMÍLIA É GROSSA DEMAIS PARA ALGUNS CÓDIGOS, e isso me fez propagar fundamento de uma
 * operação para outra (achado do Codex, 23/09/2026). "Remessa" junta a **remessa para
 * industrialização** (5.901, suspensão do art. 402) com a **remessa por conta e ordem da venda à
 * ordem** (5.923), que não tem nada a ver com o art. 402 — e o 5.923 estava recebendo "CST 50,
 * mais comum" com a justificativa da suspensão colada. Ressalva em texto não desliga destaque.
 *
 * ⚠ O ajuste NUNCA inventa um provável no lugar do que tirou: sem fundamento para eleger, a lista
 * fica sem destaque e o porquê diz de que depende.
 */
export const AJUSTES_POR_CFOP = {
  "5923": {
    resumo: "Remessa por conta e ordem numa VENDA À ORDEM — acompanha a carga e referencia a venda.",
    icms: { provavel: null,
      porque: "É a nota que acompanha a mercadoria até o destinatário final e referencia a venda (5.118/6.118) — ela NÃO pode cobrar de novo pelos mesmos produtos. O tratamento do ICMS depende do que foi destacado na nota de venda, e não da suspensão do art. 402, que é de industrialização." },
    pisCofins: { provavel: "08",
      porque: "A receita é reconhecida na nota de venda; esta apenas acompanha a entrega física." },
  },
  "5924": {
    resumo: "Remessa física do insumo do FORNECEDOR direto à TORG (art. 406, I) — não é nota da TORG.",
    icms: { provavel: null,
      porque: "⚠⚠ Esta nota é emitida pelo FORNECEDOR, não pela TORG: para a TORG ela é documento de ENTRADA. O tratamento é do fornecedor e da operação de venda dele ao encomendante." },
    pisCofins: { provavel: null,
      porque: "Emitida pelo fornecedor — o CST é do regime dele, não do da TORG." },
  },
  "5922": {
    resumo: "Simples faturamento para entrega futura — fatura sem a mercadoria sair.",
    // ⚠ O ICMS já está certo na família (só o 5.922/6.922 vivem nela) — o ajuste aqui é só o
    // PIS/COFINS, que a família não tinha como estreitar.
    icms: { provavel: null,
      porque: "O simples faturamento não acompanha saída de mercadoria, e o fato gerador do ICMS é a saída — documentada depois, no 5.116/6.116. Qual código declara isso é decisão da contabilidade." },
    pisCofins: { provavel: null,
      porque: "Em qual das duas notas a receita é reconhecida é decisão da contabilidade — e é ela que define o código de cada uma." },
  },
  "5116": {
    resumo: "Saída física do que já foi faturado por entrega futura (5.922).",
    pisCofins: { provavel: null,
      porque: "A receita pode já ter sido reconhecida no simples faturamento — repetir a alíquota básica aqui correria o risco de contar duas vezes. Decisão da contabilidade." },
  },
};

/**
 * O CENÁRIO DE UM CFOP — a família como base, e o ajuste por código quando a família não basta.
 *
 * ⚠ O par 5.xxx/6.xxx compartilha o ajuste: o que muda entre eles é o destino, não a natureza.
 */
export function cenarioDoCfop(cfop) {
  const base = cenarioDaFamilia(cfop?.familia);
  if (!base) return null;
  // ⚠ O ajuste é indexado pelo 5.xxx; o 6.xxx cai no mesmo por construção.
  const ajuste = AJUSTES_POR_CFOP[`5${String(cfop.codigo).slice(1)}`];
  if (!ajuste) return base;

  const aplicar = (parte, mod) => {
    if (!mod) return parte;
    const lista = mod.candidatos
      ? parte.candidatos.filter((c) => mod.candidatos.includes(c.cst))
      : parte.candidatos;
    return {
      candidatos: mod.provavel === undefined
        ? lista
        : lista.map((c) => ({ ...c, provavel: c.cst === mod.provavel })),
      porque: mod.porque ?? parte.porque,
    };
  };
  return {
    resumo: ajuste.resumo ?? base.resumo,
    icms: aplicar(base.icms, ajuste.icms),
    pisCofins: aplicar(base.pisCofins, ajuste.pisCofins),
  };
}

export { semProvavel };
