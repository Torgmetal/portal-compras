// ─── O PAINEL DE PRAZOS, VISTO POR RM ────────────────────────────────────────
//
// Matheus (16/09/2026): "preciso de uma aba fora para ver todas as RMs de uma vez, seus pedidos e
// prazos de cada".
//
// ⚠⚠ POR QUE UMA TELA E NÃO A `Compras › Entregas` QUE JÁ EXISTE. As duas mostram prazo de pedido,
// mas respondem perguntas diferentes, e o EIXO é a diferença: a Entregas lista PEDIDOS (kanban por
// situação, filtros por fornecedor e obra) — é a tela de quem cobra fornecedor. Esta agrupa por RM
// e responde "o que a engenharia pediu já está chegando?", que é uma pergunta de quem acompanha a
// requisição, não o fornecedor. Fundir as duas faria a Entregas servir mal aos dois.
//
// ⚠ A conta de previsão e chegada NÃO se repete aqui: vem de `linhaDoTempo`, a mesma que a régua
// dentro da RM usa. Duas telas que contam o mesmo atraso não podem discordar em um dia.
import { linhaDoTempo } from "./acompanhamento-pedido";

/** As situações de um pedido, da mais urgente para a mais tranquila. */
export const SITUACAO = {
  ATRASADO: { rotulo: "Atrasado", ordem: 0, cor: "red" },
  // ⚠⚠ LOGO ABAIXO DE "ATRASADO", não no fim da fila. Parcial é pendência viva: parte chegou e o
  // resto continua devendo. Mas fica abaixo do atrasado porque quem não recebeu NADA aperta mais
  // que quem já recebeu metade.
  PARCIAL: { rotulo: "Recebido parcial", ordem: 1, cor: "violet" },
  VENCE_HOJE: { rotulo: "Vence hoje", ordem: 2, cor: "orange" },
  PROXIMO: { rotulo: "Próximos 7 dias", ordem: 3, cor: "amber" },
  NO_PRAZO: { rotulo: "No prazo", ordem: 4, cor: "sky" },
  SEM_PRAZO: { rotulo: "Sem prazo", ordem: 5, cor: "gray" },
  // ⚠⚠ DEPOIS DE "SEM PRAZO" E ANTES DE "CHEGOU", e a posição foi escolhida, não sorteada. A
  // situação da RM é a do seu pedido MAIS urgente: se ENCERRADO viesse antes, uma RM com um pedido
  // encerrado e outro sem previsão seria carimbada "Encerrado" e sairia do radar com trabalho em
  // aberto dentro (achado do Codex, 17/09/2026). Depois de CHEGOU também não serve — chegar é
  // melhor notícia que encerrar, e a RM inteira recebida tem de continuar dizendo isso.
  ENCERRADO: { rotulo: "Encerrado no Omie", ordem: 6, cor: "slate" },
  CHEGOU: { rotulo: "Chegou", ordem: 7, cor: "emerald" },
};

export const rotuloSituacao = (s) => SITUACAO[s]?.rotulo || s;

/**
 * O pedido ainda cobra acompanhamento?
 *
 * ⚠⚠ UM PREDICADO SÓ, porque a regra estava escrita TRÊS vezes ("!== CHEGOU"): na próxima previsão
 * da RM, no contador do cabeçalho e no filtro padrão. Com ENCERRADO entrando, esquecer uma delas
 * faria a tela dizer números diferentes sobre o mesmo pedido — a RM sairia do filtro "pendentes" e
 * mesmo assim emprestaria sua data à lista.
 *
 * ⚠ É do PAINEL, e só dele. Não serve para decidir baixa de item nem elegibilidade de sync: lá
 * quem manda é o recebimento de verdade, e encerrado continua podendo receber NF depois.
 */
export const aindaAperta = (p) => p.situacao !== "CHEGOU" && p.situacao !== "ENCERRADO";

const DIA = 86400000;
const soDia = (d) => new Date(new Date(d).toISOString().slice(0, 10)).getTime();

/**
 * Em que pé está este pedido?
 *
 * ⚠⚠ "CHEGOU" GANHA DE TUDO, inclusive de previsão vencida. Um pedido entregue com 14 dias de
 * atraso não é uma pendência — é um caso encerrado que por acaso atrasou. Mantê-lo em vermelho no
 * topo empurraria para baixo o que ainda dá para resolver, que é justamente o que esta tela
 * existe para mostrar primeiro.
 */
