import "server-only";
import { rgb } from "pdf-lib";
import { pecasDoRelatorio, textoPeca } from "./inspecao-pecas";
import {
  mediaRugosidade, mediaEspessura, leiturasValidas, numeroComVirgula, numeroNoDocumento, datasNoDocumento,
  comUnidade, laudoDoRelatorio, leiturasAmbientais, ambientePorEtapa, grauNaNorma, CAMPOS_AMBIENTE,
} from "./pintura-campos";
import { RESULTADO_LABEL } from "./revisao-inspecao";
import {
  abrirDocumento, embutirFotos, M, san, quebrarTexto, alturaInstrumentos, alturaTexto,
  DARK, GRAY, LINE, SOFT, GREEN, RED,
} from "./relatorio-form-pdf";
import { criarFluxo } from "./relatorio-fluxo-pdf";
import { evidenciasDoTipo, numerarPorEvidencia } from "./fotos-evidencia";

// RELATÓRIO DE INSPEÇÃO DE PINTURA (RIP).
//
// Modelo da aba "Pintura" de "Modelos de relatorios de qualidade torg.xlsx" — o maior dos quatro.
//
// São DUAS FOLHAS no modelo: a primeira com preparação de superfície, aplicação das tintas e medição de
// espessuras; a segunda com o registro fotográfico. Cada folha fecha com as três assinaturas — no modelo
// do Vitor os blocos de assinatura aparecem duas vezes pelo mesmo motivo: as folhas circulam separadas.
//
// ⚠⚠ AS FOLHAS FLUEM (lib/relatorio-fluxo-pdf). A verificação dos modelos (02/10/2026) mostrou a folha 1
// saindo do papel com peças em 3 linhas, 9 instrumentos e assinatura com imagem, e a observação cortada
// na 2ª linha. Agora cada bloco reserva o seu espaço antes de ser desenhado: o que não cabe continua na
// folha seguinte, com a identificação curta no alto e as assinaturas no pé — e o "FOLHA x DE y" é
// escrito no fim, quando o total é conhecido.
//
// ⚠ AS TRÊS DEMÃOS SÃO COLUNAS, não linhas. Cada propriedade (lote, validade, horário, umidade,
// temperatura…) é uma linha da tabela, e as demãos se comparam lado a lado. Trocar isso obrigaria
// quem confere a caçar a mesma informação em três lugares distantes.

const TITULO = "RELATÓRIO DE INSPEÇÃO DE PINTURA";

/** As linhas do quadro de aplicação, na ordem do modelo. */
const APLICACAO = [
  ["Nome ou Norma do Produto", "produto"],
  ["Fabricante", "fabricante"],
  // ⚠⚠ A COR NÃO SAÍA NO DOCUMENTO. Ela é escolhida por demão no formulário (a mesma obra pinta
  // peças de cores diferentes com o mesmo sistema) e ficava só no banco. A TMSA devolveu o
  // RIP-103-002 R00 exatamente por "não contemplar todas as cores" (varredura de 23/09/2026).
  ["Cor Aplicada", "cor"],
  ["Lote — Componente A", "loteA"],
  ["Lote — Componente B", "loteB"],
  ["Lote — Diluente", "loteD"],
  ["Validade — Componente A", "valA"],
  ["Validade — Componente B", "valB"],
  ["Validade — Diluente", "valD"],
  ["Data de Aplicação", "data"],
  ["Horário — Inicial", "hIni"],
  ["Horário — Final", "hFim"],
  ["Umidade Relativa (%)", "umidade"],
  ["Temperatura Ambiente (ºC)", "tAmb"],
  ["Temperatura Superfície (ºC)", "tSup"],
  ["Ponto de Orvalho (ºC)", "orvalho"],
  ["Método de Aplicação", "metodo"],
  ["Inspeção Visual", "visual"],
  ["Aderência", "aderencia"],
];

const GRAUS_INTEMPERISMO = ["A", "B", "C", "D"];
const GRAUS_LIMPEZA = ["WJ1", "WJ2", "WJ3", "ST2", "SA2½", "SA3"];

// ⚠⚠ "SA2.5" NUNCA CASAVA COM "SA2½" — e é o grau usado em 90% das obras, segundo o próprio PO-05.
// O formulário grava `"SA2.5"` (lib/pintura-campos.js) e o PLP tem esse mesmo default; a lista aqui
// usa a fração tipográfica, e a comparação era `===` depois de `toUpperCase()`. A caixa do grau mais
// comum simplesmente nunca marcava, e o relatório saía sem indicar preparação de superfície nenhuma.
// O repo já sabia da tradução: `lib/plp.js:182` faz `.replace("SA2.5", "SA2½")` — só que para a tela.
const normGrau = (v) => String(v || "").toUpperCase().replace(/\s|-/g, "").replace(/SA2[.,]5|SA21\/2/g, "SA2½");
// ⚠ os rótulos das seis molduras vivem em lib/fotos-evidencia.js — são os MESMOS blocos de anexo
// da tela de preenchimento. Duplicar a lista aqui foi o que deixou a folha e o formulário falarem
// línguas diferentes.

// ⚠ As quatro condições ambientais não se leem da demão CRUA: quem responde por elas é
// `leiturasAmbientais` (lib/pintura-campos.js), a mesma regra das duas telas de preenchimento.
const EH_AMBIENTE = new Set(CAMPOS_AMBIENTE);
// ⚠ datas da demão saem dd/mm/aaaa — inclusive a LISTA de validades, uma por lata (02/10/2026)
const EH_DATA = new Set(["data", "valA", "valB", "valD"]);

