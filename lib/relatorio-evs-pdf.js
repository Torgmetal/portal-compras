import "server-only";
import { rgb } from "pdf-lib";
import { abrirDocumento, novaFolha, embutirFotos, M, san, quebrarTexto, alturaAssinaturas, alturaInstrumentos, alturaTexto,
  DARK, GRAY, LINE, SOFT, GREEN, RED, ORANGE } from "./relatorio-form-pdf";
import { criarFluxo } from "./relatorio-fluxo-pdf";
import { CRITERIO_PADRAO } from "./evs-campos";
import { completarEps, rotuloEps } from "./eps-casa";

// RELATÓRIO DE INSPEÇÃO VISUAL E DIMENSIONAL DE SOLDA (EVS).
//
// Modelo que o Vitor mandou (aba "Visual Solda" de "Modelos de relatorios de qualidade torg.xlsx").
// Vitor (21/08/2026): "a formatação do relatório de EVS deve seguir a mesma linha do de dimensional,
// forma Excel, mesma altura do cabeçalho — tem que ser tudo padrão". Por isso a folha inteira vem de
// `relatorio-form-pdf`: cabeçalho, linhas de identificação, instrumentos e assinaturas são os MESMOS
// objetos do dimensional, não uma cópia parecida. O que é próprio daqui é o miolo: a tabela de
// resultados por junta e a legenda dos defeitos.
//
// ⚠ UM BLOCO SÓ, NA LARGURA INTEIRA. A planilha tem duas metades de 7 colunas lado a lado; na largura
// de meia folha cada coluna fica com ~37 pt e o dado real não cabe ("EPS-RQPS 01" saiu "EPS-RQP…").
// Vitor: "poderia deixar apenas um em cada página e se for preciso colocar várias aí vai criando
// linhas abaixo". A duplicação existia para caber mais LINHAS, não porque as colunas precisem estar
// lado a lado: mais peças viram mais linhas — e mais páginas quando preciso.
//
// ⚠⚠ AS FOLHAS FLUEM (verificação do EVS, 02/10/2026 — lib/relatorio-fluxo-pdf). A tabela tinha altura
// FIXA de 26 linhas e ninguém conferia o espaço antes de observações, instrumentos e assinaturas: com a
// assinatura desenhada e seis instrumentos o rodapé saía do papel (com doze, só os rótulos apareciam), e
// acima de 26 juntas a folha 1 saía sem assinatura nenhuma. Agora as juntas de cada folha saem do espaço
// que SOBRA, as assinaturas têm lugar reservado no pé de TODA folha e o "FOLHA x DE y" é escrito no fim,
// contando as folhas de foto (o mesmo documento dizia "1 DE 2" e "3 DE 4").

const TITULO = "RELATÓRIO DE INSPEÇÃO VISUAL E DIMENSIONAL DE SOLDA";
const PAPEIS = ["Realizado por", "Aprovado por", "Cliente / Fiscalização"]; // os mesmos em toda folha, inclusive nas de foto

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
// 17% da metade e as outras seis 13,8% cada. Larguras "mais úteis" seriam mais legíveis — mas o
// documento que a Qualidade confere é o do modelo, e mexer na disposição obriga quem já conhece a
// folha a reaprender onde as coisas estão.
const COLS = [
  { t: "Desenho", k: "marca", w: 0.170 },
  { t: "Qtde", k: "qtd", w: 0.138, meio: true },
  { t: "Descrição", k: "descricao", w: 0.138 },
  { t: "EPS", k: "eps", w: 0.138, meio: true },
  { t: "Soldador", k: "soldador", w: 0.138, meio: true },
  { t: "Descontinuidade", k: "descontinuidade", w: 0.138, meio: true },
  { t: "Laudo", k: "laudo", w: 0.140, meio: true },
];

