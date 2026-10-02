import "server-only";
import {
  abrirDocumento, novaFolha, M, san, quebrarTexto,
  alturaAssinaturas, alturaInstrumentos, alturaTexto, ALTURA_CABECALHO, A4_DEITADA, DARK, GRAY,
} from "./relatorio-form-pdf";
import { camposCabecalhoUS, linhasTabelaUS } from "./us-relatorio";
import { montarLinha, planejarTabela, desenharSegmento } from "./relatorio-us-tabela-pdf";

// RELATÓRIO DE ENSAIO POR ULTRASSOM (RUS).
//
// Modelo da aba "Ensaio US" de "Modelos de relatorios de qualidade torg.xlsx". A tabela de
// indicações mora em lib/relatorio-us-tabela-pdf.js; aqui ficam as folhas, a identificação e o fecho.
//
// ⚠ FOLHA DEITADA. A tabela de indicações tem 18 colunas — decibéis em quatro medidas, as
// descontinuidades com percurso e profundidade, e as distâncias X e Y. Em A4 retrato cada coluna
// ficaria com 30 pt, estreita demais para "Comprimento Inspecionado". O modelo do Vitor usa 18
// colunas do Excel pela mesma razão.
//
// ⚠⚠ NADA SAI DO PAPEL, NADA É CORTADO (verificação do ultrassom, 02/10/2026). A folha tinha 12
// linhas fixas e um fecho de 159 pt contado de cabeça; com a assinatura desenhada (bloco de 118 pt) o
// nome e a data de quem assinou saíam abaixo do papel, e com seis instrumentos a própria moldura. As
// células cortavam com reticência — o "Metilcelul..." do acoplante saía em TODO RUS, e o TAG vazio
// virava a lista das 40 marcas cortada. Agora cada bloco tem a altura MEDIDA antes de ser desenhado, e
// o que não cabe numa folha vai para a seguinte dizendo que continua.

export const TITULO_US = "RELATÓRIO DE ENSAIO POR ULTRASSOM";

// ⚠ os MESMOS papéis em toda folha, inclusive nas de foto — colunas com nomes diferentes fazem a
// assinatura casar numa folha e sumir na seguinte. Ordem do convite: inspetor → Torg Metal → cliente
// (ver lib/assinatura-quadros).
export const PAPEIS_US = ["Inspetor", "Controle de Qualidade", "Cliente"];

const H_LEGENDA = 30;
const OBS_VAZIA = 30; // a caixa de observações sem texto: a altura do modelo, para escrever à mão
const LINHAS_TAG = 3;
const SEM_LIMITE = { maxLinhas: 50 }; // linha de identificação que cresce o quanto o valor pedir
const ROT_TAG = "EQUIPAMENTO / TAG:";

const texto = (v) => String(v ?? "").trim();
const revisaoDe = (rel) => (rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null);

/** O ganho de varredura com a unidade — as telas gravam só o número ("14"); "14 dB" digitado não vira "dB dB". */
const ganhoComUnidade = (v) => {
  const t = texto(v);
  return /^[-+]?\d+(?:[.,]\d+)?$/.test(t) ? `${t} dB` : t;
};

// ─── AS FOLHAS ───────────────────────────────────────────────────────────────────────────────────
//
// Mesma regra de lib/relatorio-fluxo-pdf (que só faz folha em pé): o espaço das assinaturas é
// reservado no pé de CADA folha antes de qualquer bloco, e o cabeçalho é desenhado no fim, quando o
// total de folhas — fotos inclusive — já é sabido.
//
// ⚠⚠ ASSINATURAS EM TODAS AS FOLHAS (regra que o Vitor deu para a pintura). As folhas da tabela saíam
// sem nenhuma: uma folha solta do meio do relatório não dizia quem respondia por ela.
// ⚠⚠ "FOLHA x DE y" contava só as folhas da tabela, e as de foto diziam outro total.

