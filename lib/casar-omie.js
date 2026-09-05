import "server-only";

// Casa o PERFIL da peça (linguagem da Engenharia: "CH4.80X140", "U200X25X2.65", "W250X32.7",
// "TBØ42.40X2.65") com o ITEM DA RM — que é o cadastro do OMIE (código + descrição oficial).
// Vitor 18/08: o romaneio de material do terceiro precisa sair com a descrição e o CÓDIGO do
// Omie, não com o perfil interno. Regras por TIPO (casar número por número dá falso positivo:
// "TB 1/2" casava com "CURVA 1.1/2"):
//   • CHAPA  → casa só a ESPESSURA (a largura do perfil é o corte da peça, não a chapa comprada);
//   • U/UDC  → casa as 3 medidas (alma × aba × parede);
//   • W/H    → casa a bitola (W250) e, se houver, o peso linear (32,7);
//   • TUBO   → casa a POLEGADA quando existir, senão diâmetro × parede;
//   • L      → casa aba × espessura.
// Sem match seguro devolve null (melhor sem código do que com o código errado).

const norm = (s) => String(s ?? "").toUpperCase().replace(/,/g, ".").replace(/\s+/g, " ").trim();
const nums = (s) => (norm(s).match(/\d+(?:\.\d+)?/g) || []).map(Number);
// Polegadas do texto, normalizando "1 1/2" (Omie) e "1.1/2" (Engenharia) pra mesma forma.
const polegadas = (s) => (norm(s).replace(/(\d)\s+(\d+\/\d+)/g, "$1.$2").match(/(?:\d+\.)?\d+\/\d+/g) || []);
// Tubo em polegada ↔ diâmetro EXTERNO em mm (DIN 2440 / NBR 5580). O cadastro descreve o mesmo
// tubo ora por polegada ("Ø1 1/2\""), ora por diâmetro ("D. 48,30") — sem a tabela, 1.1/2" DIN2440
// (48,3) era confundido com o redondo estrutural 1.1/2" (38,1). (Vitor 18/08.)
const POL_MM = { "1/2": 21.3, "3/4": 26.9, "1": 33.7, "1.1/4": 42.2, "1.1/2": 48.3, "2": 60.3, "2.1/2": 76.1, "3": 88.9, "3.1/2": 101.6, "4": 114.3, "5": 141.3, "6": 168.3 };
const perto = (a, b, tol = 0.03) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= tol;

// ⚠ CHAPA DESCRITA EM POLEGADA. Vitor (25/08/2026): "essas que não encontrou pode ser que esteja em
// polegada, por isso não encontrou". O CMR tem "CHAPA AÇO CARBONO 3/4 X200X425MM" — 3/4" = 19,05mm —
// e a LPC escreve CH19.05. Sem converter, a mesma chapa saía como material que nunca entrou.
const FRAC_MM = 25.4;
function fracaoParaMm(f) {
  const m = String(f).match(/^(?:(\d+)\.)?(\d+)\/(\d+)$/);
  if (!m) return null;
  const inteiro = m[1] ? Number(m[1]) : 0;
  const den = Number(m[3]);
  if (!den) return null;
  return (inteiro + Number(m[2]) / den) * FRAC_MM;
}

