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

// tipo pelo PERFIL da peça
function tipoPerfil(pf) {
  const u = norm(pf);
  if (/^(CH|CHAPA)\b|^CH\d/.test(u)) return "CHAPA";
  if (/^(TB|TUBO)\b|^TB[ØO]?\d/.test(u)) return "TUBO";
  if (/^W\s*\d/.test(u)) return "W";
  if (/^U\s*\d|UDC/.test(u)) return "U";
  if (/^L\s*\d|CANTONEIRA/.test(u)) return "L";
  if (/BARRA\s*CHATA|^BC\s*\d|^FB\s*\d/.test(u)) return "CHATA";
  if (/REDOND/.test(u)) return "REDONDO";
  return null;
}
// tipo pela DESCRIÇÃO do Omie
function tipoOmie(d) {
  const u = norm(d);
  if (/CURVA|JOELHO|LUVA|FLANGE|\bTE\b/.test(u)) return "CONEXAO"; // conexão nunca é tubo reto
  if (/CHAPA/.test(u)) return "CHAPA";
  if (/TUBO/.test(u)) return "TUBO";
  if (/PERFIL\s+[WH]|\bW\d{2,3}\b/.test(u)) return "W";
  if (/UDC|PERFIL\s+U/.test(u)) return "U";
  if (/CANTONEIRA/.test(u)) return "L";
  if (/BARRA\s+CHATA/.test(u)) return "CHATA";
  if (/BARRA\s+REDONDA|REDOND/.test(u)) return "REDONDO";
  return null;
}

function pontua(tipo, perfil, item) {
  const nP = nums(perfil), nI = nums(item.descricao);
  const polP = polegadas(perfil), polI = polegadas(item.descricao);
  switch (tipo) {
    case "CHAPA": {
      // espessura = 1º número do perfil; a do Omie vem em "ESPESSURA 4,75MM"
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
      return cands.some((y) => perto(esp, y)) ? 3 : 0;
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
      const bit = nP[0]; // W250
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
