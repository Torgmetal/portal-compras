// Perfis visuais: mesmo shader Phong e nenhuma passada de pós-processamento.
export function configurarLuzesIfc(THREE, cena, refinado, nitido = false) {
  // Phong divide a irradiância por PI nesta versão do Three. Trabalhar na escala
  // correspondente evita que as cores do IFC fiquem muito mais escuras que a referência.
  cena.add(new THREE.HemisphereLight(0xffffff, nitido ? 0xe8e8e8 : refinado ? 0xa6adb5 : 0xb8c4cf, nitido ? 0.78 * Math.PI : refinado ? 0.7 : 0.95));
  for (const [posicao, intensidade] of [
    [[1, 2, 1.4], nitido ? 0.45 * Math.PI : refinado ? 0.85 : 0.75],
    [[-1.2, 0.6, -1], nitido ? 0.16 * Math.PI : refinado ? 0.22 : 0.35],
    [[0, -1, 0.4], nitido ? 0.1 * Math.PI : refinado ? 0.16 : 0.2],
  ]) {
    const luz = new THREE.DirectionalLight(0xffffff, intensidade);
    luz.position.set(...posicao);
    cena.add(luz);
  }
}

// Contornos do perfil nítido: exclui fixadores e limita o trabalho por triângulos.
// O orçamento é da cena inteira, não se multiplica pelo número de conjuntos.
export function reservarContornoIfc(parafuso, triangulos, usados) {
  return !parafuso && triangulos > 0 && usados + triangulos <= 200_000;
}

export function pixelRatioIfc(largura, altura, dpr, refinado) {
  const nativo = Math.min(2, dpr || 1);
  // Até 3 milhões de pixels no ensaio, inclusive em tela cheia/Retina.
  // Não aumenta o custo de nenhuma tela em relação ao perfil atual.
  return refinado ? Math.min(nativo, Math.sqrt(3_000_000 / Math.max(1, largura * altura))) : nativo;
}

export function acabamentoIfc(refinado) {
  return refinado
    ? { shininess: 24, specular: 0x181818 }
    : { shininess: 14, specular: 0x1e2833 };
}
