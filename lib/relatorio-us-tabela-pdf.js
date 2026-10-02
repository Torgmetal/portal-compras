import "server-only";
import { rgb } from "pdf-lib";
import { M, san, quebrarTexto, DARK, GRAY, LINE, SOFT, GREEN, RED, ORANGE } from "./relatorio-form-pdf";
import { classificacaoIndicacao } from "./us-campos";

// A TABELA DE INDICAÇÕES DO RELATÓRIO DE ULTRASSOM (RUS) — o miolo de lib/relatorio-us-pdf.js.
//
// ⚠ O CABEÇALHO DA TABELA TEM TRÊS ANDARES: os grupos DECIBÉIS e DESCONTINUIDADES cobrem várias
// colunas, e dentro de DESCONTINUIDADES ainda há DISTÂNCIA cobrindo duas. Reproduzir os andares
// importa: sem eles, "A partir de X" e "A partir de Y" ficam soltos e ninguém sabe distância de quê.
//
// ⚠⚠ A LINHA CRESCE COM O TEXTO, E A TABELA CONTINUA NA FOLHA SEGUINTE (verificação do ultrassom,
// 02/10/2026). Eram 12 linhas fixas de 13 pt por folha, e a célula cortava com reticência: a
// observação da indicação perdia o fim ("Falta de penetração em 30 mm na ra..."), justamente o que a
// linha tinha a dizer.

/**
 * As colunas folha, com o grupo a que pertencem. `w` é PESO (a largura sai proporcional à folha).
 *
 * ⚠ A OBSERVAÇÃO GANHOU LARGURA (02/10/2026). Tinha 71 pt e não cabia nada. As colunas de número
 * (dB, distâncias, nível) só levam "52", "1250", "-3": cederam até a largura do rótulo mais largo
 * delas ("Referência", 28 pt a 5,4), e a observação foi de 71 para ~177 pt. Passando disso, a linha
 * cresce — nada se corta.
 */
const COLS = [
  { t: "Identificação\nda Peça", k: "peca", w: 62 },
  { t: "Nº da\nIndicação", k: "indicacao", w: 33, meio: true },
  { t: "Ângulo do\nCabeçote", k: "angulo", w: 33, meio: true },
  { t: "Face de\nEnsaio", k: "face", w: 33, meio: true },
  // ⚠ `inspecionado`, não `comprimento`: a tela grava o comprimento REPROVADO em `comprimento` (ver linhasTabelaUS)
  { t: "Compr.\nInspec. (mm)", k: "inspecionado", w: 40, meio: true },
  { g: "DECIBÉIS", sub: "A", t: "Nível da\nIndicação", k: "db_indicacao", w: 33, meio: true },
  { g: "DECIBÉIS", sub: "B", t: "Nível de\nReferência", k: "db_referencia", w: 33, meio: true },
  { g: "DECIBÉIS", sub: "C", t: "Fator de\nAtenuação", k: "db_atenuacao", w: 33, meio: true },
  { g: "DECIBÉIS", sub: "D", t: "Classe da\nIndicação", k: "db_classe", w: 33, meio: true },
  { g: "DESCONTINUIDADES", t: "Compr.\nReprovado", k: "reprovado", w: 36, meio: true },
  { g: "DESCONTINUIDADES", t: "Percurso\nSônico", k: "percurso", w: 36, meio: true },
  { g: "DESCONTINUIDADES", t: "Profund. da\nFace 'A'", k: "profundidade", w: 36, meio: true },
  { g: "DESCONTINUIDADES", g2: "DISTÂNCIA", t: "A partir\nde 'X'", k: "dist_x", w: 33, meio: true },
  { g: "DESCONTINUIDADES", g2: "DISTÂNCIA", t: "A partir\nde 'Y'", k: "dist_y", w: 33, meio: true },
  { t: "Avaliação /\nLaudo", k: "laudo", w: 36, meio: true },
  { t: "Sinete do\nSoldador", k: "sinete", w: 33, meio: true },
  { t: "Nível de\nDefeito", k: "nivel", w: 33, meio: true },
  { t: "Observação", k: "obs", w: 177 },
];
const SOMA_W = COLS.reduce((a, c) => a + c.w, 0);

