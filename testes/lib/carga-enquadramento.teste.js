import { expect, it } from "vitest";
import * as THREE from "three";
import { enquadrarCameraCarga } from "@/lib/carga/enquadramento";

for (const [largura, altura] of [[356, 405], [1030, 480], [1200, 560]]) {
  it(`mostra todo o veículo com a carga em ${largura} × ${altura}, inclusive na exportação`, () => {
    const caixa = new THREE.Box3(new THREE.Vector3(-6, -1.35, -0.2), new THREE.Vector3(12.4, 2.9, 2.65));
    for (const dir of [[0.62, 0.42, 0.66], [1, 0.32, 0.55], [0, 1, 0.14], [0.001, 0.18, 1]]) {
      const camera = new THREE.PerspectiveCamera(42, largura / altura, 0.05, 600);
      enquadrarCameraCarga(camera, caixa, new THREE.Vector3(...dir));
      for (const x of [caixa.min.x, caixa.max.x]) for (const y of [caixa.min.y, caixa.max.y]) for (const z of [caixa.min.z, caixa.max.z]) {
        const ponto = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(ponto.x)).toBeLessThan(1);
        expect(Math.abs(ponto.y)).toBeLessThan(1);
        expect(ponto.z).toBeGreaterThan(-1);
        expect(ponto.z).toBeLessThan(1);
      }
    }
  });
}
