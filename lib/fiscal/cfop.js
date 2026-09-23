// ─── OS CFOPs QUE A TORG USA, E AS OPERAÇÕES REAIS ONDE ELES APARECEM ────────
//
// ⚠⚠ ISTO NÃO É A TABELA OFICIAL DE CFOP, E NÃO SE DISFARÇA DE UMA. A tabela oficial é o Anexo do
// Convênio S/Nº de 15/12/1970 (CONFAZ). O que está aqui é o RESUMO OPERACIONAL que o Matheus
// forneceu (22/09/2026), útil para quem trabalha na Torg e insuficiente para fundamentar uma nota.
// Cada verbete nasce `validado: false` — a tela DIZ que a descrição oficial está pendente de
// conferência pela contabilidade, em vez de deixar o leitor supor que veio da fonte.
//
// ⚠⚠ O `quando` É EXEMPLO, NÃO DEFINIÇÃO. Matheus (22/09/2026): *"em cada CFOP dê um exemplo de
// quando deve ser usado — algo didático e resumido"*, com três casos dele: *"a TORG compra aço,
// chapas e tubos, fabrica e vende → 5.101"*; *"o cliente compra a matéria-prima, o fornecedor
// entrega direto na TORG e a TORG cobra a industrialização → 5.125"*; *"o cliente envia os
// materiais dele para a TORG industrializar → 5.124"*. São a operação da Torg contada em uma frase,
// para o operador reconhecer o caso dele — não a hipótese de incidência, que continua na tabela
// oficial e continua `validado: false`.
//
// ⚠⚠ E CFOP SOZINHO NÃO DETERMINA IMPOSTO. É a regra fundamental do módulo: a tributação depende de
// NCM + CFOP + natureza da operação + regime + UF de origem e destino + destinatário + finalidade +
// propriedade dos insumos + legislação. Por isso cada verbete leva `exige`, que é o que ainda
// precisa ser perguntado — e nenhum deles carrega alíquota.

export const SENTIDO = { SAIDA: "SAIDA", ENTRADA: "ENTRADA" };
export const AMBITO = { INTERNA: "INTERNA", INTERESTADUAL: "INTERESTADUAL" };

export const FAMILIA = {
  VENDA: "Venda",
  INDUSTRIALIZACAO: "Industrialização",
  REMESSA: "Remessa",
  RETORNO: "Retorno",
  ENTREGA_FUTURA: "Entrega futura",
  OUTRAS: "Outras saídas",
};

/** ⚠ O 5.xxx é interno e o 6.xxx é interestadual — o primeiro dígito é o âmbito, não um detalhe. */
const ambitoDoCodigo = (c) => (c.startsWith("5") ? AMBITO.INTERNA : AMBITO.INTERESTADUAL);

const C = (codigo, resumo, familia, extra = {}) => ({
  codigo,
  codigoFormatado: `${codigo[0]}.${codigo.slice(1)}`,
  resumo,
  familia,
  // ⚠ Uma frase, na língua de quem emite. Vazio é melhor que frase inventada.
  quando: extra.quando ?? null,
  sentido: SENTIDO.SAIDA,
  ambito: ambitoDoCodigo(codigo),
  // ⚠ A descrição OFICIAL entra quando a contabilidade validar. Nula é honesto; inventada, não.
  descricaoOficial: null,
  validado: false,
  fonte: "Resumo operacional TORG (22/09/2026) — descrição oficial: Convênio S/Nº de 15/12/1970, pendente de conferência",
  ...extra,
});

