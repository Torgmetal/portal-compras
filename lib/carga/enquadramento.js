import * as THREE from "three";

// Enquadra os oito cantos do caminhão + carga na perspectiva atual. Considerar apenas
// o comprimento da carroceria cortava cabine/volumes, sobretudo com a tela em pé.
export function enquadrarCameraCarga(camera, caixa, direcao) {
  const alvo = caixa.getCenter(new THREE.Vector3()), dir = direcao.clone().normalize();
  const direita = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
  const cima = new THREE.Vector3().crossVectors(dir, direita).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  let distancia = 1;
  for (const x of [caixa.min.x, caixa.max.x]) for (const y of [caixa.min.y, caixa.max.y]) for (const z of [caixa.min.z, caixa.max.z]) {
    const ponto = new THREE.Vector3(x, y, z).sub(alvo), profundidade = ponto.dot(dir);
    distancia = Math.max(distancia, profundidade + Math.abs(ponto.dot(direita)) / tanH, profundidade + Math.abs(ponto.dot(cima)) / tanV);
  }
  camera.position.copy(alvo).addScaledVector(dir, distancia * 1.1);
  camera.lookAt(alvo); camera.updateMatrixWorld();
  return alvo;
}
