import "server-only";
import { rgb } from "pdf-lib";
import {
  abrirDocumento, novaFolha, embutirFotos, A4, M, LARGURA, san,
  DARK, GRAY, LINE, SOFT, GREEN, RED, ORANGE,
} from "./relatorio-form-pdf";
import { CRITERIO_PADRAO } from "./evs-campos";

// RELATÓRIO DE INSPEÇÃO VISUAL E DIMENSIONAL DE SOLDA (EVS).
//
// Modelo que o Vitor mandou (aba "Visual Solda" de "Modelos de relatorios de qualidade torg.xlsx").
//
// Vitor (21/08/2026): "a formatação do relatório de EVS deve seguir a mesma linha do de dimensional,
// forma Excel, mesma altura do cabeçalho — tem que ser tudo padrão". Por isso a folha inteira vem de
// `relatorio-form-pdf`: cabeçalho, linhas de identificação, instrumentos e assinaturas são os MESMOS
// objetos do dimensional, não uma cópia parecida.
//
// O que é próprio daqui é o miolo: a tabela de resultados por junta e a legenda dos defeitos.
//
// ⚠ UM BLOCO SÓ, NA LARGURA INTEIRA — e a volta por cima vale registro. A planilha tem duas metades
// de 7 colunas lado a lado; reproduzi assim a pedido do Vitor ("não são duas cópias, te mandei o
// modelo em Excel"). Só que na largura de meia folha cada coluna fica com ~37 pt e o dado real não
// cabe: "EPS-RQPS 01" saiu "EPS-RQP…" e "DANIEL DA SILVA" saiu "DANIEL D…".
//
// Vitor, vendo isso: "acredito que seja para o caso de incluirmos várias peças no relatório;
// poderia deixar apenas um em cada página e se for preciso colocar várias aí vai criando linhas
// abaixo". É o certo: a duplicação existia para caber mais LINHAS numa folha, não porque as
// colunas precisem estar lado a lado. Um bloco na largura inteira dobra cada coluna, o dado cabe,
// e mais peças viram mais linhas — e mais páginas quando preciso.

/**
 * O soldador na coluna: sinete + nome curto.
 *
 * ⚠ Nome completo NÃO cabe, e cortar é pior. "VANDO MAXIMO RODRIGUES DE JESUS" e "EBERTON ROGERIO
 * GRIGOLETTO ALVES" saíam "VANDO MAXIMO RODRIG…" — e dois soldadores de primeiro nome igual ficariam
 * indistinguíveis. Primeiro nome + último sobrenome identifica, e o SINETE (S-04) é a identificação
 * formal da RSQ: é por ele que a solda é rastreada.
 */
function soldadorCurto(nome, sinete) {
  const n = String(nome || "").trim();
  if (!n) return sinete || "";
  const p = n.split(/\s+/);
  const curto = p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : n;
  return sinete ? `${sinete} ${curto}` : curto;
}

/** Legenda do modelo — os códigos que o inspetor escreve na coluna de descontinuidade. */
const LEGENDA = [
  "A - APROVADO      R - REPROVADO      REC - RECOMENDAÇÃO DE EXAME COMPLEMENTAR",
  "TL - Trinca Longitudinal    TT - Trinca Transversal    PO - Porosidade    MO - Mordedura",
  "OV - Sobreposição (Overlap)    FF - Falta de Fusão    FP - Falta de Penetração    RE - Respingo",
  "CO - Concavidade    AA - Abertura de Arco    DI - Deposição Insuficiente",
];

// ⚠ AS PROPORÇÕES SÃO AS DA PLANILHA, medidas nas larguras de coluna do Excel: a primeira ocupa
// 17% da metade e as outras seis 13,8% cada. Eu tinha chutado larguras "mais úteis" (Descrição
// larga, Qtde estreita) e ficaria mais legível — mas o documento que a Qualidade confere é o do
// modelo, e mexer na disposição obriga quem já conhece a folha a reaprender onde as coisas estão.
const COLS = [
  { t: "Desenho", k: "marca", w: 0.170 },
  { t: "Qtde", k: "qtd", w: 0.138, meio: true },
  { t: "Descrição", k: "descricao", w: 0.138 },
  { t: "EPS", k: "eps", w: 0.138, meio: true },
  { t: "Soldador", k: "soldador", w: 0.138, meio: true },
  { t: "Descontinuidade", k: "descontinuidade", w: 0.138, meio: true },
  { t: "Laudo", k: "laudo", w: 0.140, meio: true },
];

