import "server-only";
import { abrirDocumento, M, DARK, GRAY, LINE, SOFT, GREEN, RED } from "./relatorio-form-pdf";
import { camposCabecalhoRecebimento, checklistRecebimento, dataCurtaBR, dataReferenciaRecebimento, lotesRecebimento, lotesVencidos } from "./recebimento-tinta-campos";
import { abrirSuperficie, faixa, linha, linhaLaudo, nota, fotosNoCorpo, fecharSuperficie } from "./relatorio-superficie-pdf";
import { tabela } from "./relatorio-pulloff-pdf";
import { componentesDosCertificados } from "./recebimento-certificados";

// RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE TINTAS (RRT) — modelo "Relatório de Recebimento de Tintas.xlsx".
//
// ⚠ A ORDEM DOS BLOCOS É A DO MODELO: OP, cliente/contrato, local; material/norma, fabricante/certificado;
// os lotes A/B/C com a quantidade; fabricação e validade por componente; tamanho do lote e da amostra; os
// nove itens da embalagem (aprovado/reprovado); observações; REGISTRO FOTOGRÁFICO; e as assinaturas
// INSPETOR C.Q. · TÉCNICO C.Q. · FISCALIZAÇÃO.
// ⚠ O rodapé "www.novusconsultoria.com.br" do modelo não é impresso (ver lib/recebimento-tinta-campos).

export const TITULO_RECEBIMENTO = "RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE TINTAS";
// as colunas do convite: inspetor (0) → Torg Metal (1) → cliente/fiscalização (2) — ver lib/assinatura-quadros
export const PAPEIS_RECEBIMENTO = ["Inspetor C.Q.", "Técnico C.Q.", "Fiscalização"];

/** A tabela dos nove itens com as duas colunas de marcar do modelo. */
function checklist(fl, itens) {
  const { font, bold, W } = fl.f;
  const hCab = 16, hLin = 14;
  const alt = hCab + itens.length * hLin;
  faixa(fl, "ITENS INSPECIONADOS", alt);
  const f = fl.f, page = f.page;
  const topo = f.bloco(alt);
  const wItem = W * 0.64, wCol = (W - wItem) / 2;
  page.drawRectangle({ x: M, y: topo - hCab, width: W, height: hCab, color: SOFT });
  page.drawText("ITEM INSPECIONADO", { x: M + 6, y: topo - 11, size: 6.6, font: bold, color: GRAY });
  ["APROVADO", "REPROVADO"].forEach((t, i) => {
    const x = M + wItem + i * wCol;
    page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.6, color: LINE });
    page.drawText(t, { x: x + (wCol - bold.widthOfTextAtSize(t, 6.6)) / 2, y: topo - 11, size: 6.6, font: bold, color: GRAY });
  });
  itens.forEach((it, r) => {
    const y = topo - hCab - r * hLin;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
    page.drawText(f.fit(`${it.numero}. ${it.item}`, font, 7.2, wItem - 12), { x: M + 6, y: y - 10, size: 7.2, font, color: DARK });
    ["A", "R"].forEach((v, i) => {
      if (it.valor !== v) return;
      const x = M + wItem + i * wCol;
      page.drawText("X", { x: x + (wCol - bold.widthOfTextAtSize("X", 8)) / 2, y: y - 10.5, size: 8, font: bold, color: v === "A" ? GREEN : RED });
    });
  });
}

export async function gerarRecebimentoTintaPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const resultados = rel.resultados || {};
  const res = camposCabecalhoRecebimento(rel);
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];
  const lotes = lotesRecebimento(resultados);
  // ⚠ a data impressa em DATA DO RECEBIMENTO é a MESMA contra a qual a validade é conferida (nunca "hoje")
  const dataRef = dataReferenciaRecebimento(rel);
  const vencidos = new Set(lotesVencidos(resultados, dataRef).map((l) => l.componente));

  const fl = abrirSuperficie(doc, rel, { titulo: TITULO_RECEBIMENTO, cliente, assinaturas, papeis: PAPEIS_RECEBIMENTO });
  // ── identificação ──
  linha(fl, [["OP:", `OP-${rel.opNumero}`, 0.3], ["DATA DO RECEBIMENTO:", dataCurtaBR(dataRef), 0.35], ["REF. CLIENTE:", refCliente || "—", 0.35]]);
  linha(fl, [["CLIENTE:", cliente || "", 0.6], ["CONTRATO:", res.contrato || "", 0.4]]);
  if (obra) linha(fl, [["OBRA:", obra, 1]]);
  linha(fl, [["LOCAL/EQUIPAMENTO/ESTADO:", res.localEquipamento || "", 1]]);
  linha(fl, [["MATERIAL:", res.material || "", 0.6], ["NORMA:", res.norma || "", 0.4]]);
  linha(fl, [["FABRICANTE:", res.fabricante || "", 0.5], ["Nº CERTIFICADO DE ANÁLISE QUÍMICA:", res.certificado || "", 0.5]]);

  // ── lotes e quantidades ──
  tabela(fl, [{ t: "Componente", w: 0.2, meio: true }, { t: "Nº do Lote", w: 0.5 }, { t: "Quantidade", w: 0.3, meio: true }],
    lotes.map((l) => ({ valores: [l.componente, l.lote || "", l.quantidade || ""] })), { titulo: "LOTES" });

  // ── fabricação e validade por componente ──
  // ⚠ lote VENCIDO na data do recebimento sai marcado: aprovar tinta vencida é pendência (ver os campos)
  tabela(fl, [{ t: "Componente", w: 0.2, meio: true }, { t: "Data de Fabricação", w: 0.4, meio: true }, { t: "Data de Validade", w: 0.4, meio: true }],
    lotes.map((l) => ({ valores: [l.componente, dataCurtaBR(l.fabricacao), `${dataCurtaBR(l.validade)}${vencidos.has(l.componente) ? " (vencida)" : ""}`] })),
    { titulo: "DATAS DOS COMPONENTES" });

  // ⚠ OS CERTIFICADOS ESCOLHIDOS NA CRIAÇÃO (07/10/2026). O modelo do SGQ tem um só "nº do certificado" (o da
  // tinta); o do endurecedor e o do diluente só existiriam como lote. Relatório antigo, sem a escolha, sai igual.
  const certificados = Array.isArray(resultados.certificados) ? resultados.certificados : [];
  if (certificados.length) {
    const pos = componentesDosCertificados(certificados);
    tabela(fl, [{ t: "Comp.", w: 0.08, meio: true }, { t: "R (CMR)", w: 0.12, meio: true }, { t: "Produto", w: 0.4 }, { t: "Certificado", w: 0.14, meio: true }, { t: "Lote", w: 0.13, meio: true }, { t: "NF", w: 0.13, meio: true }],
      certificados.map((c, i) => ({ valores: [pos[i] || "—", c.r || "—", c.descricao || "—", c.certificado || "—", c.lote || "—", c.nf || "—"] })),
      { titulo: "CERTIFICADOS DO CMR" });
  }

  linha(fl, [["TAMANHO DO LOTE:", res.tamanhoLote || "", 0.5], ["TAMANHO DA(S) AMOSTRA(S):", res.tamanhoAmostra || "", 0.5]]);

  checklist(fl, checklistRecebimento(resultados));
  if (vencidos.size) nota(fl, `Atenção: validade vencida na data do recebimento — componente ${[...vencidos].join(", ")}.`);
  // ⚠ O RESULTADO SAI IMPRESSO, embora o modelo não tenha a linha: reprova-se também por lote vencido, produto
  // trocado ou falta de certificado — e com os nove itens aprovados, sem ela o documento não diria que reprovou
  linhaLaudo(fl, rel.resultadoInspecao, "RESULTADO DA INSPEÇÃO:");

  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  fl.instrumentos(rel.equipamentos);
  const resto = await fotosNoCorpo(doc, fl, lista);
  return fecharSuperficie(doc, fl, rel, resto, { titulo: TITULO_RECEBIMENTO, cliente, obra, assinaturas, papeis: PAPEIS_RECEBIMENTO, fabricante: res.fabricante || "" });
}