// ⚠⚠ OS TRÊS PAPÉIS SÃO OS MESMOS EM TODAS AS FOLHAS. Vitor (04/09/2026): "agora que tem 3
// páginas a assinatura tem que sair nas 3". A folha de fotos usava outros nomes de coluna
// ("Realizado por" / "Aprovado por"), e a assinatura casada como "Inspetor" aparecia na folha 1 e
// sumia na folha de fotos — o mesmo documento, assinado num lugar e em branco no outro.
const PAPEIS = ["Inspetor de Qualidade", "Qualidade / Documentação", "Cliente / Fiscalização"];

// O anexo de peças: 2 colunas, quantas linhas couberem na folha (o resto continua na seguinte).
const ANEXO_COLS = 2;
const ANEXO_LINHA = 11;

// As tabelas de demãos: a linha cede entre 9,5 e 12,4 pt para a folha 1 caber inteira quando dá; a
// célula que precisa de mais de uma linha de texto cresce 7,6 pt por linha.
const H_MIN = 9.5, H_MAX = 12.4, PASSO = 7.6;
const CINZA_FINO = rgb(0.88, 0.90, 0.92);
const ALTURA_MOLDURA = 148;
const NOTA_HERDADA = "* Condição do jateamento, não medida nesta demão: a demão não tem leitura própria e o documento "
  + "repete a medida na preparação da superfície.";

const revisao = (rel) => (rel.revisao ? `R${String(rel.revisao).padStart(2, "0")}` : null);
// ⚠ o Nº das folhas seguintes saía SEM a revisão, enquanto o cabeçalho a mostrava (02/10/2026)
const numeroDoc = (rel) => [rel.codigo || "", revisao(rel)].filter(Boolean).join(" ");
const vazio = (v) => v == null || String(v).trim() === "";

// ─── BLOCOS QUE RESERVAM O PRÓPRIO ESPAÇO ────────────────────────────────────────────────────

/** Faixa cinza com o título centrado; `junto` = altura do que não pode ficar separado dela. */
function faixa(fl, texto, junto = 0) {
  fl.reservar(13 + junto);
  const f = fl.f;
  const topo = f.bloco(13, SOFT);
  const s = san(texto);
  f.page.drawText(s, { x: M + (f.W - f.bold.widthOfTextAtSize(s, 7)) / 2, y: topo - 9.5, size: 7, font: f.bold, color: GRAY });
}

/**
 * Linha de identificação que CRESCE com o valor, com o espaço reservado antes.
 * ⚠ `linhaInfo` encolhe até 6 pt e depois corta com "…": descrição, procedimento, equipamento e
 * ruptura do pull-off saíam pela metade (verificação dos modelos, 02/10/2026).
 */
function linha(fl, campos, maxLinhas = 40) {
  fl.reservar(fl.f.medirInfoCresce(campos, { maxLinhas }).altura);
  return fl.f.linhaInfoCresce(campos, { maxLinhas });
}

/**
 * Reparte a largura pelo CONTEÚDO, não em partes iguais (mesma conta de `linhaInfoAuto`).
 * ⚠ A obra costuma ser longa e a referência curta, mas há obra de nome curto e cliente que manda
 * quatro referências — dividir igual garante que uma das duas estoure. Piso de 18% por campo.
 */
function pelaLargura(f, campos) {
  const custo = campos.map(([r, v]) => f.bold.widthOfTextAtSize(san(r), 6.4) + f.bold.widthOfTextAtSize(san(v ?? ""), 8) + 20);
  const total = custo.reduce((a, b) => a + b, 0) || 1;
  const bruto = custo.map((c) => Math.max(0.18, c / total));
  const soma = bruto.reduce((a, b) => a + b, 0);
  return campos.map(([r, v], i) => [r, v, bruto[i] / soma]);
}

const linhasNota = (f, texto) => quebrarTexto(texto, f.font, 6, f.W - 14);
const alturaNota = (f, texto) => 6 + linhasNota(f, texto).length * 7.5;

/** Uma nota curta em cinza, que quebra em quantas linhas precisar. */
function nota(fl, texto) {
  fl.reservar(alturaNota(fl.f, texto));
  const f = fl.f;
  const linhas = linhasNota(f, texto);
  const topo = f.bloco(6 + linhas.length * 7.5);
  linhas.forEach((ln, i) => f.page.drawText(ln, { x: M + 7, y: topo - 8.5 - i * 7.5, size: 6, font: f.font, color: GRAY }));
}

// ─── IDENTIFICAÇÃO ───────────────────────────────────────────────────────────────────────────