export const CFOPS = [
  C("5101", "Venda de produção do estabelecimento", FAMILIA.VENDA,
    { quando: "A TORG compra o aço, as chapas e os tubos, fabrica a estrutura e vende pronta para um cliente de SP. O material e o produto são dela.",
      exige: ["Os insumos são da TORG?", "O destinatário é contribuinte?"], relacionados: ["6101", "5116", "5118"] }),
  C("6101", "Venda interestadual de produção do estabelecimento", FAMILIA.VENDA,
    { quando: "O mesmo da 5.101, com o cliente em outro estado.",
      exige: ["UF de destino", "O destinatário é contribuinte?"], relacionados: ["5101", "6116", "6118"] }),
  C("5116", "Venda de produção própria originada de encomenda para entrega futura", FAMILIA.VENDA,
    { quando: "A venda já tinha sido faturada antes pela 5.922 e agora a estrutura sai de verdade do pátio.",
      exige: ["Houve simples faturamento antes (5.922)?"], relacionados: ["5922", "5101"] }),
  C("5118", "Venda de produção própria entregue por conta e ordem do adquirente", FAMILIA.VENDA,
    { quando: "O cliente compra da TORG e manda entregar direto no cliente final dele. Esta é a nota de VENDA, emitida para quem comprou.",
      exige: ["Quem é o adquirente original?", "Quem recebe fisicamente?", "NF referenciada"], relacionados: ["5923", "6118"] }),
  C("6118", "Venda interestadual de produção própria entregue por conta e ordem", FAMILIA.VENDA,
    { quando: "O mesmo da 5.118, com o adquirente em outro estado.",
      exige: ["Quem é o adquirente original?", "Quem recebe fisicamente?", "NF referenciada"], relacionados: ["6923", "5118"] }),
  C("5923", "Remessa por conta e ordem de terceiros", FAMILIA.REMESSA,
    { quando: "É a nota que acompanha o caminhão na venda à ordem, emitida para quem RECEBE a carga. Ela não cobra nada — quem cobra é a 5.118.",
      exige: ["NF de venda referenciada (5.118)"], relacionados: ["5118", "6923"],
      nota: "⚠ A remessa NÃO pode gerar uma segunda cobrança pelos mesmos produtos — ela acompanha a venda, não a repete." }),
  C("6923", "Remessa interestadual por conta e ordem de terceiros", FAMILIA.REMESSA,
    { quando: "O mesmo da 5.923, com a entrega em outro estado.",
      exige: ["NF de venda referenciada (6.118)"], relacionados: ["6118", "5923"] }),
  C("5901", "Remessa para industrialização por encomenda", FAMILIA.REMESSA,
    { quando: "A TORG manda material para um terceiro executar uma etapa (jateamento, pintura) e espera a peça de volta.",
      exige: ["Quem é o autor da encomenda?", "De quem são os insumos?"], relacionados: ["5902", "5124"] }),
  C("6901", "Remessa interestadual para industrialização", FAMILIA.REMESSA,
    { quando: "O mesmo da 5.901, com o industrializador em outro estado.",
      exige: ["Quem é o autor da encomenda?", "UF do industrializador"], relacionados: ["5901"] }),
  C("5902", "Retorno de mercadoria utilizada na industrialização", FAMILIA.RETORNO,
    { quando: "Volta para a TORG o que FOI aplicado na peça durante a industrialização.",
      exige: ["NF de remessa referenciada (5.901)"], relacionados: ["5901", "5124"] }),
  C("5903", "Retorno de mercadoria NÃO aplicada na industrialização", FAMILIA.RETORNO,
    { quando: "Volta o que sobrou e não chegou a ser empregado na peça.",
      exige: ["NF de remessa referenciada"], relacionados: ["5902"],
      nota: "⚠ É o que sobrou e volta sem ter sido empregado — não confundir com o 5.902." }),
  C("5124", "Industrialização efetuada para outra empresa", FAMILIA.INDUSTRIALIZACAO,
    { quando: "O cliente envia os materiais principais DELE, saídos do estabelecimento dele, e a TORG industrializa e cobra pela industrialização.",
      exige: ["Os insumos TRANSITARAM pelo estabelecimento do encomendante?"], relacionados: ["5125", "5902"],
      nota: "⚠⚠ A diferença para o 5.125 é o TRÂNSITO dos insumos, não quem pagou." }),
  C("5125", "Industrialização quando os insumos não transitaram pelo estabelecimento adquirente", FAMILIA.INDUSTRIALIZACAO,
    { quando: "O cliente compra a matéria-prima principal, o fornecedor entrega direto na TORG e a TORG fabrica e cobra pela industrialização. O material nunca passou pelo cliente.",
      exige: ["Os insumos foram entregues direto pelo fornecedor?"], relacionados: ["5124", "5925"],
      nota: "⚠⚠ A diferença para o 5.124 é o TRÂNSITO dos insumos, não quem pagou." }),
  C("5924", "Remessa para industrialização por conta e ordem do adquirente", FAMILIA.REMESSA,
    { quando: "A perna de remessa do insumo ao industrializador por conta e ordem do adquirente, quando o material não passou pelo estabelecimento dele.",
      exige: ["Quem é o adquirente?", "Quem entregou os insumos?"], relacionados: ["5925", "5125"] }),
  C("5925", "Retorno de mercadoria recebida para industrialização por conta e ordem", FAMILIA.RETORNO,
    { quando: "O retorno da mercadoria industrializada que entrou por conta e ordem — é o par da 5.924.",
      exige: ["NF de remessa referenciada (5.924)"], relacionados: ["5924", "5125"] }),
  C("5922", "Simples faturamento para entrega futura", FAMILIA.ENTREGA_FUTURA,
    { quando: "Fatura agora e entrega depois: a nota sai sem a mercadoria se mover. A saída física vem na 5.116.",
      exige: ["A mercadoria já existe?", "Quando sai fisicamente?"], relacionados: ["5116"],
      nota: "⚠ Fatura sem sair. A saída física vem depois, no 5.116." }),
  C("5949", "Outras saídas não especificadas", FAMILIA.OUTRAS,
    { quando: "Quando a operação não é nenhuma das outras — complemento de uma entrega, peça de garantia, remessa sem enquadramento próprio.",
      exige: ["Qual é a operação de verdade?"], relacionados: ["6949"],
      nota: "⚠⚠ É o último recurso, não o atalho: se coube num CFOP específico, o 5.949 esconde a operação de quem for auditar." }),
  C("6949", "Outras saídas interestaduais não especificadas", FAMILIA.OUTRAS,
    { quando: "O mesmo da 5.949, com o destino em outro estado.",
      exige: ["Qual é a operação de verdade?"], relacionados: ["5949"] }),
];

