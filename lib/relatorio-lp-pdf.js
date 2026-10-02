import "server-only";
import { abrirDocumento, M, san, quebrarTexto, alturaInstrumentos, alturaTexto, GRAY, SOFT, RED } from "./relatorio-form-pdf";
import { criarFluxo } from "./relatorio-fluxo-pdf";
import { tabelaLP } from "./relatorio-lp-tabela-pdf";
import { CRITERIO_PADRAO, PROCEDIMENTO_PADRAO, conferirEnsaio } from "./lp-campos";

export { corDoLaudo } from "./relatorio-lp-tabela-pdf";

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
// (a tabela e a legenda moram em lib/relatorio-lp-tabela-pdf.js)
//
// ⚠ OS RÓTULOS SÃO BILÍNGUES porque o documento vai para fiscalização de cliente que
// lê em inglês — é assim no modelo e no emitido, e não é enfeite.
//
// ⚠⚠ TUDO PASSA PELO FLUXO (lib/relatorio-fluxo-pdf), desde a verificação dos modelos (02/10/2026):
// cada bloco reserva o seu espaço antes de ser desenhado, o que não cabe continua na folha seguinte,
// as assinaturas saem em TODAS as folhas e o "FOLHA x DE y" é contado no fim, com as folhas de foto.
// Antes, com os 4 instrumentos do próprio modelo e a assinatura desenhada, nomes e datas saíam abaixo do
// papel; com mais de 20 linhas a folha 1 saía sem assinatura; as observações sumiam depois da 3ª linha.

export const TITULO_LP = "REGISTRO DE ENSAIO POR LÍQUIDO PENETRANTE";
// ⚠ as folhas de foto dizem de que relatório são — "MAPA DE INDICAÇÕES" sozinho, numa folha solta, não
// dizia que era LP (verificação, 02/10/2026); e as fotos do LP SÃO o mapa de indicações
const TITULO_FOTOS = `${TITULO_LP} — MAPA DE INDICAÇÕES`;
// as colunas do convite: inspetor (0) → Torg Metal (1) → cliente (2) — ver lib/assinatura-quadros.
// ⚠ os MESMOS nas folhas de foto: com outros nomes lá, a assinatura casava numa folha e sumia na outra.
export const PAPEIS_LP = ["Identif. do inspetor / Nível", "Aprovado por", "Cliente / Fiscalização"];
const ROTULO_OBS = "OBSERVAÇÕES / MAPA DE INDICAÇÕES (Remarks / Map of indications):";

const revisao = (rel) => (rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null);
const numero = (rel) => [rel.codigo || "", revisao(rel)].filter(Boolean).join(" ");

/**
 * A data como foi digitada. "aaaa-mm-dd" do <input type="date"> vira dd/mm/aaaa SEM passar por fuso:
 * meia-noite UTC em São Paulo ainda é o dia anterior (mesma lição do prazo de Compras). O resto sai
 * como veio — data não se inventa.
 */
