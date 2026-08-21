import "server-only";

// NC1 (DSTV) — o arquivo que a Engenharia já gera para o CNC.
//
// Vitor (21/08/2026): "vamos fazer um teste de como fica o NC1 de um croqui para validarmos antes
// de pedirmos para eles". E, antes disso, a observação que define o uso: "o duro do NC1 é que aí
// fica no croqui a conferência e não no conjunto".
//
// Está certo — o NC1 é POR PEÇA. Não serve para inspecionar um conjunto soldado; serve para a peça
// avulsa e para o croqui, e ali é exato: comprimento com duas casas, perfil, material, e a posição
// e o diâmetro de CADA furo. É a dimensão de projeto sem ler desenho e sem arredondamento.
//
// Formato (texto, uma informação por linha):
//
//   ST                       início do bloco de cabeçalho
//     T83                    pedido / obra
//     T83A82                 desenho
//     3                      fase
//     T83A82                 peça
//     A572-GR.50             material
//     1                      quantidade
//     W310X21                perfil
//     I                      código do perfil (I, U, L, M=tubo, R=redondo, B=chapa)
//     4980.09,5152.60        comprimento LÍQUIDO, comprimento de serra
//     303.00 / 101.00 / …    altura, largura da mesa, espessuras, raio
//   AK …                     contorno externo por face (v=alma, o=mesa sup., u=mesa inf.)
//   BO …                     FUROS: face, posição ao longo da peça, posição transversal, diâmetro
//   EN                       fim
//
// ⚠ O comprimento que vale é o LÍQUIDO (o primeiro). O segundo é o de serra, que inclui a perda de
// corte — medir a peça pronta contra ele daria diferença sistemática.

const FACES = { v: "alma", o: "mesa superior", u: "mesa inferior", h: "mesa oposta" };
// na chapa não há alma nem mesa: a face v é a própria face da peça
const FACES_CHAPA = { v: "face", o: "face", u: "face oposta", h: "face oposta" };

