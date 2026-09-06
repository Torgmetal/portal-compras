import { describe, expect, it } from 'vitest';
import { suavizarNormaisIfc } from '../../lib/ifc-normais';

describe('sombreamento dos perfis IFC', () => {
  it('suaviza uma curva de 30 graus sem mover vértices nem alterar a entrada', () => {
    const p = new Float32Array([0,0,0, 0,0,0]);
    const n = new Float32Array([1,0,0, Math.cos(Math.PI/6),Math.sin(Math.PI/6),0]);
    const original = n.slice();
    const r = suavizarNormaisIfc(p,n);
    expect([...n]).toEqual([...original]);
    expect([...p]).toEqual([0,0,0,0,0,0]);
    expect(r.length).toBe(n.length);
    expect(r[0]).toBeCloseTo(Math.cos(Math.PI/12),5);
    expect(r[1]).toBeCloseTo(Math.sin(Math.PI/12),5);
    expect([...r.slice(0,3)]).toEqual([...r.slice(3,6)]);
  });
  it('preserva quinas retas, faces opostas e pontos diferentes', () => {
    const p = new Float32Array([0,0,0, 0,0,0, 0,0,0, 1,0,0]);
    const n = new Float32Array([1,0,0, 0,1,0, -1,0,0, 0.8660254,0.5,0]);
    const r = suavizarNormaisIfc(p,n);
    expect([...r]).toEqual([...n]);
  });
});
