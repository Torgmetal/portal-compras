// Suaviza somente o sombreamento de faces próximas da MESMA geometria IFC.
// Preserva posições, índices, número de vértices e quinas acima de 40 graus.
export function suavizarNormaisIfc(posicoes, normais) {
  const grupos = new Map();
  for (let i = 0; i < posicoes.length; i += 3) {
    const chave = `${Math.round(posicoes[i] * 1e5)},${Math.round(posicoes[i + 1] * 1e5)},${Math.round(posicoes[i + 2] * 1e5)}`;
    const grupo = grupos.get(chave) || [];
    grupo.push(i);
    grupos.set(chave, grupo);
  }
  const novas = normais.slice();
  const limite = Math.cos(40 * Math.PI / 180);
  for (const grupo of grupos.values()) {
    // Evita custo quadrático em geometrias degeneradas/com muitos vértices coincidentes.
    if (grupo.length < 2 || grupo.length > 64) continue;
    for (const i of grupo) {
      const nx = normais[i], ny = normais[i + 1], nz = normais[i + 2];
      let x = 0, y = 0, z = 0;
      const vistas = new Set();
      for (const j of grupo) {
        const a = normais[j], b = normais[j + 1], c = normais[j + 2];
        if (nx * a + ny * b + nz * c < limite) continue;
        const chave = `${a},${b},${c}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        x += a; y += b; z += c;
      }
      const tamanho = Math.hypot(x, y, z);
      if (tamanho > 1e-8) {
        novas[i] = x / tamanho; novas[i + 1] = y / tamanho; novas[i + 2] = z / tamanho;
      }
    }
  }
  return novas;
}
