import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/campanha', () => ({ emSetembroAmarelo: vi.fn(), SLOGAN: 'A Torg Metal apoia a valorização da vida.' }));
import { emSetembroAmarelo } from '../../lib/campanha';
import { cabecalhoEmail, EMAIL_ORANGE } from '../../lib/email-layout';
describe('Cabeçalho dos e-mails', () => {
  it('mantém a campanha dentro do azul e antes da faixa laranja em setembro', () => {
    emSetembroAmarelo.mockReturnValue(true);
    const html = cabecalhoEmail('Lista LE revisada', 'Obra &amp; cliente');
    expect(html).toContain('Lista LE revisada');
    expect(html).toContain('Obra &amp; cliente');
    expect(html).toContain('https://workspace.torg.com.br/laco-setembro.png');
    expect(html.indexOf('Setembro Amarelo')).toBeLessThan(html.indexOf(`bgcolor="${EMAIL_ORANGE}"`));
    expect(html.match(/Setembro Amarelo/g)).toHaveLength(1);
  });
  it('omite a campanha fora de setembro e respeita subtítulo vazio', () => {
    emSetembroAmarelo.mockReturnValue(false);
    const html = cabecalhoEmail('Cotação', '');
    expect(html).not.toContain('Setembro Amarelo');
    expect(html).not.toContain('laco-setembro');
    expect(html).not.toContain('Torg Metal · Estruturas Metálicas');
    expect(html).toContain('Cotação');
  });
});
