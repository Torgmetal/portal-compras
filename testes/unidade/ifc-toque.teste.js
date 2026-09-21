import { expect, it } from 'vitest';
import { criarSeletorPorToque } from '@/lib/ifc-toque';
const ev = (pointerId, x=0, y=0) => ({pointerId, clientX:x, clientY:y});
it('seleciona no toque curto, sem selecionar ao arrastar, pinçar ou cancelar', () => {
 const s=criarSeletorPorToque();
 s.down(ev(1));expect(s.up(ev(1,2,1))).toBe(true);
 s.down(ev(1));s.move(ev(1,15));expect(s.up(ev(1,15))).toBe(false);
 s.down(ev(1));s.down(ev(2));expect(s.up(ev(2))).toBe(false);expect(s.up(ev(1))).toBe(false);
 s.down(ev(1));s.cancel(ev(1));expect(s.up(ev(1))).toBe(false);
 s.down(ev(1));expect(s.up(ev(1))).toBe(true);
});
it('não seleciona com botão direito ou central do mouse', () => {
 const s=criarSeletorPorToque();
 for(const button of [1,2]) { s.down({...ev(1),button});expect(s.up(ev(1))).toBe(false); }
});
it('não seleciona ao voltar ao ponto inicial depois de arrastar', () => {
 const s=criarSeletorPorToque();
 s.down(ev(1));s.move(ev(1,20));s.move(ev(1));expect(s.up(ev(1))).toBe(false);
});