function dataDigitada(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export async function gerarLPPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  const equipamentos = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];

  const fl = criarFluxo(doc, {
    cabecalho: { titulo: TITULO_LP, codigo: rel.codigo, revisao: revisao(rel), emitidoEm: rel.emitidoEm },
    // a folha de continuação ainda diz de que obra e de que relatório é
    identificacaoCurta: (f) => f.linhaInfoCresce([
      ["O.P (Order):", `OP-${rel.opNumero}`, 0.2], ["CLIENTE (Client):", cliente || "", 0.5], ["RLP Nº (LPR):", numero(rel), 0.3],
    ], { maxLinhas: 12 }),
    assinaturas, papeis: PAPEIS_LP, inspetor: rel.inspetor,
  });

  const desenhoCompleto = identificacao(fl, rel, res, { cliente, obra, refCliente });
  parametros(fl, res);
  // ⚠ o ensaio fora do procedimento aparece na FOLHA. Tempo de penetração curto ou luz
  // insuficiente invalidam o ensaio sem deixar rastro no resultado — é o tipo de coisa que
  // só se descobre relendo o registro, e por isso ela tem de estar nele.
  foraDoProcedimento(fl, conferirEnsaio({
    tipo: res.tipoPenetrante, lux: res.iluminacao, uv: res.uv, tempSuperficie: res.temperatura,
    penetracao: res.tempoPenetracao, secagem: res.tempoSecagem, revelador: res.tempoRevelador,
  }));

  // ── REGISTROS DOS RESULTADOS (+ LEGENDA em cada folha da tabela) ──
  // o rodapé que vem depois: as linhas vazias da tabela só ocupam o que ele deixar livre
  const rodape = alturaInstrumentos(equipamentos.length) + alturaTexto(fl.f.linhasTexto(rel.observacoes || "").length, 40)
    + (desenhoCompleto ? alturaTexto(fl.f.linhasTexto(desenhoCompleto).length) : 0);
  tabelaLP(fl, (Array.isArray(rel.linhas) ? rel.linhas : []).filter(Boolean), rodape);

  // ── INSTRUMENTOS, depois OBSERVAÇÕES — a ordem do modelo ──
  // ⚠ procedimento e critério não se repetem aqui: saem inteiros na última linha dos parâmetros.
  instrumentos(fl, equipamentos);
  fl.texto(ROTULO_OBS, rel.observacoes || "", { vazio: 40 });
  if (desenhoCompleto) fl.texto("RELAÇÃO COMPLETA — DESENHO TORG (TORG Drawing):", desenhoCompleto);

  // As fotos do LP são o mapa de indicações — preparação, penetração e revelação.
  const lista = (Array.isArray(fotos) ? fotos : []).filter(Boolean);
  if (lista.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    await paginaDeFotos(doc, rel, lista, { cliente, obra, assinaturas, paginas: fl.quantas, titulo: TITULO_FOTOS, papeis: PAPEIS_LP });
  }
  // ⚠ depois das fotos: o total de folhas só se sabe aqui
  await fl.fechar(doc.pdf.getPageCount());
  return doc.pdf.save();
}