export function situacaoDoPedido(pedido, agora = Date.now()) {
  const { previsao, atrasoDias, eventos } = linhaDoTempo(pedido);
  const chegou = eventos.some((e) => e.etapa === "MATERIAL_RECEBIDO");
  if (chegou) return { situacao: "CHEGOU", previsao, atrasoDias, diasAte: null };
  // ⚠⚠ ENCERRADO VENCE O PRAZO, MAS PERDE PARA A CHEGADA. Matheus (17/09/2026): "o portal precisa
  // reconhecer os pedidos ENCERRADOS do Omie para não ficar como atrasado, principalmente quando é
  // FATURAMENTO DIRETO". Pedido que o Omie deu por acabado não é mais uma cobrança de prazo — mas
  // dizer "chegou" seria inventar um recebimento que ninguém registrou. Ver `lib/omie-encerramento`.
  if (pedido?.encerradoOmieEm) {
    return { situacao: "ENCERRADO", previsao, atrasoDias: null, diasAte: null, encerradoEm: pedido.encerradoOmieEm };
  }
  const dias = previsao ? Math.round((soDia(previsao) - soDia(agora)) / DIA) : null;
  // ⚠⚠ PARCIAL VENCE O PRAZO, E FOI MEDIDO QUE PRECISAVA SER ASSIM. Matheus (17/09/2026): "os
  // pedidos com Status Recebidos Parcialmente precisam ser considerados como Parciais nos Prazos,
  // e quando forem concluídos/encerrados finalizar". Em 17/09 os 19 pedidos PARCIAL tinham TODOS a
  // previsão vencida — deixando o prazo ganhar, os 19 continuariam dizendo só "Atrasado" e a
  // parcialidade não apareceria em lugar nenhum da tela.
  //
  // ⚠ O atraso não some por causa disso: `diasAte` continua indo junto, e a tela escreve "parcial ·
  // N dias de atraso no restante". Trocar um sinal pelo outro seria esconder metade do problema.
  if (pedido?.statusEntrega === "PARCIAL") {
    return { situacao: "PARCIAL", previsao, atrasoDias: null, diasAte: dias };
  }
  if (!previsao) return { situacao: "SEM_PRAZO", previsao: null, atrasoDias: null, diasAte: null };

  const situacao = dias < 0 ? "ATRASADO" : dias === 0 ? "VENCE_HOJE" : dias <= 7 ? "PROXIMO" : "NO_PRAZO";
  // ⚠ `diasAte` é o que FALTA (ou já passou) e só existe enquanto não chegou; `atrasoDias` é o
  // veredito final, que só existe depois. Um campo só misturaria previsão com histórico.
  return { situacao, previsao, atrasoDias: null, diasAte: dias };
}

/**
 * A situação da RM inteira é a do seu pedido mais urgente.
 *
 * ⚠ RM cujos pedidos TODOS chegaram fica "Chegou" e vai para o fim da lista — não some. Sumir
 * faria a tela responder "onde está o que falta" e mentir sobre "onde está tudo", que é o que foi
 * pedido ("ver todas as RMs de uma vez").
 */
export const situacaoDaRM = (situacoes) =>
  (situacoes || []).slice().sort((a, b) => SITUACAO[a].ordem - SITUACAO[b].ordem)[0] || "SEM_PRAZO";

/**
 * Agrupa os pedidos por RM e ordena pelo que aperta.
 *
 * @param {object[]} pedidos cada um com `rm`, `prazoHistorico`, `acompanhamentos` e campos de entrega
 * @returns {object[]} uma linha por RM, com seus pedidos dentro
 */
const porUrgencia = (a, b) =>
  (SITUACAO[a.situacao].ordem - SITUACAO[b.situacao].ordem)
  || (new Date(a.previsao || a.proximaPrevisao || 0) - new Date(b.previsao || b.proximaPrevisao || 0));

/** O pedido como a tela precisa dele: identificação, dinheiro, situação e o rastro das etapas. */
const pedidoResumido = (p, agora) => ({
  id: p.id,
  numeroPedido: p.numeroPedido || null,
  fornecedorNome: p.fornecedorNome || "",
  faturamentoDireto: !!p.faturamentoDireto,
  cnpj: p.cnpj || null,
  encerradoOmieEm: p.encerradoOmieEm || null,
  total: Number(p.total || 0),
  criadoEm: p.createdAt || null,
  etapas: linhaDoTempo(p).eventos.filter((e) => e.tipo === "etapa"),
  ...situacaoDoPedido(p, agora),
});

/** ⚠ Pedido sem RM não é descartado: vai para um balde próprio. Descartar esconderia pedido de
 *  verdade (o lançado à mão, por exemplo) de uma tela que promete mostrar tudo. */
const baldeDaRM = (p) => ({
  rmId: p.rm?.id || null,
  numero: p.rm?.numero || "Sem RM",
  tipoRM: p.rm?.tipoRM || null,
  op: p.rm?.op || p.op || null,
  pedidos: [],
});

