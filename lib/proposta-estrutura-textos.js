// ─── OS TRECHOS QUE NÃO ESTÃO NO MODELO ───────────────────────────────────────
// Vitor (30/08/2026): "senti falta de vários gatilhos que coloquei na proposta da VALE, não estou
// vendo eles aqui".
//
// Faltavam mesmo, e o motivo é estrutural: eles estavam catalogados como blocos, mas o modelo
// 000-26 NÃO TEM esses títulos. Marcar não adiantava — não havia texto para incluir. São seções
// que só existiam quando alguém escrevia à mão, e é exatamente por isso que a proposta padrão
// ficava com brecha.
//
// ⚠⚠ AQUI ELAS VIRAM TEXTO DO PORTAL, e são INSERIDAS no documento depois de um bloco âncora. O
// modelo continua intocado; quem escolhe se entram é quem monta a proposta.
//
// ⚠ O texto veio da `PT-081-26-TMSA-VALE-TORG-R04` — a versão que o Vitor escreveu — generalizado:
// onde a VALE tinha número, aqui tem `{campo}`. Um texto que sai com o dado da VALE em outra obra
// é pior que texto nenhum.

/** `{campo}` → valor. Linha com campo sem valor é DESCARTADA, não sai com buraco. */
export function preencher(linha, dados = {}) {
  let faltou = false;
  const out = linha.replace(/\{(\w+)\}/g, (_, k) => {
    const v = dados[k];
    if (v === undefined || v === null || v === "") { faltou = true; return ""; }
    return String(v);
  });
  return faltou ? null : out;
}

