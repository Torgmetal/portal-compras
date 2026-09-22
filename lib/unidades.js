// ─── UNIDADE DE MEDIDA: A DO DOCUMENTO E A DA RM ─────────────────────────────
//
// Matheus (22/09/2026): *"precisamos criar uma opção de converter unidades de medida quando eu for
// gerar pedido de uma cotação aprovada. Exemplo fixadores: geralmente orçamos em unidades, tipo
// 2500 parafusos, e os fornecedores mandam a cotação em CT — nesse caso seriam 25 CT"*.
//
// ⚠⚠ A INVARIANTE É O TOTAL. `2500 × R$ 0,50` e `25 × R$ 50,00` são o mesmo dinheiro; o que muda é
// a forma de contar. Converter a quantidade SEM converter o preço junto é exatamente o defeito que
// `lib/pedido-itens.js` existe para ter consertado — 136 de 578 itens vencedores saíram divergentes
// em 04/09/2026. Por isso `converterParaRM` devolve os DOIS e `totalBate` é testado.
//
// ⚠⚠ O QUE FICA GRAVADO É O CANÔNICO — quantidade e preço na unidade da RM. É o que faz o resto do
// portal continuar certo sem tocar em nada: o mapa compara preço, `sugerir-vencedores` escolhe o
// menor e `pedido-itens` monta o pedido, todos já na mesma base. Guardar "25 CT" e converter na
// leitura obrigaria seis consumidores a lembrar da conversão, e o primeiro que esquecesse erraria
// por 100×, em silêncio.
//
// ⚠ Os números do documento não se perdem: saem de volta por `paraODocumento`, e o PDF do
// fornecedor continua anexado à cotação.

/**
 * O dicionário canônico.
 *
 * ⚠⚠ SÃO 63 GRAFIAS PARA ~12 UNIDADES (medido na `RMItem` em 22/09/2026): "PEÇA" aparece como
 * `Peça`, `Pç(s)`, `PÇ`, `PEÇA`, `Peças`, `Pç`, `peça(s)`, `PEÇAS`; "barra" em quatro formas.
 * Qualquer tabela de conversão indexada pelo texto cru erra antes de começar.
 */
const CANONICAS = [
  { codigo: "UN", nome: "Unidade", sinonimos: ["UN", "UND", "UNID", "UNIDADE", "UNIDADES"] },
  { codigo: "PC", nome: "Peça", sinonimos: ["PC", "PCS", "PECA", "PECAS", "PEC", "PCA", "PCAS"] },
  { codigo: "CT", nome: "Cento (100 un)", sinonimos: ["CT", "CTO", "CENTO", "CENTOS", "CEM"] },
  { codigo: "MI", nome: "Milheiro (1000 un)", sinonimos: ["MI", "MIL", "MILHEIRO", "MILHEIROS"] },
  { codigo: "DZ", nome: "Dúzia (12 un)", sinonimos: ["DZ", "DUZIA", "DUZIAS", "DZA"] },
  { codigo: "PAR", nome: "Par", sinonimos: ["PAR", "PARES"] },
  { codigo: "KG", nome: "Quilo", sinonimos: ["KG", "QUILO", "QUILOS", "KILO", "KILOS"] },
  { codigo: "TON", nome: "Tonelada", sinonimos: ["TON", "TONELADA", "TONELADAS", "TN", "T"] },
  { codigo: "M", nome: "Metro", sinonimos: ["M", "MT", "MTS", "METRO", "METROS", "ML", "METROLINEAR", "METROSLINEARES"] },
  { codigo: "M2", nome: "Metro quadrado", sinonimos: ["M2", "M²", "METROQUADRADO", "METROSQUADRADOS"] },
  { codigo: "BR", nome: "Barra", sinonimos: ["BR", "BARRA", "BARRAS"] },
  { codigo: "L", nome: "Litro", sinonimos: ["L", "LT", "LTS", "LITRO", "LITROS"] },
  { codigo: "CX", nome: "Caixa", sinonimos: ["CX", "CAIXA", "CAIXAS"] },
  { codigo: "PCT", nome: "Pacote", sinonimos: ["PCT", "PACOTE", "PACOTES"] },
  { codigo: "FD", nome: "Fardo", sinonimos: ["FD", "FARDO", "FARDOS"] },
  { codigo: "RL", nome: "Rolo", sinonimos: ["RL", "ROLO", "ROLOS"] },
  { codigo: "CJ", nome: "Conjunto", sinonimos: ["CJ", "CONJ", "CONJUNTO", "CONJUNTOS", "KIT", "KITS"] },
];