/**
 * AS OPERAÇÕES REAIS DA TORG — a biblioteca de exemplos.
 *
 * ⚠⚠ SÃO CASOS HISTÓRICOS, NÃO PRECEDENTES. Matheus (22/09/2026): *"trate os casos históricos como
 * exemplos operacionais, não como precedentes universais; revalide as hipóteses e os dispositivos
 * legais antes de transformá-los em regras automáticas"*. Nada aqui alimenta cálculo automático:
 * são o que a tela MOSTRA para quem está montando uma nota, com as perguntas que faltam.
 *
 * ⚠⚠ O `notas` DIZ QUANTAS NOTAS A OPERAÇÃO COSTUMA EXIGIR, E QUEM EMITE CADA UMA. Matheus
 * (22/09/2026): *"a simulação deve informar previamente quais notas devem ser emitidas geralmente
 * nesse tipo de operação do cliente"*. É a pergunta que vem ANTES do CST: numa venda à ordem quem
 * emite só a 5.118 deixou o caminhão sair sem documento, e quem emite a 5.923 cobrando de novo
 * faturou duas vezes o mesmo aço.
 *
 * ⚠⚠ E NEM TODA NOTA DO FLUXO É DA TORG. A remessa de entrada da industrialização é emitida pelo
 * CLIENTE ou pelo FORNECEDOR dele — listá-la sem dizer isso faria o operador procurar no Omie uma
 * nota que não é dele para emitir. Por isso cada linha carrega `quem`.
 */
