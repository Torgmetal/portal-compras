// ─── QUEM CASA O PDF DO FORNECEDOR COM AS LINHAS DA RM ────────────────────────
//
// ⚠⚠ A REGRA DE HOJE CONTINUA VALENDO, INTEIRA. Matheus (21/09/2026): "só não quebre ou piore o
// jeito que é feito hoje". O casamento por PALAVRAS não foi substituído — virou um dos caminhos.
// Tudo que casa hoje por texto continua casando; a assinatura dimensional só ACRESCENTA pares que
// o texto não alcançava (na T122-001 eram 9 de 9).
//
// ⚠⚠ O PESO NÃO REPROVA NINGUÉM. Matheus, no mesmo dia: "as diferenças de peso vão acontecer por
// ser aço, nunca bate exatamente o do pedido, às vezes vem um pouco mais ou um pouco a menos". A
// revisão externa sugeria descartar o par acima de 5% — aqui isso reprovaria casamento CERTO. Ele
// entra somando confiança quando bate e some quando não bate. Quem discrimina é a assinatura.
//
// ⚠⚠ O SUCESSO NÃO É "CASOU TUDO", É "NÃO CASOU ERRADO". Item não casado o fornecedor resolve num
// clique, na tela de associação; item casado errado vira preço errado no item errado do pedido —
// e disso ninguém desconfia até o material chegar.
import { mesmaPeca } from "./cotacao-assinatura";

/** Confiança máxima do caminho por TEXTO. Fica abaixo do piso da assinatura, de propósito. */
const TETO_TEXTO = 0.79;
/** Piso do caminho por ASSINATURA — casar dimensão é evidência mais forte que repetir palavra. */
const PISO_ASSINATURA = 0.8;
/** Corte do texto. É o MESMO de hoje (`scoreMatchTokens` > 0.5), e mudá-lo mudaria o que já funciona. */
const CORTE_TEXTO = 0.5;
/**
 * Margem que separa o melhor candidato do segundo.
 *
 * ⚠ Sem ela, dois itens igualmente plausíveis viram uma escolha de moeda — e a moeda decide um
 * preço de pedido. Empate manda para a associação manual, que é onde a dúvida deve morrer.
 */
const MARGEM = 0.05;

/**
 * O quanto a quantidade corrobora — 1 quando praticamente idêntica, 0 quando muito longe.
 *
 * ⚠ Tolerância LARGA e queda suave: 2% ainda vale cheio, e só deixa de somar além de 15%. Aço
 * não fecha na balança como fecha no desenho.
 */
export function proximidadeQtd(a, b) {
  const x = Number(a), y = Number(b);
  if (!(x > 0) || !(y > 0)) return 0;
  const d = Math.abs(x - y) / y;
  if (d <= 0.02) return 1;
  if (d >= 0.15) return 0;
  return (0.15 - d) / 0.13;
}

/** A confiança de um par, ou `null` quando ele nem é candidato. */
function confianca(itPdf, linha, scoreTexto) {
  // ⚠ A RM guarda comprimento e largura em campos PRÓPRIOS, fora da descrição — e é o que
  // distingue duas chapas da mesma espessura. Por isso vai o item inteiro, não só o texto.
  const mesma = mesmaPeca(itPdf, {
    descricao: linha.descricao, comprimento: linha.comprimento, largura: linha.largura,
  });
  // ⚠⚠ ASSINATURA QUE DIZ "NÃO" VETA, mesmo com as palavras parecidas. É o caso
  // `W200 x 26,6` × `W200 x 52,0`: descrições quase iguais, perfis que pesam o dobro um do
  // outro. Isto não é "piorar o de hoje" — é impedir o casamento errado que o texto sozinho
  // deixaria passar.
  if (mesma === false) return null;

  const texto = scoreTexto(itPdf.descricao, linha.descricao);
  const qtd = proximidadeQtd(itPdf.qtd ?? itPdf.qtdCotada, linha.qtdRm);

  if (mesma === true) {
    return { valor: PISO_ASSINATURA + qtd * 0.15 + texto * 0.05, via: "assinatura" };
  }
  // Família desconhecida dos dois lados: exatamente o comportamento de hoje.
  return texto > CORTE_TEXTO ? { valor: Math.min(texto, TETO_TEXTO), via: "texto" } : null;
}

