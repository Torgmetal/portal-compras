// O ESCOPO DE ENSAIOS DA OBRA — o PIT dizendo o que cada relatório deve ter.
//
// Vitor (21/08/2026): "temos alguns campos como pull-off, salinidade, que nem sempre serão
// utilizados; nesse caso precisamos entender o PIT da obra... isso é quem vai ditar o que vamos ter
// naquele relatório, quanto vamos ter e por aí vai; aí com essa informação você já deixa o
// relatório o mais adequado para cada tipo de situação".
//
// É a peça que faltava. Até aqui o relatório nascia com TODOS os campos e o inspetor decidia o que
// preencher — o que produz duas coisas ruins: campo em branco que ninguém sabe se é "não se aplica"
// ou "esqueceram", e inspetor medindo o que o contrato não pede.
//
// ⚠ O PIT JÁ EXISTE NO PORTAL: é a §10 do data book, por OP (`DataBookSecao.conteudoJson`). Este
// módulo não cria um segundo cadastro — acrescenta ao MESMO objeto um bloco `escopo`, com as
// escolhas que o formulário precisa ler. Um segundo lugar para dizer a mesma coisa é um lugar que
// diverge.

/**
 * O que se pode ligar ou desligar por obra.
 *
 * ⚠ `padrao` é o que vale quando a obra não definiu nada — e a escolha de cada padrão importa. Os
 * ensaios que o PO-05 exige sempre (rugosidade, espessura, aderência) vêm ligados; os que dependem
 * de contrato (pull-off, salinidade) vêm DESLIGADOS. Melhor o inspetor ligar o que o cliente pede
 * do que preencher a vida toda um campo que ninguém olha.
 */
export const ITENS_ESCOPO = {
  PINTURA: [
    { k: "rugosidade", nome: "Perfil de rugosidade", padrao: true, nota: "PO-05, item 5.5.1.1" },
    { k: "poeira", nome: "Teste de poeira (ISO 8502-3)", padrao: false },
    { k: "salinidade", nome: "Salinidade — Bresle (ISO 8502-6/9)", padrao: false },
    { k: "espessura", nome: "Espessura de película (DFT)", padrao: true },
    { k: "aderenciaX", nome: "Aderência — ensaio X", padrao: true, nota: "PO-05, item 5.3" },
    { k: "pullOff", nome: "Aderência — pull-off", padrao: false },
    { k: "intemperismo", nome: "Grau de intemperismo", padrao: true },
  ],
  VISUAL_SOLDA: [
    { k: "iluminacao", nome: "Medição de iluminação (luxímetro)", padrao: true, nota: "PO-06, item 6.2" },
    { k: "dimensionalSolda", nome: "Dimensional da solda (perna, reforço)", padrao: true },
  ],
  ULTRASSOM: [
    { k: "criticaFratura", nome: "Solda crítica à fratura", padrao: false, nota: "PI-QUA-003, item 15.1 — registra também até 6 dB abaixo" },
  ],
  DIMENSIONAL: [],
};

/** O escopo cheio de um tipo, aplicando o padrão onde a obra não definiu. */
export function escopoDoTipo(tipo, escopoSalvo) {
  const itens = ITENS_ESCOPO[tipo] || [];
  const salvo = escopoSalvo?.[tipo] || {};
  const out = {};
  for (const i of itens) out[i.k] = salvo[i.k] === undefined ? i.padrao : !!salvo[i.k];
  return out;
}

/** Está ligado para esta obra? Sem PIT definido, vale o padrão do item. */
export function aplica(escopo, tipo, chave) {
  const e = escopoDoTipo(tipo, escopo);
  return e[chave] !== false;
}

/**
 * A amostragem definida no PIT — "quanto vamos ter".
 *
 * ⚠ Texto livre de propósito. A frequência real vem escrita em contrato de formas que nenhuma lista
 * cobre: "10% das juntas", "1 a cada 20 peças", "100% das juntas de topo com penetração total",
 * "conforme % contratual". Enquadrar isso numa lista faria alguém escolher o mais parecido — e o
 * mais parecido não é o que o contrato diz.
 */
export function amostragemDoTipo(escopo, tipo) {
  return escopo?.amostragem?.[tipo] || null;
}