// ⚠⚠ `ancora` É UMA LISTA, e o teste mostrou por quê. A pré-montagem ancorava em
// DESCRICAO_TECNICA — que existe na proposta da ORCA mas NÃO no modelo 000-26. Âncora ausente = a
// seção some em silêncio, e a modularização (que ancorava na pré-montagem) sumia junto, em
// cascata. Agora cada bloco tem uma cadeia: a primeira âncora que existir no documento vence.
export const TEXTOS = {
  PRE_MONTAGEM: {
    titulo: "Pré-montagem",
    ancora: ["DESCRICAO_TECNICA", "ITENS_COMERCIAIS", "DESCRICAO_OBRA"],
    linhas: [
      "Em atendimento à Especificação Técnica de Fabricação e à solicitação da CONTRATANTE, a pré-montagem em fábrica foi considerada nos termos abaixo.",
      "Cenário considerado: peso pré-montado de {pesoPreMontado} kg, equivalente a {percentualPreMontado}% do peso total da obra.",
      "Base de cálculo: o percentual de pré-montagem é apurado sobre o peso das famílias efetivamente pré-montáveis, e não sobre o peso total do fornecimento.",
      "Precificação: a pré-montagem é precificada separadamente do fornecimento, pelo preço unitário indicado na planilha comercial.",
      "Nas pré-montagens será instalada 100% da quantidade de parafusos nas ligações aparafusadas.",
      "As peças pré-montadas são verificadas dimensionalmente em fábrica antes do desmembramento para transporte.",
    ],
  },

  MODULARIZACAO: {
    titulo: "Modularização",
    ancora: ["PRE_MONTAGEM", "ITENS_COMERCIAIS", "DESCRICAO_OBRA"],
    linhas: [
      "Os módulos são definidos pelo envelope de transporte rodoviário convencional e pela capacidade de içamento em fábrica.",
      "Envelope de transporte considerado: {envelopeTransporte}.",
      "Peças que excedam o envelope acima serão fornecidas desmembradas, com as ligações de campo indicadas no diagrama de montagem.",
      "O percentual parafusado/soldado de cada família consta na tabela de modularização anexa a esta proposta.",
    ],
    // a tabela por família é montada a partir do levantamento, não é texto fixo
    tabela: "modularizacao",
  },

  PREMISSAS_CALCULO: {
    titulo: "Escopo e premissas do cálculo estrutural",
    ancora: ["ELABORACAO_PROJETOS", "NORMAS"],
    linhas: [
      "O escopo de cálculo estrutural sob responsabilidade da TORG, com emissão de memorial de cálculo e ART, compreende as estruturas indicadas no levantamento desta proposta.",
      "Permanecem sob responsabilidade da CONTRATANTE o cálculo das estruturas não relacionadas acima, bem como o fornecimento das cargas, reações e interferências necessárias.",
      "Os cálculos sob responsabilidade da TORG serão elaborados com base nos documentos técnicos fornecidos pela CONTRATANTE e relacionados no item Documentos referentes.",
      "Os prazos de engenharia contam a partir do recebimento completo da documentação técnica. Documentação insuficiente que exija desenvolvimento de cálculo não previsto será tratada como aditivo.",
      "Ficam excluídos do escopo de cálculo da TORG: verificação e dimensionamento de fundações, de estruturas de concreto e de equipamentos, bem como análise dinâmica não expressamente contratada.",
    ],
  },

  PREMISSAS_COMERCIAIS: {
    titulo: "Premissas comerciais",
    ancora: ["PLANILHA_PRECO", "NOTAS_COMERCIAIS"],
    linhas: [
      "Nossa proposta tem como base o quantitativo estimado de {pesoTotal} kg, apurado a partir dos documentos e projetos relacionados nesta proposta.",
      "Os preços têm como base os custos de matéria-prima e de combustível vigentes na data desta proposta. Decorridos {diasReajuste} dias da emissão, os valores serão revistos conforme a variação desses insumos.",
      "Os preços consideram a legislação tributária vigente na data desta proposta. Alterações de alíquotas, criação de tributos ou mudança de regime serão repassadas.",
      "A medição será realizada pelos pesos indicados nos desenhos de fabricação aprovados. Divergências entre o peso estimado e o peso de projeto serão ajustadas pelo preço unitário desta proposta.",
      "Revisões de projeto emitidas pela CONTRATANTE após o início da fabricação das peças afetadas serão tratadas como aditivo, incluindo material já adquirido e mão de obra já aplicada.",
      "As estruturas fabricadas, inspecionadas e liberadas conforme o plano de inspeção serão faturadas na disponibilização para expedição, independentemente da data de retirada.",
    ],
  },

  // ── e as duas que o Vitor ditou na revisão de 30/08 ──

  // ⚠⚠ ESTE É O TEXTO QUE ELE DITOU, e o prazo de 30 dias é o ponto. Hoje a proposta só fala de
  // brita — e peça parada no pátio do cliente por meses volta com retrabalho de pintura que
  // ninguém orçou. Vitor: "nos responsabilizamos para peças armazenadas em até no máximo 30 dias;
  // após isso qualquer retrabalho de pintura, limpeza será cobrado de acordo com o tempo gasto".
  RESP_ARMAZENAMENTO: {
    titulo: null, // entra como linhas dentro do bloco existente
    ancora: ["RESP_CONTRATANTE", "EXCLUSOS"],
    linhas: [
      "O local destinado ao armazenamento das peças deverá contar com brita ou lona plástica, de forma que nenhuma peça tenha contato direto com o solo.",
      "As peças devem ser armazenadas apoiadas sobre calços, com afastamento entre si que permita a drenagem da água de chuva e a circulação de ar, e de modo a não acumular água sobre as superfícies pintadas.",
      "O armazenamento correto é condição para a garantia do tratamento de superfície: empilhamento inadequado, contato com solo e acúmulo de água comprometem a película de tinta.",
      "A TORG se responsabiliza pela conservação das peças armazenadas em campo por até {diasArmazenamento} dias contados da entrega. Após esse prazo, qualquer retrabalho de pintura ou limpeza será cobrado conforme o tempo efetivamente gasto na execução.",
    ],
  },

  // ⚠ Vitor: "os prazos são calculados de acordo com o grau de dificuldade de cada tipo de
  // estrutura, o prazo informado é apenas uma estimativa, e no ato do fechamento precisam ser
  // avaliados por conta da demanda dentro da fábrica".
  PRAZO_NOTA: {
    titulo: null,
    ancora: ["PRAZO", "CONTROLE_QUALIDADE"],
    linhas: [
      "O prazo acima é uma ESTIMATIVA, calculada a partir do grau de dificuldade de cada tipo de estrutura levantada nesta proposta.",
      "No ato do fechamento o prazo será reavaliado em função da carga de trabalho da fábrica na data da contratação, e o cronograma definitivo será emitido após a aprovação do contrato.",
    ],
  },
};

/** Os blocos que o portal insere (não vêm do modelo). */
export const BLOCOS_INSERIDOS = Object.keys(TEXTOS);

/**
 * As linhas de um bloco inserido, já preenchidas.
 * @returns {{titulo: string|null, linhas: string[]}}
 */
export function textoDoBloco(id, dados = {}) {
  const t = TEXTOS[id];
  if (!t) return null;
  const linhas = t.linhas.map((l) => preencher(l, dados)).filter(Boolean);
  return linhas.length ? { titulo: t.titulo, linhas, ancora: t.ancora, tabela: t.tabela || null } : null;
}
