import "server-only";
import { embutirFotos, M, san, GRAY, LINE, SOFT, GREEN, RED, quebrarTexto } from "./relatorio-form-pdf";
import { criarFluxo } from "./relatorio-fluxo-pdf";
import { dataBR } from "./data-br";

// ─── O QUE OS RELATÓRIOS DE SUPERFÍCIE (SAIS E POEIRA) TÊM EM COMUM ─────────────────────────────
// Os dois modelos (Relatório de Sais.xlsx e Relatório de Poeira.xlsx) foram feitos juntos e têm a
// mesma moldura: faixa de subtítulo com a norma, o bloco de identificação (CLIENTE/DATA, DOCUMENTO DE
// REFERÊNCIA/RELATÓRIO Nº, ORDEM DE COMPRA), as faixas cinza das seções, o LAUDO com as duas caixas,
// o REGISTRO FOTOGRÁFICO com Foto 1 e Foto 2 e as assinaturas INSPETOR CQ · TÉCNICO CQ · CLIENTE.
// ⚠ Uma moldura só — duas cópias divergem na primeira correção.
//
// ⚠⚠ TUDO PASSA PELO FLUXO (lib/relatorio-fluxo-pdf): cada bloco reserva o seu espaço antes de ser
// desenhado. A verificação de 02/10/2026 mostrou o bloco das assinaturas saindo do papel com seis
// instrumentos, as observações cortadas em duas linhas e a relação de peças em três — sem aviso.

// as colunas do convite: inspetor (0) → Torg Metal (1) → cliente (2) — ver lib/assinatura-quadros
export const PAPEIS_SUPERFICIE = ["Inspetor CQ", "Técnico CQ", "Cliente"];

const revisao = (rel) => (rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null);
const numero = (rel) => [rel.codigo || "", revisao(rel)].filter(Boolean).join(" ");

/** Abre o documento: o fluxo, com a identificação curta no alto das folhas de continuação. */
export function abrirSuperficie(doc, rel, { titulo, cliente, assinaturas }) {
  return criarFluxo(doc, {
    cabecalho: { titulo, codigo: rel.codigo, revisao: revisao(rel), emitidoEm: rel.emitidoEm },
    identificacaoCurta: (f) => f.linhaInfo([["OP:", `OP-${rel.opNumero}`, 0.2], ["CLIENTE:", cliente || "", 0.45], ["RELATÓRIO Nº:", numero(rel), 0.35]]),
    assinaturas, papeis: PAPEIS_SUPERFICIE, inspetor: rel.inspetor,
  });
}

/** Faixa cinza com o texto centralizado. `junto` = altura do que vem logo abaixo, que não se separa dela. */
export function faixa(fl, texto, junto = 0) {
  fl.reservar(13 + junto);
  const f = fl.f;
  const t = f.bloco(13, SOFT);
  const s = san(texto);
  f.page.drawText(s, { x: M + (f.W - f.bold.widthOfTextAtSize(s, 7)) / 2, y: t - 9.5, size: 7, font: f.bold, color: GRAY });
}

/** Linha de identificação que CRESCE com o valor, com o espaço reservado antes. */
export function linha(fl, campos, { maxLinhas = 12 } = {}) {
  fl.reservar(fl.f.medirInfoCresce(campos, { maxLinhas }).altura);
  return fl.f.linhaInfoCresce(campos, { maxLinhas });
}

/**
 * A data do ensaio (o campo DATA do modelo). "aaaa-mm-dd" do <input type="date"> vira dd/mm/aaaa SEM
 * passar por fuso: meia-noite UTC em São Paulo ainda é o dia anterior (mesma lição do prazo de Compras).
 * Sem data informada, a de emissão — e, antes de emitir, a de criação.
 */