/** Fecha a linha da RM: situação, próxima data e total. */
function fecharLinha(r) {
  // ⚠ A data que representa a RM é a MAIS PRÓXIMA entre as pendentes — não a média nem a do
  // primeiro pedido. É a próxima vez que alguém precisa olhar para ela.
  const pendentes = r.pedidos.filter((p) => aindaAperta(p) && p.previsao);
  const proxima = pendentes.length
    ? pendentes.map((p) => p.previsao).sort((a, b) => new Date(a) - new Date(b))[0]
    : null;
  // ⚠⚠ A TAG "FD" DA RM É DERIVADA DOS PEDIDOS, porque Faturamento Direto é atributo do PEDIDO,
  // não da requisição. Matheus (16/09/2026): "marque na listagem Prazos de RM as RMs que são
  // Faturamento Direto, coloque uma TAG FD para saber quais são".
  //
  // ⚠ Três estados, não dois. Medido em 16/09/2026: das 237 RMs com pedido, 44 são inteiramente FD
  // e NENHUMA é mista — mas nada impede uma RM de ter um pedido FD e outro normal, e aí carimbar
  // "FD" no cabeçalho diria que a obra inteira não passa pela Torg, o que seria falso. "parcial"
  // existe para esse dia, e cada linha de pedido carrega a sua própria tag de qualquer forma.
  const comFD = r.pedidos.filter((p) => p.faturamentoDireto).length;
  const fd = comFD === 0 ? "NENHUM" : comFD === r.pedidos.length ? "TODOS" : "PARCIAL";

  return {
    ...r,
    situacao: situacaoDaRM(r.pedidos.map((p) => p.situacao)),
    fd,
    proximaPrevisao: proxima,
    total: r.pedidos.reduce((s, p) => s + p.total, 0),
    // ⚠ Dentro da RM os pedidos também vêm pelo que aperta: numa RM com quatro pedidos, o
    // atrasado não pode ficar em terceiro lugar.
    pedidos: r.pedidos.slice().sort(porUrgencia),
  };
}

export function agruparPorRM(pedidos, agora = Date.now()) {
  const porRM = new Map();
  for (const p of pedidos || []) {
    const chave = p.rm?.id || "__sem-rm__";
    if (!porRM.has(chave)) porRM.set(chave, baldeDaRM(p));
    porRM.get(chave).pedidos.push(pedidoResumido(p, agora));
  }
  return ordenarLinhas([...porRM.values()].map(fecharLinha));
}

/**
 * A ordem da lista: o que aperta primeiro, e RM com RM em ordem de número.
 *
 * ⚠⚠ FUNÇÃO PRÓPRIA PORQUE O FILTRO TAMBÉM PRECISA DELA (achado do Codex, 17/09/2026). Filtrar por
 * fornecedor RECALCULA a situação de cada RM — tirando o pedido atrasado da SOUFER, a RM pode virar
 * "No prazo". Sem reordenar, ela continuava no topo, acima de RMs realmente atrasadas: a lista
 * dizia uma coisa nos chips e outra na ordem.
 */
export function ordenarLinhas(linhas) {
  return [...(linhas || [])].sort((a, b) =>
    porUrgencia(a, b)
    || String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }));
}

/**
 * A identidade do fornecedor: a RAIZ do CNPJ, não o nome.
 *
 * ⚠⚠ O NOME DUPLICAVA A LISTA, E O CNPJ RESOLVE SEM ADIVINHAR. Matheus (17/09/2026): "agrupe os
 * que estão duplicando em apenas 1 nome, os que forem o mesmo CNPJ". O acervo tinha 14 CNPJs com
 * dois nomes cada — "AÇOS MAQ" e "AÇOS MAQ CONCHAL LTDA", "COMPANHIA DA SEGURANCA" com e sem
 * "LTDA", e até "INDUSCOLOR TINTAS" e "VENDAS" (alguém digitou o nome do contato).
 *
 * ⚠⚠ RAIZ (8 primeiros dígitos), NÃO O CNPJ INTEIRO. Casar o CNPJ completo ainda deixaria a
 * SOUFER aparecendo QUATRO vezes na lista — matriz e três filiais, todas escritas "SOUFER" — e
 * duas opções com rótulo idêntico é pior que a duplicação que se queria resolver. A raiz identifica
 * a EMPRESA por lei, e duas empresas diferentes nunca compartilham raiz: agrupar por ela é exato,
 * não heurístico. Também junta GERDAU (2), FERRO STORE (2) e FER-ALVAREZ/FERALVAREZ (2).
 *
 * ⚠ CPF não tem raiz: fornecedor pessoa física entra com os dígitos inteiros. Sem documento, o
 * nome é o que sobra — pior chave, mas melhor que jogar o pedido fora da lista.
 */
