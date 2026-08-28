import "server-only";
import { rgb } from "pdf-lib";
import {
  abrirDocumento, novaFolha, M, san,
  DARK, GRAY, LINE, SOFT, GREEN, RED,
} from "./relatorio-form-pdf";
import { classificacaoIndicacao } from "./us-campos";

// RELATÓRIO DE ENSAIO POR ULTRASSOM (RUS).
//
// Modelo da aba "Ensaio US" de "Modelos de relatorios de qualidade torg.xlsx".
//
// ⚠ FOLHA DEITADA. A tabela de indicações tem 18 colunas — decibéis em quatro medidas, as
// descontinuidades com percurso e profundidade, e as distâncias X e Y. Em A4 retrato cada coluna
// ficaria com 30 pt, estreita demais para "Comprimento Inspecionado". O modelo do Vitor usa 18
// colunas do Excel pela mesma razão.
//
// ⚠ O CABEÇALHO DA TABELA TEM TRÊS ANDARES: os grupos DECIBÉIS e DESCONTINUIDADES cobrem várias
// colunas, e dentro de DESCONTINUIDADES ainda há DISTÂNCIA cobrindo duas. Reproduzir os andares
// importa: sem eles, "A partir de X" e "A partir de Y" ficam soltos e ninguém sabe distância de quê.

/** As colunas folha, com o grupo a que pertencem. */
const COLS = [
  { t: "Identificação\nda Peça", k: "peca", w: 7.5 },
  { t: "Nº da\nIndicação", k: "indicacao", w: 5, meio: true },
  { t: "Ângulo do\nCabeçote", k: "angulo", w: 5, meio: true },
  { t: "Face de\nEnsaio", k: "face", w: 5, meio: true },
  { t: "Compr.\nInspec. (mm)", k: "comprimento", w: 6, meio: true },
  { g: "DECIBÉIS", sub: "A", t: "Nível da\nIndicação", k: "db_indicacao", w: 5, meio: true },
  { g: "DECIBÉIS", sub: "B", t: "Nível de\nReferência", k: "db_referencia", w: 5, meio: true },
  { g: "DECIBÉIS", sub: "C", t: "Fator de\nAtenuação", k: "db_atenuacao", w: 5, meio: true },
  { g: "DECIBÉIS", sub: "D", t: "Classe da\nIndicação", k: "db_classe", w: 5, meio: true },
  { g: "DESCONTINUIDADES", t: "Compr.\nReprovado", k: "reprovado", w: 5.5, meio: true },
  { g: "DESCONTINUIDADES", t: "Percurso\nSônico", k: "percurso", w: 5.5, meio: true },
  { g: "DESCONTINUIDADES", t: "Profund. da\nFace 'A'", k: "profundidade", w: 5.5, meio: true },
  { g: "DESCONTINUIDADES", g2: "DISTÂNCIA", t: "A partir\nde 'X'", k: "dist_x", w: 5, meio: true },
  { g: "DESCONTINUIDADES", g2: "DISTÂNCIA", t: "A partir\nde 'Y'", k: "dist_y", w: 5, meio: true },
  { t: "Avaliação /\nLaudo", k: "laudo", w: 5.5, meio: true },
  { t: "Sinete do\nSoldador", k: "sinete", w: 5, meio: true },
  { t: "Nível de\nDefeito", k: "nivel", w: 5, meio: true },
  { t: "Observação", k: "obs", w: 9 },
];

// ⚠ 12 LINHAS POR FOLHA, e o número não é chute: a A4 deitada tem 595 pt, menos 56 de margem dão
// 539 úteis. O cabeçalho come 46, as oito linhas de identificação 128, e o fecho da última folha
// (declaração, observações, instrumentos e assinaturas) mais 159. Sobram 206 para a tabela; tirando
// os 34 do cabeçalho dela e a 13 pt por linha, cabem 13. Fico com 12 para a folha não terminar
// colada na borda.
const LINHAS_POR_FOLHA = 12;

