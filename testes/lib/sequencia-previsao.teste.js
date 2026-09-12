import { describe, it, expect } from 'vitest';
import { previsaoDaSequencia } from '../../lib/sequencia-previsao';

describe('previsão fixada da sequência', () => {
  const tarefa = { diasParaConcluir: 5, estimativaEm: '2026-09-10T22:00:00Z', dataFimPrevista: '2026-09-11T00:00:00Z' };
  it('mantém a data ao abrir em dias diferentes e conta só dias úteis', () => {
    const a = previsaoDaSequencia(tarefa, new Date('2026-09-10T12:00:00Z'));
    const b = previsaoDaSequencia(tarefa, new Date('2026-09-14T12:00:00Z'));
    expect(a.previsaoFim).toBe('2026-09-17T12:00:00.000Z');
    expect(b.previsaoFim).toBe(a.previsaoFim);
    expect(b.atrasoPrevisto).toBe(6);
  });
  it('usa o dia brasileiro da estimativa, mesmo após meia-noite UTC', () => {
    expect(previsaoDaSequencia({...tarefa, diasParaConcluir: 0, estimativaEm: '2026-09-11T01:00:00Z'}).previsaoFim).toBe('2026-09-10T12:00:00.000Z');
  });
  it('não inventa uma data móvel para estimativa antiga sem carimbo', () => {
    expect(previsaoDaSequencia({...tarefa, estimativaEm: null}).previsaoFim).toBeNull();
  });
  it('revisar o carimbo muda a previsão e limpar ou concluir remove a previsão', () => {
    expect(previsaoDaSequencia({...tarefa, estimativaEm:'2026-09-14T12:00:00Z'}).previsaoFim).toBe('2026-09-21T12:00:00.000Z');
    expect(previsaoDaSequencia({...tarefa, diasParaConcluir:null}).previsaoFim).toBeNull();
    expect(previsaoDaSequencia({...tarefa, percentualRealizado:100}).previsaoFim).toBeNull();
  });
});
