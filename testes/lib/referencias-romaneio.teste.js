import { it, expect } from 'vitest';
import { preservarReferenciasRomaneio } from '@/lib/referencias-romaneio';

it('preserva referência comprovada ao reimportar uma LE com quantidade revisada', () => {
  const fontes = [{ arquivo: '01.xls', numero: '01' }];
  const anterior = [{ marca: 'T89A1', qte: 1, romaneio: '01', dataExpedicao: '2026-09-04', romaneioFonteSharepoint: fontes, expedidoRomaneio: true }];
  const novas = [{ marca: 'T89A1', qte: 2 }, { marca: 'T89A2', qte: 1 }];
  const resultado = preservarReferenciasRomaneio(novas, anterior);
  expect(resultado[0]).toEqual({ marca: 'T89A1', qte: 2, romaneio: '01', dataExpedicao: '2026-09-04', romaneioFonteSharepoint: fontes });
  expect(resultado[1]).toEqual(novas[1]);
  expect(novas[0].romaneio).toBeUndefined();
});

it('prioriza leitura nova e não recupera referência sem fonte documentada', () => {
  const resultado = preservarReferenciasRomaneio([{ marca:'A',romaneio:'02' },{marca:'B'}], [
    {marca:'A',romaneio:'01',romaneioFonteSharepoint:[{numero:'01'}]},
    {marca:'B',romaneio:'01'},
  ]);
  expect(resultado).toEqual([{marca:'A',romaneio:'02'},{marca:'B'}]);
});