/** A identificação curta das folhas de continuação — a folha solta ainda diz de que obra é. */
const identificacaoCurta = (rel, { cliente, obra }) => [
  ["OP:", `OP-${rel.opNumero}`, 0.16], ["CLIENTE:", cliente || "", 0.42], ["CONTRATO / OBRA:", obra || "", 0.42],
];

function folhasDeitadas(doc, { cabecalho, curta, assinaturas, inspetor }) {
  const piso = M + alturaAssinaturas(assinaturas);
  const folhas = [];
  let f = null;
  const abrir = () => {
    f = novaFolha(doc, { paisagem: true });
    folhas.push({ f, topo: f.y });
    f.y -= ALTURA_CABECALHO;
    if (folhas.length > 1) f.linhaInfoCresce(curta, SEM_LIMITE);
    return f;
  };
  abrir();
  const hCurta = f.medirInfoCresce(curta, SEM_LIMITE).altura;

  const fl = {
    get f() { return f; },
    get quantas() { return folhas.length; },
    /** O espaço útil de uma folha de continuação recém-aberta. */
    fresca: A4_DEITADA[1] - M - ALTURA_CABECALHO - hCurta - piso,
    sobra: () => f.y - piso,
    // ⚠ folga de 0,01 pt: o plano da tabela e o cursor somam as mesmas alturas em ordens diferentes, e
    // um resto de ponto flutuante não pode mandar o fecho que cabia para uma folha a mais
    cabe: (h) => f.y - h >= piso - 0.01,
    novaFolha: abrir,
    /** Garante `h` pontos livres na folha atual; se não houver, continua na seguinte. */
    reservar(h) { if (!fl.cabe(h)) abrir(); return f; },
    /** Assinaturas logo abaixo do conteúdo e o cabeçalho no topo, com o total do documento inteiro. */
    async fechar(total) {
      for (const [i, { f: fo, topo }] of folhas.entries()) {
        await fo.blocoAssinaturas(assinaturas, PAPEIS_US, { inspetor });
        fo.y = topo;
        fo.cabecalho({ ...cabecalho, folha: i + 1, total });
      }
    },
  };
  return fl;
}

// ─── A IDENTIFICAÇÃO ─────────────────────────────────────────────────────────────────────────────

/** Uma linha de identificação que CRESCE com o valor, com o espaço reservado antes de desenhar. */
function linha(fl, campos) {
  fl.reservar(fl.f.medirInfoCresce(campos, SEM_LIMITE).altura);
  fl.f.linhaInfoCresce(campos, SEM_LIMITE);
}

/** Reparte a largura pelo conteúdo, como `linhaInfoAuto` (piso de 18% por campo), para a linha que cresce. */
function fracoesPeloConteudo(f, campos) {
  const custo = campos.map(([r, v]) => f.bold.widthOfTextAtSize(san(r), 6.4) + f.bold.widthOfTextAtSize(san(v), 8) + 20);
  const total = custo.reduce((a, b) => a + b, 0) || 1;
  const bruto = custo.map((c) => Math.max(0.18, c / total));
  const soma = bruto.reduce((a, b) => a + b, 0);
  return campos.map(([r, v], i) => [r, v, bruto[i] / soma]);
}

/** Quantas linhas o valor ocupa numa célula de `frac` da largura, ao lado do rótulo (como em `linhaInfoCresce`). */
const linhasNaCelula = (f, rotulo, valor, frac) =>
  quebrarTexto(valor, f.bold, 8, f.W * frac - (f.bold.widthOfTextAtSize(rotulo, 6.4) + 12) - 8).length;

/**
 * O TAG na célula.
 *
 * Digitado pelo inspetor, sai como está — a célula cresce o quanto ele pedir. Vazio, o cabeçalho o
 * preenche com as peças (camposCabecalhoUS), e com 40 peças isso virava a lista cortada com
 * reticência. Até três linhas a relação sai inteira; passando disso, sai o começo e QUANTAS faltam,
 * dizendo onde estão — toda peça ensaiada tem linha própria na tabela (linhasTabelaUS), então nada
 * some: a relação inteira está logo abaixo, peça por peça.
 */
