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
const polegadas = (s) => (norm(s).match(/(?:\d+\.)?\d+\/\d+/g) || []);
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
      const alvo = espOmie ? Number(espOmie) : nI[0];
      return perto(esp, alvo) ? 3 : 0;
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
      if (polP.length) return polP.every((x) => polI.includes(x)) ? 4 : 0; // polegada manda
      const d = nP[0], par = nP[1];
      if (!d || !nI.some((y) => perto(d, y))) return 0;
      return par && nI.some((y) => perto(par, y)) ? 4 : 2;
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