// O quadro do modelo tem 26 linhas: a última folha da tabela completa até elas em branco (o documento
// também é preenchido à mão), mas só no espaço que sobra depois do rodapé — linha vazia não o empurra.
const LINHAS_DO_MODELO = 26;
const H_LINHA = 12.5, ENTRE_LINHAS = 8, H_CAB_TABELA = 19, H_TITULO = 14, H_LEGENDA = 12 + LEGENDA.length * 8.5 + 4;
const TAM_OBS = 6.4, ENTRE_OBS = 7.5, ROT_OBS = "Obs.:", SEPARADOR = rgb(0.88, 0.90, 0.92);
// ⚠ a identificação cresce o quanto o valor pedir: com teto de 3 linhas a 4ª EPS sumia sem aviso
const NUNCA_CORTA = { maxLinhas: Infinity };

/**
 * Quebra o título de uma coluna em até duas linhas.
 *
 * ⚠ QUEBRA DENTRO DA PALAVRA quando preciso. "Descontinuidade" é uma palavra só e não tem espaço
 * onde partir: a quebra por palavras devolvia a linha inteira e o título saía "Descontinu...". No
 * Excel a célula quebra no meio da palavra, e é isso que se reproduz.
 */
function quebrarCabecalho(f, texto, fnt, larg) {
  const tam = 5.8;
  const porPalavra = f.quebrar(texto, fnt, tam, larg);
  if (porPalavra.length > 1 || fnt.widthOfTextAtSize(porPalavra[0] || "", tam) <= larg) return porPalavra.slice(0, 2);
  // uma palavra que não cabe: corta no maior pedaço que couber e joga o resto para a segunda linha
  const t = porPalavra[0];
  let corte = t.length;
  while (corte > 1 && fnt.widthOfTextAtSize(t.slice(0, corte), tam) > larg) corte--;
  return [t.slice(0, corte), t.slice(corte)];
}

// "1250" vira "1250 lux": o campo da tela é numérico e o PO-06 (item 6.2) mede em lux — o número sozinho
// não diz a unidade (o LP já imprimia "lux"). Quem escreveu a unidade fica como escreveu.
const comLux = (v) => { const t = String(v ?? "").trim(); return /^\d+(?:[.,]\d+)?$/.test(t) ? `${t} lux` : t; };

/** Linha de identificação que CRESCE até caber o valor inteiro, com o espaço reservado antes. */
function linha(fl, campos) {
  fl.reservar(fl.f.medirInfoCresce(campos, NUNCA_CORTA).altura);
  fl.f.linhaInfoCresce(campos, NUNCA_CORTA);
}

const linhaObra = (rel, cliente, obra) => [["OP:", `OP-${rel.opNumero}`, 0.12], ["CLIENTE:", cliente, 0.45], ["OBRA:", obra, 0.43]];

/**
 * ⚠⚠ DESENHO DO CLIENTE VAZIO FICA VAZIO (02/10/2026). Ele caía na REF. CLIENTE, e o código do pedido do
 * cliente saía como se fosse número de desenho. ⚠ A relação de desenhos é uma lista ("T89A1 R0, …"):
 * longa, ganha a largura da folha em vez de virar uma coluna de vinte linhas.
 */
function linhaDesenhos(fl, res, marcas) {
  const torg = ["DESENHO TORG:", res.desenho || marcas.join(", ")], cli = ["DESENHO CLIENTE:", res.desenhoCliente];
  const revT = ["REV.:", res.revisaoDesenho || "-"], revC = ["REV.:", res.revisaoCliente || "-"];
  const campos = [[...torg, 0.40], [...revT, 0.10], [...cli, 0.36], [...revC, 0.14]];
  if (fl.f.medirInfoCresce(campos, NUNCA_CORTA).usadas <= 3) return linha(fl, campos);
  linha(fl, [[...torg, 0.86], [...revT, 0.14]]);
  linha(fl, [[...cli, 0.86], [...revC, 0.14]]);
}

