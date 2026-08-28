import "server-only";
import {
  abrirDocumento, novaFolha, A4, M, LARGURA, san,
  GRAY, LINE, SOFT, RED, GREEN,
} from "./relatorio-form-pdf";
import { CRITERIO_PADRAO, PROCEDIMENTO_PADRAO, conferirEnsaio } from "./lp-campos";

// ─── REGISTRO DE ENSAIO POR LÍQUIDO PENETRANTE ────────────────────────────────
// Vitor (22/08/2026): "vamos para o relatório de LP agora... precisa seguir a mesma
// linha, como Excel, porém trazer as informações pertinentes do procedimento e do
// relatório que coloquei de amostra".
//
// Modelo: aba do "Modelos de relatórios de qualidade torg 1.xlsx" —
// FORM. SGQ - 012, bilíngue, conferido também contra um emitido de verdade
// (LP_269_26_T70, OP-070). Procedimento: PO-15 R1.
//
// A folha tem seções nomeadas, e é essa a diferença dos outros modelos:
//   IDENTIFICAÇÃO · PARÂMETROS DO ENSAIO · REGISTROS DOS RESULTADOS · LEGENDA ·
//   INSTRUMENTOS · OBSERVAÇÕES / MAPA DE INDICAÇÕES · assinaturas
//
// ⚠ OS RÓTULOS SÃO BILÍNGUES porque o documento vai para fiscalização de cliente que
// lê em inglês — é assim no modelo e no emitido, e não é enfeite.

const COLS = [
  { t: "JUNTA / PEÇA", en: "Joint / Part", k: "marca", w: 0.22 },
  { t: "Nº DA INDICAÇÃO", en: "Indication No.", k: "indicacaoLp", w: 0.15, meio: true },
  { t: "LOCAL", en: "Place", k: "local", w: 0.15, meio: true },
  { t: "TAMANHO", en: "Size", k: "tamanho", w: 0.13, meio: true },
  { t: "TIPO DE DEFEITO", en: "Defect Type", k: "tipoDefeito", w: 0.20, meio: true },
  { t: "LAUDO", en: "Certificate", k: "laudo", w: 0.15, meio: true },
];

const LINHAS_POR_FOLHA = 20;

const LEGENDA = [
  "A - APROVADO (Approved)      R - REPROVADO (Rejected)      REC - RECOMENDAÇÃO DE EXAME COMPLEMENTAR (Recommended Additional Test)",
  "IL - INDICAÇÃO LINEAR (Linear Indication)      IA - INDICAÇÃO ARREDONDADA (Rounded Indication)      INR - INDICAÇÃO NÃO RELEVANTE (Non-relevant)",
];

/** Rótulo em duas linhas: português em cima, inglês embaixo — como no modelo. */
function tituloColuna(f, page, bold, font, texto, en, x, larg, topo) {
  const t = f.fit(texto, bold, 5.8, larg - 3);
  page.drawText(t, { x: x + (larg - bold.widthOfTextAtSize(t, 5.8)) / 2, y: topo - 8, size: 5.8, font: bold, color: GRAY });
  const e = f.fit(`(${en})`, font, 4.8, larg - 3);
  page.drawText(e, { x: x + (larg - font.widthOfTextAtSize(e, 4.8)) / 2, y: topo - 15, size: 4.8, font, color: GRAY });
}