// tipo pelo PERFIL da peça
function tipoPerfil(pf) {
  const u = norm(pf);
  if (/^(CH|CHAPA)\b|^CH\d/.test(u)) return "CHAPA";
  if (/^(TB|TUBO)\b|^TB[ØO]?\d/.test(u)) return "TUBO";
  if (/^W\s*\d|^HP\s*\d/.test(u)) return "W"; // HP250X62 = perfil H (mesma família do W no cadastro)
  if (/^U\s*\d|UDC/.test(u)) return "U";
  if (/^L\s*\d|CANTONEIRA/.test(u)) return "L";
  // ⚠ FC = FERRO CHATO da Engenharia ("FC2.1/2''X3/8''"). Achado em 04/09/2026 fechando o data book
  // da OP-085: sem o FC aqui o tipo saía null, o casamento nem era tentado, e a barra chata caía
  // como "sem material no CMR" com o R 281033 ("BARRA CHATA ... DN. 3/8 X 2.1/2POL") na prateleira.
  if (/BARRA\s*CHATA|^BC\s*\d|^FB\s*\d|^FC\s*\d|^FC\s*[\dØO]/.test(u)) return "CHATA";
  // FR = ferro redondo da Engenharia ("FRØ3/8\"", "FR 12"); BR/VG também aparecem.
  if (/REDOND/.test(u) || /^FR\s*[ØO]?\s*\d|^BR\s*\d/.test(u)) return "REDONDO";
  return null;
}
// tipo pela DESCRIÇÃO do Omie
function tipoOmie(d) {
  const u = norm(d);
  if (/CURVA|JOELHO|LUVA|FLANGE|\bTE\b/.test(u)) return "CONEXAO"; // conexão nunca é tubo reto
  if (/CHAPA/.test(u)) return "CHAPA";
  // ⚠ CHAPA QUE O FORNECEDOR CHAMA DE "PERFIL". Achado em 04/09/2026 no CMR da OP-085: o R 260678
  // (4.880 kg) está lançado como "PERFIL DB FQ 9,50 X 6000 A36" — DB FQ é desbobinado de tira fina
  // a quente, ou seja, chapa. Sem reconhecer isso, 367 peças de CH9.50 da 085 saíam no data book
  // como "sem material no CMR" com o aço comprado, recebido e certificado.
  if (/\bDB\s*F[QF]\b|\bTIRA\s*(FINA|A\s*QUENTE)\b/.test(u)) return "CHAPA";
  if (/TUBO/.test(u)) return "TUBO";
  if (/PERFIL\s+[WH]|\bW\d{2,3}\b/.test(u)) return "W";
  if (/UDC|PERFIL\s+U/.test(u)) return "U";
  if (/CANTONEIRA/.test(u)) return "L";
  if (/BARRA\s+CHATA/.test(u)) return "CHATA";
  if (/BARRA\s+REDONDA|REDOND/.test(u)) return "REDONDO";
  return null;
}

// ⚠⚠ CHAPA LISA NÃO É CHAPA XADREZ. Achado em 02/09/2026 investigando por que as chapas de 3 e 8mm
// da OP-113 não liberavam: `CH3.00X43` (lisa) casou com "CHAPA AÇO CARBONO XADREZ COSIPISO II
// ESPESSURA 3,00MM" do CMR de outra obra e virou material "de estoque".
//
// A regra de chapa compara SÓ a espessura — de propósito, porque a largura do perfil é o corte da
// peça e não a chapa comprada. Só que xadrez e lisa têm a mesma espessura e são materiais
// diferentes: uma é piso antiderrapante, a outra é estrutural. Bastava o PCP informar o R para a
// peça ser liberada e alguém cortar estrutura em chapa de piso.
//
// A Engenharia escreve a diferença ("CHAPA XADREZ 3.00X710" vs "CH3.00X43") e o CMR também
// (XADREZ / COSIPISO / ANTIDERRAPANTE), então dá para exigir que os dois lados concordem.
const RX_XADREZ = /XADREZ|COSIPISO|ANTIDERRAP/;
const ehXadrez = (s) => RX_XADREZ.test(norm(s));

