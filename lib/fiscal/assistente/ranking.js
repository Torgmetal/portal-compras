// ─── O RANKING DOS DISPOSITIVOS — PURO, E POR ISSO TESTÁVEL ──────────────────
//
// ⚠⚠ O COLABORADOR NÃO FALA A LÍNGUA DA LEI, E ESSE É O PROBLEMA CENTRAL DA RECUPERAÇÃO. Ele
// escreve *"o cliente comprou o aço e o fornecedor entregou aqui"*; a lei escreve *"industrialização
// por conta de terceiros"* e *"o estabelecimento fornecedor remeterá a mercadoria diretamente ao
// industrializador"*. Sem uma ponte entre os dois vocabulários, a busca lexical devolve nada — e
// "nada" seria lido como "não há previsão legal", que é a pior saída possível.
//
// O Codex pediu exatamente isto: *"vocabulário controlado de sinônimos das operações"*. Ele é
// CONTROLADO — escrito à mão, revisável no PR — e não um modelo de embeddings que ninguém audita.

const SEM_ACENTO = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** ⚠ Palavras que aparecem em quase todo dispositivo e por isso não distinguem nada. */
const VAZIAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "OU", "A", "O", "AS", "OS", "EM", "NO", "NA",
  "PARA", "POR", "COM", "QUE", "SE", "AO", "AOS", "UM", "UMA", "SER", "SEU", "SUA", "PELO", "PELA", "QUAL",
  "QUANDO", "COMO", "MEU", "MINHA", "VOU", "TENHO", "PRECISO", "FAZER", "USAR", "ESTA", "ESTE", "ISSO"]);

/**
 * ⚠⚠ A PONTE É DO JEITO QUE A PESSOA FALA → PARA O JEITO QUE A LEI ESCREVE, nunca o contrário.
 * Cada entrada é um gatilho em linguagem de chão de fábrica e os termos legais que ele deve trazer.
 */
export const VOCABULARIO = [
  { gatilhos: ["CLIENTE COMPROU", "CLIENTE COMPRA", "ENCOMENDANTE", "MATERIA PRIMA DO CLIENTE", "FATURAMENTO DIRETO"],
    termos: ["INDUSTRIALIZACAO", "ENCOMENDANTE", "AUTOR", "ENCOMENDA"] },
  { gatilhos: ["FORNECEDOR ENTREGOU", "ENTREGA DIRETA", "ENTREGOU DIRETO", "ENTREGOU NA TORG", "ENTREGA NA TORG"],
    termos: ["INDUSTRIALIZADOR", "REMETERA", "DIRETAMENTE", "FORNECEDOR", "ESTABELECIMENTO"] },
  { gatilhos: ["JATEAMENTO", "PINTURA", "GALVANIZACAO", "BENEFICIAMENTO", "TRATAMENTO"],
    termos: ["INDUSTRIALIZACAO", "BENEFICIAMENTO", "RETORNO", "SUSPENSAO"] },
  { gatilhos: ["MANDAR PARA", "ENVIAR MATERIAL", "REMESSA", "MANDAR MATERIAL"],
    termos: ["REMESSA", "SAIDA", "SUSPENSAO", "RETORNO"] },
  { gatilhos: ["DEVOLVER", "DEVOLUCAO", "RETORNAR"], termos: ["RETORNO", "DEVOLUCAO"] },
  { gatilhos: ["LOCACAO", "ALUGUEL", "COMODATO"], termos: ["LOCACAO", "COMODATO", "NAO CONSIDERA"] },
  { gatilhos: ["DOIS CAMINHOES", "VARIOS CAMINHOES", "TRANSPORTE PARCELADO", "CARREGAMENTO PARCIAL"],
    termos: ["TRANSPORTE", "PARCELADA", "REMESSA", "GLOBAL"] },
  { gatilhos: ["NOTA COMPLEMENTAR", "NF COMPLEMENTAR", "COMPLEMENTAR"],
    termos: ["COMPLEMENTAR", "IMPOSTO", "DESTAQUE", "REGULARIZACAO"] },
  { gatilhos: ["ALIQUOTA", "IMPOSTO INTERESTADUAL", "OUTRO ESTADO", "VENDER PARA"],
    termos: ["ALIQUOTA", "INTERESTADUAL", "OPERACOES"] },
  { gatilhos: ["VENDA A ORDEM", "VENDA POR CONTA E ORDEM", "ADQUIRENTE"],
    termos: ["ADQUIRENTE", "ORDEM", "ENCOMENDANTE"] },
];