/** Todos os pares possíveis, já pontuados. Em função própria para `casarItens` caber no teto. */
function pontuarPares(itensPdf, linhas, scoreTexto) {
  const candidatos = [];
  (itensPdf || []).forEach((itPdf, idxPdf) => {
    (linhas || []).forEach((linha, idxLinha) => {
      // ⚠ Linha recusada ("Não tenho") ou já preenchida à mão não é destino: casar nela
      // sobrescreveria, em silêncio, o que o fornecedor acabou de decidir.
      if (linha.semEstoque || String(linha.precoUnit ?? "").trim()) return;
      const c = confianca(itPdf, linha, scoreTexto);
      if (c) candidatos.push({ idxPdf, idxLinha, via: c.via, confianca: c.valor });
    });
  });
  return candidatos;
}

/**
 * As confianças de cada item do PDF, EM ORDEM DECRESCENTE — para a regra de margem.
 *
 * ⚠⚠ A SEGUNDA MELHOR É A DA POSIÇÃO 1, NÃO "a primeira com valor diferente". Eu tinha escrito
 * assim e o teste do empate pegou: duas linhas idênticas dão a MESMA confiança, o filtro por valor
 * apagava a rival e o par passava como se fosse escolha óbvia — exatamente o chute que a margem
 * existe para impedir.
 */
function agruparPorPdf(candidatos) {
  const mapa = new Map();
  for (const c of candidatos) {
    const lista = mapa.get(c.idxPdf) || [];
    lista.push(c.confianca);
    mapa.set(c.idxPdf, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => b - a);
  return mapa;
}

/**
 * Casa itens do PDF com linhas da RM.
 *
 * ⚠⚠ A ESCOLHA É GLOBAL, NÃO NA ORDEM EM QUE OS ITENS CHEGAM. O laço de hoje pega o melhor para
 * cada item do PDF na ordem do arquivo, e o primeiro pode levar a linha que era claramente de
 * outro. Aqui todos os pares são pontuados, ordenados por confiança e distribuídos um a um.
 *
 * @param {{descricao?:string, qtd?:number}[]} itensPdf
 * @param {{id:string, descricao?:string, qtdRm?:number, precoUnit?:string, semEstoque?:boolean}[]} linhas
 * @param {{ scoreTexto: (a:string,b:string)=>number }} deps a função de hoje, injetada
 * @returns {{pares: {idxPdf:number, idxLinha:number, via:string, confianca:number}[],
 *            ambiguos: number[], sobraram: number[]}}
 */
export function casarItens(itensPdf, linhas, { scoreTexto }) {
  const candidatos = pontuarPares(itensPdf, linhas, scoreTexto);
  const melhorAlternativa = agruparPorPdf(candidatos);
  candidatos.sort((a, b) => b.confianca - a.confianca);
  const pdfUsado = new Set();
  const linhaUsada = new Set();
  const pares = [];
  const ambiguos = new Set();

  for (const c of candidatos) {
    if (pdfUsado.has(c.idxPdf) || linhaUsada.has(c.idxLinha)) continue;
    const segundo = (melhorAlternativa.get(c.idxPdf) || [])[1] ?? 0;
    if (c.confianca - segundo < MARGEM && segundo > 0) {
      ambiguos.add(c.idxPdf);
      continue;
    }
    pares.push(c);
    pdfUsado.add(c.idxPdf);
    linhaUsada.add(c.idxLinha);
  }

  const sobraram = (itensPdf || []).map((_, i) => i).filter((i) => !pdfUsado.has(i));
  return { pares, ambiguos: [...ambiguos].filter((i) => !pdfUsado.has(i)), sobraram };
}