function pontua(tipo, perfil, item) {
  const nP = nums(perfil), nI = nums(item.descricao);
  const polP = polegadas(perfil), polI = polegadas(item.descricao);
  switch (tipo) {
    case "CHAPA": {
      // xadrez só casa com xadrez, lisa só com lisa — ver RX_XADREZ acima
      if (ehXadrez(perfil) !== ehXadrez(item.descricao)) return 0;
      // espessura = 1º número do perfil; a do Omie vem em "ESPESSURA 4,75MM"
      // ⚠ em "CHAPA XADREZ 3.00X710" o 1º número já é a espessura, igual à lisa — a palavra
      // XADREZ não traz número, então nP[0] continua valendo para os dois casos.
      const esp = nP[0];
      const espOmie = (norm(item.descricao).match(/ESPESSURA\s*(\d+(?:\.\d+)?)/) || [])[1];
      if (espOmie) return perto(esp, Number(espOmie)) ? 3 : 0;
      // Sem a palavra ESPESSURA o cadastro escreve a chapa como "CHAPA LQ A36 6,3x1500x3000":
      // o 1º número é a NORMA (A36), não a espessura — comparar com nI[0] nunca casava e a peça
      // saía como "sem material". Tira os códigos de norma/grau e procura a espessura entre os
      // números plausíveis (< 100 mm; 1500/3000 são as dimensões da chapa).
      const semGrau = norm(item.descricao)
        .replace(/\bASTM\b|\bSAE\b|\bLQ\b|\bLF\b/g, " ")
        .replace(/\bA\s*-?\s*\d{2,3}\b/g, " ")
        .replace(/\bGR\.?\s*\d+/g, " ")
        .replace(/\bNBR\s*\d+/g, " ");
      const cands = (semGrau.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x < 100);
      if (cands.some((y) => perto(esp, y))) return 3;
      // ⚠ a espessura pode estar escrita em POLEGADA: "CHAPA AÇO CARBONO 3/4 X200X425MM".
      const emMm = polI.map(fracaoParaMm).filter((x) => x && x < 100);
      return emMm.some((y) => perto(esp, y)) ? 3 : 0;
    }
    case "U": {
      // Dois formatos: UDC dobrado (200x25x2.65 — 3 medidas) e U LAMINADO em polegada
      // (U4"X7.95 ↔ "PERFIL U LAMINADO 4\" - 1 ALMA"), onde vale a polegada + peso linear.
      const trio = nP.slice(0, 3);
      if (trio.length >= 3) return trio.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
      const pol = nP[0]; // 4" / 8"
      if (!pol || !nI.some((y) => perto(pol, y, 0.01))) return 0;
      const peso = nP[1];
      return peso && nI.some((y) => perto(peso, y)) ? 4 : 3;
    }
    case "W": {
      // ⚠ HP250 ≠ W250: são seções diferentes com a MESMA bitola. O cadastro escreve "DN. W250 X
      // 32,7KG/M" e "DN. HP250 X 62,0KG/M" — sem exigir que os dois lados concordem no HP, o
      // perfil HP casava no W (ou nem casava, quando "HP" não era reconhecido). (Vitor 19/08.)
      const ehHpPerfil = /^HP\s*\d/.test(norm(perfil));
      const ehHpItem = /\bHP\s*\d/.test(norm(item.descricao));
      if (ehHpPerfil !== ehHpItem) return 0;
      const bit = nP[0]; // W250 / HP250
      if (!bit || !nI.some((y) => perto(bit, y, 0.01))) return 0;
      const peso = nP[1];
      return peso && nI.some((y) => perto(peso, y)) ? 4 : 2;
    }
    case "TUBO": {
      // BITOLA obrigatória + PAREDE desempatando. O perfil vem "TB 1.1/2\"X2.65 - DIN2440"; o
      // cadastro descreve o mesmo tubo por polegada OU por diâmetro (48,30). Sem casar a parede,
      // 1.1/2"×2,65 caía no 1.1/2"×2,00 estrutural ou no ×3,35. Pontua: bitola 2 + parede 2 +
      // norma 1 → exige pelo menos bitola+parede (ou bitola+norma) pra passar do corte (3).
      const normaP = (norm(perfil).match(/DIN\s*-?\s*\d{3,4}|SCH\s*\d+|NBR\s*\d+/) || [])[0];
      const semEspaco = (t) => norm(t).replace(/[\s.-]/g, "");
      const temNorma = normaP && semEspaco(item.descricao).includes(semEspaco(normaP));

      // bitola: polegada igual OU diâmetro em mm equivalente
      let bitolaOk = false;
      if (polP.length) {
        bitolaOk = polP.some((x) => polI.includes(x));
        if (!bitolaOk) {
          const mm = POL_MM[polP[0]];
          if (mm) bitolaOk = nI.some((y) => perto(mm, y, 0.02));
        }
      } else if (nP[0]) {
        bitolaOk = nI.some((y) => perto(nP[0], y));
      }
      if (!bitolaOk) return 0;

      // parede: tira as FRAÇÕES de polegada antes de ler os números — senão "1.1/2" vira [1.1, 2]
      // e o "2" era confundido com a parede (2,00 em vez de 2,65). Sobram só as medidas em mm.
      const semPol = (t) => norm(t).replace(/(\d)\s+(\d+\/\d+)/g, "$1.$2").replace(/(?:\d+\.)?\d+\/\d+/g, " ");
      const mmPerfil = (semPol(perfil).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x < 1000);
      const mmItem = (semPol(item.descricao).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x < 1000);
      const paredeP = mmPerfil.find((x) => x > 1 && x < 20);
      const paredeOk = paredeP ? mmItem.some((y) => perto(paredeP, y, 0.02)) : null;
      return 2 + (paredeOk === true ? 2 : 0) + (temNorma ? 1 : 0) - (paredeOk === false ? 1 : 0);
    }
    case "L": {
      // Cantoneira vem em POLEGADAS na Engenharia e no cadastro: L2.1/2''X3/16'' ↔
      // "CANTONEIRA ... DN. 3/16 X 2.1/2POL". Casa pelas frações (ordem não importa).
      if (polP.length >= 2) return polP.every((x) => polI.includes(x)) ? 4 : 0;
      const dois = nP.slice(0, 2);
      if (dois.length < 2) return 0;
      return dois.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
    }
    case "CHATA": {
      if (polP.length >= 2) return polP.every((x) => polI.includes(x)) ? 4 : 0;
      const dois = nP.slice(0, 2);
      return dois.length >= 2 && dois.every((x) => nI.some((y) => perto(x, y))) ? 4 : 0;
    }
    case "REDONDO": {
      if (polP.length) return polP.every((x) => polI.includes(x)) ? 4 : 0;
      return nP[0] && nI.some((y) => perto(nP[0], y)) ? 3 : 0;
    }
    default:
      return 0;
  }
}