function identificacao(fl, rel, res, { cliente, obra, refCliente }) {
  linha(fl, [["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
  linha(fl, pelaLargura(fl.f, [["OP:", `OP-${rel.opNumero}`], ["OBRA / CONTRATO:", obra || ""], ["REF. CLIENTE:", refCliente || "—"]]));
  linha(fl, [["DESCRIÇÃO:", res.descricao || "", 0.62], ["PROCEDIMENTO / REV.:", res.procedimento || "", 0.38]]);
}

/**
 * A RELAÇÃO DE PEÇAS SAI INTEIRA.
 *
 * ⚠⚠ Vitor (04/09/2026): "quando informamos as peças precisa que sejam listadas todas elas, você não
 * pode deixar ela com '…', precisa sair 100%". Cabe em até 3 linhas na folha 1; passou disso, a folha 1
 * diz quantas são e EM QUE FOLHA estão, e a relação completa vira ANEXO.
 *
 * ⚠ A folha do anexo só se conhece depois de desenhadas as folhas que vêm antes dele (a folha 1 pode
 * continuar, o registro fotográfico pode ter mais de uma) — por isso a frase é escrita no fim, por
 * `apontar`, no lugar que ficou reservado.
 */
function pecas(fl, rel, res) {
  const marcas = (Array.isArray(rel.marcas) ? rel.marcas : []).filter(Boolean);
  const detalhadas = res.pecasInformadas?.length ? pecasDoRelatorio(rel).map(textoPeca) : null;
  const texto = detalhadas ? detalhadas.join(", ") : res.pecas || marcas.join(", ");
  const quantidade = res.quantidade ?? "";
  const campos = [["PEÇAS PINTADAS:", texto, 0.72], ["QUANTIDADE:", quantidade, 0.28]];
  const itens = detalhadas || (marcas.length ? marcas : String(texto).split(/[,;]/).map((t) => t.trim()).filter(Boolean));
  const cabe = fl.f.medirInfoCresce(campos, { maxLinhas: 999 }).dobras[0].length <= 3;
  // sem itens para listar no anexo (não acontece), o texto sai inteiro aqui mesmo — nunca some
  if (cabe || !itens.length) {
    linha(fl, campos, cabe ? 3 : 40);
    return null;
  }
  fl.reservar(16);
  const f = fl.f, y = f.y;
  f.linhaInfoCresce([["PEÇAS PINTADAS:", "", 0.72], ["QUANTIDADE:", quantidade, 0.28]], { maxLinhas: 1 });
  const dx = f.bold.widthOfTextAtSize(san("PEÇAS PINTADAS:"), 6.4) + 12;
  return {
    itens,
    apontar: (ini, fim) => f.valor(M + dx, y - 11,
      `${itens.length} marcas — relação completa ${ini === fim ? `na folha ${ini}` : `nas folhas ${ini} a ${fim}`}`,
      f.W * 0.72 - dx - 8, 8),
  };
}

// ─── PREPARAÇÃO DA SUPERFÍCIE ────────────────────────────────────────────────────────────────

function preparacao(fl, res) {
  faixa(fl, "PREPARAÇÃO DA SUPERFÍCIE", 16);
  linha(fl, [
    ["PROCEDIMENTO:", res.prepProcedimento || "", 0.4],
    ["DATA:", datasNoDocumento(res.prepData), 0.2],
    ["HORÁRIO INICIAL:", res.prepIni || "", 0.2],
    ["HORÁRIO FINAL:", res.prepFim || "", 0.2],
  ]);
  // ⚠ ESTA LINHA É A LEITURA DO JATEAMENTO, e o documento passou a dizer isso. Sem o rótulo, ela
  // parecia "a condição ambiental do relatório" — e era copiada para as três demãos como se
  // alguém tivesse medido em cada uma.
  linha(fl, [
    ["UMIDADE NO JATO (URA):", numeroNoDocumento(res.prepUmidade), 0.25],
    ["TEMP. AMBIENTE:", numeroNoDocumento(res.prepTAmb), 0.25],
    ["TEMP. SUPERFÍCIE:", numeroNoDocumento(res.prepTSup), 0.25],
    ["PONTO DE ORVALHO:", numeroNoDocumento(res.prepOrvalho), 0.25],
  ]);
  // ⚠ o perfil obtido é a MÉDIA DAS MEDIÇÕES (PO-05, item 5.5.1.1) — calculada, não digitada.
  // ⚠⚠ e o rótulo diz de QUANTAS: com 2 leituras ele dizia "média de 5" sobre uma conta que somava
  // três zeros (62 e 71 viravam 26,6 µm — verificação de 02/10/2026).
  const nRug = leiturasValidas(res.rugLeituras);
  const rugMedia = mediaRugosidade(res.rugLeituras);
  linha(fl, [
    ["RUGOSIDADE ESPEC.:", res.rugEspec || "", 0.26],
    [nRug ? `OBTIDO (média de ${nRug}):` : "OBTIDO:", rugMedia != null ? `${numeroComVirgula(rugMedia)} µm` : (res.rugObtido || ""), 0.24],
    ["TIPO DE ABRASIVO:", res.abrasivo || "", 0.5],
  ]);
  linha(fl, [
    ["POEIRA (ISO 8502-3):", res.poeira || "", 0.5],
    ["SALINIDADE (ISO 8502-6 / 9):", res.salinidade || "", 0.5],
  ]);
  // ⚠ o PULL-OFF NÃO SAÍA NO DOCUMENTO. O formulário passou a ter os campos (com N/A), mas o PDF
  // só tinha a moldura de foto do ensaio — o valor medido ficava no banco e o cliente recebia um
  // relatório que não dizia se a aderência foi ensaiada.
  linha(fl, [
    ["ADERÊNCIA PULL-OFF — EQUIP.:", res.pullOffEquip || "", 0.36],
    ["OBTIDO (MPa):", numeroNoDocumento(res.pullOffValor), 0.16],
    ["MÍNIMO (MPa):", numeroNoDocumento(res.pullOffMin), 0.16],
    ["RUPTURA:", res.pullOffRuptura || "", 0.32],
  ]);
  grau(fl, "GRAU DE INTEMPERISMO:", GRAUS_INTEMPERISMO, res.intemperismo);
  grau(fl, "GRAU DE LIMPEZA:", GRAUS_LIMPEZA, res.limpeza);
}

/**
 * Os graus, marcados com caixinha como no modelo.
 *
 * ⚠⚠ GRAU QUE O MODELO NÃO TEM NÃO PODE SUMIR. A tela oferece ST3, SA1 e SA2, e a folha só tem as
 * caixas WJ1–3 / ST2 / SA2½ / SA3: um jateamento comercial (SA2) saía com as seis caixas vazias, como
 * se ninguém tivesse preparado a superfície (verificação dos modelos, 02/10/2026). O grau escolhido vai
 * marcado ao lado, como "Outro", na notação da norma.
 */
function grau(fl, rot, opcoes, escolhido) {
  const { W, bold } = fl.f;
  const x0 = M + 150;
  const passo = Math.min(52, (W - 160) / opcoes.length);
  const xOutro = x0 + opcoes.length * passo;
  const casou = opcoes.some((o) => normGrau(o) === normGrau(escolhido));
  const outro = !vazio(escolhido) && !casou ? quebrarTexto(`Outro: ${grauNaNorma(escolhido)}`, bold, 6.4, M + W - 7 - (xOutro + 10)) : [];
  const alt = 15 + Math.max(0, outro.length - 1) * 8;
  fl.reservar(alt);
  const f = fl.f;
  const topo = f.bloco(alt);
  f.rotulo(M + 7, topo - 10, rot, 6);
  opcoes.forEach((o, i) => {
    const x = x0 + i * passo;
    f.marcar(x, topo - 3.5, normGrau(escolhido) === normGrau(o), GREEN);
    f.page.drawText(san(o), { x: x + 10, y: topo - 10, size: 6.4, font: f.font, color: DARK });
  });
  if (outro.length) {
    f.marcar(xOutro, topo - 3.5, true, GREEN);
    outro.forEach((ln, i) => f.page.drawText(ln, { x: xOutro + 10, y: topo - 10 - i * 8, size: 6.4, font: bold, color: DARK }));
  }
}

// ─── AS TABELAS POR DEMÃO ────────────────────────────────────────────────────────────────────

/**
 * As linhas do quadro de aplicação, com o valor como o documento escreve.
 *
 * ⚠⚠ A CONDIÇÃO AMBIENTAL DO JATO VALE PARA A DEMÃO QUE NÃO TEM A SUA — e o documento DIZ que herdou.
 * Vitor (04/09/2026): "não está salvando umidade e temperatura no relatório" — estava, no bloco do
 * jateamento, e a coluna da demão saía em branco; herdar manteve o documento legível. Mas o valor
 * herdado saía igual a uma medição feita na demão (verificação dos modelos, 02/10/2026): agora leva
 * "*" e a nota abaixo da tabela explica. ⚠ Herda SÓ em demão que existe (`leiturasAmbientais`).
 */
function linhasAplicacao(res) {
  const dem = res.demaos || {};
  const ambiente = ["1", "2", "3"].map((n) => leiturasAmbientais(res, n));
  let herdou = false;
  const linhas = APLICACAO.map(([rot, k]) => ({
    rot,
    valores: ["1", "2", "3"].map((n, d) => {
      if (EH_AMBIENTE.has(k)) {
        const v = ambiente[d][k];
        if (vazio(v)) return "";
        const herdado = ambiente[d].herdados.includes(k);
        herdou = herdou || herdado;
        return `${numeroNoDocumento(v)}${herdado ? "*" : ""}`;
      }
      const v = dem[n]?.[k];
      if (vazio(v)) return "";
      return EH_DATA.has(k) ? datasNoDocumento(v) : String(v);
    }),
  }));
  return { linhas, herdou };
}

/** As cinco leituras e a média de cada demão. */
function linhasEspessura(res) {
  const esp = res.espessuras || {};
  const lista = (n) => (Array.isArray(esp[n]) ? esp[n] : []);
  const leituras = [0, 1, 2, 3, 4].map((i) => ({
    rot: `Leitura ${i + 1}`,
    valores: ["1", "2", "3"].map((n) => (vazio(lista(n)[i]) ? "" : numeroNoDocumento(lista(n)[i]))),
  }));
  // ⚠ a MÉDIA é calculada, não digitada: valor que se digita à mão é valor que se erra, e aqui ela é o
  // número que decide se a demão passa. ⚠⚠ E pela MESMA função das telas — esta folha tinha conta
  // própria, que também somava a leitura em branco como zero (3 leituras de 272 µm davam 163,6).
  const media = { rot: "Média geral", negrito: true, separado: true, valores: ["1", "2", "3"].map((n) => numeroComVirgula(mediaEspessura(lista(n)))) };
  return [...leituras, media];
}

/** Quantas linhas de texto cada linha da tabela precisa — a célula QUEBRA, não corta (02/10/2026). */
function medirLinhas(f, linhas, tam) {
  const wRot = f.W * 0.34, wDem = (f.W - wRot) / 3;
  return linhas.map((l) => {
    const rot = quebrarTexto(l.rot, l.negrito ? f.bold : f.font, 6.4, wRot - 12);
    const cels = l.valores.map((v) => (vazio(v) ? [] : quebrarTexto(String(v), f.bold, tam, wDem - 8)));
    return { ...l, rot, cels, n: Math.max(1, rot.length, ...cels.map((c) => c.length)) };
  });
}
const alturaLinha = (l, hL) => hL + (l.n - 1) * PASSO;

/**
 * Uma tabela "propriedade × demão". Desenha as linhas que cabem na folha; o resto continua na
 * seguinte, com o título "(continuação)" e o cabeçalho das demãos repetidos — a folha solta ainda diz
 * qual coluna é qual demão.
 */
function tabela(fl, { titulo, canto, linhas, hL, tam }) {
  let i = 0, parte = 0;
  while (i < linhas.length) {
    // ⚠ o título vai junto do cabeçalho e de pelo menos 3 linhas — não deixa fiapo de tabela no pé da folha
    const primeiras = linhas.slice(i, i + 3).reduce((s, l) => s + alturaLinha(l, hL), 0);
    faixa(fl, parte ? `${titulo} (continuação)` : titulo, 13 + primeiras);
    let alt = 13, j = i;
    while (j < linhas.length && fl.cabe(alt + alturaLinha(linhas[j], hL))) { alt += alturaLinha(linhas[j], hL); j++; }
    if (j === i) { alt += alturaLinha(linhas[i], hL); j = i + 1; }
    segmento(fl.f, { canto, linhas: linhas.slice(i, j), alt, hL, tam });
    i = j; parte++;
    if (i < linhas.length) fl.novaFolha();
  }
}

function segmento(f, { canto, linhas, alt, hL, tam }) {
  const { page, font, bold, W } = f;
  const wRot = W * 0.34, wDem = (W - wRot) / 3;
  const topo = f.bloco(alt);
  page.drawText(canto, { x: M + 7, y: topo - 9, size: 6.4, font: bold, color: GRAY });
  ["1ª DEMÃO", "2ª DEMÃO", "3ª DEMÃO"].forEach((t, d) => {
    const x = M + wRot + d * wDem;
    page.drawLine({ start: { x, y: topo }, end: { x, y: topo - alt }, thickness: 0.7, color: LINE });
    page.drawText(t, { x: x + (wDem - bold.widthOfTextAtSize(t, 6.4)) / 2, y: topo - 9, size: 6.4, font: bold, color: GRAY });
  });
  page.drawLine({ start: { x: M, y: topo - 13 }, end: { x: M + W, y: topo - 13 }, thickness: 0.7, color: LINE });
  // a base do texto acompanha a linha (8,6 pt numa linha de 12,4)
  const base = hL * 0.69;
  let y = topo - 13;
  linhas.forEach((l, k) => {
    if (l.separado && k > 0) page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.7, color: LINE });
    const fim = y - alturaLinha(l, hL);
    if (k < linhas.length - 1) page.drawLine({ start: { x: M, y: fim }, end: { x: M + W, y: fim }, thickness: 0.35, color: CINZA_FINO });
    l.rot.forEach((ln, r) => page.drawText(ln, { x: M + 7, y: y - base - r * PASSO, size: 6.4, font: l.negrito ? bold : font, color: GRAY }));
    l.cels.forEach((cel, d) => {
      const x = M + wRot + d * wDem;
      cel.forEach((ln, r) => page.drawText(ln, { x: x + (wDem - bold.widthOfTextAtSize(ln, tam)) / 2, y: y - base - r * PASSO, size: tam, font: bold, color: DARK }));
    });
    y = fim;
  });
}

// ─── LAUDO ───────────────────────────────────────────────────────────────────────────────────

/**
 * O que o bloco do laudo vai escrever, e a altura dele — medido antes, para a conta da folha 1.
 *
 * ⚠⚠ O LAUDO É O RESULTADO DA INSPEÇÃO (`laudoDoRelatorio`). Vitor (05/09/2026): "o laudo final desse
 * relatório não está como aprovado" — a folha lia o campo ANTIGO do formulário (`resultados.laudo`). E
 * a verificação de 02/10/2026 achou o inverso: o select antigo ainda na tela, preferido pelo PDF, e um
 * relatório REPROVADO saindo com a caixa "Aprovado".
 *
 * ⚠ A espessura mínima só vai ao lado das caixas quando cabe: com o rótulo do REC ("Recomendação de
 * exame complementar") os dois textos saíam um por cima do outro. Não cabendo, desce uma linha.
 *
 * ⚠ CONDIÇÃO AMBIENTAL FORA DO PO-05 SAI IMPRESSA, junto do laudo, POR ETAPA ("na 2ª demão") — e
 * inteira: era cortada com reticência numa linha só.
 */
function medirLaudo(f, rel, res) {
  const estado = laudoDoRelatorio(rel);
  const fimCaixas = estado === "REC"
    ? M + 270 + f.bold.widthOfTextAtSize(san(RESULTADO_LABEL.REC), 7)
    : M + 191 + f.bold.widthOfTextAtSize("Reprovado", 7);
  const esp = vazio(res.espessuraMinima) ? null : san(`Espessura mínima especificada: ${comUnidade(res.espessuraMinima, "µm")}`);
  const espAoLado = !!esp && fimCaixas + 16 + f.font.widthOfTextAtSize(esp, 6.4) <= M + f.W - 7;
  const espLinhas = esp && !espAoLado ? quebrarTexto(esp, f.font, 6.4, f.W - 14) : [];
  const fora = ambientePorEtapa(res).filter((e) => e.avaliacao.avaliado && !e.avaliacao.permitido);
  const foraLinhas = fora.length
    ? quebrarTexto(`Fora do PO-05 (5.4) ${fora.map((e) => `na ${e.curto}: ${e.avaliacao.impedimentos.join(" ")}`).join(" | ")}`, f.font, 6, f.W - 14)
    : [];
  return { estado, esp, espAoLado, espLinhas, foraLinhas, altura: 24 + (espLinhas.length + foraLinhas.length) * 9 };
}

function laudo(fl, rel, res) {
  const m = medirLaudo(fl.f, rel, res);
  fl.reservar(m.altura);
  const f = fl.f;
  const { page, font, bold, W } = f;
  const topo = f.bloco(m.altura);
  page.drawText("LAUDO FINAL:", { x: M + 7, y: topo - 15, size: 7, font: bold, color: DARK });
  ["Aprovado", "Reprovado"].forEach((o, i) => {
    const x = M + 90 + i * 90;
    const on = m.estado === o.toUpperCase();
    f.marcar(x, topo - 8, on, o === "Aprovado" ? GREEN : RED);
    page.drawText(o, { x: x + 11, y: topo - 15, size: 7, font: on ? bold : font, color: DARK });
  });
  // ⚠ "exame complementar" não é aprovado nem reprovado — sem isto, um relatório em REC sairia com
  // as duas caixas vazias, indistinguível de um que ninguém julgou.
  if (m.estado === "REC") page.drawText(san(RESULTADO_LABEL.REC), { x: M + 270, y: topo - 15, size: 7, font: bold, color: DARK });
  if (m.espAoLado) page.drawText(m.esp, { x: M + W - 7 - font.widthOfTextAtSize(m.esp, 6.4), y: topo - 15, size: 6.4, font, color: GRAY });
  let y = topo - 15;
  for (const ln of m.espLinhas) { y -= 9; page.drawText(ln, { x: M + 7, y, size: 6.4, font, color: GRAY }); }
  for (const ln of m.foraLinhas) { y -= 9; page.drawText(ln, { x: M + 7, y, size: 6, font, color: RED }); }
}

// ─── O CORPO DA FOLHA 1 ──────────────────────────────────────────────────────────────────────

/**
 * Aplicação, espessuras, laudo, observações e instrumentos.
 *
 * ⚠⚠ A FOLHA 1 TEM DE FECHAR DENTRO DO PAPEL. Varredura de 23/09/2026: no RIP-106-002 as datas das
 * assinaturas foram desenhadas em y = −2,2 pt; a verificação de 02/10/2026 achou a moldura a −8,6 pt
 * com peças em 3 linhas, 9 instrumentos e assinatura com imagem — o piso de 9,5 pt da linha não
 * bastava, e nada conferia a margem. Agora a linha das tabelas ainda cede (entre 9,5 e 12,4 pt) para
 * TUDO caber na folha 1 quando dá; quando não dá nem a 9,5, ela fica no tamanho que leva as tabelas e o
 * laudo, e observações e instrumentos continuam na folha seguinte — cada bloco reserva o seu espaço.
 */
function corpo(fl, rel, res, { obsFotosNaFolha1 }) {
  const { linhas: aplic, herdou } = linhasAplicacao(res);
  const mAplic = medirLinhas(fl.f, aplic, 6.6);
  const mEsp = medirLinhas(fl.f, linhasEspessura(res), 6.8);
  const todas = [...mAplic, ...mEsp];
  const fixo = 4 * 13 + todas.reduce((s, l) => s + (l.n - 1) * PASSO, 0) + (herdou ? alturaNota(fl.f, NOTA_HERDADA) : 0);
  const equipamentos = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];
  const hLaudo = medirLaudo(fl.f, rel, res).altura;
  const cauda = hLaudo + alturaTexto(fl.f.linhasTexto(rel.observacoes).length, 30)
    + (obsFotosNaFolha1 ? alturaTexto(fl.f.linhasTexto(res.obsFotos).length, 30) : 0)
    + alturaInstrumentos(equipamentos.length);
  // ⚠ 1 pt de folga: a linha é calculada para fechar EXATAMENTE, e 23,9999… < 24 de arredondamento
  // jogava o laudo para a folha seguinte sem necessidade
  const disp = fl.sobra() - 1;
  const tudo = (disp - fixo - cauda) / todas.length;
  const hL = tudo >= H_MIN ? Math.min(H_MAX, tudo) : Math.max(H_MIN, Math.min(H_MAX, (disp - fixo - hLaudo) / todas.length));

  tabela(fl, { titulo: "APLICAÇÃO DE TINTAS", canto: "DEMÃOS", linhas: mAplic, hL, tam: 6.6 });
  if (herdou) nota(fl, NOTA_HERDADA);
  tabela(fl, { titulo: "MEDIÇÕES DE ESPESSURA (µm)", canto: "LEITURAS", linhas: mEsp, hL, tam: 6.8 });
  laudo(fl, rel, res);
  // ⚠⚠ A OBSERVAÇÃO SAI INTEIRA. Ela tinha caixa fixa de duas linhas, a segunda riscada pela borda, e
  // o resto sumia: cabiam ~280 caracteres onde o celular aceita 1000 e o computador não tem teto
  // (verificação de 02/10/2026). O que não cabe continua na folha seguinte, como "(continuação)".
  fl.texto("OBSERVAÇÕES:", rel.observacoes || "", { vazio: 30 });
  // ⚠ sem foto de ensaio não existe a folha do registro fotográfico — e a OBS. dela não pode sumir junto
  if (obsFotosNaFolha1) fl.texto("OBS. DO REGISTRO FOTOGRÁFICO:", res.obsFotos, { vazio: 30 });
  if (equipamentos.length) fl.instrumentos(equipamentos);
  else { fl.reservar(alturaInstrumentos(0)); fl.f.blocoInstrumentos([]); }
}