export function dataDoEnsaio(rel, res) {
  const m = String(res.dataInspecao || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dataBR(rel.emitidoEm || rel.createdAt || new Date());
}

/** As linhas de identificação do modelo, mais OP/obra/referência do cliente (rastreabilidade da Torg). */
export function identificacao(fl, rel, res, { cliente, obra, refCliente, rotuloDoc = "DOCUMENTO DE REFERÊNCIA:" }) {
  linha(fl, [["CLIENTE:", cliente || "", 0.62], ["DATA DO ENSAIO:", dataDoEnsaio(rel, res), 0.38]]);
  linha(fl, [[rotuloDoc, res.documentoReferencia || "", 0.62], ["RELATÓRIO Nº:", numero(rel), 0.38]]);
  linha(fl, [["ORDEM DE COMPRA:", res.ordemCompra || "", 0.62], ["NORMA:", res.norma || "", 0.38]]);
  linha(fl, [["OP:", `OP-${rel.opNumero}`, 0.18], ["OBRA:", obra || "", 0.52], ["REF. CLIENTE:", refCliente || "—", 0.30]]);
}

/**
 * A relação de peças na célula do modelo, em até `max` linhas. Passou disso, a célula diz que a lista
 * completa está no fim do documento — e ela vai inteira para lá (`completa`).
 *
 * ⚠⚠ Vitor (04/09/2026): "precisa sair 100%". A relação nasce das marcas escolhidas na criação, sem
 * teto: com 40 marcas, a célula de três linhas engolia vinte em silêncio.
 */
export function pecaNoCorpo(f, peca, { frac = 0.62, max = 6 } = {}) {
  const larg = f.W * frac - (f.bold.widthOfTextAtSize("PEÇA INSPECIONADA:", 6.4) + 12) - 8;
  const linhas = quebrarTexto(peca, f.bold, 8, larg);
  if (linhas.length <= max) return { celula: peca, completa: null };
  let k = max - 1, celula;
  do { celula = `${linhas.slice(0, k).join(" ")} … (relação completa ao final)`; k--; }
  while (k > 0 && quebrarTexto(celula, f.bold, 8, larg).length > max);
  return { celula, completa: peca };
}

/**
 * O laudo com as duas caixas do modelo ("( ) APROVADO ( ) REPROVADO"). Sem laudo dado, as duas saem
 * em branco — documento sem laudo não sai com um laudo inventado.
 */
export function linhaLaudo(fl, laudo) {
  fl.reservar(20);
  const f = fl.f;
  const t = f.bloco(20);
  f.page.drawText("LAUDO:", { x: M + 7, y: t - 13, size: 7, font: f.bold, color: GRAY });
  ["APROVADO", "REPROVADO"].forEach((op, i) => {
    const marcado = laudo === op;
    const cor = op === "APROVADO" ? GREEN : RED;
    const x = M + 60 + i * 120;
    f.page.drawRectangle({ x, y: t - 15, width: 9, height: 9, borderColor: LINE, borderWidth: 0.8 });
    if (marcado) f.page.drawText("X", { x: x + 1.8, y: t - 13.2, size: 8, font: f.bold, color: cor });
    f.page.drawText(op, { x: x + 14, y: t - 13, size: 8, font: f.bold, color: marcado ? cor : GRAY });
  });
}

/** Uma nota curta em cinza (o asterisco da densidade calculada, por exemplo). */
export function nota(fl, texto) {
  const f = fl.f;
  const linhas = quebrarTexto(texto, f.font, 6, f.W - 14);
  const alt = 6 + linhas.length * 7.5;
  fl.reservar(alt);
  const t = fl.f.bloco(alt);
  linhas.forEach((ln, i) => fl.f.page.drawText(ln, { x: M + 7, y: t - 8.5 - i * 7.5, size: 6, font: fl.f.font, color: GRAY }));
}

const ALTURA_FOTOS_CORPO = 13 + 150;

/**
 * Foto 1 e Foto 2 no corpo, como no modelo — QUANDO CABEM. Não cabendo (muitas observações, muitos
 * instrumentos), vão com as demais para a folha de fotos: nenhuma se perde, e a folha não estoura.
 * Devolve as fotos que ainda faltam desenhar.
 *
 * ⚠ A LEGENDA É O QUE O INSPETOR ESCREVEU (marca · observação), em até três linhas. Saía só "Foto 1":
 * o campo era lido por um nome que a foto não tem — e o celular promete "sai embaixo dela no PDF".
 */
export async function fotosNoCorpo(doc, fl, fotos) {
  if (!fotos.length) return [];
  if (!fl.cabe(ALTURA_FOTOS_CORPO)) return fotos;
  const comImagem = await embutirFotos(doc.pdf, fotos.slice(0, 2));
  faixa(fl, "REGISTRO FOTOGRÁFICO", 150);
  const f = fl.f;
  const hCel = 150, wCel = f.W / 2;
  const topo = f.bloco(hCel);
  comImagem.forEach((ft, i) => {
    const x = M + i * wCel;
    if (i > 0) f.page.drawLine({ start: { x, y: topo }, end: { x, y: topo - hCel }, thickness: 0.7, color: LINE });
    const cap = [ft.marca, ft.observacao].filter(Boolean).join(" · ") || `Foto ${i + 1}`;
    const todas = quebrarTexto(cap, f.bold, 6.8, wCel - 12);
    const linhas = todas.slice(0, 3);
    if (todas.length > 3) linhas[2] = f.fit(`${linhas[2]}…`, f.bold, 6.8, wCel - 12);
    linhas.forEach((ln, j) => f.page.drawText(ln, { x: x + 6, y: topo - 10 - j * 8.5, size: 6.8, font: f.bold, color: GRAY }));
    const hCap = 6 + linhas.length * 8.5;
    if (!ft.img) {
      const t = "(imagem não disponível)";
      f.page.drawText(t, { x: x + (wCel - f.font.widthOfTextAtSize(t, 7)) / 2, y: topo - hCel / 2, size: 7, font: f.font, color: GRAY });
      return;
    }
    const maxW = wCel - 14, maxH = hCel - hCap - 8;
    const esc = Math.min(maxW / ft.img.width, maxH / ft.img.height);
    const w = ft.img.width * esc, h = ft.img.height * esc;
    f.page.drawImage(ft.img, { x: x + (wCel - w) / 2, y: topo - hCap - (maxH + h) / 2, width: w, height: h });
  });
  return fotos.slice(2);
}

/**
 * Fecha o documento: as fotos que sobraram na folha de fotos padrão (com o título do relatório e os
 * mesmos papéis), depois cabeçalho e assinaturas em cada folha, com o total certo.
 */
export async function fecharSuperficie(doc, fl, rel, resto, { titulo, cliente, obra, assinaturas }) {
  if (resto.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    await paginaDeFotos(doc, rel, resto, { cliente, obra, assinaturas, paginas: fl.quantas, titulo, papeis: PAPEIS_SUPERFICIE });
  }
  await fl.fechar(doc.pdf.getPageCount());
  return doc.pdf.save();
}
