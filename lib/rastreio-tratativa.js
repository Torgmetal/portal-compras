import "server-only";

// ─── QUANDO UM MATERIAL ESTÁ "EM DIA" ─────────────────────────────────────────
// Vitor (22/08/2026): "o que precisamos garantir é que todos os materiais listados para as ops
// estejam com as informações em dia".
//
// Dois níveis, porque são cobranças diferentes:
//
//   RASTREABILIDADE (bloqueia)  arquivo do certificado + nº do certificado + corrida.
//                               É o que o data book precisa e o que a ISO 9001 exige para provar
//                               de onde veio o aço. Sem isso a obra não fecha.
//   RECEBIMENTO (informa)       NF, pedido e data. Diz de qual compra o material veio. Falta
//                               disso é buraco de cadastro, não impede o data book — e material
//                               de estoque legitimamente não tem pedido nenhum.
//
// Misturar os dois faria a tela cobrar pedido de material de estoque para sempre.

export const SITUACOES = {
  ESTOQUE: {
    rotulo: "Material de estoque",
    ajuda: "Saiu do estoque. O certificado é o da compra original — informe o R de origem.",
    exigeROrigem: true,
    // ⚠ resolve DE VERDADE: o certificado existe, só está noutro R. Mas só vale se o R de
    // origem realmente tiver certificado — apontar para um R vazio não rastreia nada.
    resolve: true,
  },
  ARQUIVO_FISICO: {
    rotulo: "Certificado em arquivo físico",
    ajuda: "O certificado existe em papel e ainda não foi digitalizado na pasta do Almoxarifado.",
    resolve: false,
  },
  AGUARDANDO_CERTIFICADO: {
    rotulo: "Aguardando certificado",
    ajuda: "O certificado ainda não chegou. Em cobrança.",
    resolve: false,
  },
};

// ⚠ A LISTA ACIMA É FECHADA, E ISSO NÃO É DETALHE DE IMPLEMENTAÇÃO.
//
// Vitor (22/08/2026): "não podemos em hipótese alguma mencionar que o fornecedor não entrega
// certificado". Registrar isso deixaria escrito, num documento que auditor e cliente podem ler,
// que a Torg recebeu material sabendo que o certificado não viria — uma não conformidade
// declarada pela própria empresa, e uma prova contra nós num eventual problema com a estrutura.
//
// Por isso toda situação aqui descreve ONDE o certificado está (estoque, arquivo físico) ou que
// ele AINDA não chegou. Nenhuma delas descreve uma decisão de dispensar certificado, porque essa
// decisão não é registrável — e se alguém precisar dela, o caminho é uma RNC, não um campo de
// observação. Antes de acrescentar uma situação nova, reler este parágrafo.

export const SITUACOES_VALIDAS = Object.keys(SITUACOES);

/**
 * Confere um material do CMR.
 * @param {object} doc            linha do CMR (DocumentoQualidade categoria MATERIAL)
 * @param {object} ctx
 * @param {boolean} ctx.temArquivo        já vinculado, ou o índice do servidor acha o PDF
 * @param {boolean} ctx.achavel           o PDF existe no servidor mas não está vinculado
 * @param {object=} ctx.tratativa         RastreioTratativa deste R
 * @param {boolean=} ctx.origemTemCertificado  o R de origem (estoque) tem certificado
 */
export function conferir(doc, { temArquivo, achavel = false, tratativa = null, origemTemCertificado = false }) {
  const faltas = [];
  if (!temArquivo) faltas.push("arquivo");
  if (!doc.numeroDocumento) faltas.push("certificado");
  if (!doc.numeroCorrida) faltas.push("corrida");

  const lacunas = [];
  if (!doc.nfNumero) lacunas.push("nf");
  if (!doc.pedidoCompra) lacunas.push("pedido");
  if (!doc.dataRecebimento) lacunas.push("data");
  if (!doc.opNumero) lacunas.push("op");

  const cfg = tratativa ? SITUACOES[tratativa.situacao] : null;
  // Material de estoque só sai da pendência quando o R apontado tem certificado de verdade.
  const tratadoResolve = !!cfg?.resolve && (tratativa.situacao !== "ESTOQUE" || origemTemCertificado);

  let situacao;
  if (!faltas.length) situacao = "EM_DIA";
  else if (tratadoResolve) situacao = "EM_DIA";
  else if (tratativa) situacao = "TRATADO";
  else situacao = "PENDENTE";

  return { situacao, faltas, lacunas, achavel, tratativa: tratativa || null };
}

export const ROTULO_FALTA = {
  arquivo: "certificado não digitalizado",
  certificado: "sem nº de certificado",
  corrida: "sem corrida",
};
export const ROTULO_LACUNA = { nf: "NF", pedido: "pedido", data: "data de recebimento", op: "OP" };