/** Os termos que a consulta realmente vai procurar: os do usuário + os que o vocabulário traz. */
export function expandir(consulta) {
  const bruto = SEM_ACENTO(consulta);
  const proprios = bruto.split(/[^A-Z0-9]+/).filter((t) => t.length > 2 && !VAZIAS.has(t));
  const trazidos = [];
  for (const v of VOCABULARIO) {
    if (v.gatilhos.some((g) => bruto.includes(g))) trazidos.push(...v.termos);
  }
  return [...new Set([...proprios, ...trazidos])];
}

/** ⚠ Número de artigo citado à mão ("art. 406", "artigo 406") é a pista mais forte que existe. */
function artigosCitados(consulta) {
  return [...SEM_ACENTO(consulta).matchAll(/ART(?:IGO|\.)?\s*(\d{1,4})/g)].map((m) => m[1]);
}

/**
 * ⚠⚠ O RÓTULO PESA MUITO MAIS QUE O CORPO. "Artigo 406" no rótulo é o dispositivo; "artigo 406"
 * citado dentro do texto de outro artigo é referência cruzada — útil, mas não é o alvo.
 * ⚠ E o texto conta OCORRÊNCIA ÚNICA por termo: sem isso, o dispositivo mais COMPRIDO ganharia
 * sempre, porque repete qualquer palavra mais vezes. O maior aqui tem 5.228 caracteres.
 */
export function pontuar(dispositivo, termos, artigos) {
  const rotulo = SEM_ACENTO(dispositivo.rotulo);
  const texto = SEM_ACENTO(dispositivo.texto);
  let p = 0;
  for (const a of artigos) {
    if (String(dispositivo.artigo ?? "") === a) p += 40;
    else if (rotulo.includes(a)) p += 20;
  }
  for (const t of termos) {
    if (rotulo.includes(t)) p += 6;
    if (texto.includes(t)) p += 1;
  }
  return p;
}

/**
 * ⚠⚠⚠ O PISO NÃO É ARBITRADO — FOI MEDIDO CONTRA O CORPUS REAL EM 23/09/2026, e ele existe porque
 * a busca sem piso tinha DOIS falsos positivos, e o segundo era perigoso:
 *
 *   "A QWS comprou o aço e o fornecedor entregou na TORG"  → art. 406, III   p=6  ✅
 *   "material para jateamento e depois pintura"            → art. 409, 402   p=5  ✅
 *   "vender estrutura para o Rio Grande do Sul"            → art. 52, § 2º   p=4  ✅
 *   "impressora em LOCAÇÃO, preciso devolver"              → art. 408, II    p=3  ❌
 *   "qual a receita de bolo de cenoura"                    → art. 131, § 3º  p=1  ❌
 *
 * ⚠⚠ O CASO DA LOCAÇÃO É O QUE JUSTIFICA O PISO. Não existe UMA linha sobre locação nesta base —
 * e a busca devolvia um artigo de INDUSTRIALIZAÇÃO, que não tem nada a ver. Um dispositivo errado
 * é muito pior que nenhum: nenhum vira "não tenho fundamento aqui"; errado vira uma resposta com
 * cara de fundamentada. ⚠ E "receita" casou com bolo porque no RICMS "receita" é faturamento — o
 * vocabulário do fisco e o da cozinha se cruzam, e ninguém adivinharia isso sem medir.
 *
 * ⚠ Rótulo de dispositivo é "Artigo 406, II": ele não contém palavra de domínio, só número. Por
 * isso, na prática, a pontuação de uma consulta em palavras É a contagem de termos distintos que
 * casaram — e o piso 4 quer dizer "pelo menos quatro termos da pergunta aparecem neste texto".
 */
export const PISO = 4;

export function ordenarDispositivos(corpus, consulta, { limite = 6, piso = PISO } = {}) {
  const termos = expandir(consulta);
  const artigos = artigosCitados(consulta);
  if (!termos.length && !artigos.length) return [];
  return (corpus ?? [])
    .map((d) => ({ d, p: pontuar(d, termos, artigos) }))
    .filter((x) => x.p >= piso)
    // ⚠ Desempate ESTÁVEL pela ordem do documento: sem ele, duas execuções com a mesma pergunta
    // podiam devolver dispositivos em ordem diferente, e a rastreabilidade do §22 pede o contrário.
    .sort((a, b) => b.p - a.p || (a.d.ordem ?? 0) - (b.d.ordem ?? 0) || a.d.id.localeCompare(b.d.id))
    .slice(0, limite)
    .map((x) => x.d);
}
