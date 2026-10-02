import "server-only";
import { abrirDocumento, M, san, DARK, GRAY, LINE, SOFT } from "./relatorio-form-pdf";
import { amostrasCalculadas, arredondar, camposCabecalhoSais, laudoSais, mediaDensidade, numeroMedida, N_AMOSTRAS } from "./sais-campos";
import { abrirSuperficie, faixa, identificacao, linha, linhaLaudo, nota, pecaNoCorpo, fotosNoCorpo, fecharSuperficie } from "./relatorio-superficie-pdf";

// RELATÓRIO DE CONTAMINAÇÃO DA SUPERFÍCIE POR SAIS (RCS) — modelo "Relatório de Sais.xlsx".
//
// ⚠ A ORDEM DOS BLOCOS É A DO MODELO: identificação, INFORMAÇÕES, ENSAIO (cinco amostras em colunas),
// requisito/média, LAUDO, observações, REGISTRO FOTOGRÁFICO e as assinaturas. Quem confere o documento
// com a planilha ao lado acha cada coisa no mesmo lugar.

export const TITULO_SAIS = "RELATÓRIO DE CONTAMINAÇÃO DA SUPERFÍCIE POR SAIS";
const SUBTITULO = "Contaminação da Superfície por Sais — ISO 8502-6 / 8502-9";

// o que sai da conta vai sempre com uma casa ("9,0", não "9"): a coluna lê alinhada, como a planilha
const n1 = (v) => (v == null ? "" : arredondar(v, 1).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
// a leitura como foi LIDA — mesmas casas, só com vírgula ("0.125" do aparelho sai "0,125", "12.0" sai "12,0");
// o que não é número sai como veio
const lido = (v) => {
  const s = String(v ?? "").trim();
  return numeroMedida(s) == null ? s : s.replace(".", ",");
};

export async function gerarSaisPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const resultados = rel.resultados || {};
  const res = camposCabecalhoSais(rel);
  const amostras = amostrasCalculadas(resultados);
  const media = mediaDensidade(resultados);
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];

  const fl = abrirSuperficie(doc, rel, { titulo: TITULO_SAIS, cliente, assinaturas });
  faixa(fl, SUBTITULO);
  identificacao(fl, rel, res, { cliente, obra, refCliente });

  // ── informações ──
  faixa(fl, "INFORMAÇÕES", 16);
  const peca = pecaNoCorpo(fl.f, res.peca || "");
  linha(fl, [["PEÇA INSPECIONADA:", peca.celula, 0.62], ["ETAPA DA PINTURA:", res.etapaPintura || "", 0.38]]);
  linha(fl, [["VOLUME DE ÁGUA INJETADO (ml):", res.volumeAgua || "", 0.62], ["ÁREA DA CÉLULA (cm²):", res.areaCelula || "", 0.38]]);
  linha(fl, [["APARELHO:", res.aparelho || "", 0.4], ["MODELO:", res.apModelo || "", 0.34], ["TAG:", res.apTag || "", 0.26]]);
  linha(fl, [["TERMÔMETRO:", res.termometro || "", 0.4], ["MODELO:", res.tmModelo || "", 0.34], ["TAG:", res.tmTag || "", 0.26]]);

  // ── ensaio: as cinco amostras em colunas, como no modelo ──
  const linhasTab = [
    ["Condutividade da água deionizada (µS/cm)", (a) => lido(a.condAgua)],
    ["Condutividade da amostra (µS/cm)", (a) => lido(a.condAmostra)],
    // ⚠ "Diferença", não "Δ": a fonte padrão do PDF (WinAnsi) não tem letra grega
    ["Diferença de condutividade (µS/cm)", (a) => n1(a.delta)],
    ["Densidade de sais (mg/m²)", (a) => (a.densidade == null ? "" : `${n1(a.densidade)}${a.densidadeCalculada ? "*" : ""}`)],
    ["Hora do ensaio", (a) => a.hora],
  ];
  const hCab = 14, hLin = 14;
  const alt = hCab + linhasTab.length * hLin;
  faixa(fl, "ENSAIO", alt);
  const f = fl.f;
  const { page, font, bold, W } = f;
  const topo = f.bloco(alt);
  const wDesc = W * 0.36, wCol = (W - wDesc) / N_AMOSTRAS;
  page.drawRectangle({ x: M, y: topo - hCab, width: W, height: hCab, color: SOFT });
  page.drawText("Descrição", { x: M + 7, y: topo - 10, size: 6.8, font: bold, color: GRAY });
  for (let i = 0; i < N_AMOSTRAS; i++) {
    const x = M + wDesc + i * wCol;
    page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
    const t = `Amostra ${i + 1}`;
    page.drawText(t, { x: x + (wCol - bold.widthOfTextAtSize(t, 6.8)) / 2, y: topo - 10, size: 6.8, font: bold, color: GRAY });
  }
  linhasTab.forEach(([rot, ler], r) => {
    const y = topo - hCab - r * hLin;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: LINE });
    page.drawText(f.fit(rot, font, 6.8, wDesc - 10), { x: M + 7, y: y - 10, size: 6.8, font, color: DARK });
    amostras.forEach((a, i) => {
      const v = san(String(ler(a) ?? "").trim());
      if (!v) return;
      const x = M + wDesc + i * wCol;
      const t = f.fit(v, bold, 7.5, wCol - 6);
      page.drawText(t, { x: x + (wCol - bold.widthOfTextAtSize(t, 7.5)) / 2, y: y - 10, size: 7.5, font: bold, color: DARK });
    });
  });

  linha(fl, [["REQUISITO DE ACEITAÇÃO (mg/m²):", res.requisito || "", 0.62], ["MÉDIA (mg/m²):", n1(media), 0.38]]);
  linhaLaudo(fl, laudoSais(resultados));
  // ⚠ o documento diz quando a densidade saiu da conta — ninguém confunde com leitura do aparelho
  if (amostras.some((a) => a.densidadeCalculada)) {
    nota(fl, "* densidade calculada pela ISO 8502-9: densidade = 5 x V x diferença de condutividade / A (V em ml, condutividade em µS/cm, A em cm²).");
  }

  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  fl.instrumentos(rel.equipamentos);
  const resto = await fotosNoCorpo(doc, fl, lista);
  if (peca.completa) fl.texto("RELAÇÃO COMPLETA DAS PEÇAS INSPECIONADAS:", peca.completa);
  return fecharSuperficie(doc, fl, rel, resto, { titulo: TITULO_SAIS, cliente, obra, assinaturas });
}