function tagNaCelula(f, rel, res, frac) {
  if (texto(rel.resultados?.tag)) return res.tag;
  const marcas = (Array.isArray(rel.marcas) ? rel.marcas : []).map(texto).filter(Boolean);
  const cabe = (t) => linhasNaCelula(f, ROT_TAG, t, frac) <= LINHAS_TAG;
  if (cabe(marcas.join(", "))) return marcas.join(", ");
  // de baixo para cima, parando no primeiro que não cabe: obra com 500 marcas não mede 500 textos
  let resumo = `${marcas.length} peças, todas na tabela de indicações`;
  for (let k = 1; k < marcas.length; k++) {
    const t = `${marcas.slice(0, k).join(", ")} e mais ${marcas.length - k} peças, todas na tabela de indicações`;
    if (!cabe(t)) break;
    resumo = t;
  }
  return resumo;
}

/**
 * A primeira linha: fabricante, cliente e desenho, como no modelo.
 *
 * ⚠ DESENHO LONGO GANHA LINHA PRÓPRIA (02/10/2026). Ele pode ser uma lista ("T103-DE-001 R2, …",
 * até 500 caracteres): na terça parte da largura viravam oito linhas, e a linha inteira descia com o
 * fabricante e o cliente boiando em células vazias. Na largura toda, a mesma lista cabe em duas ou três.
 */
function primeiraLinha(f, desenho, cliente) {
  if (linhasNaCelula(f, "DESENHO:", desenho, 0.33) <= 2) {
    return [[["FABRICANTE:", "TORG METAL", 0.34], ["CLIENTE:", cliente, 0.33], ["DESENHO:", desenho, 0.33]]];
  }
  return [[["FABRICANTE:", "TORG METAL", 0.34], ["CLIENTE:", cliente, 0.66]], [["DESENHO:", desenho, 1]]];
}