export function chaveFornecedor(pedido) {
  const digitos = String(pedido?.cnpj || "").replace(/\D/g, "");
  if (digitos.length === 14) return `cnpj:${digitos.slice(0, 8)}`;
  if (digitos.length > 0) return `doc:${digitos}`;
  const nome = (pedido?.fornecedorNome || "").trim();
  return nome ? `nome:${nome}` : null;
}

/**
 * Os fornecedores que aparecem nestas linhas, com quantos pedidos cada um.
 *
 * ⚠ Sai dos PEDIDOS, porque fornecedor é atributo do pedido — uma RM pode ter pedidos de três
 * fornecedores diferentes e aparece nas três opções.
 *
 * ⚠⚠ O RÓTULO DO GRUPO É O NOME MAIS USADO, não o mais completo. "INDUSCOLOR TINTAS" (28 pedidos)
 * e "VENDAS" (1) são o mesmo CNPJ; escolher o mais longo ou o último daria "VENDAS" ao grupo, e
 * ninguém procuraria a Induscolor por ali. Empate desempata em ordem alfabética, para a lista não
 * mudar de rótulo entre duas cargas.
 */
export function fornecedoresDasLinhas(linhas) {
  const grupos = new Map();
  for (const l of linhas || []) {
    for (const p of l.pedidos || []) {
      const chave = chaveFornecedor(p);
      if (!chave) continue;
      if (!grupos.has(chave)) grupos.set(chave, { chave, quantidade: 0, nomes: new Map() });
      const g = grupos.get(chave);
      g.quantidade++;
      const nome = (p.fornecedorNome || "").trim();
      if (nome) g.nomes.set(nome, (g.nomes.get(nome) || 0) + 1);
    }
  }
  return [...grupos.values()]
    .map(({ chave, quantidade, nomes }) => ({
      chave,
      quantidade,
      nome: [...nomes.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || "—",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Só os pedidos daquele fornecedor — e a linha da RM REFEITA em cima do que sobrou.
 *
 * ⚠⚠ REFAZER A CONTA É O PONTO. Filtrar só a lista visível deixaria o cabeçalho da RM dizendo o
 * total, a situação e a próxima data de TODOS os pedidos, inclusive os dos outros fornecedores que
 * a pessoa acabou de tirar da tela. Um cabeçalho que descreve o que não está embaixo dele é pior
 * que não ter filtro.
 *
 * ⚠ RM que fica sem nenhum pedido some da lista: ela não tem nada a ver com esse fornecedor.
 */
export function filtrarPorFornecedor(linhas, fornecedor) {
  if (!fornecedor) return linhas || [];
  return ordenarLinhas(
    (linhas || [])
      .map((l) => ({ ...l, pedidos: (l.pedidos || []).filter((p) => chaveFornecedor(p) === fornecedor) }))
      .filter((l) => l.pedidos.length > 0)
      .map(fecharLinha)
  );
}

/** Os contadores do cabeçalho — quantas RMs em cada situação. */
export function resumoPorSituacao(linhas) {
  const contagem = Object.fromEntries(Object.keys(SITUACAO).map((k) => [k, 0]));
  for (const l of linhas || []) contagem[l.situacao] = (contagem[l.situacao] || 0) + 1;
  return {
    ...contagem,
    rms: (linhas || []).length,
    pedidos: (linhas || []).reduce((s, l) => s + l.pedidos.length, 0),
    // ⚠ "Pendentes" é o que ainda pode ser resolvido hoje. O que chegou sai da conta mesmo tendo
    // atrasado — cobrar o fornecedor por isso agora não muda nada — e o encerrado sai porque o
    // Omie já declarou que dele não vem mais nada.
    pendentes: (linhas || []).reduce((s, l) => s + l.pedidos.filter(aindaAperta).length, 0),
  };
}

/**
 * O que a tela mostra, dado o filtro escolhido.
 *
 * ⚠⚠ O PADRÃO ESCONDE O QUE JÁ CHEGOU, e isso veio de medir, não de gosto. Na primeira versão a
 * tela renderizou TODAS as RMs abertas e saiu com 31 mil pixels de altura: das 236 RMs com pedido,
 * **168 já tinham chegado** (71%) e só 68 pedidos estavam pendentes, em 53 RMs. Uma parede onde
 * três quartos é caso encerrado não responde "o que aperta" — obriga a rolar por cima do que já
 * foi resolvido para achar o que não foi.
 *
 * ⚠ Mas "chegou" não SOME: continua atrás do próprio filtro, e "todas" mostra a lista inteira —
 * o pedido era ver todas as RMs de uma vez, e essa porta fica aberta.
 */
export function filtrarLinhas(linhas, filtro) {
  const todas = linhas || [];
  if (filtro === "TODAS") return todas;
  if (!filtro || filtro === "PENDENTES") return todas.filter(aindaAperta);
  return todas.filter((l) => l.situacao === filtro);
}