// ⚠ agrupamentos tirados das MESCLAGENS da planilha: METAL BASE (A:D), METAL DE ADIÇÃO (E:G), CONDIÇÕES
// (H:K), ILUMINAÇÃO (L:N); PROCEDIMENTO (A:G) e CRITÉRIO (H:N), meio a meio. ⚠⚠ NADA CORTADO (02/10/2026):
// procedimento, obra e desenho saíam com "..." — "PO-06 Ensaio Visual e Dimensional de Soldas - R1"
// perdia justamente a revisão.
function identificacao(fl, rel, res, { cliente, obra, refCliente }) {
  const marcas = Array.isArray(rel.marcas) ? rel.marcas : [];
  linha(fl, linhaObra(rel, cliente, obra));
  linhaDesenhos(fl, res, marcas);
  // ⚠ DESCRIÇÃO DA PEÇA, não "encomenda" (Vitor, 21/08/2026): o que a lista da Engenharia diz de cada
  // marca, sem repetir — um relatório de cinco vigas e duas colunas diz "VIGA, COLUNA".
  const tipos = [...new Set(marcas.map((m) => res.tiposPeca?.[String(m).toUpperCase()]).filter(Boolean))];
  const qtdTotal = marcas.reduce((soma, m) => soma + (res.qtdPeca?.[String(m).toUpperCase()] || 0), 0);
  linha(fl, [["DESCRIÇÃO DA PEÇA:", tipos.join(", "), 0.366], ["QUANT. DE PEÇAS:", res.quantidade ?? (qtdTotal || ""), 0.284], ["REF. CLIENTE:", refCliente || "—", 0.350]]);
  // ⚠⚠ A JUNTA SOLDADA CRESCE, NÃO CORTA (23/09/2026): o EVS-102-001 junta GMAW e SMAW, e lista as duas EPS
  linha(fl, [["METAL BASE:", res.metalBase, 0.25], ["METAL DE ADIÇÃO:", res.metalAdicao, 0.25], ["COND. SUPERFICIAIS:", res.condicoes, 0.25], ["ILUMINAÇÃO:", comLux(res.iluminacao), 0.25]]);
  linha(fl, [["PROCESSO DE SOLDAGEM:", res.processoSolda, 0.24], ["EPS (WPS):", res.eps, 0.27], ["RQS (PQR):", res.rqs, 0.27], ["TIPO DE JUNTA:", res.tipoJunta, 0.22]]);
  // ⚠⚠ TIPO DE ESTRUTURA E COMPONENTE (02/10/2026): pedidos nas telas, o primeiro nunca era impresso e o
  // segundo só quando a lista da Engenharia não descrevia as peças
  linha(fl, [["TIPO DE ESTRUTURA:", res.tipoPeca, 0.25], ["COMPONENTE:", res.componente, 0.45], ["TÉCNICA:", res.tecnica, 0.30]]);
  linha(fl, [["PROCEDIMENTO:", res.procedimento, 0.5], ["CRITÉRIO DE ACEITAÇÃO:", res.criterio || CRITERIO_PADRAO, 0.5]]);
}

/** O texto da célula, já como sai no papel. */
function textoDaCelula(l, k) {
  // ⚠ a EPS da junta é gravada pelo CÓDIGO da pasta ("EPS-RQPS 01") e o cabeçalho cita o número do
  // documento ("EPS 001/2025"): o mesmo documento com dois nomes faz procurar duas EPS (23/09/2026)
  if (k === "soldador") return san(soldadorCurto(l.soldador, l.sinete));
  if (k === "eps" && l.eps) return san(rotuloEps(completarEps({ codigo: String(l.eps) })));
  // ⚠ `san` ANTES de medir: a largura era medida no texto cru, e um "≥" na descrição derrubava o PDF
  return san(l[k] == null ? "" : String(l[k]));
}

/**
 * A letra e as linhas de uma célula. ⚠ ENCOLHE ANTES DE QUEBRAR, até 5,6 pt como sempre foi: "S-02
 * EBERTON ALVES" passa por poucos pontos, e partir o nome por isso seria pior que letra menor.
 * ⚠⚠ E QUEBRA EM VEZ DE CORTAR (02/10/2026): passado disso a célula cortava com reticência ("Filete
 * enrijecedor 8 mm a...", "S-07 FRANCISCO PERE...") — agora a junta cresce com o texto.
 */