// ─── FOLHA 2: O REGISTRO FOTOGRÁFICO ─────────────────────────────────────────────────────────

/**
 * Uma moldura por ENSAIO com foto, duas por fileira, cada uma com a PRIMEIRA foto daquela área.
 *
 * ⚠⚠ AS SEIS MOLDURAS SAÍAM SEMPRE VAZIAS. Este trecho lia `foto.imagem`, propriedade que não existe —
 * `embutirFotos` devolve `img` — e ainda pegava a foto pela ORDEM DE UPLOAD, então nem por acaso a
 * imagem cairia no ensaio certo.
 * ⚠ A legenda ("Medição de Espessura · 1 de 8 · o que o inspetor escreveu") QUEBRA em quantas linhas
 * precisar e a foto encolhe — ela era cortada com reticência numa linha só (02/10/2026).
 */
async function registroFotografico(doc, fl, { areasComFoto, naGrade, obsFotos }) {
  // embute só a PRIMEIRA de cada área — as demais vão na folha de fotos, e embutir a mesma imagem
  // duas vezes engorda o PDF à toa
  const fotosGrade = await embutirFotos(doc.pdf, [...naGrade]);
  fl.novaFolha();
  const wCel = fl.f.W / 2;
  const celulas = areasComFoto.map((a) => {
    const foto = fotosGrade.find((ft) => (ft.evidencia || null) === a.k);
    const linhas = quebrarTexto(foto?.legenda || a.rot, fl.f.bold, 6.4, wCel - 14);
    return { linhas, faixa: 6 + 8 * Math.max(1, linhas.length), img: foto?.img || null };
  });
  // ⚠ a grade cresce com o que existe: uma fileira para cada dois ensaios com foto, nunca as três fixas
  // do modelo — o resto da folha fica para a OBS. e as assinaturas
  const fileiras = [];
  for (let i = 0; i < celulas.length; i += 2) {
    const par = celulas.slice(i, i + 2);
    fileiras.push({ par, alt: Math.max(ALTURA_MOLDURA, ...par.map((c) => c.faixa + 12 + 110)) });
  }
  faixa(fl, "REGISTRO FOTOGRÁFICO", fileiras[0].alt);
  fileiras.forEach((fi, k) => {
    if (k > 0 && !fl.cabe(fi.alt)) { fl.novaFolha(); faixa(fl, "REGISTRO FOTOGRÁFICO (continuação)", fi.alt); }
    const f = fl.f;
    const topo = f.bloco(fi.alt);
    fi.par.forEach((c, col) => moldura(f, c, { x: M + col * wCel, topo, larg: wCel, alt: fi.alt }));
  });
  // ⚠ a OBS. desta folha tinha a mesma caixa fixa de duas linhas das observações — e nenhum campo nas
  // telas para preencher (verificação de 02/10/2026)
  fl.texto("OBS.:", obsFotos || "", { vazio: 30 });
}