/** IDENTIFICAÇÃO. Devolve a relação completa do desenho quando ela não coube na célula. */
function identificacao(fl, rel, res, { cliente, obra, refCliente }) {
  secao(fl, "IDENTIFICAÇÃO (Identification)", 16);
  linha(fl, [["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE (Client):", cliente || "", 0.5]]);
  // ⚠ "O.P (Order)", como no modelo — saía "O.S" num documento de ordem de produção (02/10/2026)
  linha(fl, peloConteudo(fl.f, [["O.P (Order):", `OP-${rel.opNumero}`], ["OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]));
  const desenhoCompleto = desenhoTorg(fl, res, Array.isArray(rel.marcas) ? rel.marcas : []);
  linha(fl, [
    ["DOC. DE INSPEÇÃO (Document):", res.documentoInspecao || "", 0.5],
    ["DATA DE INSPEÇÃO (Date):", dataDigitada(res.dataInspecao), 0.5],
  ]);
  // ⚠ O COMPONENTE FICA, SOZINHO NA LINHA. Ela repetia o DESENHO e a REVISÃO da linha do desenho e não
  // está no modelo (02/10/2026) — mas o componente só existe aqui, e tirá-lo apagaria o dado.
  linha(fl, [["COMPONENTE INSPECIONADO (Component):", res.componente || "", 1]]);
  // ⚠ RÓTULO CURTO NESTA LINHA. Com os quatro campos e o nome bilíngue completo sobravam
  // ~30 pt por valor e TUDO saía cortado: "E...", "F...". O rótulo se entende sem o inglês
  // (as duas primeiras linhas já ensinaram o par); o VALOR é que não pode sumir.
  // ⚠ a junta soldada CRESCE em vez de cortar: a peça pode ter solda de dois processos, e o
  // cabeçalho lista as duas EPS (23/09/2026 — ver o mesmo aviso em relatorio-evs-pdf.js).
  linha(fl, [
    ["METAL BASE / ESP.:", res.metalBase || "", 0.30],
    ["METAL DE ADIÇÃO:", res.metalAdicao || "", 0.22],
    ["PROC. SOLDAGEM:", res.processoSolda || "", 0.22],
    ["COND. SUPERFICIAIS:", res.condicoes || "", 0.26],
  ]);
  linha(fl, [["EPS (WPS):", res.eps || "", 0.33], ["RQS (PQR):", res.rqs || "", 0.33], ["TIPO DE JUNTA (Joint Type):", res.tipoJunta || "", 0.34]]);
  return desenhoCompleto;
}

const tipoLote = (tipo, lote) => `${tipo || ""}${lote ? ` / ${lote}` : ""}`;
const minutos = (v) => (v ? `${v} min` : "");

/** PARÂMETROS DO ENSAIO. */
function parametros(fl, res) {
  secao(fl, "PARÂMETROS DO ENSAIO (Examination Parameters)", 16);
  const tipo = res.tipoPenetrante === "I" ? "Tipo I - Fluorescente" : res.tipoPenetrante === "II" ? "Tipo II - Visível" : "";
  linha(fl, [
    ["PENETRANTE — TIPO/LOTE:", tipoLote(res.penetranteMarca, res.penetranteLote), 0.40],
    ["TEMPO (Dwell):", minutos(res.tempoPenetracao), 0.18],
    // na amostra o método aparece como a letra ("Tipo ll - A"); o nome inteiro não cabe
    // e não acrescenta — quem lê LP sabe o que é o método A.
    ["MÉTODO:", String(res.metodo || "").split(/[\s—-]/)[0], 0.14],
    // ⚠ o modelo tem caixas Fluorescente/Visível: aqui vira texto, porque a caixa marcada
    // num PDF gerado não acrescenta nada e o texto é lido por quem audita.
    ["TIPO (Type):", tipo, 0.28],
  ]);
  // ⚠ 0,40 · 0,24 · 0,36 nas duas linhas, para as divisórias alinharem. A iluminação precisa da largura:
  // no fluorescente ela leva o lux E a luz negra, e saía "1200 µ..." (02/10/2026).
  linha(fl, [
    ["REMOVEDOR — TIPO/LOTE:", tipoLote(res.removedor, res.removedorLote), 0.40],
    ["TEMPO SECAGEM (Drying):", minutos(res.tempoSecagem), 0.24],
    ["TEMPERATURA (Temp.):", res.temperatura ? `${res.temperatura} °C` : "", 0.36],
  ]);
  linha(fl, [
    ["REVELADOR — TIPO/LOTE:", tipoLote(res.revelador, res.reveladorLote), 0.40],
    // ⚠ o número é o que as telas pedem como "tempo de interpretação" — ver lib/lp-campos.js
    ["TEMPO INTERP. (Interp.):", minutos(res.tempoRevelador), 0.24],
    // ⚠ "ILUMINAÇÃO (Lighting)", como no modelo: o valor é a luz MEDIDA, não o equipamento
    ["ILUMINAÇÃO (Lighting):", res.iluminacao ? `${res.iluminacao} lux${res.uv ? ` / ${res.uv} µW/cm²` : ""}` : "", 0.36],
  ]);
  linha(fl, [
    ["PROCEDIMENTO / REV.:", res.procedimento || PROCEDIMENTO_PADRAO, 0.42],
    // ⚠ sem critério gravado sai o do PO-15: campo vazio num documento que vai ao cliente é
    // dizer que a peça foi julgada contra nada.
    ["NORMA / CRITÉRIO DE ACEITAÇÃO:", res.criterio || CRITERIO_PADRAO, 0.58],
  ]);
}

/** Faixa de seção — é o que o modelo do LP tem e os outros não. `junto` = o que não se separa dela. */
function secao(fl, texto, junto = 0) {
  fl.reservar(12 + junto);
  const f = fl.f;
  const topo = f.bloco(12, SOFT);
  const s = san(texto);
  f.page.drawText(s, { x: M + (f.W - f.bold.widthOfTextAtSize(s, 6.6)) / 2, y: topo - 8.5, size: 6.6, font: f.bold, color: GRAY });
}

/** Linha de identificação que CRESCE com o valor (nunca "..."), com o espaço reservado antes. */
function linha(fl, campos, { maxLinhas = 12 } = {}) {
  fl.reservar(fl.f.medirInfoCresce(campos, { maxLinhas }).altura);
  return fl.f.linhaInfoCresce(campos, { maxLinhas });
}

/**
 * Reparte a largura pelo CONTEÚDO, como `linhaInfoAuto` — obra longa e referência curta, ou o
 * contrário —, mas para a linha que cresce. Cabendo tudo, na proporção. Não cabendo, quem cabe na sua
 * parte fica inteiro numa linha e só o mais longo quebra: dividir a falta por todos quebrava a obra E a
 * referência ("TPR763 / TPR803 /" + "TPR804").
 */
function peloConteudo(f, campos) {
  // rótulo + valor + os 20 pt de respiro da célula (`linhaInfoCresce`) + 4 de folga, para não quebrar no limite
  const custo = campos.map(([r, v]) => f.bold.widthOfTextAtSize(san(r), 6.4) + f.bold.widthOfTextAtSize(san(v ?? ""), 8) + 24);
  const total = custo.reduce((a, b) => a + b, 0);
  let larg = custo.map((c) => (c / total) * f.W);
  if (total > f.W) {
    larg = [];
    let restante = f.W, abertos = custo.map((_, i) => i);
    while (abertos.length) {
      const quota = restante / abertos.length;
      const inteiros = abertos.filter((i) => custo[i] <= quota);
      if (!inteiros.length) { for (const i of abertos) larg[i] = quota; break; }
      for (const i of inteiros) { larg[i] = custo[i]; restante -= custo[i]; }
      abertos = abertos.filter((i) => !inteiros.includes(i));
    }
  }
  return campos.map(([r, v], i) => [r, v, larg[i] / f.W]);
}

const ROT_DESENHO = "DESENHO TORG (TORG Drawing):", ROT_DESENHO_CLI = "DESENHO CLIENTE (Client Drawing):";

/**
 * DESENHO TORG / REV. / DESENHO CLIENTE / REV. — numa linha, como no modelo, enquanto cabem em duas
 * linhas de texto. Sem desenho informado sai a relação de peças, e ela pode ter 40 marcas: aí o desenho
 * ganha a largura da folha, em até seis linhas; passou disso, a célula avisa e a relação inteira sai no
 * fim (devolvida aqui). ⚠ Vitor (04/09/2026): "precisa sair 100%".
 */
function desenhoTorg(fl, res, marcas) {
  const desenho = String(res.desenho || "").trim() || marcas.join(", ");
  const rev = res.revisaoDesenho || "-", cli = res.desenhoCliente || "", revCli = res.revisaoCliente || "-";
  const juntos = [[ROT_DESENHO, desenho, 0.34], ["REV.:", rev, 0.12], [ROT_DESENHO_CLI, cli, 0.38], ["REV.:", revCli, 0.16]];
  if (fl.f.medirInfoCresce(juntos, { maxLinhas: 99 }).usadas <= 2) { linha(fl, juntos); return null; }
  const { celula, completa } = celulaDoDesenho(fl.f, desenho, 0.8, 6);
  linha(fl, [[ROT_DESENHO, celula, 0.8], ["REV.:", rev, 0.2]]);
  linha(fl, [[ROT_DESENHO_CLI, cli, 0.8], ["REV.:", revCli, 0.2]]);
  return completa;
}

/** O desenho na célula em até `max` linhas; passou disso, a célula diz onde está a relação inteira. */
function celulaDoDesenho(f, desenho, frac, max) {
  const larg = f.W * frac - (f.bold.widthOfTextAtSize(san(ROT_DESENHO), 6.4) + 12) - 8;
  const partes = quebrarTexto(desenho, f.bold, 8, larg);
  if (partes.length <= max) return { celula: desenho, completa: null };
  let k = max - 1, celula;
  do { celula = `${partes.slice(0, k).join(" ")} … (relação completa ao final)`; k--; }
  while (k > 0 && quebrarTexto(celula, f.bold, 8, larg).length > max);
  return { celula, completa: desenho };
}

/** O aviso de ensaio fora do PO-15, em vermelho, com cada problema inteiro. */
function foraDoProcedimento(fl, check) {
  if (!check.avaliado || check.conforme) return;
  const linhas = check.problemas.flatMap((pr) => quebrarTexto(pr, fl.f.font, 5.8, fl.f.W - 137));
  const alt = 11 + linhas.length * 8;
  fl.reservar(alt);
  const f = fl.f;
  const topo = f.bloco(alt);
  f.page.drawText(san("ENSAIO FORA DO PROCEDIMENTO:"), { x: M + 7, y: topo - 9, size: 6.4, font: f.bold, color: RED });
  linhas.forEach((ln, i) => f.page.drawText(ln, { x: M + 130, y: topo - 9 - i * 8, size: 5.8, font: f.font, color: RED }));
}

/** Os instrumentos, partidos entre folhas quando não cabem. Sem nenhum, o quadro sai com "—". */
function instrumentos(fl, lista) {
  if (lista.length) return fl.instrumentos(lista);
  // ⚠ o modelo tem o quadro sempre: sumir com ele esconderia que nenhum instrumento foi registrado
  fl.reservar(alturaInstrumentos(0));
  fl.f.blocoInstrumentos([]);
}