const num = (s) => {
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

/**
 * Lê um NC1 e devolve o que interessa para a inspeção dimensional.
 *
 * @param {Buffer|string} conteudo
 * @returns {{peca,desenho,pedido,material,quantidade,perfil,tipo,comprimento,comprimentoSerra,
 *            altura,larguraMesa,espAlma,espMesa,raio,furos:Array}|null}
 */
export function lerNC1(conteudo) {
  const txt = Buffer.isBuffer(conteudo) ? conteudo.toString("latin1") : String(conteudo || "");
  const linhas = txt.split(/\r?\n/);

  const iST = linhas.findIndex((l) => l.trim() === "ST");
  if (iST < 0) return null;

  // ⚠ a linha logo abaixo do ST pode ser um comentário ("** arquivo.nc1"). Pular por posição fixa
  // funcionaria só nos arquivos deste Tekla; ignorar comentário funciona sempre.
  const campos = [];
  for (let i = iST + 1; i < linhas.length && campos.length < 16; i++) {
    const t = linhas[i].trim();
    if (t.startsWith("**")) continue;
    if (/^(AK|IK|BO|SI|SC|KA|EN)$/.test(t)) break;
    campos.push(t);
  }
  if (campos.length < 9) return null;

  const [compLiq, compSerra] = String(campos[8] || "").split(",").map(num);

  const dados = {
    pedido: campos[0] || null,
    desenho: campos[1] || null,
    fase: campos[2] || null,
    peca: campos[3] || null,
    material: campos[4] || null,
    quantidade: parseInt(campos[5], 10) || null,
    perfil: campos[6] || null,
    tipo: campos[7] || null,
    comprimento: compLiq,
    comprimentoSerra: compSerra,
    altura: num(campos[9]),
    larguraMesa: num(campos[10]),
    espAlma: num(campos[11]),
    espMesa: num(campos[12]),
    raio: num(campos[13]),
    furos: [],
  };

  // ── furos ────────────────────────────────────────────────────────────────────────────────────
  // "  v    1338.01o    151.50      18.00" → face v, x=1338.01, y=151.50, Ø18
  // A letra grudada no x ("o") é a referência da cota transversal; não é dado de inspeção.
  let emBO = false;
  for (const bruta of linhas) {
    const t = bruta.trim();
    if (/^(AK|IK|SI|SC|KA|ST)$/.test(t)) { emBO = false; continue; }
    if (t === "BO") { emBO = true; continue; }
    if (t === "EN") break;
    if (!emBO || !t) continue;

    const m = t.match(/^([voux])\s+([\d.,]+)[a-z]?\s+([\d.,]+)\s+([\d.,]+)/i);
    if (!m) continue;
    const [, face, x, y, d] = m;
    const diam = num(d);
    if (!diam) continue;
    dados.furos.push({ face: face.toLowerCase(), faceLabel: FACES[face.toLowerCase()] || face, x: num(x), y: num(y), diametro: diam });
  }

  return dados;
}

/**
 * Transforma o NC1 nas LINHAS do relatório dimensional.
 *
 * O que entra como "dimensão de projeto":
 *   · o comprimento da peça (o líquido);
 *   · a altura e a largura do perfil, quando o NC1 traz;
 *   · a POSIÇÃO de cada grupo de furos ao longo da peça, por face e diâmetro.
 *
 * ⚠ Os furos são agrupados por posição. Uma linha de três furos na mesma seção é UMA cota a medir
 * (a distância da ponta até aquela linha), não três — senão o relatório vira uma lista de furo em
 * vez de uma lista de medidas.
 */
export function linhasDoNC1(nc, marca) {
  if (!nc) return [];
  const linhas = [];
  const base = { marca: marca || nc.peca, conjunto: null, qtd: nc.quantidade ?? null, material: nc.material || null, encontradoMm: null, obs: null };

  // ⚠ O CÓDIGO DO PERFIL MUDA O QUE CADA CAMPO SIGNIFICA. Em chapa (tipo B) o campo de "altura" é
  // a LARGURA e o de espessura da mesa é a ESPESSURA da chapa — a T89A-P32 (CH10X118) sai com
  // 117,85 no campo de altura. Rotular tudo como perfil faria o relatório pedir a "altura do
  // perfil" de uma chapa, e quem for medir não acha o que medir.
  const ehChapa = String(nc.tipo || "").toUpperCase() === "B";
  linhas.push({ ...base, descricao: `Comprimento (${nc.perfil || "perfil"})`, projetoMm: nc.comprimento });
  if (ehChapa) {
    if (nc.altura) linhas.push({ ...base, descricao: "Largura da chapa", projetoMm: nc.altura });
    const esp = nc.espMesa || nc.espAlma || nc.larguraMesa;
    if (esp) linhas.push({ ...base, descricao: "Espessura", projetoMm: esp });
  } else {
    if (nc.altura) linhas.push({ ...base, descricao: "Altura do perfil", projetoMm: nc.altura });
    if (nc.larguraMesa) linhas.push({ ...base, descricao: "Largura da mesa", projetoMm: nc.larguraMesa });
  }

  const grupos = new Map();
  for (const f of nc.furos) {
    // 0,5 mm de tolerância pra juntar furos que o Tekla escreve com sobra de casa decimal
    const chave = `${f.face}|${f.diametro}|${Math.round(f.x * 2) / 2}`;
    const g = grupos.get(chave) || { face: f.faceLabel, faceCod: f.face, diametro: f.diametro, x: f.x, n: 0 };
    g.n++;
    grupos.set(chave, g);
  }
  for (const g of [...grupos.values()].sort((a, b) => a.x - b.x)) {
    const onde = ehChapa ? (FACES_CHAPA[g.faceCod] || "face") : g.face;
    linhas.push({
      ...base,
      descricao: `Furos Ø${g.diametro} na ${onde}${g.n > 1 ? ` (${g.n})` : ""} — posição`,
      projetoMm: g.x,
    });
  }

  return linhas;
}
