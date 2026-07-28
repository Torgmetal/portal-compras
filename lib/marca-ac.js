// Itens "AC" (aço comercial / a comprar — parafusos, acessórios). A marca segue o
// padrão T<número da OP>AC (ex.: "T82AC", "T82AC-1"). Nas planilhas que o portal
// exporta, esses itens vão sempre para o FIM da lista.

// Detecta se uma marca é um item AC.
export function marcaEhAC(marca) {
  const s = String(marca || "").toUpperCase().replace(/\s+/g, "");
  // T (opcional) + número da OP + AC, seguido de fim/dígito/separador (evita falso
  // positivo em marcas que só por acaso tenham "AC" no meio).
  return /^T?\d+AC([^A-Z]|$)/.test(s);
}

// Ordena mantendo a ordem original de cada grupo, mas jogando os AC para o fim.
// (Array.sort é estável no Node/navegadores atuais, então a ordem interna se mantém.)
export function ordenarACNoFim(itens, getMarca = (x) => x) {
  return [...itens].sort((a, b) => (marcaEhAC(getMarca(a)) ? 1 : 0) - (marcaEhAC(getMarca(b)) ? 1 : 0));
}
