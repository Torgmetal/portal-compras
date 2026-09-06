// Comparação conservadora: só associa GlobalIds únicos. Nunca associa pela marca.
export function compararElementosIfc(anterior, atual) {
  const agrupar = (lista) => {
    const mapa = new Map();
    for (const e of lista) { const k = e.guid || ""; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(e); }
    return mapa;
  };
  const a = agrupar(anterior), b = agrupar(atual), resultado = [];
  for (const guid of new Set([...a.keys(), ...b.keys()])) {
    const velhos = a.get(guid) || [], novos = b.get(guid) || [];
    if (!guid || velhos.length > 1 || novos.length > 1) {
      for (const e of velhos) resultado.push({ status: "conferir", anterior: e, motivo: "Identificador ausente ou repetido" });
      for (const e of novos) resultado.push({ status: "conferir", atual: e, motivo: "Identificador ausente ou repetido" });
      continue;
    }
    const antes = velhos[0], depois = novos[0];
    const status = !antes ? "adicionado" : !depois ? "removido" : antes.hash !== depois.hash || antes.meta !== depois.meta ? "alterado" : "igual";
    resultado.push({ status, anterior: antes, atual: depois, motivo: status === "alterado" ? (antes.hash !== depois.hash ? "Geometria ou posição diferente" : "Nome, marca ou classe diferente") : "" });
  }
  return resultado;
}

// 1 mm; independe da ordem dos vértices/triângulos, mantém a conectividade.
// Mudanças de triangulação entre exportações podem aparecer como diferença geométrica.
export function canonizarTriangulosIfc(pos, indices) {
  const ponto = (i) => [0, 1, 2].map((k) => Math.round(pos[i * 3 + k] * 1000)).join(",");
  const triangulos = [];
  for (let i = 0; i < indices.length; i += 3) triangulos.push([ponto(indices[i]), ponto(indices[i + 1]), ponto(indices[i + 2])].sort().join(";"));
  return triangulos.sort().join("|");
}