/** 26 linhas por folha — a mesma altura de tabela da planilha, agora num bloco só. */
const LINHAS_POR_FOLHA = 26;

/**
 * Quebra o título de uma coluna em até duas linhas.
 *
 * ⚠ QUEBRA DENTRO DA PALAVRA quando preciso. "Descontinuidade" é uma palavra só e não tem espaço
 * onde partir: a quebra por palavras devolvia a linha inteira e o título saía "Descontinu...". No
 * Excel a célula quebra no meio da palavra, e é isso que se reproduz — o inspetor precisa ler o
 * nome da coluna inteiro para saber o que escrever ali.
 */
function quebrarCabecalho(f, texto, fnt, larg, tam = 5.8) {
  const porPalavra = f.quebrar(texto, fnt, tam, larg);
  if (porPalavra.length > 1 || fnt.widthOfTextAtSize(porPalavra[0] || "", tam) <= larg) {
    return porPalavra.slice(0, 2);
  }
  // uma palavra que não cabe: corta no maior pedaço que couber e joga o resto para a segunda linha
  const t = porPalavra[0];
  let corte = t.length;
  while (corte > 1 && fnt.widthOfTextAtSize(t.slice(0, corte), tam) > larg) corte--;
  return [t.slice(0, corte), t.slice(corte)];
}

/**
 * @param {{rel, assinaturas, cliente, obra, refCliente}} p
 * @returns {Promise<Uint8Array>}
 */
