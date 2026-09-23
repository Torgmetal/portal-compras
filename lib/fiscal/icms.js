// ─── ICMS: ALÍQUOTA DE REFERÊNCIA, NUNCA IMPOSTO DETERMINADO ─────────────────
//
// ⚠⚠ A PROIBIÇÃO DO BRIEFING É CONTRA O AUTOMATISMO, NÃO CONTRA A TABELA. O briefing veda *"aplicar
// automaticamente 12% de ICMS a toda venda interestadual"* — e ela é justa: 12% não vale para todo
// destino. O que este módulo devolve é a **alíquota interestadual de referência** prevista no
// art. 52 do RICMS/SP para saídas de São Paulo, acompanhada das condições que ainda precisam ser
// verificadas. Referência com condições explícitas é o oposto de automatismo.
//
// ⚠⚠ E ELE NÃO DETERMINA O IMPOSTO. Parecer de arquitetura (22/09/2026): a alíquota é um dos
// insumos do cálculo; base reduzida, benefício estadual, diferimento, substituição tributária,
// DIFAL e FCP entram depois e nenhum deles está estruturado no portal. Por isso o retorno leva
// `estado` e `condicoes`, e a tela mostra as duas coisas juntas.
//
// ⚠ A ALÍQUOTA INTERNA (dentro de SP) NÃO ENTRA. Ela é 18% com um campo enorme de reduções e
// benefícios por mercadoria — sem a fonte estruturada, um número ali seria o chute que o módulo
// existe para evitar.

export const ESTADO = { REFERENCIA: "REFERENCIA", NAO_DETERMINADO: "NAO_DETERMINADO" };

/**
 * A ORIGEM DA MERCADORIA, DECLARADA.
 *
 * ⚠⚠ É DECLARAÇÃO COM ESCOPO E DATA, NÃO VERDADE GRAVADA NO CÓDIGO. Matheus (22/09/2026): *"origem
 * sempre é nacional, não compramos material de fora do Brasil; sempre é da Gerdau/Soufer, e a
 * estrutura é produzida na nossa fábrica em Conchal/SP"*.
 *
 * ⚠⚠ MAS COMPRAR DE FORNECEDOR NACIONAL NÃO PROVA AUSÊNCIA DE CONTEÚDO IMPORTADO (achado do Codex).
 * A origem 3/8 e a alíquota de 4% dependem do **Conteúdo de Importação** apurado por FCI, que é
 * atributo do PRODUTO, não da compra. Enquanto a declaração vale, a tela a exibe com quem
 * declarou — e um item importado que entre um dia muda isto aqui, não o cálculo espalhado.
 */
export const ORIGEM_DECLARADA = {
  codigo: "0",
  rotulo: "Nacional",
  declaradoPor: "Matheus (Torg Metal)",
  declaradoEm: "2026-09-22",
  base: "Matéria-prima nacional (Gerdau / Soufer); estrutura produzida na fábrica de Conchal/SP.",
  ressalva: "Origem é atributo do PRODUTO, não da compra: conteúdo importado apurado por FCI mudaria o código de origem e a alíquota interestadual para 4%.",
};

/**
 * ⚠⚠ OS 7% NÃO SÃO "NORTE E NORDESTE": O ESPÍRITO SANTO ENTRA. É o erro clássico de quem decora a
 * regra pela região em vez de pela lista — o ES é Sudeste e mesmo assim recebe 7%.
 */
export const SETE_POR_CENTO = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO",
]);
const DOZE_POR_CENTO = new Set(["MG", "PR", "RJ", "RS", "SC"]);

export const UF_ORIGEM_PREVISTA = "SP";

/**
 * ⚠ As condições que precisam ser verificadas ANTES de a alíquota virar imposto. Ficam como dado e
 * não como texto corrido porque a tela precisa listá-las uma a uma: um bloco de prosa embaixo de um
 * número grande não é lido.
 */
export const CONDICOES = [
  "A finalidade da operação (industrialização, revenda, uso/consumo, ativo) muda o tratamento — e consumidor final é uma dimensão separada de ser contribuinte.",
  "Havendo consumidor final em outro estado, existe DIFAL: ele muda quem recolhe e pode existir tanto para contribuinte quanto para não contribuinte (LC 190/2022).",
  "Redução de base, isenção, diferimento e benefícios do estado de destino não estão estruturados no portal.",
  "Substituição tributária e FCP, quando aplicáveis, entram por fora desta alíquota.",
  "A origem da mercadoria aqui é a declarada (nacional): conteúdo de importação apurado por FCI levaria a alíquota a 4%.",
];

/**
 * A alíquota interestadual de referência para uma saída de SP.
 *
 * @returns {{estado:string, aliquota?:number, fundamento?:string, motivo?:string, condicoes:string[], origem:object}}
 */