export async function gerarUSPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const paginas = Math.max(1, Math.ceil(linhas.length / LINHAS_POR_FOLHA));

  const somaW = COLS.reduce((a, c) => a + c.w, 0);

  for (let p = 0; p < paginas; p++) {
    const f = novaFolha(doc, { paisagem: true });
    const { page, font, bold, W } = f;
    const doPedaco = linhas.slice(p * LINHAS_POR_FOLHA, (p + 1) * LINHAS_POR_FOLHA);

    f.cabecalho({
      titulo: "RELATÓRIO DE ENSAIO POR ULTRASSOM",
      codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm, folha: p + 1, total: paginas,
    });

    // ── identificação ──
    f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.34], ["CLIENTE:", cliente || "", 0.33], ["DESENHO:", res.desenho || "", 0.33]]);
    f.linhaInfoAuto([["OP:", `OP-${rel.opNumero}`], ["CONTRATO / OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
    f.linhaInfo([
      ["EQUIPAMENTO / TAG:", res.tag || "", 0.34],
      ["LOCAL DE ENSAIO:", res.local || "", 0.33],
      ["TÉCNICA DE ENSAIO:", res.tecnica || "", 0.33],
    ]);
    f.linhaInfo([
      ["PROCEDIMENTO / REV.:", res.procedimento || "", 0.34],
      ["NORMA DE REFERÊNCIA:", res.norma || "", 0.33],
      ["CRITÉRIO DE ACEITAÇÃO:", res.criterio || "", 0.33],
    ]);
    f.linhaInfo([
      ["MATERIAL:", res.material || "", 0.22],
      ["ESPESSURA:", res.espessura || "", 0.18],
      ["METAL DE ADIÇÃO:", res.metalAdicao || "", 0.24],
      ["PROC. DE SOLDAGEM:", res.processoSolda || "", 0.24],
      ["ACOPLANTE:", res.acoplante || "", 0.12],
    ]);
    f.linhaInfo([
      ["TIPO DE JUNTA:", res.junta || "", 0.28],
      ["TIPO DE CHANFRO:", res.chanfro || "", 0.28],
      ["BLOCO PADRÃO / Nº SÉRIE:", res.blocoPadrao || "", 0.44],
    ]);

    // ── aparelho e cabeçote ──
    // ⚠ são identificação de EQUIPAMENTO, não da peça: o laudo de ultrassom só vale se disser em
    // que aparelho e com que cabeçote foi feito.
    f.linhaInfo([
      ["APARELHO — FABRICANTE:", res.apFabricante || "", 0.34],
      ["MODELO:", res.apModelo || "", 0.33],
      ["Nº DE SÉRIE:", res.apSerie || "", 0.33],
    ]);
    f.linhaInfo([
      ["CABEÇOTE — FABRICANTE:", res.cbFabricante || "", 0.22],
      ["MODELO:", res.cbModelo || "", 0.16],
      ["ÂNGULO REAL:", res.cbAngulo || "", 0.15],
      ["DIMENSÕES:", res.cbDimensoes || "", 0.16],
      ["FREQUÊNCIA:", res.cbFrequencia || "", 0.15],
      ["Nº DE SÉRIE:", res.cbSerie || "", 0.16],
    ]);

    // ── tabela de indicações ──
    const hGrupo = 11, hSub = 9, hCabTab = hGrupo + hSub + 14, hLin = 13;
    const alt = hCabTab + LINHAS_POR_FOLHA * hLin;
    const topo = f.bloco(alt);
    const largDe = (c) => (W * c.w) / somaW;

    // andar 1: os grupos que cobrem várias colunas
    let x = M;
    let i = 0;
    while (i < COLS.length) {
      const c = COLS[i];
      if (!c.g) { x += largDe(c); i++; continue; }
      let larg = 0, j = i;
      while (j < COLS.length && COLS[j].g === c.g) { larg += largDe(COLS[j]); j++; }
      page.drawRectangle({ x, y: topo - hGrupo, width: larg, height: hGrupo, color: SOFT });
      page.drawRectangle({ x, y: topo - hGrupo, width: larg, height: hGrupo, borderColor: LINE, borderWidth: 0.7 });
      const t = f.fit(c.g, bold, 6, larg - 4);
      page.drawText(t, { x: x + (larg - bold.widthOfTextAtSize(t, 6)) / 2, y: topo - 8, size: 6, font: bold, color: GRAY });
      x += larg; i = j;
    }

    // andar 2: o subgrupo DISTÂNCIA e as letras A..D dos decibéis
    x = M; i = 0;
    while (i < COLS.length) {
      const c = COLS[i];
      const y2 = topo - hGrupo;
      if (c.g2) {
        let larg = 0, j = i;
        while (j < COLS.length && COLS[j].g2 === c.g2) { larg += largDe(COLS[j]); j++; }
        page.drawRectangle({ x, y: y2 - hSub, width: larg, height: hSub, borderColor: LINE, borderWidth: 0.7 });
        const t = f.fit(c.g2, bold, 5.4, larg - 3);
        page.drawText(t, { x: x + (larg - bold.widthOfTextAtSize(t, 5.4)) / 2, y: y2 - 6.5, size: 5.4, font: bold, color: GRAY });
        x += larg; i = j; continue;
      }
      if (c.sub) {
        const larg = largDe(c);
        page.drawRectangle({ x, y: y2 - hSub, width: larg, height: hSub, borderColor: LINE, borderWidth: 0.7 });
        page.drawText(c.sub, { x: x + (larg - bold.widthOfTextAtSize(c.sub, 5.4)) / 2, y: y2 - 6.5, size: 5.4, font: bold, color: GRAY });
      }
      x += largDe(c); i++;
    }

    // andar 3: o nome de cada coluna, em duas linhas
    x = M;
    for (const c of COLS) {
      const larg = largDe(c);
      page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
      const partes = String(c.t).split("\n");
      partes.forEach((ln, k) => {
        const tt = f.fit(ln, bold, 5.4, larg - 3);
        page.drawText(tt, { x: x + (larg - bold.widthOfTextAtSize(tt, 5.4)) / 2, y: topo - hGrupo - hSub - 6 - k * 6.5, size: 5.4, font: bold, color: GRAY });
      });
      x += larg;
    }
    page.drawLine({ start: { x: M, y: topo - hCabTab }, end: { x: M + W, y: topo - hCabTab }, thickness: 0.7, color: LINE });

    // linhas
    for (let k = 0; k < LINHAS_POR_FOLHA; k++) {
      const ly = topo - hCabTab - k * hLin;
      page.drawLine({ start: { x: M, y: ly - hLin }, end: { x: M + W, y: ly - hLin }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
      const l = doPedaco[k];
      if (!l) continue;
      let cx = M;
      for (const c of COLS) {
        const larg = largDe(c);
        // ⚠ `c` e `d` saem calculados quando não vierem gravados — o relatório antigo, feito antes
        // do cálculo existir, continua imprimindo o número certo.
        let v = l[c.k] == null ? "" : String(l[c.k]);
        if (!v && (c.k === "db_atenuacao" || c.k === "db_classe")) {
          const r = classificacaoIndicacao({ a: l.db_indicacao, b: l.db_referencia, percursoMm: l.percurso });
          const calc = c.k === "db_atenuacao" ? r.c : r.d;
          v = calc == null ? "" : String(calc);
        }
        if (v) {
          const cor = c.k !== "laudo" ? DARK : /^R/i.test(v) ? RED : /^A/i.test(v) ? GREEN : DARK;
          const fnt = c.k === "laudo" ? bold : font;
          const txt = f.fit(v, fnt, 6.2, larg - 4);
          const px = c.meio ? cx + (larg - fnt.widthOfTextAtSize(txt, 6.2)) / 2 : cx + 3;
          page.drawText(txt, { x: px, y: ly - 9, size: 6.2, font: fnt, color: cor });
        }
        cx += larg;
      }
    }

    if (p === paginas - 1) {
      // ── legenda + declaração ──
      const hDec = 30;
      const topoDec = f.bloco(hDec);
      page.drawText("A - Aceitação        R - Rejeição        REC - Recomendação de exame complementar",
        { x: M + 7, y: topoDec - 11, size: 6, font: bold, color: GRAY });
      page.drawText(san("Certificamos que as declarações do presente relatório correspondem ao ensaio realizado e estão de acordo com o procedimento e a norma citados."),
        { x: M + 7, y: topoDec - 22, size: 6, font, color: GRAY });

      f.blocoTexto("OBSERVAÇÕES:", rel.observacoes || "", { alt: 30, linhas: 2 });
      f.blocoInstrumentos(rel.equipamentos, res.norma ? `*Norma de referência: ${res.norma}` : null);
      await f.blocoAssinaturas(assinaturas, ["Inspetor", "Controle de Qualidade", "Cliente"]);
    }
  }

  // ── FOTOS: FOLHA A MAIS, MESMO FORMATO ──────────────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos testes, tanto
  // para o computador quanto para o celular; posso colocar foto em qualquer relatório — alguns têm
  // campos específicos, e para os que não têm você cria uma página para anexar essas imagens".
  //
  // ⚠ Reusa a folha do EVS de propósito: é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção.
  if (Array.isArray(fotos) && fotos.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas });
  }

  return doc.pdf.save();
}
