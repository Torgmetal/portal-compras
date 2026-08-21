import "server-only";
import { prisma } from "./prisma";
import { parseIndicesDoNome } from "./match-certificados";

// CERTIFICADO ANEXADO ↔ FICHA DO CMR, pelo índice R.
//
// Quem monta o data book anexa o PDF do certificado, e o arquivo se chama pelo índice R:
// "R 260620.pdf". O `DocumentoQualidade` nasce com `nome: "R 260620"` e mais nada — sem material,
// sem corrida, sem número de certificado. O CMR importado do Almoxarifado tem tudo isso indexado
// pelo MESMO R.
//
// Isso conserta duas coisas ao mesmo tempo:
//
//  1. a LISTAGEM (tela e PDF), que mostrava "R 260620 | — | — | Sem validade";
//  2. a CLASSIFICAÇÃO por seção. `classificarMaterial` lê o NOME, e "R 260527" não tem como dizer
//     se é aço, tinta, parafuso ou arame — cai no padrão ESTRUTURAL e vai parar na §04. Era por
//     isso que a §05 da OP-070 (13 fixadores) e a §15 da OP-083 (4 tintas) apareciam como se
//     fossem material estrutural.
//
// 🚫 Não escreve nada. Só resolve na leitura — o vínculo do usuário continua sendo o que ele fez.

/** Nome que é SÓ um índice R ("R 260620", "R260620", "R 260542 á 543"). */
export const RX_NOME_R = /^r[\s._-]*\d{4,}/i;

/**
 * O índice R de um documento, ou null.
 *
 * ⚠ Só extrai número quando o nome é MESMO um índice R. Sair pegando dígito de nome qualquer faria
 * "T70_-_ART_assinado" virar o R 70 de outra obra.
 */
export function rDoDoc(d) {
  if (d?.importRef) return String(d.importRef);
  if (!RX_NOME_R.test(String(d?.nome || "").trim())) return null;
  return parseIndicesDoNome(d.nome)[0] || null;
}

/**
 * Busca as fichas do CMR dos R presentes na lista.
 * @param {Array} docs documentos que podem ter R
 * @param {string|null} opNumero desempate: a ficha da própria OP ganha
 * @returns {Promise<Map<string, object>>} R → ficha
 */
export async function fichasPorR(docs, opNumero = null) {
  const rs = [...new Set((docs || []).map(rDoDoc).filter(Boolean))];
  const mapa = new Map();
  if (!rs.length) return mapa;

  const fichas = await prisma.documentoQualidade.findMany({
    where: { origem: "importacao_planilha", importRef: { in: rs }, ativo: true },
    select: {
      importRef: true, nome: true, numeroDocumento: true, numeroCorrida: true,
      norma: true, fornecedor: true, dataEmissao: true, dataValidade: true, opNumero: true,
    },
  });
  for (const f of fichas) {
    // o mesmo R pode ter sido usado em duas obras; a ficha da OP do data book manda
    const atual = mapa.get(f.importRef);
    if (!atual || (opNumero && f.opNumero === opNumero && atual.opNumero !== opNumero)) mapa.set(f.importRef, f);
  }
  return mapa;
}

/** Documento com o que faltava preenchido pela ficha do CMR daquele R. */
export function comFicha(d, mapa) {
  const r = rDoDoc(d);
  const f = r ? mapa.get(r) : null;
  if (!f) return r ? { ...d, indiceR: r } : d;
  return {
    ...d,
    indiceR: r,
    // o nome do anexo é só o R; o do CMR descreve o material — esse é o que informa
    nome: RX_NOME_R.test(String(d.nome || "").trim()) && f.nome ? f.nome : d.nome,
    numeroDocumento: d.numeroDocumento || f.numeroDocumento,
    numeroCorrida: d.numeroCorrida || f.numeroCorrida,
    norma: d.norma || f.norma,
    fornecedor: d.fornecedor || f.fornecedor,
    dataEmissao: d.dataEmissao || f.dataEmissao,
    dataValidade: d.dataValidade || f.dataValidade,
  };
}

/** Atalho: resolve as fichas e devolve a lista já enriquecida. */
export async function enriquecerComFicha(docs, opNumero = null) {
  const mapa = await fichasPorR(docs, opNumero);
  return (docs || []).map((d) => comFicha(d, mapa));
}