function moldura(f, c, { x, topo, larg, alt }) {
  const { page } = f;
  f.caixa(x, topo, larg, alt);
  page.drawRectangle({ x, y: topo - c.faixa, width: larg, height: c.faixa, color: SOFT });
  page.drawRectangle({ x, y: topo - c.faixa, width: larg, height: c.faixa, borderColor: LINE, borderWidth: 0.7 });
  c.linhas.forEach((ln, k) => page.drawText(ln, { x: x + 7, y: topo - 10 - k * 8, size: 6.4, font: f.bold, color: GRAY }));
  const dispW = larg - 12, dispH = alt - c.faixa - 12;
  if (!c.img) {
    // a falta fica visível, não silenciosa — como na folha de fotos
    const t = "(imagem não disponível)";
    page.drawText(t, { x: x + (larg - f.font.widthOfTextAtSize(t, 7)) / 2, y: topo - c.faixa - dispH / 2, size: 7, font: f.font, color: GRAY });
    return;
  }
  const esc = Math.min(dispW / c.img.width, dispH / c.img.height);
  page.drawImage(c.img, {
    x: x + 6 + (dispW - c.img.width * esc) / 2,
    y: topo - c.faixa - 6 - dispH + (dispH - c.img.height * esc) / 2,
    width: c.img.width * esc, height: c.img.height * esc,
  });
}