function celula(f, l, c) {
  const v = textoDaCelula(l, c.k);
  const fnt = c.k === "laudo" ? f.bold : f.font;
  const larg = f.W * c.w - 6;
  let tam = 7;
  while (tam > 5.6 && fnt.widthOfTextAtSize(v, tam) > larg) tam = +(tam - 0.2).toFixed(2);
  if (fnt.widthOfTextAtSize(v, tam) <= larg) return { v, fnt, tam, linhas: v ? [v] : [] };
  return { v, fnt, tam: 7, linhas: quebrarTexto(v, fnt, 7, larg) };
}

/**
 * Uma junta medida antes de desenhar. ⚠⚠ A OBSERVAÇÃO DA JUNTA NUNCA ERA IMPRESSA (02/10/2026): pedida
 * no celular e gravada (`l.obs`), o gerador não a lia. Sai numa faixa logo abaixo da própria junta — no
 * bloco de observações ninguém saberia de qual das juntas iguais da mesma peça ela fala.
 */
function medirJunta(f, l) {
  const cels = COLS.map((c) => celula(f, l, c));
  const n = Math.max(1, ...cels.map((x) => x.linhas.length));
  const hCel = H_LINHA + (n - 1) * ENTRE_LINHAS;
  const dxObs = f.bold.widthOfTextAtSize(ROT_OBS, TAM_OBS) + 4;
  const obs = san(l.obs).trim() ? quebrarTexto(l.obs, f.font, TAM_OBS, f.W - 12 - dxObs) : [];
  return { cels, n, hCel, obs, dxObs, h: hCel + (obs.length ? 4 + obs.length * ENTRE_OBS : 0) };
}

// os traços verticais entre as colunas, de `topo` até `topo - alt`
function divisorias(f, topo, alt) {
  let x = M;
  for (const c of COLS.slice(0, -1)) { x += f.W * c.w; f.page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE }); }
}

function cabecalhoTabela(f, topo) {
  const { page, bold, W } = f;
  divisorias(f, topo, H_CAB_TABELA);
  let x = M;
  for (const c of COLS) {
    const larg = W * c.w;
    const partes = quebrarCabecalho(f, c.t, bold, larg - 3);
    partes.forEach((ln, k) => {
      const tt = f.fit(ln, bold, 6.2, larg - 2);
      page.drawText(tt, { x: x + (larg - bold.widthOfTextAtSize(tt, 6.2)) / 2, y: topo - (partes.length === 1 ? 12 : 8.5 + k * 7), size: 6.2, font: bold, color: GRAY });
    });
    x += larg;
  }
  page.drawLine({ start: { x: M, y: topo - H_CAB_TABELA }, end: { x: M + W, y: topo - H_CAB_TABELA }, thickness: 0.7, color: LINE });
}

function desenharJunta(f, topo, j) {
  const { page, W } = f;
  divisorias(f, topo, j.hCel);
  let x = M;
  COLS.forEach((c, i) => {
    const larg = W * c.w;
    const { v, fnt, tam, linhas } = j.cels[i];
    // ⚠ o LAUDO ganha cor: é o que se procura ao folhear — quem confere acha o reprovado sem ler tudo
    const cor = c.k !== "laudo" ? DARK : /^R$/i.test(v) ? RED : /^A$/i.test(v) ? GREEN : ORANGE;
    const desce = ((j.n - linhas.length) * ENTRE_LINHAS) / 2; // célula de menos linhas fica no meio da junta
    linhas.forEach((ln, k) => {
      const px = c.meio ? x + (larg - fnt.widthOfTextAtSize(ln, tam)) / 2 : x + 4;
      page.drawText(ln, { x: px, y: topo - 8.8 - desce - k * ENTRE_LINHAS, size: tam, font: fnt, color: cor });
    });
    x += larg;
  });
  const yObs = topo - j.hCel - 7.5;
  if (j.obs.length) page.drawText(ROT_OBS, { x: M + 6, y: yObs, size: TAM_OBS, font: f.bold, color: GRAY });
  j.obs.forEach((ln, k) => page.drawText(ln, { x: M + 6 + j.dxObs, y: yObs - k * ENTRE_OBS, size: TAM_OBS, font: f.font, color: DARK }));
  page.drawLine({ start: { x: M, y: topo - j.h }, end: { x: M + W, y: topo - j.h }, thickness: 0.35, color: SEPARADOR });
}

