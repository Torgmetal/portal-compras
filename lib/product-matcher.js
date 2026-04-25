// Normalizador de descrição de produto pra matching fuzzy entre o que está
// na RM ("CHAPA 6.40 A572-GR.50") e o que veio na cotação do fornecedor
// ("CHAPA LQ A36 6,3X1200X3000"). Reconhece categoria + dimensões + grade.
//
// Validado contra:
//   RM × Gerdau (Cotação Usina São Paulo): 5/5 itens que ambos cotaram
//   - CHAPA 16.00 A572 ↔ CHAPA LCG A57250 16X2550X6000 ✓
//   - CHAPA 19.00 A572 ↔ CHAPA LCG A57250 19X2550X6000 ✓
//   - L3''X1/4'' A36 ↔ CANT 3X1/4 A36 6M FX1T ✓
//   - W150X13 A572 ↔ PF I W150X13 A572GR50 12M FX4,37T ✓
//   - W200X15 A572 ↔ PF I W200X15 A572GR50 12M FX4,32T ✓
//
// As falhas reais (CHAPA 6.40 A572 em RM × CHAPA 6,3 A36 em Gerdau) são
// CORRETAS — grades diferentes não devem casar. CHAPA 25 e W200X26.6
// também não casam porque o Gerdau não cotou.

// Padrões de grade — testados em ordem (mais específicos primeiro)
const GRADE_PATTERNS = [
  { re: /A\s*572\s*[-/]?\s*GR?\s*\.?\s*50/i, label: "A572-GR50" },
  { re: /A\s*57\s*2?\s*50/i, label: "A572-GR50" },
  { re: /\bA\s*36\b/i, label: "A36" },
  { re: /CIVIL\s*300/i, label: "A572-GR50" }, // sinônimo brasileiro de A572
];

function detectGradeAndStrip(text) {
  for (const { re, label } of GRADE_PATTERNS) {
    if (re.test(text)) {
      return { grade: label, cleaned: text.replace(re, " ") };
    }
  }
  return { grade: null, cleaned: text };
}

// Converte string em polegadas (suporta "3", "1/4", "2.1/2") pra mm.
// Aceita também valor já em mm sem polegadas (passa direto multiplicado por 25.4
// porque assume polegadas — caller decide).
function inchesToMm(s) {
  if (s == null) return null;
  let str = String(s).trim().replace(/['"]/g, "").replace(",", ".");
  if (!str) return null;
  try {
    let value;
    if (str.includes(".") && str.includes("/")) {
      // "2.1/2"
      const [whole, frac] = str.split(".", 2);
      const [num, den] = frac.split("/");
      value = parseFloat(whole) + parseFloat(num) / parseFloat(den);
    } else if (str.includes("/")) {
      const [num, den] = str.split("/");
      value = parseFloat(num) / parseFloat(den);
    } else {
      value = parseFloat(str);
    }
    if (!isFinite(value)) return null;
    return value * 25.4;
  } catch {
    return null;
  }
}

export function normalizeProduto(desc, mat = "") {
  const raw = `${desc || ""} ${mat || ""}`.toUpperCase().trim();
  if (!raw) return null;
  const { grade, cleaned } = detectGradeAndStrip(raw);

  // CHAPA — espessura é o número significativo
  if (/CHAPA|CHP/.test(cleaned)) {
    // Pega número precedido por inicio, espaço, vírgula, ou marcadores tipo LQ/LISA/LCG/GR
    const m = cleaned.match(/(?:^|[\s,]|LQ|LISA|LCG|GR)\s*(\d+(?:[,.]\d+)?)/);
    if (m) {
      const esp = parseFloat(m[1].replace(",", "."));
      if (isFinite(esp)) return { categoria: "CHAPA", dim1: Math.round(esp * 10) / 10, dim2: null, grade };
    }
  }

  // CANTONEIRA — duas dimensões em polegadas geralmente
  if (/\bCANT|FERROCANT/.test(cleaned) || /^L\s*\d/.test(cleaned)) {
    const stripped = cleaned.replace(/CANT(ONEIRA)?|FERRO|^L\b/g, " ");
    const nums = stripped.match(/(\d+(?:[./,]\d+)?)/g) || [];
    if (nums.length >= 2) {
      const lado = inchesToMm(nums[0]);
      const esp = inchesToMm(nums[1]);
      if (lado && esp) {
        return { categoria: "CANT", dim1: Math.round(lado), dim2: Math.round(esp * 10) / 10, grade };
      }
    }
  }

  // PERFIL W (W150X13)
  const wm = cleaned.match(/\bW\s*(\d{2,4})\s*X\s*(\d+(?:[,.]\d+)?)/);
  if (wm) {
    return {
      categoria: "PERFIL_W",
      dim1: parseInt(wm[1], 10),
      dim2: parseFloat(wm[2].replace(",", ".")),
      grade,
    };
  }

  return null;
}

// Compara dois produtos normalizados. Tolerâncias práticas pra absorver
// diferença de cadastro (cadastro arredonda 6,3 → 6,40, etc).
export function matchProdutos(a, b, opts = {}) {
  if (!a || !b) return false;
  if (a.categoria !== b.categoria) return false;
  // Grade só compara se AMBOS têm — se um lado é null (categoria sem grade ainda
  // identificada), considera compatível
  if (a.grade && b.grade && a.grade !== b.grade) return false;

  const tolChapa = opts.tolChapa ?? 0.5;
  const tolCantLado = opts.tolCantLado ?? 2;
  const tolCantEsp = opts.tolCantEsp ?? 0.5;
  const tolPerfilPeso = opts.tolPerfilPeso ?? 0.5;

  if (a.categoria === "CHAPA") return Math.abs(a.dim1 - b.dim1) <= tolChapa;
  if (a.categoria === "CANT")
    return Math.abs(a.dim1 - b.dim1) <= tolCantLado && Math.abs(a.dim2 - b.dim2) <= tolCantEsp;
  if (a.categoria === "PERFIL_W")
    return a.dim1 === b.dim1 && Math.abs(a.dim2 - b.dim2) <= tolPerfilPeso;
  return false;
}

// Encontra o índice do item da RM que corresponde a um item de cotação.
// Estratégia em camadas: estrutural (normalize+match) primeiro, fallback texto.
export function findRmIndexSmart(pdfItem, rmItens) {
  const pdfNorm = normalizeProduto(pdfItem.descricao || pdfItem.item || "", "");
  if (pdfNorm) {
    const idx = rmItens.findIndex((ri) => {
      const rmNorm = normalizeProduto(ri.descricao || ri.item || "", ri.material || ri.mat || "");
      return matchProdutos(rmNorm, pdfNorm);
    });
    if (idx >= 0) return idx;
  }
  // Fallback texto puro pra produtos fora das categorias conhecidas
  const pdfDesc = (pdfItem.descricao || pdfItem.item || "").toUpperCase().trim();
  if (!pdfDesc) return -1;
  let idx = rmItens.findIndex((ri) => (ri.descricao || "").toUpperCase().trim() === pdfDesc);
  if (idx >= 0) return idx;
  const lastToken = pdfDesc.split(/\s+/).pop();
  idx = rmItens.findIndex((ri) => (ri.descricao || "").toUpperCase().includes(lastToken));
  return idx;
}
