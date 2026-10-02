import "server-only";
import { abrirDocumento, M, san, quebrarTexto, DARK, GRAY, LINE, SOFT } from "./relatorio-form-pdf";
import { CLASSES_POEIRA, camposCabecalhoPoeira, classificacaoParticulas, maiorTamanhoAcima, mediaQuantidade, testesPoeira } from "./poeira-campos";
import { abrirSuperficie, faixa, identificacao, linha, linhaLaudo, pecaNoCorpo, fotosNoCorpo, fecharSuperficie } from "./relatorio-superficie-pdf";

// RELATÓRIO DE TESTE DE POEIRA (RTP) — modelo "Relatório de Poeira.xlsx".
//
// ⚠ A ORDEM DOS BLOCOS É A DO MODELO: identificação, INFORMAÇÕES, ENSAIO (testes A a E), média e
// classificação, LAUDO, a tabela de referência da ISO 8502-3, observações, REGISTRO FOTOGRÁFICO e as
// assinaturas. A tabela da norma vai impressa porque é ela que dá sentido às classes de 0 a 5 — quem lê
// "classe 3" no papel precisa saber, ali, que são partículas de até 0,5 mm.

export const TITULO_POEIRA = "RELATÓRIO DE TESTE DE POEIRA";
const SUBTITULO = "Inspeção de Poeira — ISO 8502-3";

// ⚠ cabeçalho em DUAS linhas: "Tamanho das Partículas (Classe 0–5)" numa linha só saía cortado
const COLS = [
  { t: "Local", w: 0.25 },
  { t: "Quantidade de Poeira\n(Classe 0–5)", w: 0.22, meio: true, k: "quantidade" },
  { t: "Tamanho das Partículas\n(Classe 0–5)", w: 0.22, meio: true, k: "tamanho" },
  { t: "Observação", w: 0.31, k: "obs" },
];
const TAM = 7.2, ENTRELINHA = 8.5;