const H_GRUPO = 11, H_SUB = 9;
export const H_CAB_TAB = H_GRUPO + H_SUB + 14;
// a linha da tabela: 13 pt com uma linha de texto, mais 7 por linha a mais
export const H_LIN = 13;
// o aviso no pé da folha cuja tabela continua na seguinte
export const H_AVISO = 9;
const AVISO = "(a tabela continua na folha seguinte)";
const ENTRELINHA = 7, TAM = 6.2, TAM_MIN = 5.4;
const SEPARADOR = rgb(0.88, 0.90, 0.92);

const largDe = (f, c) => (f.W * c.w) / SOMA_W;

/**
 * A cor do laudo na tabela: R vermelho, A verde, REC laranja.
 *
 * ⚠ "REC" SAÍA VERMELHO, COMO REPROVADO (02/10/2026): o teste era `/^R/`, e "REC" começa com R.
 * Recomendação de exame complementar não é rejeição — é a cor laranja das duas telas (LAUDOS).
 */
export function corDoLaudo(v) {
  const t = String(v ?? "").trim().toUpperCase();
  return t === "R" ? RED : t === "A" ? GREEN : t === "REC" ? ORANGE : DARK;
}

/** O valor da célula. ⚠ `c` e `d` saem calculados quando não vierem gravados — o relatório antigo,
 * feito antes do cálculo existir, continua imprimindo o número certo. */
// ⚠ número com vírgula, como o dimensional (02/10/2026): "69.5" saía com ponto, digitado assim no celular.
// Só o que é número limpo; o resto ("70°", "N/A") sai como foi escrito.
const NUMERICAS = new Set(["angulo", "inspecionado", "db_indicacao", "db_referencia", "db_atenuacao", "db_classe",
  "reprovado", "percurso", "profundidade", "dist_x", "dist_y"]);
const comVirgula = (k, v) => (NUMERICAS.has(k) && /^-?\d+\.\d+$/.test(v.trim()) ? v.trim().replace(".", ",") : v);

function valorDaCelula(l, k) {
  const v = l[k] == null ? "" : String(l[k]);
  if (v || (k !== "db_atenuacao" && k !== "db_classe")) return comVirgula(k, v);
  const r = classificacaoIndicacao({ a: l.db_indicacao, b: l.db_referencia, percursoMm: l.percurso });
  const calc = k === "db_atenuacao" ? r.c : r.d;
  return calc == null ? "" : comVirgula(k, String(calc));
}

/**
 * O texto de uma célula em linhas que cabem nela.
 *
 * ⚠ ENCOLHE ATÉ 5,4 PT NUMA LINHA SÓ, e só então quebra. Um valor um pouco mais largo que a coluna
 * fica numa linha (a tabela não cresce à toa); o que nem assim cabe QUEBRA LINHA e a linha da tabela
 * cresce. Reticência, nunca.
 */
function linhasDaCelula(v, fnt, larg) {
  const s = san(v);
  const w = fnt.widthOfTextAtSize(s, TAM);
  if (w <= larg) return { linhas: [s], tam: TAM };
  const tam = Math.floor(((TAM * larg) / w) * 100) / 100;
  if (tam >= TAM_MIN) return { linhas: [s], tam };
  return { linhas: quebrarTexto(v, fnt, TAM, larg), tam: TAM };
}

/** Uma linha da tabela pronta para desenhar: o texto de cada célula e a altura que a linha pede. */
export function montarLinha(f, l) {
  const celulas = COLS.map((c) => {
    const v = valorDaCelula(l, c.k);
    if (!v.trim()) return null;
    const fnt = c.k === "laudo" ? f.bold : f.font;
    return { ...linhasDaCelula(v, fnt, largDe(f, c) - 6), fnt, cor: c.k === "laudo" ? corDoLaudo(v) : DARK };
  });
  const n = Math.max(1, ...celulas.map((c) => c?.linhas.length || 1));
  return { celulas, altura: H_LIN + (n - 1) * ENTRELINHA };
}