// ── A MESMA CHAPA ESCRITA DE TRÊS JEITOS ─────────────────────────────────────────────────────
//
// Vitor (28/08/2026), olhando a OP-106: "sobre as chapas de 6,40 que você fala, não seria o mesmo
// caso das chapas 6,3, 6,30 e 6,40, que são a mesma?". É a mesma: 1/4" = 6,35mm, e o cadastro
// escreve ora 6,30, ora 6.35, enquanto a Engenharia desenha CH6.40. A pontuação já aceita as três
// (tolerância de 3%), mas o rastreio usava só a MELHOR descrição — então a entrada gravada com a
// outra grafia ficava fora do FIFO, como se aquele aço não existisse.
//
// ⚠ TOLERÂNCIA NÃO É SINÔNIMO. Chapa xadrez, inox, expandida e galvanizada também têm 6,30mm e NÃO
// são a mesma chapa. Por isso a equivalência exige, além da espessura, que as duas descrições
// concordem em cada um desses qualificadores.
const QUALIF_CHAPA = [/XADREZ|COSIPISO|ANTIDERRAP/, /\bINOX\b|A-?240|\b30[46]\b/, /EXPANDID/, /GALVANIZ|ZINCAD/, /PERFURAD/];

const espessuraDe = (descricao) => {
  const m = norm(descricao).match(/ESPESSURA\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  const semGrau = norm(descricao)
    .replace(/\bASTM\b|\bSAE\b|\bLQ\b|\bLF\b/g, " ")
    .replace(/\bA\s*-?\s*\d{2,3}\b/g, " ")
    .replace(/\bGR\.?\s*\d+/g, " ")
    .replace(/\bNBR\s*\d+/g, " ");
  const cands = (semGrau.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x < 100);
  return cands.length ? cands[0] : null;
};

/**
 * As descrições que são O MESMO MATERIAL da escolhida — hoje só para CHAPA, onde a mesma espessura
 * aparece escrita de várias formas. Para os outros perfis devolve só a escolhida: lá a pontuação
 * distingue bitola e peso, e juntar empates misturaria cantoneira de 3/8 com a de 1/2.
 *
 * @returns {string[]} descrições a considerar como um único material
 */
export function descricoesEquivalentes(perfil, escolhida, itens) {
  if (!escolhida) return [];
  if (tipoPerfil(perfil) !== "CHAPA") return [escolhida];
  const espAlvo = espessuraDe(escolhida);
  if (!espAlvo) return [escolhida];
  const marcas = (t) => QUALIF_CHAPA.map((rx) => rx.test(norm(t)));
  const alvo = marcas(escolhida);
  const out = new Set([escolhida]);
  for (const it of itens || []) {
    const d = it?.descricao;
    if (!d || out.has(d) || tipoOmie(d) !== "CHAPA") continue;
    const esp = espessuraDe(d);
    if (!esp || !perto(espAlvo, esp)) continue;
    if (marcas(d).some((v, i) => v !== alvo[i])) continue; // xadrez/inox/expandida não se misturam
    out.add(d);
  }
  return [...out];
}

/**
 * @param {string} perfil - perfil da peça (Engenharia)
 * @param {Array} itensRm - itens da RM da OP: { codigo, descricao, unidade, largura, comprimento }
 * @returns {{codigo, descricao}|null} item do Omie casado, ou null se não houver match seguro
 */
export function casarPerfilComOmie(perfil, itensRm) {
  const tipo = tipoPerfil(perfil);
  if (!tipo || !Array.isArray(itensRm) || !itensRm.length) return null;
  let melhor = null, best = 0;
  for (const it of itensRm) {
    if (tipoOmie(it.descricao) !== tipo) continue;
    const s = pontua(tipo, perfil, it);
    if (s > best) { best = s; melhor = it; }
  }
  return best >= 3 ? { codigo: melhor.codigo || null, descricao: melhor.descricao || null } : null;
}
