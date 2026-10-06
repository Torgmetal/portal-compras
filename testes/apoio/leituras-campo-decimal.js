// Acha, no código de uma tela, o texto de um CampoDecimal lido com Number/parseFloat/parseInt.
//
// O CampoDecimal entrega o que a pessoa digitou, em português ("519539,62"). Quem guarda esse texto
// no estado tem de lê-lo com `numeroBR`: `Number("519539,62")` é NaN, `parseFloat("1.500,00")` é
// 1,5 e `parseInt("12.000")` é 12. Varredura de propósito simples — olha o `value` dos campos cujo
// `onChange` guarda o texto cru e procura esses nomes dentro das conversões erradas.
//
// ⚠ NÃO SEGUE FUNÇÃO AUXILIAR. Um `const num = (v) => Number(v) || 0` aplicado ao texto (era o caso
// do custo-hora, do orçamento de serviço e dos cargos) ou um `onQtd={(v) => ... Number(v)}` passado
// para o filho escapam daqui — na varredura de 06/10/2026 esses foram achados lendo o código.

const IGNORAR = new Set([
  "form", "l", "p", "v", "ev", "it", "item", "m", "t", "dados", "so", "Object", "values", "undefined",
  "null", "semEstoque", "id", "linha", "av", "editValores", "novoItem", "imp", "key", "k", "x", "f",
  "prev", "String", "modelo", "porArea", "area", "i",
]);

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Nomes (estado ou campo) que recebem o texto cru de algum CampoDecimal deste código. */
export function nomesComTextoCru(codigo) {
  const nomes = new Set();
  for (const m of codigo.matchAll(/<CampoDecimal\b([\s\S]*?)\/>/g)) {
    const bloco = m[1];
    const onChange = bloco.match(/onChange=\{([\s\S]*?)\}\s*(?:\n|[a-zA-Z]+=|$)/)?.[1] || "";
    if (onChange.includes("numeroBR")) continue; // já guarda número
    const valor = bloco.match(/value=\{([^}]*)\}/)?.[1] || "";
    for (const nome of valor.match(/[A-Za-z_]\w*/g) || []) if (!IGNORAR.has(nome)) nomes.add(nome);
  }
  return nomes;
}

/** As conversões erradas desse texto: [{ linha, expressao }]. */
export function leiturasSemNumeroBR(codigo) {
  const nomes = [...nomesComTextoCru(codigo)];
  if (!nomes.length) return [];
  const achados = [];
  codigo.split("\n").forEach((texto, i) => {
    for (const m of texto.matchAll(/\b(?:Number|parseFloat|parseInt)\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
      const arg = m[1].trim();
      const pega = nomes.some((n) => new RegExp(`(?:^|\\.)${escapar(n)}(?:\\s*\\|\\||\\s*\\?\\?|\\s*$|\\]|,\\s*10\\s*$)`).test(arg));
      if (pega) achados.push({ linha: i + 1, expressao: m[0] });
    }
  });
  return achados;
}