/**
 * Reparte as linhas da tabela pelas folhas e decide onde vai o fecho (legenda e declaração,
 * observações e instrumentos).
 *
 * 1. as linhas enchem cada folha, e a tabela recomeça na seguinte com o cabeçalho dela;
 * 2. se o fecho INTEIRO cabe depois da última linha, fica ali — e linhas em branco preenchem o meio,
 *    como no formulário (é o que o RUS sempre teve);
 * 3. se não cabe, as duas últimas linhas vão com ele para uma folha nova — a legenda continua logo
 *    abaixo de uma tabela, e não sozinha no alto de uma folha sem tabela;
 * 4. se nem assim (fecho maior que uma folha), ele começa logo abaixo da tabela e flui pelas folhas.
 *
 * ⚠ Toda folha que NÃO fecha a tabela guarda H_AVISO no pé para dizer que ela continua — a folha
 * solta não pode parecer o relatório inteiro. A última devolve essa reserva.
 *
 * @param {number[]} alturas a altura de cada linha
 * @param {{livre:number, fresca:number, fecho:number}} espaco livre na folha atual · numa folha de
 *   continuação · altura do fecho inteiro
 * @returns {{segmentos:{novaFolha:boolean, linhas:number[]}[], fechoJunto:boolean, brancas:number}}
 *   `brancas` = linhas em branco no fim do último pedaço
 */
export function planejarTabela(alturas, { livre, fresca, fecho }) {
  const segmentos = [];
  // tabela sem linha nenhuma (rascunho sem peça) sai com uma linha em branco, não só com o cabeçalho
  const minimo = alturas.length ? 0 : 1;
  let disp = 0;
  const abrir = (novaFolha) => {
    disp = (novaFolha ? fresca : livre) - H_CAB_TAB - H_AVISO;
    segmentos.push({ novaFolha, linhas: [] });
    return segmentos.at(-1);
  };
  let seg = abrir(livre < H_CAB_TAB + H_AVISO + (alturas[0] ?? H_LIN));
  disp -= minimo * H_LIN;
  alturas.forEach((h, i) => {
    if (h > disp && seg.linhas.length) seg = abrir(true);
    seg.linhas.push(i);
    disp -= h;
  });
  disp += H_AVISO; // o último pedaço fecha a tabela: não precisa do aviso
  if (disp >= fecho) return { segmentos, fechoJunto: true, brancas: minimo + Math.floor((disp - fecho) / H_LIN) };
  if (seg.linhas.length >= 3) {
    const levar = seg.linhas.slice(-2);
    const sobraNova = fresca - H_CAB_TAB - levar.reduce((a, i) => a + alturas[i], 0);
    if (sobraNova >= fecho) {
      seg.linhas = seg.linhas.slice(0, -2);
      segmentos.push({ novaFolha: true, linhas: levar });
      return { segmentos, fechoJunto: true, brancas: Math.floor((sobraNova - fecho) / H_LIN) };
    }
  }
  return { segmentos, fechoJunto: false, brancas: minimo };
}

// ─── O DESENHO ───────────────────────────────────────────────────────────────────────────────────

/** Rótulo centrado na célula. Rótulo de coluna é fixo: ENCOLHE até caber, não corta. */
function rotuloCentrado(f, t, { x, larg, y, tam }) {
  const s = san(t);
  let corpo = tam;
  while (corpo > 4 && f.bold.widthOfTextAtSize(s, corpo) > larg - 3) corpo = +(corpo - 0.2).toFixed(2);
  f.page.drawText(s, { x: x + (larg - f.bold.widthOfTextAtSize(s, corpo)) / 2, y, size: corpo, font: f.bold, color: GRAY });
}

/**
 * As colunas vizinhas que dividem o mesmo `chave` (grupo, subgrupo, letra), com o x e a largura juntos.
 * ⚠ A vizinhança é pelo ÍNDICE da coluna, não pela posição: somas de largura em ponto flutuante não
 * batem exato, e o "DESCONTINUIDADES" chegou a sair três vezes, uma por pedaço.
 */
function corridas(f, chave) {
  const out = [];
  let x = M;
  COLS.forEach((c, i) => {
    const larg = largDe(f, c), ult = out.at(-1);
    if (c[chave] && ult?.valor === c[chave] && ult.ate === i - 1) { ult.larg += larg; ult.ate = i; }
    else if (c[chave]) out.push({ valor: c[chave], x, larg, ate: i });
    x += larg;
  });
  return out;
}

