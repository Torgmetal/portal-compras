// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import GanttProgramacao from '@/app/pcp/producao/GanttProgramacao';
import { montarCalendario } from '@/app/pcp/producao/_gantt/calendario';

globalThis.React = React;
vi.mock('@/lib/desenhos-zip-cliente', () => ({ baixarZipLote: vi.fn() }));
vi.mock('@/lib/pintura-excel-cliente', () => ({ baixarCadernoPintura: vi.fn() }));
vi.mock('@/lib/baixa-syneco-cliente', () => ({ baixarPlanilhaBaixaSyneco: vi.fn() }));
vi.mock('@/lib/lista-posto-cliente', () => ({ baixarListaDoPosto: vi.fn() }));

const lote = (setor, recurso, dia = '2026-09-11', id = 'p1') => ({
  id, setor, recurso, dia, op: '112', pecas: 1, kg: 100, custo: 0.2, feitas: 0,
  itens: [{ id, m: id, q: 1, kg: 100, c: 0.2, prontidao: { pronto: true, total: 1, cortados: 1 } }],
});

function arrastarPara(barra, dia) {
  const celula = barra.closest('[data-row]').querySelector(`[data-dia="${dia}"]`);
  // O jsdom não calcula layout nem faz hit testing; o gesto e o Gantt são reais.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 2000, bottom: 1000, width: 106, height: 30,
  });
  document.elementFromPoint = () => celula;
  fireEvent(barra, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 100 }));
  fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 500, clientY: 100 }));
}

afterEach(() => {
  cleanup();
  delete document.elementFromPoint;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  ['CORTE', 'LASER_CHAPA'], ['MONTAGEM', 'MONTAGEM 1'], ['SOLDA', 'SOLDA 1'],
  ['ACABAMENTO', 'ACABAMENTO'], ['JATO', 'JATO_TURBINA'], ['PINTURA', 'GALPAO_1'],
])('permite arrastar, salvar e recarregar a fabricação de %s no sábado', async (setor, recurso) => {
  let programacao = [lote(setor, recurso)], enviado;
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('fetch', async (_url, opcoes) => {
    if (opcoes?.method === 'POST') {
      enviado = JSON.parse(opcoes.body);
      programacao = programacao.map(p => ({ ...p, dia: enviado.blocos[0].dia }));
      return { ok: true, json: async () => ({ total: 1 }) };
    }
    return { ok: true, json: async () => ({ hoje: '2026-09-09', lotes: structuredClone(programacao) }) };
  });
  render(<GanttProgramacao />);
  await waitFor(() => expect(document.querySelector('.barra-op')).toBeTruthy());
  arrastarPara(document.querySelector('.barra-op'), '2026-09-12');
  expect([...document.querySelectorAll('.cel.alvo')].map(c => c.dataset.dia)).toEqual(['2026-09-12']);
  fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));
  expect(document.querySelector('.barra-op').title).toContain('12/09');
  await act(async () => fireEvent.click(document.querySelector('#gp-salvar')));
  expect(enviado.blocos).toEqual([{ setor, recurso, dia: '2026-09-12', ids: ['p1'] }]);
  await waitFor(() => expect(document.querySelector('#gp-nAlt').textContent).toBe('0'));
  expect(document.querySelector('.barra-op').title).toContain('12/09');
});

it('a prévia de um bloco com dois dias corresponde à sexta e ao sábado enviados para salvar', async () => {
  const programacao = [lote('SOLDA', 'SOLDA 1', '2026-09-10'), lote('SOLDA', 'SOLDA 1', '2026-09-11', 'p2')];
  let enviado;
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('fetch', async (_url, opcoes) => {
    if (opcoes?.method === 'POST') enviado = JSON.parse(opcoes.body);
    return { ok: true, json: async () => opcoes?.method === 'POST' ? { total: 2 } : { hoje: '2026-09-09', lotes: structuredClone(programacao) } };
  });
  render(<GanttProgramacao />);
  await waitFor(() => expect(document.querySelector('.barra-op')).toBeTruthy());
  arrastarPara(document.querySelector('.barra-op'), '2026-09-11');
  expect([...document.querySelectorAll('.cel.alvo')].map(c => c.dataset.dia)).toEqual(['2026-09-11', '2026-09-12']);
  fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));
  await act(async () => fireEvent.click(document.querySelector('#gp-salvar')));
  expect(enviado.blocos.map(b => ({ dia: b.dia, ids: b.ids }))).toEqual([
    { dia: '2026-09-11', ids: ['p1'] }, { dia: '2026-09-12', ids: ['p2'] },
  ]);
});

it('distribuição automática iniciada na sexta continua pulando o fim de semana', () => {
  const calendario = montarCalendario([], '2026-09-11');
  const dias = calendario.diasDaQuebra(calendario.IDX.get('2026-09-11'), 3);
  expect(dias.map(i => calendario.DIAS[i])).toEqual(['2026-09-11', '2026-09-14', '2026-09-15']);
});