export const OPERACOES = [
  { id: "venda-normal", titulo: "Venda normal", cliente: null,
    resumo: "A TORG compra os materiais, fabrica e vende o produto acabado.",
    fluxo: ["TORG", "Cliente"], cfops: ["5101", "6101"],
    perguntas: ["O destino é dentro ou fora de SP?", "O destinatário é contribuinte?"],
    notas: [{ quem: "TORG", cfop: "5101/6101", papel: "Venda", de: "TORG", para: "Cliente", obs: "Uma nota só: fatura e acompanha a carga." }],
  },

  { id: "venda-a-ordem", titulo: "Venda à ordem", cliente: "TMSA",
    resumo: "O cliente compra da TORG mas manda entregar direto no cliente final dele.",
    fluxo: ["TORG → venda para o adquirente", "TORG → remessa física ao destinatário final"],
    cfops: ["5118", "6118", "5923", "6923"],
    perguntas: ["Qual a NF do adquirente para o destinatário final?", "As notas estão referenciadas?"],
    alerta: "⚠⚠ A remessa não pode cobrar de novo pelos mesmos produtos.",
    notas: [
      { quem: "TORG", cfop: "5118/6118", papel: "Venda", de: "TORG", para: "Adquirente (quem comprou)", obs: "É a nota que COBRA." },
      { quem: "TORG", cfop: "5923/6923", papel: "Remessa", de: "TORG", para: "Destinatário final", obs: "⚠⚠ Acompanha a carga e referencia a venda — NÃO cobra de novo pelos mesmos produtos." },
      { quem: "Adquirente", cfop: null, papel: "Venda do adquirente ao cliente final dele", de: "Adquirente", para: "Destinatário final", obs: "Não sai do Omie da TORG; é ela que a remessa referencia." },
    ],
  },

  { id: "indust-mp-cliente", titulo: "Industrialização com matéria-prima do cliente", cliente: "QWS",
    resumo: "O cliente compra o material, o fornecedor entrega direto na TORG, a TORG industrializa e cobra pelo serviço.",
    fluxo: ["Fornecedor", "TORG", "Cliente"], cfops: ["5924", "5925", "5125", "5949"],
    perguntas: ["Os insumos vieram do fornecedor ou do estabelecimento do encomendante?", "Houve remessa simbólica?"],
    notas: [
      { quem: "Fornecedor do cliente", cfop: null, papel: "Remessa do insumo por conta e ordem", de: "Fornecedor", para: "TORG", obs: "⚠ A entrada não é nota da TORG — confira se ela chegou antes de industrializar." },
      { quem: "TORG", cfop: "5925", papel: "Retorno da mercadoria industrializada", de: "TORG", para: "Cliente", obs: "Devolve o que entrou, referenciando a remessa." },
      { quem: "TORG", cfop: "5125", papel: "Industrialização (o que a TORG cobra)", de: "TORG", para: "Cliente", obs: "O valor do serviço e dos materiais que a TORG aplicou." },
    ],
  },

  { id: "indust-insumo-direto", titulo: "Industrialização com insumos enviados pelo cliente", cliente: null,
    resumo: "O cliente manda o material, a TORG industrializa e devolve.",
    fluxo: ["Cliente", "TORG", "Cliente"], cfops: ["5901", "5902", "5124"],
    perguntas: ["Os insumos transitaram pelo estabelecimento do encomendante?"],
    alerta: "⚠⚠ É o TRÂNSITO dos insumos que separa o 5.124 do 5.125.",
    notas: [
      { quem: "Cliente", cfop: null, papel: "Remessa para industrialização", de: "Cliente", para: "TORG", obs: "⚠ Emitida pelo CLIENTE. É ela que as notas de volta referenciam." },
      { quem: "TORG", cfop: "5902", papel: "Retorno do material aplicado", de: "TORG", para: "Cliente", obs: "O que era do cliente e voltou dentro da peça." },
      { quem: "TORG", cfop: "5124", papel: "Industrialização (o que a TORG cobra)", de: "TORG", para: "Cliente", obs: "O valor agregado pela TORG." },
    ],
  },

  { id: "indust-entrega-direta", titulo: "Industrialização com entrega ao cliente final do contratante", cliente: null,
    resumo: "A TORG industrializa material do contratante e entrega direto a quem ele indicar.",
    fluxo: ["TORG", "Cliente final do contratante"], cfops: ["5125", "5925", "5949"],
    perguntas: ["As condições do art. 408 do RICMS/SP estão atendidas?"],
    alerta: "⚠⚠ Não aplicar esta sistemática automaticamente a qualquer triangulação.",
    notas: [
      { quem: "TORG", cfop: "5925", papel: "Retorno simbólico ao contratante", de: "TORG", para: "Contratante", obs: "⚠ Só se as condições do art. 408 do RICMS/SP estiverem atendidas." },
      { quem: "TORG", cfop: "5125", papel: "Industrialização", de: "TORG", para: "Contratante", obs: "O que a TORG cobra." },
      { quem: "TORG", cfop: "5949", papel: "Remessa ao cliente final do contratante", de: "TORG", para: "Cliente final", obs: "⚠⚠ A que acompanha a carga. Não aplicar esta sistemática a qualquer triangulação." },
    ],
  },

  { id: "terceirizacao", titulo: "Terceirização de jateamento e pintura", cliente: "MEGASTEAM / B.BOSCH",
    resumo: "A TORG fabrica parte e terceiriza etapas de acabamento.",
    fluxo: ["TORG", "Jateamento", "Pintura", "TORG", "Cliente final"], cfops: ["5901", "5902", "5124"],
    perguntas: ["Quem fornece os materiais?", "Quem contrata cada etapa?", "Quem recebe o produto final?"],
    alerta: "⚠⚠ Quem PAGA não define quem é o autor da encomenda fiscal.",
    notas: [
      { quem: "TORG", cfop: "5901/6901", papel: "Remessa para industrialização", de: "TORG", para: "Jateamento / Pintura", obs: "Uma por etapa terceirizada." },
      { quem: "Terceiro", cfop: "5902", papel: "Retorno do material aplicado", de: "Terceiro", para: "TORG", obs: "⚠ Emitida pelo TERCEIRO — a TORG recebe, não emite." },
      { quem: "Terceiro", cfop: "5124", papel: "Industrialização cobrada pelo terceiro", de: "Terceiro", para: "TORG", obs: "É a nota de serviço/industrialização que entra no custo." },
    ],
  },

  { id: "dois-caminhoes", titulo: "Uma venda e dois caminhões", cliente: null,
    resumo: "Estrutura grande que não cabe numa carga só.",
    fluxo: ["TORG", "Cliente (em duas cargas)"], cfops: ["5101", "5949", "5922", "5116"],
    perguntas: ["O preço foi estabelecido para o conjunto?", "Quando foi o faturamento?", "A mercadoria já existia?"],
    alerta: "⚠ São dois cenários diferentes: remessa parcial de conjunto × entrega futura.",
    notas: [
      { quem: "TORG", cfop: "5922", papel: "Simples faturamento", de: "TORG", para: "Cliente", obs: "Só no cenário de ENTREGA FUTURA: fatura sem a mercadoria sair." },
      { quem: "TORG", cfop: "5116", papel: "Saída física da entrega futura", de: "TORG", para: "Cliente", obs: "Uma por carga, referenciando o faturamento." },
      { quem: "TORG", cfop: "5101/6101", papel: "Venda", de: "TORG", para: "Cliente", obs: "⚠ No outro cenário (remessa parcial de conjunto) o caminho é outro — os dois não se misturam." },
    ],
  },

  { id: "garantia", titulo: "Garantia", cliente: null,
    resumo: "Peça enviada para substituir produto com defeito.",
    fluxo: ["TORG", "Cliente"], cfops: ["5949", "6949"],
    perguntas: ["A peça defeituosa foi devolvida?", "A nova já havia sido faturada?"],
    alerta: "⚠ Não presumir ausência de ICMS ou IPI.",
    notas: [{ quem: "TORG", cfop: "5949/6949", papel: "Remessa da peça de reposição", de: "TORG", para: "Cliente", obs: "⚠ Não presumir ausência de ICMS ou IPI. A devolução da peça defeituosa é nota do cliente." }],
  },

  { id: "faltantes", titulo: "Peças que faltaram na entrega", cliente: null,
    resumo: "Peças faturadas que não foram produzidas ou carregadas na entrega original.",
    fluxo: ["TORG", "Cliente"], cfops: ["5949"],
    perguntas: ["Qual a nota original?", "Quanto já foi faturado?"],
    alerta: "⚠⚠ É COMPLEMENTAÇÃO da entrega, não garantia — classificar como garantia esconde o que aconteceu.",
    notas: [{ quem: "TORG", cfop: "5949", papel: "Complemento da entrega", de: "TORG", para: "Cliente", obs: "⚠⚠ Referencia a nota original. Não é garantia — classificar como garantia esconde o que aconteceu." }],
  },
];

