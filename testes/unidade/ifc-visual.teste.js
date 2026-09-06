import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { configurarLuzesIfc, pixelRatioIfc } from '../../lib/ifc-visual';

describe('orçamento do ensaio IFC', () => {
  it('limita pixels em Retina e tela cheia sem ultrapassar o perfil atual', () => {
    for (const [w, h] of [[800,520], [1920,1080], [3840,2160]]) {
      for (const dpr of [1,1.25,2,3]) {
        const ratio = pixelRatioIfc(w,h,dpr,true);
        expect(Math.floor(w*ratio)*Math.floor(h*ratio)).toBeLessThanOrEqual(3_000_000);
        expect(ratio).toBeLessThanOrEqual(pixelRatioIfc(w,h,dpr,false));
      }
    }
  });
  it('preserva resolução de telas pequenas e restaura após sair de tela cheia', () => {
    expect(pixelRatioIfc(800,520,2,true)).toBe(2);
    expect(pixelRatioIfc(3840,2160,2,true)).toBeLessThan(1);
    expect(pixelRatioIfc(800,520,2,true)).toBe(2);
  });
  it('mantém quatro luzes sem mapas de sombra e sem geometria adicional', () => {
    for (const refinado of [false,true]) {
      const cena = new THREE.Scene();
      configurarLuzesIfc(THREE,cena,refinado);
      expect(cena.children).toHaveLength(4);
      expect(cena.children.every(l => l.isLight && !l.castShadow && !l.geometry)).toBe(true);
    }
  });
});

describe('contornos estruturais do perfil nítido', () => {
  it('exclui fixadores e respeita o orçamento cumulativo mesmo com muitos grupos', async () => {
    const { reservarContornoIfc } = await import('../../lib/ifc-visual');
    expect(reservarContornoIfc({ nome: 'Parafuso' }, 100, 0)).toBe(false);
    let usados = 0;
    for (let i = 0; i < 10_000; i++) {
      if (reservarContornoIfc(null, 300, usados)) usados += 300;
    }
    expect(usados).toBeLessThanOrEqual(200_000);
    expect(usados).toBeGreaterThan(199_000);
    expect(reservarContornoIfc(null, 300_000, 0)).toBe(false);
  });
});