// ─── ANEXO: A RELAÇÃO DE PEÇAS, INTEIRA ──────────────────────────────────────────────────────

/**
 * Só existe quando a lista não coube na folha 1. Em 2 colunas, preenchidas por COLUNA: a marca P10
 * fica embaixo da P9, como na lista de expedição — por linha, a sequência atravessaria a folha e
 * ninguém acha nada. Devolve as folhas em que ficou, para a folha 1 apontar.
 */
function relacaoDePecas(fl, itens) {
  fl.novaFolha();
  const ini = fl.quantas;
  const f0 = fl.f;
  const larg = f0.W / ANEXO_COLS - 10;
  // marca longa encolhe até 6 pt e, se nem assim couber, quebra — nunca invade a coluna vizinha
  const entradas = itens.flatMap((m) => {
    const t = san(m);
    const w1 = Math.max(f0.font.widthOfTextAtSize(t, 1), 0.001);
    if (w1 * 6 <= larg) return [{ t, tam: Math.min(7, larg / w1), recuo: 0 }];
    return quebrarTexto(t, f0.font, 6, larg - 6).map((ln, k) => ({ t: ln, tam: 6, recuo: k ? 6 : 0 }));
  });
  // ⚠ 3 pt de respiro no pé da caixa: a última marca encostava o parêntese na borda
  const porFolha = Math.max(1, Math.floor((fl.sobra() - 13 - 3) / ANEXO_LINHA)) * ANEXO_COLS;
  const nFolhas = Math.ceil(entradas.length / porFolha);
  for (let pg = 0; pg < nFolhas; pg++) {
    if (pg) fl.novaFolha();
    const rot = nFolhas > 1
      ? `RELAÇÃO DE PEÇAS PINTADAS (${pg + 1} de ${nFolhas}) — ${itens.length} marcas`
      : `RELAÇÃO DE PEÇAS PINTADAS — ${itens.length} marcas`;
    const doPg = entradas.slice(pg * porFolha, (pg + 1) * porFolha);
    const linhasPg = Math.ceil(doPg.length / ANEXO_COLS);
    faixa(fl, rot, linhasPg * ANEXO_LINHA + 3);
    const f = fl.f;
    const topo = f.bloco(linhasPg * ANEXO_LINHA + 3);
    doPg.forEach((e, i) => {
      const col = Math.floor(i / linhasPg), lin = i % linhasPg;
      f.page.drawText(e.t, { x: M + col * (f.W / ANEXO_COLS) + 5 + e.recuo, y: topo - lin * ANEXO_LINHA - 8, size: e.tam, font: f.font, color: DARK });
    });
  }
  return { ini, fim: fl.quantas };
}