/** ⚠ Tira acento, pontuação e o plural entre parênteses: "Pç(s)" e "PEÇAS" caem no mesmo lugar. */
const enxugar = (v) => String(v ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase()
  .replace(/\(S\)/g, "")
  .replace(/[^A-Z0-9²]/g, "")
  .replace(/²/g, "2");

const PORSINONIMO = new Map();
for (const u of CANONICAS) for (const s of u.sinonimos) PORSINONIMO.set(enxugar(s), u.codigo);

/**
 * A unidade canônica de um texto qualquer — ou `null` quando não é nenhuma das conhecidas.
 *
 * ⚠⚠ `null` E NÃO UM CHUTE. O `normalizeUnidade` do pedido faz `substring(0, 6)` no que não
 * reconhece, e é assim que "LATA 2,80L" virou "LATA280" no Omie. Aqui, desconhecido é desconhecido:
 * quem chama decide o que fazer, em vez de receber uma sigla inventada que parece válida.
 *
 * ⚠ "LATA 18L" e afins NÃO são unidade de conversão — são embalagem, com volume dentro do nome. Não
 * entram no dicionário de propósito.
 */
export function unidadeCanonica(texto) {
  const limpo = enxugar(texto);
  if (!limpo) return null;
  return PORSINONIMO.get(limpo) || null;
}

export const NOME_DA_UNIDADE = Object.fromEntries(CANONICAS.map((u) => [u.codigo, u.nome]));
export const UNIDADES_CANONICAS = CANONICAS.map((u) => ({ codigo: u.codigo, nome: u.nome }));

/**
 * Quantas unidades da RM cabem em UMA unidade cotada.
 *
 * ⚠⚠ ESTA É A DEFINIÇÃO DO FATOR, E ELA TEM UM SENTIDO SÓ. "1 CT = 100 UN" → fator 100, com a RM em
 * UN. Com a RM em CT e o fornecedor em UN, o fator é 0,01. Deixar o sentido ambíguo é o caminho
 * mais curto para multiplicar onde se devia dividir.
 */
const EM_UNIDADES = { UN: 1, PC: 1, CT: 100, MI: 1000, DZ: 12, PAR: 2 };

/**
 * O fator FIXO entre duas unidades — ou `null` quando ele depende do item.
 *
 * ⚠⚠ METADE DAS CONVERSÕES QUE O MATHEUS PEDIU NÃO CABE EM TABELA. "Metro linear para unidade", na
 * telha, depende do COMPRIMENTO daquela telha; "quilo para unidade", do peso da peça. Devolver 1
 * nesses casos seria inventar uma equivalência — por isso é `null`, e quem chama pede o número a
 * quem tem o documento na mão.
 */
export function fatorFixo(unidadeCotada, unidadeRM) {
  const de = unidadeCanonica(unidadeCotada);
  const para = unidadeCanonica(unidadeRM);
  if (!de || !para) return null;
  if (de === para) return 1;
  const a = EM_UNIDADES[de];
  const b = EM_UNIDADES[para];
  if (!a || !b) return null;          // ML↔UN, KG↔UN: depende do item
  return a / b;
}

/** Duas casas — a mesma conta de `lib/pedido-itens.js`, pelo mesmo motivo (o centavo do Omie). */
const emCentavos = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

/**
 * A UNIDADE EM QUE O ITEM DA RM É REALMENTE COTADO E PEDIDO.
 *
 * ⚠⚠ ITEM COM PESO É COTADO EM KG, NÃO NA UNIDADE DA COLUNA (achado do Codex, 22/09/2026). A
 * coluna `unidade` pode dizer "UN" enquanto a tela do fornecedor, o modal do comprador e o pedido
 * do Omie tratam o item em KG — quem decide é `peso > 0`. Lendo a coluna crua, a conversão comparava
 * "UN" com "UN", concluía que não havia o que converter, e gravava quantidade e preço POR UNIDADE
 * em algo que todo o resto do portal lê como QUILO.
 *
 * ⚠ A regra já estava escrita à mão em `page.js` da RM, em `pedido-itens.js` e no formulário do
 * fornecedor. Passou a morar aqui para não nascer uma quarta cópia — defesa em profundidade só
 * vale quando as camadas concordam (a lição do "TOTAL.:" da Lista de Expedição).
 *
 * ⚠ Outras telas repetem a mesma conta só para RÓTULO; não foram trocadas porque não decidem
 * conversão e estão fora desta tarefa. Fica anotado em `docs/revisao-codex-claude.md`.
 */
export const unidadeEfetivaDoItem = (item) =>
  ((Number(item?.peso) || 0) > 0 ? "KG" : (item?.unidade || "KG"));


/**
 * O documento do fornecedor traduzido para a base da RM.
 *
 * ⚠ A quantidade MULTIPLICA e o preço DIVIDE pelo mesmo fator — é isso que preserva o total, e é
 * por isso que os dois saem juntos desta função em vez de cada tela fazer a sua metade.
 *
 * @returns {{qtd:number, preco:number, total:number}}
 */
export function converterParaRM({ qtd, preco, fator }) {
  const f = Number(fator);
  if (!Number.isFinite(f) || f <= 0) return { qtd: Number(qtd) || 0, preco: Number(preco) || 0, total: emCentavos((Number(qtd) || 0) * (Number(preco) || 0)) };
  const q = (Number(qtd) || 0) * f;
  const p = (Number(preco) || 0) / f;
  return { qtd: q, preco: p, total: emCentavos(q * p) };
}

/** O caminho de volta — o que o fornecedor escreveu, para a tela mostrar e conferir. */
export function paraODocumento({ qtd, preco, fator }) {
  const f = Number(fator);
  if (!Number.isFinite(f) || f <= 0) return { qtd: Number(qtd) || 0, preco: Number(preco) || 0 };
  return { qtd: (Number(qtd) || 0) / f, preco: (Number(preco) || 0) * f };
}

/**
 * O TOTAL BATE AO CENTAVO?
 *
 * ⚠⚠ É A TRAVA DA CONVERSÃO. Fator que não divide redondo (R$ 49,99 o cento) deixa dízima no preço
 * unitário; o que não pode é o TOTAL mudar. Se não bater, quem chama recusa ou avisa — perder
 * centavo em silêncio numa conversão é como a conferência contra a nota começa a divergir.
 */
export const totalBate = (a, b) => emCentavos(a) === emCentavos(b);

/**
 * A conversão inteira, conferida — o que a rota chama.
 *
 * @returns {{ok:true, qtd:number, preco:number, total:number}|{erro:string}}
 */
export function conversaoDoItem({ qtdDoc, precoDoc, fator, unidadeCotada, unidadeRM }) {
  const f = Number(fator);
  if (!Number.isFinite(f) || f <= 0) return { erro: "Informe quantas unidades da RM cabem em 1 " + (unidadeCanonica(unidadeCotada) || "unidade cotada") + "." };
  const doDocumento = emCentavos((Number(qtdDoc) || 0) * (Number(precoDoc) || 0));
  const bruto = converterParaRM({ qtd: qtdDoc, preco: precoDoc, fator: f });

  // ⚠⚠ A CONFERÊNCIA É SOBRE O QUE VAI SER GRAVADO, NÃO SOBRE O CÁLCULO CRU (achado do Codex,
  // 22/09/2026). Antes esta função conferia o total com a quantidade em precisão total e QUEM CHAMAVA
  // arredondava depois — então o total conferido não era o total persistido. Com 130 M a R$ 10 e
  // fator 0,1923 (o máximo que o campo aceita), fechava em R$ 1.300,00 aqui e gravava R$ 1.300,05.
  //
  // ⚠⚠ E O PREÇO SAI DA QUANTIDADE ARREDONDADA, NÃO DO FATOR. É o que torna a invariante
  // ESTRUTURAL: o total gravado é o total do documento por construção, em vez de depender de o fator
  // dividir redondo. De quebra, o campo de 4 casas volta a servir — 25/130 é dízima e nenhuma
  // quantidade de casas a expressaria.
  //
  // ⚠ Isso NÃO afrouxa a proteção contra fator errado: o teste do total nunca pegou fator errado
  // (fator 0,5 também fechava em R$ 1.300,00, com a quantidade errada). Quem pega isso é a prévia na
  // tela, que mostra "130 M → 25 UN" antes de gravar.
  const qtd = emCentavos(bruto.qtd);
  const preco = qtd > 0 ? doDocumento / qtd : 0;
  const total = emCentavos(qtd * preco);
  if (!totalBate(doDocumento, total)) {
    return { erro: `A conversão mudaria o total da proposta (R$ ${doDocumento.toFixed(2)} → R$ ${total.toFixed(2)}). Confira a unidade e o fator.` };
  }
  // ⚠⚠ O FATOR DEVOLVIDO É O EFETIVO, NÃO O DIGITADO. É ele que vai ao banco, e é por ele que a tela
  // reconstrói depois "25 CT a R$ 49,99" a partir dos "2500 UN a R$ 0,4999" gravados. O digitado
  // pode ser uma aproximação de 4 casas (25/130 é dízima): guardado assim, a volta não fecha e a
  // proposta reaberta arrasta centavo a cada rodada. O efetivo inverte exato por construção.
  const fatorEfetivo = Number(qtdDoc) > 0 ? qtd / Number(qtdDoc) : f;
  return { ok: true, qtd, preco, total, fator: fatorEfetivo, unidadeCotada: unidadeCanonica(unidadeCotada), unidadeRM: unidadeCanonica(unidadeRM) };
}
