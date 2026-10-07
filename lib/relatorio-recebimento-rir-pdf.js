import "server-only";
import { abrirDocumento } from "./relatorio-form-pdf";
import { abrirSuperficie, linha, linhaLaudo, nota, fotosNoCorpo, fecharSuperficie } from "./relatorio-superficie-pdf";
import { tabela } from "./relatorio-pulloff-pdf";
import { tituloDocumento } from "./qualidade-campo";
import { INSPECOES_RIR, itensRir, itensVencidosRir, rotuloMarca } from "./recebimento-rir-campos";
import { dataCurtaBR, dataReferenciaRecebimento } from "./recebimento-tinta-campos";

// RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO — PENETRANTE E REVELADOR (RRP) E ARAME DE SOLDA (RRA).
//
// ⚠ O MODELO É DA TORG. Vitor (07/10/2026): o RIR que veio da QWS é de um concorrente e "é apenas um modelo
// para saber as informações necessárias". Do RIR vieram só as INFORMAÇÕES — por item: NF e item, certificado
// e/ou lote, pedido, descrição, quantidade, inspeção visual/dimensional/documentos (A, R, N.A.) e a RNC; o
// espaço reservado aos comentários da fiscalização; e as três assinaturas. A moldura é a dos outros
// relatórios da casa (lib/relatorio-superficie-pdf), e o R do CMR entra numa coluna: é por ele que a Torg
// rastreia o certificado.
//
// ⚠ A TABELA SE PARTE EM BLOCOS. O desenho da tabela reserva a altura inteira antes de desenhar; 40
// certificados numa tabela só passariam do pé da folha. Cada bloco repete o cabeçalho das colunas.

// as colunas do convite: inspetor (0) → Torg Metal (1) → cliente/fiscalização (2) — ver lib/assinatura-quadros
export const PAPEIS_RIR = ["Inspeção realizada por", "Controle da Qualidade", "Fiscalização do cliente"];
const POR_BLOCO = 12;

// ⚠ AS LARGURAS SAÍRAM DO QUE PRECISA CABER NUMA LINHA, medido no Helvetica Bold a 6,6 pt: a data inteira
// ("30/09/2026"), o "N.A." e um nº de RNC ("RNC-031/26"). Mais estreitas, a data partia em "30/09/" + "2026".
// A descrição é a que cede: ela quebra em palavras sem perder sentido.
const COLUNAS = [
  { t: "Nº", w: 0.035, meio: true },
  { t: "R (CMR)", w: 0.07, meio: true },
  { t: "NF / ITEM", w: 0.085, meio: true },
  { t: "CERT. / LOTE", w: 0.135 },
  { t: "PEDIDO", w: 0.065, meio: true },
  { t: "DESCRIÇÃO DO PRODUTO", w: 0.185 },
  { t: "VALIDADE", w: 0.095, meio: true },
  { t: "QTDE.", w: 0.085, meio: true },
  ...INSPECOES_RIR.map((c) => ({ t: c.curto, w: 0.05, meio: true })),
  { t: "RNC", w: 0.095, meio: true },
];

export const LEGENDA_RIR = "VIS. = inspeção visual · DIM. = dimensional · DOC. = documentação (certificado) · A = aprovado · R = reprovado · N.A. = não aplicável";

export async function gerarRecebimentoRirPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  const titulo = tituloDocumento(rel.tipo);
  const itens = itensRir(res);
  // ⚠ a data impressa em DATA DO RECEBIMENTO é a MESMA contra a qual a validade é conferida (nunca "hoje")
  const dataRef = dataReferenciaRecebimento(rel);
  const vencidos = new Set(itensVencidosRir(rel).map((i) => i.numero));
  const fornecedores = [...new Set(itens.map((i) => i.fornecedor).filter(Boolean))];
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];

  const fl = abrirSuperficie(doc, rel, { titulo, cliente, assinaturas, papeis: PAPEIS_RIR });
  // ── identificação ──
  linha(fl, [["OP:", `OP-${rel.opNumero}`, 0.3], ["DATA DO RECEBIMENTO:", dataCurtaBR(dataRef), 0.35], ["REF. CLIENTE:", refCliente || "—", 0.35]]);
  linha(fl, [["CLIENTE:", cliente || "", 0.6], ["CONTRATO:", res.contrato || "", 0.4]]);
  if (obra) linha(fl, [["OBRA:", obra, 1]]);
  linha(fl, [["LOCAL DE APLICAÇÃO:", res.localAplicacao || "", 1]]);
  linha(fl, [["FORNECEDOR:", fornecedores.join(" · ") || "—", 1]]);

  // ── itens recebidos: uma linha por certificado ──
  const valores = (i) => [
    String(i.numero),
    i.r || "—",
    [i.nf, i.itemNf].filter(Boolean).join(" / ") || "—",
    [i.certificado, i.lote].filter(Boolean).join(" / ") || "—",
    i.pc || "—",
    i.descricao || "—",
    i.validade ? `${dataCurtaBR(i.validade)}${vencidos.has(i.numero) ? " (vencida)" : ""}` : "—",
    i.quantidade || "—",
    ...INSPECOES_RIR.map((c) => rotuloMarca(i[c.k]) || "—"),
    i.rnc || "—",
  ];
  if (!itens.length) nota(fl, "Nenhum item recebido informado.");
  for (let ini = 0; ini < itens.length; ini += POR_BLOCO) {
    tabela(fl, COLUNAS, itens.slice(ini, ini + POR_BLOCO).map((i) => ({ valores: valores(i) })), {
      tam: 6.6, titulo: ini ? "ITENS RECEBIDOS (continuação)" : "ITENS RECEBIDOS",
    });
  }
  nota(fl, LEGENDA_RIR);
  if (vencidos.size) nota(fl, `Atenção: validade vencida na data do recebimento — item ${[...vencidos].join(", ")}.`);
  linhaLaudo(fl, rel.resultadoInspecao, "RESULTADO DA INSPEÇÃO:");

  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  // o espaço do modelo para a fiscalização do cliente: vazio, a caixa tem a altura para escrever à mão
  fl.texto("COMENTÁRIOS DA FISCALIZAÇÃO DO CLIENTE:", res.comentariosFiscalizacao || "");
  fl.instrumentos(rel.equipamentos);
  const resto = await fotosNoCorpo(doc, fl, lista);
  return fecharSuperficie(doc, fl, rel, resto, { titulo, cliente, obra, assinaturas, papeis: PAPEIS_RIR, fabricante: "" });
}