// ─── O DOCUMENTO ─────────────────────────────────────────────────────────────────────────────

export async function gerarPinturaPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const res = rel.resultados || {};
  // ── AS FOTOS, POR ÁREA DE ENSAIO ─────────────────────────────────────────────────────────────
  // A folha 2 tem uma moldura por ensaio; cada uma leva a PRIMEIRA foto daquela área. O resto — 2ª
  // foto em diante e o que está sem área — vai na folha extra de fotos.
  // ⚠⚠ A NUMERAÇÃO VEM PRONTA, DE UM LUGAR SÓ (lib/fotos-evidencia.js): "Medição de Espessura ·
  // 3 de 8". Calculada na moldura e esquecida na folha de fotos, ela fazia o documento prometer
  // uma contagem de 8 e mostrar número em uma foto só.
  const listaFotos = numerarPorEvidencia("PINTURA", fotos);
  const areas = evidenciasDoTipo("PINTURA");
  const naGrade = new Set();
  for (const a of areas) {
    const primeira = listaFotos.find((f) => (f.evidencia || null) === a.k);
    if (primeira) naGrade.add(primeira);
  }
  // ⚠ com o nome do ensaio E o número na legenda, senão a folha extra volta a ser um monte de
  // imagem solta — sete quadros dizendo "Medição de Espessura", indistinguíveis entre si.
  // ⚠ AS SOBRAS SAEM AGRUPADAS POR ENSAIO. Vitor (04/09/2026): "você não separa as fotos de acordo
  // com cada tipo de teste". Vêm na ordem dos ensaios, e as sem área por último.
  const sobras = listaFotos.filter((f) => !naGrade.has(f)).map((f) => ({ ...f, observacao: f.legenda }));
  const ordemArea = new Map(areas.map((a, i) => [a.k, i]));
  sobras.sort((x, y) => (ordemArea.get(x.evidencia) ?? 99) - (ordemArea.get(y.evidencia) ?? 99));
  // ⚠⚠ MOLDURA VAZIA NÃO SE IMPRIME. Vitor (04/09/2026): "caso não sejam importadas fotos dessas
  // áreas você não precisa mostrar elas, já demos N/A para alguns casos". Só entram os ensaios que
  // TÊM foto — e, se nenhum tem, a folha do registro fotográfico nem existe.
  const areasComFoto = areas.filter((a) => listaFotos.some((ft) => (ft.evidencia || null) === a.k));
  const temFolha2 = areasComFoto.length > 0;

  const fl = criarFluxo(doc, {
    cabecalho: { titulo: TITULO, codigo: rel.codigo, revisao: revisao(rel), emitidoEm: rel.emitidoEm },
    identificacaoCurta: (f) => f.linhaInfoCresce([["OP:", `OP-${rel.opNumero}`, 0.2], ["CLIENTE:", cliente || "", 0.45], ["Nº:", numeroDoc(rel), 0.35]], { maxLinhas: 6 }),
    assinaturas, papeis: PAPEIS, inspetor: rel.inspetor,
  });

  // ── FOLHA 1 (e a continuação dela, quando não cabe) ──
  identificacao(fl, rel, res, { cliente, obra, refCliente });
  const anexo = pecas(fl, rel, res);
  preparacao(fl, res);
  corpo(fl, rel, res, { obsFotosNaFolha1: !temFolha2 && !vazio(res.obsFotos) });

  // ── FOLHA 2: registro fotográfico (só quando algum ensaio tem foto) ──
  if (temFolha2) await registroFotografico(doc, fl, { areasComFoto, naGrade, obsFotos: res.obsFotos });

  // ── ANEXO: a relação de peças, quando não coube na folha 1 ──
  if (anexo) {
    const { ini, fim } = relacaoDePecas(fl, anexo.itens);
    anexo.apontar(ini, fim);
  }

  // ── FOTOS QUE SOBRARAM: folha a mais, mesmo formato ──────────────────────────────────────────
  //
  // Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos testes, tanto
  // para o computador quanto para o celular; posso colocar foto em qualquer relatório — alguns têm
  // campos específicos, e para os que não têm você cria uma página para anexar essas imagens".
  //
  // ⚠ Reusa a folha do EVS de propósito: é literalmente o mesmo formato, e duas implementações da
  // mesma página divergiriam na primeira correção. Ela vem DEPOIS de todas as folhas que fluem e se
  // numera a partir delas (`paginas`); o fluxo fecha com o total do documento inteiro.
  if (sobras.length) {
    const { paginaDeFotos } = await import("./relatorio-evs-pdf");
    await paginaDeFotos(doc, rel, sobras, { cliente, obra, assinaturas, papeis: PAPEIS, paginas: fl.quantas });
  }

  await fl.fechar(doc.pdf.getPageCount());
  return doc.pdf.save();
}
