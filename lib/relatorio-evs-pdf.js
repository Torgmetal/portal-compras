import "server-only";
import { rgb } from "pdf-lib";
import {
  abrirDocumento, novaFolha, A4, M, LARGURA, san,
  DARK, GRAY, LINE, SOFT, GREEN, RED,
} from "./relatorio-form-pdf";

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
// ⚠ A TABELA TEM DUAS METADES LADO A LADO, como na planilha: 7 colunas à esquerda e as mesmas 7 à
// direita, preenchidas em ordem de leitura (a esquerda enche primeiro). Cheguei a juntar tudo num
// bloco só por caber melhor em A4, e o Vitor corrigiu: "não são duas cópias, te mandei o modelo em
// Excel". O modelo é o documento — quem confere já conhece a folha, e mudar a disposição obriga a
// pessoa a reaprender onde as coisas estão.

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

/** 26 linhas por metade, 52 por folha — a mesma contagem da planilha (linhas 15 a 40). */
const LINHAS_POR_BLOCO = 26;
const LINHAS_POR_FOLHA = LINHAS_POR_BLOCO * 2;

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
export async function gerarEVSPDF({ rel, assinaturas = null, cliente = null, obra = null, refCliente = null }) {
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
      codigo: rel.codigo, emitidoEm: rel.emitidoEm, folha: p + 1, total: paginas,
    });

    // ── identificação ──
    f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
    f.linhaInfoAuto([["OP:", `OP-${rel.opNumero}`], ["OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
    // ⚠ agrupamentos e larguras tirados das MESCLAGENS da planilha: CLIENTE (A:E), ENCOMENDA (F:I)
    // e QUANTIDADE (J:N); COMPONENTE (A:G) e DESENHO (H:N); METAL BASE (A:C), ILUMINAÇÃO (D:F),
    // TÉCNICA (G:J) e CONDIÇÕES (K:N); PROCEDIMENTO (A:G) e CRITÉRIO (H:N).
    f.linhaInfo([
      ["ENCOMENDA:", res.encomenda || "", 0.366],
      ["QUANT. DE PEÇAS:", res.quantidade ?? "", 0.284],
      ["DESENHO:", res.desenho || "", 0.350],
    ]);
    f.linhaInfo([
      ["COMPONENTE / PARTE:", res.componente || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : ""), 0.506],
      ["METAL BASE:", res.metalBase || "", 0.494],
    ]);
    f.linhaInfo([
      ["ILUMINAÇÃO:", res.iluminacao || "", 0.226],
      ["TÉCNICA DE INSPEÇÃO:", res.tecnica || "", 0.280],
      ["COND. SUPERFICIAIS:", res.condicoes || "", 0.284],
      ["PROC. / REV.:", res.procedimento || "", 0.210],
    ]);
    f.linhaInfo([
      ["CRITÉRIO DE ACEITAÇÃO:", res.criterio || "", 1],
    ]);

    // ── registros dos resultados: duas metades, como na planilha ──
    // ⚠ cabeçalho de DUAS LINHAS. Com as colunas na largura do modelo, "Descontinuidade" não cabe
    // numa linha só e saía "Descontinu..." — no Excel a célula quebra, e é o que se faz aqui.
    const hLin = 12.5, hCabTab = 19;
    const alt = hCabTab + LINHAS_POR_BLOCO * hLin;
    const topoTit = f.bloco(14, SOFT);
    const tTit = "REGISTROS DOS RESULTADOS";
    page.drawText(tTit, { x: M + (W - bold.widthOfTextAtSize(tTit, 7)) / 2, y: topoTit - 10, size: 7, font: bold, color: GRAY });

    const topo = f.bloco(alt);
    const wMetade = W / 2;
    // a divisória entre as duas metades é mais forte: são duas tabelas, não catorze colunas
    page.drawLine({ start: { x: M + wMetade, y: topo }, end: { x: M + wMetade, y: topo - alt }, thickness: 1.1, color: LINE });

    for (const metade of [0, 1]) {
      const x0 = M + metade * wMetade;
      let x = x0;
      COLS.forEach((c, i) => {
        const larg = wMetade * c.w;
        if (i > 0) page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
        const partes = quebrarCabecalho(f, c.t, bold, larg - 3);
        partes.forEach((ln, k) => {
          const tt = f.fit(ln, bold, 5.8, larg - 2);
          page.drawText(tt, {
            x: x + (larg - bold.widthOfTextAtSize(tt, 5.8)) / 2,
            // uma linha só fica centrada na altura; duas se dividem
            y: topo - (partes.length === 1 ? 12 : 8.5 + k * 7),
            size: 5.8, font: bold, color: GRAY,
          });
        });
        x += larg;
      });
    }
    page.drawLine({ start: { x: M, y: topo - hCabTab }, end: { x: M + W, y: topo - hCabTab }, thickness: 0.7, color: LINE });

    for (let i = 0; i < LINHAS_POR_BLOCO; i++) {
      const ly = topo - hCabTab - i * hLin;
      page.drawLine({ start: { x: M, y: ly - hLin }, end: { x: M + W, y: ly - hLin }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
      for (const metade of [0, 1]) {
        // ⚠ ordem de LEITURA: a metade da esquerda enche primeiro, inteira, e só então a direita.
        const l = doPedaco[metade * LINHAS_POR_BLOCO + i];
        if (!l) continue;
        let cx = M + metade * wMetade;
        for (const c of COLS) {
          const larg = wMetade * c.w;
          const v = l[c.k] == null ? "" : String(l[c.k]);
          if (v) {
            // ⚠ o LAUDO ganha cor: é o que se procura ao folhear o relatório. R em vermelho, A em
            // verde — quem confere não precisa ler linha por linha para achar o reprovado.
            const cor = c.k !== "laudo" ? DARK : /^R/i.test(v) ? RED : /^A/i.test(v) ? GREEN : DARK;
            const fnt = c.k === "laudo" ? bold : font;
            const txt = f.fit(v, fnt, 6.2, larg - 4);
            const px = c.meio ? cx + (larg - fnt.widthOfTextAtSize(txt, 6.2)) / 2 : cx + 3;
            page.drawText(txt, { x: px, y: ly - 8.8, size: 6.2, font: fnt, color: cor });
          }
          cx += larg;
        }
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
      f.blocoAssinaturas(assinaturas, ["Realizado por", "Aprovado por", "Cliente / Fiscalização"]);
    }
  }

  return doc.pdf.save();
}