function linhasDeIdentificacao(f, rel, res, { cliente, obra, refCliente }) {
  const v = (k) => res[k] || "";
  return [
    ...primeiraLinha(f, v("desenho"), cliente || ""),
    fracoesPeloConteudo(f, [["OP:", `OP-${rel.opNumero}`], ["CONTRATO / OBRA:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]),
    [[ROT_TAG, tagNaCelula(f, rel, res, 0.34), 0.34], ["LOCAL DE ENSAIO:", v("local"), 0.33], ["TÉCNICA DE ENSAIO:", v("tecnica"), 0.33]],
    [["PROCEDIMENTO / REV.:", v("procedimento"), 0.34], ["NORMA DE REFERÊNCIA:", v("norma"), 0.33], ["CRITÉRIO DE ACEITAÇÃO:", v("criterio"), 0.33]],
    [["MATERIAL:", v("material"), 0.22], ["ESPESSURA:", v("espessura"), 0.18],
      ["METAL DE ADIÇÃO:", v("metalAdicao"), 0.30], ["PROC. DE SOLDAGEM:", v("processoSolda"), 0.30]],
    // ⚠ `tipoJunta` (chave do EVS/LP, usada pela tela desde 22/09/2026) e `junta` (o que havia
    //   antes aqui, sem nenhum formulário que a preenchesse)
    [["TIPO DE JUNTA:", v("tipoJunta") || v("junta"), 0.28], ["TIPO DE CHANFRO:", v("chanfro"), 0.28],
      ["BLOCO PADRÃO / Nº SÉRIE:", v("blocoPadrao"), 0.44]],
    // ⚠⚠ TIPO DE ESTRUTURA E GANHO DE VARREDURA ERAM PEDIDOS E NUNCA IMPRESSOS (02/10/2026). O item
    // 18.1 do PI-QUA-003 os põe no conteúdo mínimo do relatório — e o tipo de estrutura decide o
    // critério (15.6 estática × 15.7 dinâmica). As duas telas os exigem com asterisco; o documento
    // não os mostrava. O ACOPLANTE veio para esta linha: com 12% da largura, ao lado de quatro campos,
    // o próprio padrão da casa saía "Metilcelul...".
    [["TIPO DE ESTRUTURA:", v("carregamento"), 0.36], ["GANHO DE VARREDURA:", ganhoComUnidade(res.ganhoVarredura), 0.24],
      ["ACOPLANTE:", v("acoplante"), 0.40]],
    // ⚠ aparelho e cabeçote são identificação de EQUIPAMENTO, não da peça: o laudo de ultrassom só
    // vale se disser em que aparelho e com que cabeçote foi feito.
    [["APARELHO — FABRICANTE:", v("apFabricante"), 0.34], ["MODELO:", v("apModelo"), 0.33], ["Nº DE SÉRIE:", v("apSerie"), 0.33]],
    [["CABEÇOTE — FABRICANTE:", v("cbFabricante"), 0.22], ["MODELO:", v("cbModelo"), 0.16],
      ["ÂNGULO REAL:", v("cbAngulo"), 0.15], ["DIMENSÕES:", v("cbDimensoes"), 0.16],
      ["FREQUÊNCIA:", v("cbFrequencia"), 0.15], ["Nº DE SÉRIE:", v("cbSerie"), 0.16]],
  ];
}

// ─── O FECHO ─────────────────────────────────────────────────────────────────────────────────────

function legenda(f) {
  const topo = f.bloco(H_LEGENDA);
  f.page.drawText("A - Aceitação        R - Rejeição        REC - Recomendação de exame complementar",
    { x: M + 7, y: topo - 11, size: 6, font: f.bold, color: GRAY });
  // ⚠ a declaração do modelo cita a AWS D1.1 por seção (6 parte F, 2 partes B/C); esta é genérica.
  //   Trocar é decisão do Vitor (verificação de 02/10/2026) — não mexer sem ele.
  f.page.drawText(san("Certificamos que as declarações do presente relatório correspondem ao ensaio realizado e estão de acordo com o procedimento e a norma citados."),
    { x: M + 7, y: topo - 22, size: 6, font: f.font, color: GRAY });
}

/** O bloco vai inteiro aqui; não cabendo, inteiro na folha seguinte. */
function inteiro(fl, h, desenhar) {
  fl.reservar(h);
  desenhar(fl.f);
}

/**
 * As observações INTEIRAS.
 *
 * ⚠⚠ A CAIXA TINHA DUAS LINHAS, E A SEGUNDA SAÍA RISCADA PELA BORDA (02/10/2026) — o resto do texto
 * sumia sem aviso, e o celular aceita 1000 caracteres (o computador, sem limite). A caixa cresce com o
 * texto; vai inteira para a folha seguinte se lá couber, e só a que é maior que uma folha se parte,
 * com o pedaço de lá dizendo "(continuação)".
 */
function observacoes(fl, linhas) {
  const alt = (n) => alturaTexto(n, OBS_VAZIA);
  // ⚠ o pedaço que continua TERMINA dizendo isso, como em lib/relatorio-fluxo-pdf: quem lê a folha
  // sozinha precisa saber que o texto não acabou ali (a seguinte abre com "(continuação)")
  const AVISO = "(continua na folha seguinte)";
  const caixa = (rot, lns) => {
    const f = fl.f;
    const topo = f.bloco(alt(lns.length));
    f.rotulo(M + 7, topo - 10, rot);
    lns.forEach((ln, j) => f.page.drawText(ln, { x: M + 7, y: topo - 21 - j * 10, size: 7.5, font: f.font, color: ln === AVISO ? GRAY : DARK }));
  };
  if (alt(linhas.length) <= fl.fresca) return inteiro(fl, alt(linhas.length), () => caixa("OBSERVAÇÕES:", linhas));
  let i = 0;
  while (i < linhas.length) {
    const restam = linhas.length - i;
    const n = Math.min(restam, Math.floor((fl.sobra() - 18) / 10));
    // não deixa fiapo: menos de 2 linhas (quando há mais) vai para a folha seguinte
    if (n < Math.min(2, restam) || !fl.cabe(alt(n))) { fl.novaFolha(); continue; }
    const usa = n < restam ? n - 1 : n; // a última linha da caixa vira o aviso
    caixa(i ? "OBSERVAÇÕES (continuação):" : "OBSERVAÇÕES:", [...linhas.slice(i, i + usa), ...(usa < restam ? [AVISO] : [])]);
    i += usa;
  }
}

/** Os instrumentos: inteiros onde couberem; mais que uma folha, partidos (a nota da norma no primeiro pedaço). */
function instrumentos(fl, lista, nota) {
  if (alturaInstrumentos(lista.length, !!nota) <= fl.fresca) {
    return inteiro(fl, alturaInstrumentos(lista.length, !!nota), (f) => f.blocoInstrumentos(lista, nota));
  }
  let i = 0;
  while (i < lista.length) {
    const comNota = i === 0 && !!nota;
    const restam = lista.length - i;
    let n = restam;
    while (n > 0 && !fl.cabe(alturaInstrumentos(n, comNota))) n--;
    if (n < Math.min(2, restam)) { fl.novaFolha(); continue; }
    fl.f.blocoInstrumentos(lista.slice(i, i + n), comNota ? nota : null);
    i += n;
  }
}

export async function gerarUSPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = camposCabecalhoUS(rel);
  const fl = folhasDeitadas(doc, {
    cabecalho: { titulo: TITULO_US, codigo: rel.codigo, revisao: revisaoDe(rel), emitidoEm: rel.emitidoEm },
    curta: identificacaoCurta(rel, { cliente, obra }), assinaturas, inspetor: rel.inspetor,
  });

  // ── identificação ──
  for (const campos of linhasDeIdentificacao(fl.f, rel, res, { cliente, obra, refCliente })) linha(fl, campos);

  // ── tabela de indicações ──
  // as indicações reprovadas E as peças ensaiadas sem indicação — ver linhasTabelaUS
  const prontas = linhasTabelaUS(rel).map((l) => montarLinha(fl.f, l));
  const obs = quebrarTexto(rel.observacoes || "", fl.f.font, 7.5, fl.f.W - 16);
  const lista = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];
  const nota = res.norma ? `*Norma de referência: ${res.norma}` : null;
  const fecho = H_LEGENDA + alturaTexto(obs.length, OBS_VAZIA) + alturaInstrumentos(lista.length, !!nota);
  const plano = planejarTabela(prontas.map((p) => p.altura), { livre: fl.sobra(), fresca: fl.fresca, fecho });
  plano.segmentos.forEach((seg, i) => {
    if (seg.novaFolha) fl.novaFolha();
    const ultimo = i === plano.segmentos.length - 1;
    desenharSegmento(fl.f, seg.linhas.map((k) => prontas[k]), ultimo ? plano.brancas : 0, { continua: !ultimo });
  });

  // ── legenda + declaração, observações, instrumentos ──
  inteiro(fl, H_LEGENDA, legenda);
  observacoes(fl, obs);
  instrumentos(fl, lista, nota);

  // ── FOTOS: FOLHA A MAIS, MESMO FORMATO ──────────────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos testes, tanto
  // para o computador quanto para o celular; posso colocar foto em qualquer relatório — alguns têm
  // campos específicos, e para os que não têm você cria uma página para anexar essas imagens".
  //
  // ⚠ Reusa a folha do EVS de propósito: é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção.
  // ⚠ Com o TÍTULO e os PAPÉIS do RUS (02/10/2026): sem eles a folha saía "REGISTRO FOTOGRÁFICO"
  // assinada por "Realizado por / Aprovado por" — papéis que nenhuma outra folha do RUS tem.
  if (Array.isArray(fotos) && fotos.some(Boolean)) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    await paginaDeFotos(doc, rel, fotos, { cliente, obra, assinaturas, paginas: fl.quantas, titulo: TITULO_US, papeis: PAPEIS_US });
  }

  await fl.fechar(doc.pdf.getPageCount());
  return doc.pdf.save();
}
