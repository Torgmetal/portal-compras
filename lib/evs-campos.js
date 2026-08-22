// OS CÓDIGOS DO ENSAIO VISUAL DE SOLDA.
//
// Saem da legenda do formulário da Torg (aba "Visual Solda" do modelo) e do PO-06 — Procedimento de
// Ensaio Visual e Dimensional de Soldas, R1.
//
// ⚠ Isto é lista fechada de propósito. Descontinuidade digitada à mão vira "mordedura", "MORDEDURA",
// "mord." e "MO" no mesmo relatório, e aí não dá para responder "quantas mordeduras teve a OP-089".
// Com código, o relatório fica pesquisável e o laudo pode se sugerir sozinho.

export const DESCONTINUIDADES = [
  { c: "TL", nome: "Trinca Longitudinal", grave: true },
  { c: "TT", nome: "Trinca Transversal", grave: true },
  { c: "PO", nome: "Porosidade" },
  { c: "MO", nome: "Mordedura" },
  { c: "OV", nome: "Sobreposição (Overlap)" },
  { c: "FF", nome: "Falta de Fusão", grave: true },
  { c: "FP", nome: "Falta de Penetração", grave: true },
  { c: "RE", nome: "Respingo (Splash)" },
  { c: "CO", nome: "Concavidade" },
  { c: "AA", nome: "Abertura de Arco" },
  { c: "DI", nome: "Deposição Insuficiente" },
];

// ⚠ `curto` existe para o botão. "Recomendação de exame complementar" não cabe num terço da tela
// do celular, e cortar com reticência num botão de decisão é pior que abreviar: quem lê "Recomend…"
// não sabe se recomenda aprovar ou reprovar.
export const LAUDOS = [
  { c: "A", nome: "Aprovado", curto: "Aprovado", cor: "verde" },
  { c: "R", nome: "Reprovado", curto: "Reprovado", cor: "vermelho" },
  { c: "REC", nome: "Recomendação de exame complementar", curto: "Exame complementar", cor: "laranja" },
];

/**
 * O laudo que o portal SUGERE a partir das descontinuidades marcadas.
 *
 * ⚠ SUGERE, não decide. Trinca e falta de fusão/penetração não têm tolerância na AWS D1.1 — achou,
 * é reprovado, e não faz sentido deixar alguém marcar "aprovado" sem perceber. As demais dependem
 * de medida (profundidade da mordedura, tamanho do poro), e aí quem julga é o inspetor com o
 * critério na mão.
 */
export function laudoSugerido(codigos) {
  const lista = Array.isArray(codigos) ? codigos : String(codigos || "").split(/[\s,;]+/).filter(Boolean);
  if (!lista.length) return "A";
  if (lista.some((c) => DESCONTINUIDADES.find((d) => d.c === c)?.grave)) return "R";
  return null; // tem defeito, mas o julgamento é do inspetor
}

/**
 * O critério de aceitação do ensaio visual de solda.
 *
 * Vitor (21/08/2026): "nesse caso de critério de aceitação, o que deve ser apresentado aqui?".
 *
 * O PO-06 responde no item 9.4: para estrutura metálica o critério é a AWS D1.1, e os limites estão
 * na tabela 11 do próprio procedimento. A revisão 1 do PO-06 foi feita para atualizar a norma — o
 * texto cita a Edição 2025.
 *
 * ⚠ Citar SÓ "AWS D1.1" não basta num documento que vai ao cliente: a norma tem edições, e os
 * limites mudam entre elas. Sem a edição e sem o item do procedimento, quem confere depois não
 * sabe contra o que a peça foi julgada.
 *
 * ⚠ DIVERGÊNCIA CONHECIDA, que vale a Qualidade olhar: o PO-06 R1 cita a edição 2025, mas a
 * Relação de Soldadores Qualificados (RSQ 001/25 Rev.5) foi emitida contra a AWS D1.1/D1.1M: 2020.
 * São documentos diferentes e pode ser proposital — mas se não for, um dos dois está desatualizado.
 */
export const CRITERIO_PADRAO = "AWS D1.1:2025 - tabela 11 do PO-06 (item 9.4)";

/** Iluminação mínima do PO-06, item 6.2 — verificada na superfície com luxímetro calibrado. */
export const LUX_MINIMO = 1076;

/** Técnicas previstas no PO-06. */
export const TECNICAS = ["Visual direta", "Visual direta com espelho", "Visual remota"];

/**
 * Metal base.
 *
 * Vitor (21/08/2026): "no metal base vamos usar apenas a seleção de aço carbono por hora, caso seja
 * necessário adicionaremos mais tipos de materiais posteriormente".
 *
 * ⚠ Lista de UM item, e de propósito. Como texto livre, o mesmo aço vira "A572", "ASTM A572 Gr.50",
 * "a572 gr50" e "aço carbono" em quatro relatórios da mesma OP — e depois não dá para filtrar nem
 * comparar. Um item hoje é melhor que campo aberto; acrescentar o segundo é uma linha aqui.
 */
export const METAIS_BASE = ["Aço carbono"];

/**
 * Tipo de estrutura inspecionada.
 *
 * Vitor (21/08/2026): "o tipo das estruturas, listar: Coluna, Viga, Suporte, Bandeja, Tesoura,
 * Treliça".
 *
 * ⚠ NÃO CONFUNDIR COM O CARREGAMENTO DA AWS D1.1 (`TIPOS_ESTRUTURA` em lib/aws-d11.js). São dois
 * campos de nome parecido e função oposta: este descreve O QUE é a peça e serve para ler e filtrar o
 * relatório; aquele diz se a estrutura é estática, cíclica ou tubular e é o que DECIDE o limite de
 * cada defeito — 1 mm de mordedura contra 0,25 mm. Trocar um pelo outro faria o portal mostrar o
 * critério errado sem avisar ninguém.
 */
export const TIPOS_PECA = ["Coluna", "Viga", "Suporte", "Bandeja", "Tesoura", "Treliça"];

export const CONDICOES = [
  "Como soldado",
  "Escovada",
  "Esmerilhada",
  "Jateada",
  "Limpa, sem respingos",
];