/**
 * OS CST DE IPI (saída).
 *
 * ⚠⚠ ESCOLHER CST NÃO É ESCOLHER QUANTO PAGAR. Matheus (22/09/2026): *"não utilizar CST 53
 * simplesmente porque o usuário deseja emitir uma NF sem IPI"* e *"não utilizar CST 55 sem
 * identificar o fundamento legal da suspensão"*. Por isso cada um carrega o que PRECISA ser provado.
 */
export const CST_IPI = [
  { cst: "50", rotulo: "Saída tributada", exigeFundamento: false },
  { cst: "51", rotulo: "Saída tributada com alíquota zero", exigeFundamento: false,
    nota: "⚠ Alíquota zero é a da TIPI — não é escolha de quem emite." },
  { cst: "52", rotulo: "Saída isenta", exigeFundamento: true },
  { cst: "53", rotulo: "Saída não tributada", exigeFundamento: true,
    nota: "⚠⚠ Não é o caminho para 'emitir sem IPI': exige que o produto esteja fora do campo de incidência." },
  { cst: "54", rotulo: "Saída imune", exigeFundamento: true },
  { cst: "55", rotulo: "Saída com suspensão", exigeFundamento: true,
    nota: "⚠⚠ Sem o dispositivo legal da suspensão identificado, não se usa." },
  { cst: "99", rotulo: "Outras saídas", exigeFundamento: true },
];

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** Busca por código ou por descrição — o mesmo comportamento da consulta de NCM. */
export function buscarCfop(termo, { familia = null } = {}) {
  const t = String(termo ?? "").trim();
  const d = soDigitos(t);
  const semAcento = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const alvo = semAcento(t);
  return CFOPS.filter((c) => {
    if (familia && c.familia !== familia) return false;
    if (!t) return true;
    if (d.length >= 2 && c.codigo.startsWith(d)) return true;
    return Boolean(alvo) && semAcento(c.resumo).includes(alvo);
  });
}