/** Um pedaço da tabela: título, cabeçalho, juntas, linhas em branco e a legenda (que avisa se continua). */
function pedacoDaTabela(f, juntas, { continuacao, continua, vazias }) {
  const { page, bold, W } = f;
  const topoTit = f.bloco(H_TITULO, SOFT);
  const tTit = continuacao ? "REGISTROS DOS RESULTADOS (continuação)" : "REGISTROS DOS RESULTADOS";
  page.drawText(tTit, { x: M + (W - bold.widthOfTextAtSize(tTit, 7)) / 2, y: topoTit - 10, size: 7, font: bold, color: GRAY });
  const topo = f.bloco(H_CAB_TABELA + juntas.reduce((s, j) => s + j.h, 0) + vazias * H_LINHA);
  cabecalhoTabela(f, topo);
  let y = topo - H_CAB_TABELA;
  for (const j of juntas) { desenharJunta(f, y, j); y -= j.h; }
  if (vazias > 0) divisorias(f, y, vazias * H_LINHA);
  for (let i = 1; i <= vazias; i++) page.drawLine({ start: { x: M, y: y - i * H_LINHA }, end: { x: M + W, y: y - i * H_LINHA }, thickness: 0.35, color: SEPARADOR });

  const topoLeg = f.bloco(H_LEGENDA);
  f.rotulo(M + 7, topoLeg - 9, "LEGENDA");
  const aviso = "a tabela continua na folha seguinte";
  if (continua) page.drawText(aviso, { x: M + W - 7 - bold.widthOfTextAtSize(aviso, 6.2), y: topoLeg - 9, size: 6.2, font: bold, color: ORANGE });
  LEGENDA.forEach((ln, i) => page.drawText(san(ln), { x: M + 7, y: topoLeg - 19 - i * 8.5, size: 6, font: f.font, color: GRAY }));
}

/**
 * A tabela inteira, em quantas folhas precisar: cada folha leva as juntas que CABEM no que sobra (as
 * assinaturas já têm o seu espaço reservado pelo fluxo) e a junta nunca é partida entre duas folhas.
 * @param {number} rodape altura de observações + instrumentos — as linhas em branco não o empurram
 */
function tabela(fl, juntas, rodape) {
  let i = 0, folhaNova = false;
  do {
    const livre = fl.sobra() - H_TITULO - H_CAB_TABELA - H_LEGENDA;
    let fim = i, usado = 0;
    while (fim < juntas.length && usado + juntas[fim].h <= livre) usado += juntas[fim++].h;
    // ⚠ nem uma junta cabe: a identificação tomou a folha e a tabela começa na seguinte; numa folha que
    // acabou de nascer, a junta vai assim mesmo — nunca um laço que não avança
    if (fim === i && i < juntas.length && !folhaNova) { fl.novaFolha(); folhaNova = true; continue; }
    if (fim === i && i < juntas.length) usado += juntas[fim++].h;
    const ultima = fim >= juntas.length, sobra = livre - usado;
    const vazias = ultima && rodape <= sobra ? Math.min(LINHAS_DO_MODELO - (fim - i), Math.floor((sobra - rodape) / H_LINHA)) : 0;
    pedacoDaTabela(fl.f, juntas.slice(i, fim), { continuacao: i > 0, continua: !ultima, vazias: Math.max(0, vazias) });
    i = fim;
    if (!ultima) { fl.novaFolha(); folhaNova = true; }
  } while (i < juntas.length);
}

/** Sem instrumento o quadro sai do mesmo jeito, com "—": o modelo tem a seção, e a folha à mão precisa dela. */
function instrumentos(fl, lista) {
  const todos = Array.isArray(lista) ? lista.filter(Boolean) : [];
  if (todos.length) return fl.instrumentos(todos);
  fl.reservar(alturaInstrumentos(0));
  fl.f.blocoInstrumentos([]);
}

