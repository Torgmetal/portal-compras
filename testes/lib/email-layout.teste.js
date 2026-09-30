import { describe, it, expect, vi } from 'vitest';
const campanha = vi.hoisted(() => ({ hoje: null }));
vi.mock('../../lib/campanha', async (orig) => ({ ...(await orig()), campanhaHoje: () => campanha.hoje }));
import { CAMPANHAS } from '../../lib/campanha';
import { cabecalhoEmail, EMAIL_ORANGE } from '../../lib/email-layout';
const doId = (id) => CAMPANHAS.find((c) => c.id === id);
describe('Cabeçalho dos e-mails', () => {
  it('mantém a campanha dentro do azul e antes da faixa laranja em setembro', () => {
    campanha.hoje = doId('setembro-amarelo');
    const html = cabecalhoEmail('Lista LE revisada', 'Obra &amp; cliente');
    expect(html).toContain('Lista LE revisada');
    expect(html).toContain('Obra &amp; cliente');
    expect(html).toContain('https://workspace.torg.com.br/campanhas/setembro-amarelo/laco.png');
    expect(html.indexOf('Setembro Amarelo')).toBeLessThan(html.indexOf(`bgcolor="${EMAIL_ORANGE}"`));
    expect(html.match(/Setembro Amarelo/g)).toHaveLength(1);
  });
  // Vitor (30/09/2026): a campanha de outubro é o Outubro Rosa — o e-mail troca junto com as telas
  it('em outubro o selo é o do Outubro Rosa, com o laço rosa e o slogan dele', () => {
    campanha.hoje = doId('outubro-rosa');
    const html = cabecalhoEmail('Cotação', '');
    expect(html).toContain('https://workspace.torg.com.br/campanhas/outubro-rosa/laco.png');
    expect(html).toContain('Outubro Rosa');
    expect(html).toContain(doId('outubro-rosa').slogan);
    expect(html).toContain('alt="Laço rosa"');
    expect(html).not.toContain('Setembro Amarelo');
  });
  it('omite a campanha fora do mês dela e respeita subtítulo vazio', () => {
    campanha.hoje = null;
    const html = cabecalhoEmail('Cotação', '');
    expect(html).not.toContain('Setembro Amarelo');
    expect(html).not.toContain('Outubro Rosa');
    expect(html).not.toContain('/campanhas/');
    expect(html).not.toContain('Torg Metal · Estruturas Metálicas');
    expect(html).toContain('Cotação');
  });
});