export async function gerarEVSPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];

  // ⚠ pelo menos uma folha, mesmo sem nenhuma junta lançada: o documento existe para ser preenchido
  // à mão quando a inspeção acontece antes do lançamento.
  const paginas = Math.max(1, Math.ceil(linhas.length / LINHAS_POR_FOLHA));

  for (let p = 0; p < paginas; p++) {
    const f = novaFolha(doc);
    const { page, font, bold, W } = f;
    const doPedaco = linhas.slice(p * LINHAS_POR_FOLHA, (p + 1) * LINHAS_POR_FOLHA);

    f.cabecalho({
      titulo: "RELATÓRIO DE INSPEÇÃO VISUAL E DIMENSIONAL DE SOLDA",
      codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: p + 1, total: paginas,
    });

    // ── identificação ──
    f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
    f.linhaInfoAuto([["OP:", `OP-${rel.opNumero}`], ["OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
    // ⚠ agrupamentos e larguras tirados das MESCLAGENS da planilha: CLIENTE (A:E), ENCOMENDA (F:I)
    // e QUANTIDADE (J:N); COMPONENTE (A:G) e DESENHO (H:N); METAL BASE (A:C), ILUMINAÇÃO (D:F),
    // TÉCNICA (G:J) e CONDIÇÕES (K:N); PROCEDIMENTO (A:G) e CRITÉRIO (H:N).
    // ⚠ DESCRIÇÃO DA PEÇA, não "encomenda". Vitor (21/08/2026): "aqui você traz a descrição da peça,
    // não encomenda". O rótulo veio do modelo em Excel, mas o campo útil é o mesmo do dimensional —
    // COLUNA, VIGA, TESOURA. "Encomenda" é o pedido do cliente, e isso já está em REF. CLIENTE, na
    // linha de cima.
    //
    // ⚠ O EVS cobre VÁRIAS peças, então a descrição é o conjunto dos tipos, sem repetir: um
    // relatório de cinco vigas e duas colunas diz "VIGA, COLUNA".
    const tipos = [...new Set(
      (Array.isArray(rel.marcas) ? rel.marcas : [])
        .map((m) => res.tiposPeca?.[String(m).toUpperCase()])
        .filter(Boolean),
    )];
    const qtdTotal = (Array.isArray(rel.marcas) ? rel.marcas : [])
      .reduce((soma, m) => soma + (res.qtdPeca?.[String(m).toUpperCase()] || 0), 0);
    f.linhaInfo([
      ["DESCRIÇÃO DA PEÇA:", tipos.join(", ") || res.componente || "", 0.366],
      ["QUANT. DE PEÇAS:", res.quantidade ?? (qtdTotal || ""), 0.284],
      ["DESENHO:", res.desenho || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : ""), 0.350],
    ]);
    f.linhaInfo([
      ["COMPONENTE / PARTE:", res.componente || "", 0.506],
      ["METAL BASE:", res.metalBase || "", 0.494],
    ]);
    f.linhaInfo([
      ["ILUMINAÇÃO:", res.iluminacao || "", 0.226],
      ["TÉCNICA DE INSPEÇÃO:", res.tecnica || "", 0.280],
      ["COND. SUPERFICIAIS:", res.condicoes || "", 0.284],
      ["PROC. / REV.:", res.procedimento || "", 0.210],
    ]);
    f.linhaInfo([
      // ⚠ sem critério gravado, o PDF traz o do PO-06 em vez de sair em branco: campo vazio num
      // documento que vai ao cliente é dizer que a peça foi julgada contra nada.
      ["CRITÉRIO DE ACEITAÇÃO:", res.criterio || CRITERIO_PADRAO, 1],
    ]);

    // ── registros dos resultados ──
    const hLin = 12.5, hCabTab = 19;
    const alt = hCabTab + LINHAS_POR_FOLHA * hLin;
    const topoTit = f.bloco(14, SOFT);
    const tTit = "REGISTROS DOS RESULTADOS";
    page.drawText(tTit, { x: M + (W - bold.widthOfTextAtSize(tTit, 7)) / 2, y: topoTit - 10, size: 7, font: bold, color: GRAY });

    const topo = f.bloco(alt);
    let x = M;
    COLS.forEach((c, i) => {
      const larg = W * c.w;
      if (i > 0) page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
      const partes = quebrarCabecalho(f, c.t, bold, larg - 3);
      partes.forEach((ln, k) => {
        const tt = f.fit(ln, bold, 6.2, larg - 2);
        page.drawText(tt, {
          x: x + (larg - bold.widthOfTextAtSize(tt, 6.2)) / 2,
          y: topo - (partes.length === 1 ? 12 : 8.5 + k * 7),
          size: 6.2, font: bold, color: GRAY,
        });
      });
      x += larg;
    });
    page.drawLine({ start: { x: M, y: topo - hCabTab }, end: { x: M + W, y: topo - hCabTab }, thickness: 0.7, color: LINE });

    for (let i = 0; i < LINHAS_POR_FOLHA; i++) {
      const ly = topo - hCabTab - i * hLin;
      page.drawLine({ start: { x: M, y: ly - hLin }, end: { x: M + W, y: ly - hLin }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
      const l = doPedaco[i];
      if (!l) continue;
      let cx = M;
      for (const c of COLS) {
        const larg = W * c.w;
        const v = c.k === "soldador"
          ? soldadorCurto(l.soldador, l.sinete)
          : (l[c.k] == null ? "" : String(l[c.k]));
        if (v) {
          // ⚠ o LAUDO ganha cor: é o que se procura ao folhear o relatório. R em vermelho, A em
          // verde — quem confere não precisa ler linha por linha para achar o reprovado.
          const cor = c.k !== "laudo" ? DARK : /^R$/i.test(v) ? RED : /^A$/i.test(v) ? GREEN : ORANGE;
          const fnt = c.k === "laudo" ? bold : font;
          // ⚠ ENCOLHE ANTES DE CORTAR, célula a célula. "S-02 EBERTON ALVES" passa por poucos
          // pontos da largura da coluna; reticência num nome de soldador tira justamente a
          // identificação de quem soldou — e o sinete existe para isso não se perder.
          let tam = 7;
          while (tam > 5.6 && fnt.widthOfTextAtSize(v, tam) > larg - 6) tam = +(tam - 0.2).toFixed(2);
          const txt = f.fit(v, fnt, tam, larg - 6);
          const px = c.meio ? cx + (larg - fnt.widthOfTextAtSize(txt, tam)) / 2 : cx + 4;
          page.drawText(txt, { x: px, y: ly - 8.8, size: tam, font: fnt, color: cor });
        }
        cx += larg;
      }
    }

    // ── legenda ──
    const hLeg = 12 + LEGENDA.length * 8.5 + 4;
    const topoLeg = f.bloco(hLeg);
    f.rotulo(M + 7, topoLeg - 9, "LEGENDA");
    LEGENDA.forEach((ln, i) => {
      page.drawText(san(ln), { x: M + 7, y: topoLeg - 19 - i * 8.5, size: 6, font, color: GRAY });
    });

    // ── só na última folha: observações, instrumentos e assinaturas ──
    if (p === paginas - 1) {
      f.blocoTexto("OBSERVAÇÕES:", rel.observacoes || "", { alt: 34, linhas: 2 });
      f.blocoInstrumentos(rel.equipamentos, res.criterio ? `*Critério de aceitação: ${res.criterio}` : null);
      await f.blocoAssinaturas(assinaturas, ["Realizado por", "Aprovado por", "Cliente / Fiscalização"]);
    }
  }

  // ── PÁGINA DE FOTOS, SÓ SE HOUVER ────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "não precisa obrigatoriamente de imagens, mas no caso de uma necessidade
  // pode ser incluído, e você cria uma nova página no mesmo formato". A folha só nasce quando há
  // foto — relatório sem evidência fotográfica não deve sair com uma página de molduras vazias.
  await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas });

  return doc.pdf.save();
}

/** A folha de registro fotográfico, no mesmo formato do relatório. */
/**
 * Quantas fotos cabem numa folha de registro fotográfico: grade 2 × 3.
 *
 * ⚠⚠ ERAM OITO — E A OITAVA EMPURRAVA AS ASSINATURAS PARA FORA DA FOLHA. Vitor (04/09/2026):
 * "agora que tem 3 páginas a assinatura tem que sair nas 3". Quatro linhas de 168 pt não deixam os
 * 118 pt do bloco de assinaturas com imagem: ele era desenhado abaixo da margem e simplesmente não
 * aparecia. Com seis fotos sobra a altura do bloco — e a folha continua com o quadro assinado, que
 * é o que faz dela um documento.
 */
export const FOTOS_POR_FOLHA = 6;

export async function paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas = 1, titulo = null, papeis = null }) {
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];
  if (!lista.length) return false;

  // ⚠⚠ FOTO NENHUMA SE PERDE. Vitor (04/09/2026): "as fotos que ela importou não saíram no PDF".
  // Saíam — só que oito. O `slice(0, 8)` cortava o resto SEM DIZER: a inspetora anexou 11 no
  // RIP-106-002 e o documento saiu com 8, sem nada indicando que faltavam três. Evidência que o
  // relatório engole é pior que evidência que não existe, porque ninguém vai procurar.
  const folhas = Math.ceil(lista.length / FOTOS_POR_FOLHA);
  const total = paginas + folhas;

  for (let i = 0; i < folhas; i++) {
    const doLote = lista.slice(i * FOTOS_POR_FOLHA, (i + 1) * FOTOS_POR_FOLHA);
    const comImagem = await embutirFotos(doc.pdf, doLote);
    const f = novaFolha(doc);
    f.cabecalho({
      titulo: titulo || "REGISTRO FOTOGRÁFICO",
      codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null,
      emitidoEm: rel.emitidoEm, folha: paginas + 1 + i, total,
    });
    f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.34], ["CLIENTE:", cliente || "", 0.33], ["OP:", `OP-${rel.opNumero}`, 0.33]]);
    f.linhaInfo([["OBRA:", obra || "", 1]]);
    f.blocoFotos(comImagem, { colunas: 2, altura: 168 });
    // ⚠ os MESMOS papéis das outras folhas quando o relatório os define: colunas com nomes
    // diferentes fazem a assinatura casar numa folha e sumir na seguinte.
    await f.blocoAssinaturas(assinaturas, papeis || ["Realizado por", "Aprovado por", "Cliente / Fiscalização"]);
  }
  return true;
}