/** Os três andares do cabeçalho da tabela, a partir de `topo`. */
function desenharCabecalhoTabela(f, topo) {
  // andar 1: os grupos que cobrem várias colunas
  for (const g of corridas(f, "g")) {
    f.caixa(g.x, topo, g.larg, H_GRUPO, SOFT);
    rotuloCentrado(f, g.valor, { x: g.x, larg: g.larg, y: topo - 8, tam: 6 });
  }
  // andar 2: o subgrupo DISTÂNCIA e as letras A..D dos decibéis
  for (const s of [...corridas(f, "g2"), ...corridas(f, "sub")]) {
    f.caixa(s.x, topo - H_GRUPO, s.larg, H_SUB);
    rotuloCentrado(f, s.valor, { x: s.x, larg: s.larg, y: topo - H_GRUPO - 6.5, tam: 5.4 });
  }
  // andar 3: o nome de cada coluna, em duas linhas
  let x = M;
  for (const c of COLS) {
    const larg = largDe(f, c);
    String(c.t).split("\n").forEach((ln, k) => rotuloCentrado(f, ln, { x, larg, y: topo - H_GRUPO - H_SUB - 6 - k * 6.5, tam: 5.4 }));
    x += larg;
  }
  f.page.drawLine({ start: { x: M, y: topo - H_CAB_TAB }, end: { x: M + f.W, y: topo - H_CAB_TAB }, thickness: 0.7, color: LINE });
}

/**
 * A moldura e as linhas das colunas, de `topo` até `base`.
 * ⚠ Dentro de um grupo, a linha começa ABAIXO da faixa dele: riscava o "DECIBÉIS", o
 * "DESCONTINUIDADES" e o "DISTÂNCIA" no meio, como se fossem células separadas.
 */
function desenharColunas(f, topo, base) {
  f.caixa(M, topo, f.W, topo - base);
  let x = M;
  COLS.forEach((c, i) => {
    if (i > 0) {
      const ant = COLS[i - 1];
      const noGrupo = c.g && ant.g === c.g;
      const noSub = noGrupo && c.g2 && ant.g2 === c.g2;
      const y0 = topo - (noSub ? H_GRUPO + H_SUB : noGrupo ? H_GRUPO : 0);
      f.page.drawLine({ start: { x, y: y0 }, end: { x, y: base }, thickness: 0.7, color: LINE });
    }
    x += largDe(f, c);
  });
}

function desenharLinha(f, ly, linha) {
  let cx = M;
  COLS.forEach((c, i) => {
    const larg = largDe(f, c);
    const cel = linha.celulas[i];
    if (cel) {
      // centrada na vertical: a célula de uma linha fica no meio da linha que cresceu por outra
      const y0 = ly - 9 - (linha.altura - H_LIN - (cel.linhas.length - 1) * ENTRELINHA) / 2;
      cel.linhas.forEach((t, j) => {
        const px = c.meio ? cx + (larg - cel.fnt.widthOfTextAtSize(t, cel.tam)) / 2 : cx + 3;
        f.page.drawText(t, { x: px, y: y0 - j * ENTRELINHA, size: cel.tam, font: cel.fnt, color: cel.cor });
      });
    }
    cx += larg;
  });
}

/**
 * Um pedaço da tabela numa folha, a partir do cursor: cabeçalho, linhas, linhas em branco e a moldura.
 * `continua` = a tabela segue na folha seguinte, e o pé deste pedaço diz isso (o espaço é o H_AVISO
 * que `planejarTabela` reservou).
 */
export function desenharSegmento(f, linhas, brancas, { continua = false } = {}) {
  const topo = f.y;
  desenharCabecalhoTabela(f, topo);
  let y = topo - H_CAB_TAB;
  const separar = () => f.page.drawLine({ start: { x: M, y }, end: { x: M + f.W, y }, thickness: 0.35, color: SEPARADOR });
  for (const l of linhas) {
    desenharLinha(f, y, l);
    y -= l.altura;
    separar();
  }
  for (let k = 0; k < brancas; k++) { y -= H_LIN; separar(); }
  desenharColunas(f, topo, y);
  if (continua) {
    f.page.drawText(AVISO, { x: M + f.W - 4 - f.font.widthOfTextAtSize(AVISO, 6), y: y - 7, size: 6, font: f.font, color: GRAY });
    y -= H_AVISO;
  }
  f.y = y;
}