/**
 * ⚠⚠ REMESSA E RETORNO NÃO RECEBEM ALÍQUOTA DE REFERÊNCIA. Visto na validação da tela (22/09/2026):
 * uma remessa para industrialização de R$ 222.769,58 saía com "12% · R$ 26.732,35" — número
 * plausível, grande e provavelmente errado, porque a remessa para industrialização em SP costuma
 * correr com SUSPENSÃO do ICMS (art. 402 do RICMS/SP).
 *
 * ⚠ O portal NÃO afirma que há suspensão: suspensão tem condições e prazo, e afirmá-la sem conferir
 * seria o mesmo pecado ao contrário. Ele se cala e DIZ por que se calou — mesma regra do PIS/COFINS
 * em operação que não é receita.
 */
const FAMILIAS_SEM_REFERENCIA = new Set(["Remessa", "Retorno", "Entrega futura", "Outras saídas"]);

export function icmsDeReferencia(ufOrigem, ufDestino, cfop = null) {
  const o = String(ufOrigem ?? "").trim().toUpperCase();
  const d = String(ufDestino ?? "").trim().toUpperCase();
  const comum = { condicoes: CONDICOES, origem: ORIGEM_DECLARADA };

  if (!o || !d) return { estado: ESTADO.NAO_DETERMINADO, motivo: "Informe a UF de origem e a de destino.", ...comum };

  // ⚠ A tabela vale para saídas de SP. De outro estabelecimento, a tabela é outra — e o portal
  // não tem por que supor que ela é igual.
  if (o !== UF_ORIGEM_PREVISTA) {
    return { estado: ESTADO.NAO_DETERMINADO, motivo: `Esta tabela é a das saídas de ${UF_ORIGEM_PREVISTA} (art. 52 do RICMS/SP). Para saída de ${o}, vale a legislação daquele estado.`, ...comum };
  }
  if (o === d) {
    // ⚠⚠ A INTERNA FICA DE FORA DE PROPÓSITO — ver o cabeçalho.
    return { estado: ESTADO.NAO_DETERMINADO, motivo: "Operação interna (dentro de SP): a alíquota interna tem um campo grande de reduções e benefícios por mercadoria, e o portal não tem essa fonte estruturada.", ...comum };
  }
  // ⚠⚠ SEM CFOP RECONHECIDO NÃO HÁ REFERÊNCIA (achado do Codex, 22/09/2026). O bloqueio abaixo
  // depende de saber a família, e sem o código não dá para saber se a operação é das excluídas —
  // então SP → MG com R$ 1.000 e CFOP em branco devolvia 12% e R$ 120. O PIS/COFINS já se abstinha
  // exatamente nessa condição; o ICMS não, e a incoerência era minha.
  if (!cfop) {
    return { estado: ESTADO.NAO_DETERMINADO,
      motivo: "Escolha o CFOP: é a operação que diz se a alíquota interestadual se aplica — remessa, retorno e entrega futura têm tratamento próprio.",
      ...comum };
  }
  if (FAMILIAS_SEM_REFERENCIA.has(cfop.familia)) {
    return { estado: ESTADO.NAO_DETERMINADO,
      // ⚠⚠ NÃO CITAR O ART. 402 AQUI (achado do Codex, 23/09/2026, por tabela). A mesma família
      // "Remessa" cobre a remessa para industrialização (5.901, suspensão do art. 402) e a remessa
      // por conta e ordem da venda à ordem (5.923), que não tem nada a ver com ele. O fundamento
      // específico é do CENÁRIO, que conhece o código; aqui só cabe a razão comum às duas.
      motivo: `O CFOP ${cfop.codigoFormatado} é de ${cfop.familia.toLowerCase()}: a operação movimenta mercadoria e tem tratamento próprio, que depende de qual remessa é. A alíquota interestadual não se aplica sem antes confirmar o tratamento.`,
      ...comum };
  }
  const aliquota = SETE_POR_CENTO.has(d) ? 7 : DOZE_POR_CENTO.has(d) ? 12 : null;
  if (aliquota == null) {
    return { estado: ESTADO.NAO_DETERMINADO, motivo: `UF de destino "${d}" não reconhecida.`, ...comum };
  }
  return {
    estado: ESTADO.REFERENCIA,
    aliquota,
    fundamento: `Art. 52 do RICMS/SP — saída de ${o} para ${d}, mercadoria de origem ${ORIGEM_DECLARADA.rotulo.toLowerCase()}.`,
    ...comum,
  };
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** ⚠ A estimativa só existe quando há alíquota de referência E valor — e segue sendo estimativa. */
export function estimarIcms(ufOrigem, ufDestino, valor, cfop = null) {
  const ref = icmsDeReferencia(ufOrigem, ufDestino, cfop);
  const base = r2(valor);
  if (ref.estado !== ESTADO.REFERENCIA || !(base > 0)) return ref;
  return { ...ref, base, valor: r2(base * ref.aliquota / 100),
    baseNota: "Estimativa sobre o valor digitado. A base real pode incluir frete, seguro e despesas acessórias, e pode ser reduzida por benefício." };
}