export async function gerarPoeiraPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const resultados = rel.resultados || {};
  const res = camposCabecalhoPoeira(rel);
  const testes = testesPoeira(resultados);
  const media = mediaQuantidade(resultados);
  const classif = classificacaoParticulas(resultados);
  const maior = maiorTamanhoAcima(resultados);
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];

  const fl = abrirSuperficie(doc, rel, { titulo: TITULO_POEIRA, cliente, assinaturas });
  faixa(fl, SUBTITULO);
  identificacao(fl, rel, res, { cliente, obra, refCliente, rotuloDoc: "DOCUMENTOS DE REFERÊNCIA:" });

  // ── informações ──
  faixa(fl, "INFORMAÇÕES", 16);
  const peca = pecaNoCorpo(fl.f, res.peca || "");
  linha(fl, [["PEÇA INSPECIONADA:", peca.celula, 0.62], ["ETAPA DA PINTURA:", res.etapaPintura || "", 0.38]]);
  linha(fl, [["FITA ADESIVA:", res.fitaAdesiva || "", 0.62], ["AMPLIAÇÃO:", res.ampliacao || "", 0.38]]);

  // ── ensaio: testes A a E ──
  // ⚠⚠ A LINHA CRESCE COM O TEXTO. Local e observação saíam numa linha só, com "…": a rota aceita 120 e
  // 200 caracteres, e o papel mostrava 30 e 45.
  const { font, bold, W } = fl.f;
  const celulas = testes.map((t) => COLS.map((c, i) => {
    const v = i === 0 ? `Teste ${t.letra}${String(t.local || "").trim() ? ` — ${t.local}` : ""}` : String(t[c.k] ?? "").trim();
    return quebrarTexto(v, i === 0 ? font : bold, TAM, W * c.w - 14);
  }));
  const hLinhas = celulas.map((cs) => 14 + (Math.max(1, ...cs.map((l) => l.length)) - 1) * ENTRELINHA);
  const hCab = 20;
  const alt = hCab + hLinhas.reduce((a, b) => a + b, 0);
  faixa(fl, "ENSAIO", alt);
  const f = fl.f;
  const page = f.page;
  const topo = f.bloco(alt);
  page.drawRectangle({ x: M, y: topo - hCab, width: W, height: hCab, color: SOFT });
  let x = M;
  COLS.forEach((c, i) => {
    const larg = W * c.w;
    if (i > 0) page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
    const partes = c.t.split("\n");
    partes.forEach((ln, k) => {
      const t = f.fit(ln, bold, 6.6, larg - 8);
      const yy = partes.length > 1 ? topo - 8.5 - k * 7.5 : topo - 12;
      page.drawText(t, { x: c.meio ? x + (larg - bold.widthOfTextAtSize(t, 6.6)) / 2 : x + 7, y: yy, size: 6.6, font: bold, color: GRAY });
    });
    x += larg;
  });
  let y = topo - hCab;
  celulas.forEach((cs, r) => {
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: LINE });
    let cx = M;
    COLS.forEach((c, i) => {
      const larg = W * c.w;
      const fnt = i === 0 ? font : bold;
      cs[i].forEach((ln, j) => {
        page.drawText(ln, { x: c.meio ? cx + (larg - fnt.widthOfTextAtSize(ln, TAM)) / 2 : cx + 7, y: y - 10 - j * ENTRELINHA, size: TAM, font: fnt, color: DARK });
      });
      cx += larg;
    });
    y -= hLinhas[r];
  });

  linha(fl, [
    ["AVALIAÇÃO DA QUANTIDADE (MÉDIA):", media == null ? "" : `Classe ${media}`, 0.5],
    // ⚠ classificação marcada abaixo da maior encontrada sai com a maior ao lado — ver poeira-campos
    ["CLASSIFICAÇÃO DAS PARTÍCULAS:", classif == null ? "" : `Classe ${classif}${maior != null ? ` (maior encontrada: ${maior})` : ""}`, 0.5],
  ]);
  // o laudo é o "Resultado da inspeção" do relatório (ver lib/poeira-campos)
  linhaLaudo(fl, String(rel.resultadoInspecao || "").toUpperCase());

  // ── a tabela de referência da norma ──
  const hRef = 11.5;
  const altRef = hRef * (CLASSES_POEIRA.length + 1);
  faixa(fl, "CLASSIFICAÇÃO — ISO 8502-3 (Referência)", altRef);
  const fr = fl.f;
  const topoRef = fr.bloco(altRef);
  const wC = W * 0.1, wQ = W * 0.4;
  const colsRef = [["Classe", wC], ["Quantidade de Poeira", wQ], ["Tamanho das Partículas (diâmetro)", W - wC - wQ]];
  fr.page.drawRectangle({ x: M, y: topoRef - hRef, width: W, height: hRef, color: SOFT });
  let rx = M;
  colsRef.forEach(([t, w], i) => {
    if (i > 0) fr.page.drawLine({ start: { x: rx, y: topoRef }, end: { x: rx, y: topoRef - altRef }, thickness: 0.6, color: LINE });
    fr.page.drawText(san(t), { x: rx + 6, y: topoRef - 8.5, size: 6.4, font: bold, color: GRAY });
    rx += w;
  });
  CLASSES_POEIRA.forEach((c, r) => {
    const yy = topoRef - hRef * (r + 1);
    fr.page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness: 0.4, color: LINE });
    fr.page.drawText(String(c.classe), { x: M + 6, y: yy - 8.5, size: 6.4, font: bold, color: DARK });
    fr.page.drawText(fr.fit(c.quantidade, font, 6.4, wQ - 10), { x: M + wC + 6, y: yy - 8.5, size: 6.4, font, color: DARK });
    fr.page.drawText(fr.fit(c.tamanho, font, 6.4, W - wC - wQ - 10), { x: M + wC + wQ + 6, y: yy - 8.5, size: 6.4, font, color: DARK });
  });

  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  fl.instrumentos(rel.equipamentos);
  const resto = await fotosNoCorpo(doc, fl, lista);
  if (peca.completa) fl.texto("RELAÇÃO COMPLETA DAS PEÇAS INSPECIONADAS:", peca.completa);
  return fecharSuperficie(doc, fl, rel, resto, { titulo: TITULO_POEIRA, cliente, obra, assinaturas });
}