export async function gerarLPPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const paginas = Math.max(1, Math.ceil(linhas.length / LINHAS_POR_FOLHA));

  // O ensaio respeitou os tempos e a iluminação do PO-15? Sai na folha, não só na tela:
  // quem confere o documento meses depois precisa ver que isso foi verificado.
  const check = conferirEnsaio({
    tipo: res.tipoPenetrante, lux: res.iluminacao, uv: res.uv, tempSuperficie: res.temperatura,
    penetracao: res.tempoPenetracao, secagem: res.tempoSecagem, revelador: res.tempoRevelador,
  });

  for (let p = 0; p < paginas; p++) {
    const f = novaFolha(doc);
    const { page, font, bold, W } = f;
    const doPedaco = linhas.slice(p * LINHAS_POR_FOLHA, (p + 1) * LINHAS_POR_FOLHA);

    f.cabecalho({
      titulo: "REGISTRO DE ENSAIO POR LÍQUIDO PENETRANTE",
      codigo: rel.codigo,
      revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null,
      emitidoEm: rel.emitidoEm, folha: p + 1, total: paginas,
    });

    // ── IDENTIFICAÇÃO ──
    secao(f, page, bold, W, "IDENTIFICAÇÃO (Identification)");
    f.linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE (Client):", cliente || "", 0.5]]);
    f.linhaInfoAuto([["O.S (Order):", `OP-${rel.opNumero}`], ["OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]);
    f.linhaInfo([
      ["DOC. DE INSPEÇÃO (Document):", res.documentoInspecao || "", 0.5],
      ["DATA DE INSPEÇÃO (Date):", res.dataInspecao || "", 0.5],
    ]);
    f.linhaInfo([
      ["COMPONENTE INSPECIONADO (Component):", res.componente || "", 0.5],
      ["DESENHO (Drawing):", res.desenho || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : ""), 0.32],
      ["REVISÃO (Rev.):", res.revisaoDesenho || "-", 0.18],
    ]);
    // ⚠ RÓTULO CURTO NESTA LINHA. Com os quatro campos e o nome bilíngue completo sobravam
    // ~30 pt por valor e TUDO saía cortado: "E...", "F...". O rótulo se entende sem o inglês
    // (as duas primeiras linhas já ensinaram o par); o VALOR é que não pode sumir.
    f.linhaInfo([
      ["METAL BASE / ESP.:", res.metalBase || "", 0.30],
      ["METAL DE ADIÇÃO:", res.metalAdicao || "", 0.22],
      ["PROC. SOLDAGEM:", res.processoSolda || "", 0.22],
      ["COND. SUPERFICIAIS:", res.condicoes || "", 0.26],
    ]);

    // ── PARÂMETROS DO ENSAIO ──
    secao(f, page, bold, W, "PARÂMETROS DO ENSAIO (Examination Parameters)");
    const fluor = res.tipoPenetrante === "I";
    f.linhaInfo([
      ["PENETRANTE — TIPO/LOTE:", `${res.penetranteMarca || ""}${res.penetranteLote ? ` / ${res.penetranteLote}` : ""}`, 0.40],
      ["TEMPO (Dwell):", res.tempoPenetracao ? `${res.tempoPenetracao} min` : "", 0.18],
      // na amostra o método aparece como a letra ("Tipo ll - A"); o nome inteiro não cabe
      // e não acrescenta — quem lê LP sabe o que é o método A.
      ["MÉTODO:", String(res.metodo || "").split(/[\s—-]/)[0], 0.14],
      // ⚠ o modelo tem caixas Fluorescente/Visível: aqui vira texto, porque a caixa marcada
      // num PDF gerado não acrescenta nada e o texto é lido por quem audita.
      ["TIPO (Type):", fluor ? "Tipo I - Fluorescente" : res.tipoPenetrante === "II" ? "Tipo II - Visível" : "", 0.28],
    ]);
    f.linhaInfo([
      ["REMOVEDOR — TIPO/LOTE:", `${res.removedor || ""}${res.removedorLote ? ` / ${res.removedorLote}` : ""}`, 0.40],
      ["TEMPO SECAGEM (Drying):", res.tempoSecagem ? `${res.tempoSecagem} min` : "", 0.30],
      ["TEMPERATURA (Temp.):", res.temperatura ? `${res.temperatura} °C` : "", 0.30],
    ]);
    f.linhaInfo([
      ["REVELADOR — TIPO/LOTE:", `${res.revelador || ""}${res.reveladorLote ? ` / ${res.reveladorLote}` : ""}`, 0.40],
      ["TEMPO INTERP. (Interp.):", res.tempoRevelador ? `${res.tempoRevelador} min` : "", 0.30],
      ["EQUIP. ILUMINAÇÃO (Lighting):", res.iluminacao ? `${res.iluminacao} lux${res.uv ? ` / ${res.uv} µW/cm²` : ""}` : "", 0.30],
    ]);
    f.linhaInfo([
      ["PROCEDIMENTO / REV.:", res.procedimento || PROCEDIMENTO_PADRAO, 0.42],
      // ⚠ sem critério gravado sai o do PO-15: campo vazio num documento que vai ao cliente é
      // dizer que a peça foi julgada contra nada.
      ["NORMA / CRITÉRIO DE ACEITAÇÃO:", res.criterio || CRITERIO_PADRAO, 0.58],
    ]);

    // ⚠ o ensaio fora do procedimento aparece na FOLHA. Tempo de penetração curto ou luz
    // insuficiente invalidam o ensaio sem deixar rastro no resultado — é o tipo de coisa que
    // só se descobre relendo o registro, e por isso ela tem de estar nele.
    if (p === 0 && check.avaliado && !check.conforme) {
      const alt = 11 + check.problemas.length * 8;
      const topo = f.bloco(alt);
      page.drawText(san("ENSAIO FORA DO PROCEDIMENTO:"), { x: M + 7, y: topo - 9, size: 6.4, font: bold, color: RED });
      check.problemas.forEach((pr, i) => {
        page.drawText(f.fit(pr, font, 5.8, W - 150), { x: M + 130, y: topo - 9 - i * 8, size: 5.8, font, color: RED });
      });
    }

    // ── REGISTROS DOS RESULTADOS ──
    const hLin = 13, hCabTab = 21;
    const alt = hCabTab + LINHAS_POR_FOLHA * hLin;
    const topoTit = f.bloco(14, SOFT);
    const tTit = "REGISTROS DOS RESULTADOS (Registers of the Results)";
    page.drawText(san(tTit), { x: M + (W - bold.widthOfTextAtSize(san(tTit), 7)) / 2, y: topoTit - 10, size: 7, font: bold, color: GRAY });

    const topo = f.bloco(alt);
    let x = M;
    for (const [i, c] of COLS.entries()) {
      const larg = W * c.w;
      if (i > 0) page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
      tituloColuna(f, page, bold, font, c.t, c.en, x, larg, topo);
      x += larg;
    }
    page.drawLine({ start: { x: M, y: topo - hCabTab }, end: { x: M + W, y: topo - hCabTab }, thickness: 0.7, color: LINE });

    for (let i = 0; i < LINHAS_POR_FOLHA; i++) {
      const ly = topo - hCabTab - i * hLin;
      if (i > 0) page.drawLine({ start: { x: M, y: ly }, end: { x: M + W, y: ly }, thickness: 0.35, color: LINE });
      const l = doPedaco[i];
      if (!l) continue;
      let cx = M;
      for (const c of COLS) {
        const larg = W * c.w;
        const v = san(l[c.k] ?? "");
        if (v) {
          const reprovado = c.k === "laudo" && String(v).toUpperCase().startsWith("R");
          const fnt = reprovado ? bold : font;
          const cor = reprovado ? RED : c.k === "laudo" && String(v).toUpperCase().startsWith("A") ? GREEN : undefined;
          let tam = 7;
          while (tam > 5.6 && fnt.widthOfTextAtSize(v, tam) > larg - 6) tam = +(tam - 0.2).toFixed(2);
          const txt = f.fit(v, fnt, tam, larg - 6);
          const px = c.meio ? cx + (larg - fnt.widthOfTextAtSize(txt, tam)) / 2 : cx + 4;
          page.drawText(txt, { x: px, y: ly - 9, size: tam, font: fnt, color: cor });
        }
        cx += larg;
      }
    }

    // ── LEGENDA ──
    const hLeg = 12 + LEGENDA.length * 8.5 + 4;
    const topoLeg = f.bloco(hLeg);
    f.rotulo(M + 7, topoLeg - 9, "LEGENDA (Legend)");
    // ⚠ FORM. SGQ - 012 é a identidade do formulário no SGQ. Está no modelo e no emitido, e
    // é por ele que a Qualidade sabe qual versão da folha está lendo.
    page.drawText("FORM. SGQ - 012", {
      x: M + W - bold.widthOfTextAtSize("FORM. SGQ - 012", 5.6) - 7,
      y: topoLeg - 9, size: 5.6, font: bold, color: GRAY,
    });
    LEGENDA.forEach((ln, i) => {
      page.drawText(san(ln), { x: M + 7, y: topoLeg - 19 - i * 8.5, size: 5.6, font, color: GRAY });
    });

    if (p === paginas - 1) {
      f.blocoTexto("OBSERVAÇÕES / MAPA DE INDICAÇÕES (Remarks / Map of indications):", rel.observacoes || "", { alt: 40, linhas: 3 });
      f.blocoInstrumentos(rel.equipamentos, `*Procedimento: ${res.procedimento || PROCEDIMENTO_PADRAO} · Critério: ${res.criterio || CRITERIO_PADRAO}`);
      await f.blocoAssinaturas(assinaturas, ["Identif. do inspetor / Nível", "Aprovado por", "Cliente / Fiscalização"]);
    }
  }

  // As fotos do LP são o mapa de indicações — preparação, penetração e revelação.
  const { paginaDeFotos } = await import("./relatorio-evs-pdf");
  await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas, titulo: "MAPA DE INDICAÇÕES (Map of indications)" });

  return doc.pdf.save();
}

/** Faixa de seção — é o que o modelo do LP tem e os outros não. */
function secao(f, page, bold, W, texto) {
  const topo = f.bloco(12, SOFT);
  page.drawText(san(texto), { x: M + (W - bold.widthOfTextAtSize(san(texto), 6.6)) / 2, y: topo - 8.5, size: 6.6, font: bold, color: GRAY });
}