/** @returns {Promise<Uint8Array>} */
export async function gerarEVSPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {}, fl = criarFluxo(doc, {
    cabecalho: { titulo: TITULO, codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null, emitidoEm: rel.emitidoEm },
    // ⚠ a folha de continuação repete OP, cliente e obra (o número está no cabeçalho), não a identificação
    // inteira: crescendo sem cortar, ela pode trazer quarenta desenhos e comeria a tabela em toda folha
    identificacaoCurta: (f) => f.linhaInfoCresce(linhaObra(rel, cliente, obra), NUNCA_CORTA),
    assinaturas, papeis: PAPEIS, inspetor: rel.inspetor,
  });
  identificacao(fl, rel, res, { cliente, obra, refCliente });
  const juntas = (Array.isArray(rel.linhas) ? rel.linhas : []).filter(Boolean).map((l) => medirJunta(fl.f, l));
  tabela(fl, juntas, alturaTexto(fl.f.linhasTexto(rel.observacoes).length) + alturaInstrumentos((rel.equipamentos || []).length));
  // ⚠⚠ OBSERVAÇÕES E INSTRUMENTOS UMA VEZ, DEPOIS DA ÚLTIMA JUNTA (02/10/2026): valem para a inspeção
  // inteira, e repetidos em cada folha roubariam as linhas da tabela. Saem onde o leitor termina a
  // tabela; o que não cabe continua na folha seguinte, dizendo que continua. ⚠ O critério saía também
  // como nota nos instrumentos — é o campo CRITÉRIO, que agora sai inteiro; a nota podia passar da borda.
  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  instrumentos(fl, rel.equipamentos);

  // Vitor (21/08/2026): "não precisa obrigatoriamente de imagens, mas no caso de uma necessidade pode
  // ser incluído, e você cria uma nova página no mesmo formato" — a folha só nasce quando há foto.
  await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas: fl.quantas, papeis: PAPEIS });
  await fl.fechar(doc.pdf.getPageCount());
  return doc.pdf.save();
}

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

/** A folha de registro fotográfico, no mesmo formato do relatório. */
export async function paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas = 1, titulo = null, papeis = null, fabricante = "TORG METAL" }) {
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
    f.cabecalho({ titulo: titulo || "REGISTRO FOTOGRÁFICO", codigo: rel.codigo, revisao: rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null,
      emitidoEm: rel.emitidoEm, folha: paginas + 1 + i, total });
    // ⚠ CLIENTE E OBRA CRESCEM EM VEZ DE CORTAR (02/10/2026): na coluna de um terço, "TERMASA TERMINAL
    // MARÍTIMO DE SANTOS S.A." saía com reticência em toda folha de foto. Valor que cabe sai igual a antes.
    // ⚠ `fabricante` é a Torg (quem fabrica a estrutura) — menos no recebimento de tintas, onde o modelo usa
    // FABRICANTE para o da TINTA: a mesma palavra com dois valores no mesmo documento (02/10/2026)
    f.linhaInfoCresce([["FABRICANTE:", fabricante, 0.34], ["CLIENTE:", cliente, 0.33], ["OP:", `OP-${rel.opNumero}`, 0.33]], NUNCA_CORTA);
    f.linhaInfoCresce([["OBRA:", obra, 1]], NUNCA_CORTA);
    // ⚠ a grade continua 2 × 3 (FOTOS_POR_FOLHA, que a pintura usa para contar folhas): se a identificação
    // cresceu, a foto encolhe o que for preciso para as assinaturas continuarem dentro do papel
    const altura = Math.min(168, Math.floor((f.y - M - alturaAssinaturas(assinaturas)) / Math.max(1, Math.ceil(comImagem.length / 2))));
    f.blocoFotos(comImagem, { colunas: 2, altura });
    // ⚠ os MESMOS papéis das outras folhas quando o relatório os define: colunas com nomes
    // diferentes fazem a assinatura casar numa folha e sumir na seguinte.
    await f.blocoAssinaturas(assinaturas, papeis || PAPEIS, { inspetor: rel.inspetor });
  }
  return true;
}