/** As operações reais em que um CFOP aparece — é o que dá contexto ao código. */
export const operacoesDoCfop = (codigo) => OPERACOES.filter((o) => o.cfops.includes(soDigitos(codigo)));

/**
 * OS CÓDIGOS AGRUPADOS EM PARES DENTRO/FORA DO ESTADO.
 *
 * ⚠⚠ O PAR É UMA OPERAÇÃO SÓ, ESCRITA EM DOIS CÓDIGOS. Matheus (22/09/2026): *"agrupe dentro e fora
 * do estado, deixe dessa forma: 5101/6101 — Venda…"*. A venda para Campinas e a venda para Caxias
 * são o MESMO negócio; o que muda entre o 5.101 e o 6.101 é o destino, e o destino o portal já
 * sabe — ele sai das duas UFs. Oferecer os dois lado a lado era pedir ao operador que acertasse um
 * dígito que a máquina consegue deduzir sozinha.
 *
 * ⚠ O par casa pelos TRÊS ÚLTIMOS DÍGITOS e por âmbitos opostos. Nem todo código tem irmão — o
 * 5.124, o 5.125 e os retornos aparecem sozinhos na lista da TORG, e aparecer sozinho é informação:
 * quem procurar um "6.125" precisa saber que ele não está aqui.
 *
 * @returns {{chave:string,rotulo:string,codigos:string[],resumo:string,familia:string,quando:string|null}[]}
 */
export function paresDeCfop() {
  const usados = new Set();
  const saida = [];
  for (const c of CFOPS) {
    if (usados.has(c.codigo)) continue;
    const irmao = CFOPS.find((o) => o.codigo !== c.codigo && o.codigo.slice(1) === c.codigo.slice(1) && o.ambito !== c.ambito);
    usados.add(c.codigo);
    if (irmao) usados.add(irmao.codigo);
    const codigos = irmao ? [c, irmao].sort((a, b) => a.codigo.localeCompare(b.codigo)) : [c];
    saida.push({
      chave: codigos.map((x) => x.codigo).join("/"),
      rotulo: codigos.map((x) => x.codigoFormatado).join(" / "),
      codigos: codigos.map((x) => x.codigo),
      // ⚠ O resumo do par é o do 5.xxx: o do 6.xxx só acrescenta a palavra "interestadual", que o
      // par inteiro já torna redundante.
      resumo: codigos[0].resumo,
      familia: c.familia,
      quando: codigos[0].quando,
    });
  }
  return saida;
}
