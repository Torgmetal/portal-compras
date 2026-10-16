import { describe, it, expect } from 'vitest';
import * as rnc from '@/lib/nao-conformidade';
const avaliar = (data, hoje, extra={}) => rnc.acompanhamentoEficacia?.({data,status:'EM_ACAO',...extra},new Date(hoje));
describe('RNC: 60 dias corridos desde a emissão',()=>{
 it('não considera parada no 59º dia mesmo sem atualização',()=>expect(avaliar('2026-08-17T12:00:00Z','2026-10-15T15:00:00Z')).toMatchObject({fase:'AGUARDANDO_EFICACIA',diasRestantes:1,avaliarEm:'2026-10-16'}));
 it('libera avaliação no 60º dia',()=>expect(avaliar('2026-08-17','2026-10-16T15:00:00Z')).toMatchObject({fase:'AVALIAR_EFICACIA',diasRestantes:0}));
 it('edição recente não reinicia o prazo',()=>expect(avaliar('2026-08-17','2026-10-17T15:00:00Z',{updatedAt:'2026-10-17'})).toMatchObject({fase:'AVALIAR_EFICACIA',diasRestantes:-1}));
 it('usa o dia de São Paulo à meia noite UTC',()=>expect(avaliar('2026-08-17','2026-10-16T01:00:00Z')).toMatchObject({fase:'AGUARDANDO_EFICACIA',diasRestantes:1}));
 it('encerrada não pede avaliação',()=>expect(avaliar('2026-08-17','2026-10-16T15:00:00Z',{status:'ENCERRADA'})).toBeNull());
 it('não inventa prazo para emissão inválida',()=>expect(avaliar('invalida','2026-10-16T15:00:00Z')).toBeNull());
});
