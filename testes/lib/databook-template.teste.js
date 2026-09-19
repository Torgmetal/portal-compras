import { describe, it, expect } from 'vitest';
import { templateInicial, usaTemplateNovo } from '../../lib/databook-template';

describe('template do data book por histórico de emissão', () => {
  it('adota o modelo novo nos rascunhos sem emissão, mesmo criados antes', () => {
    expect(templateInicial({ status: 'EM_MONTAGEM', revisao: 0 })).toBe('TORG_2026');
  });
  it.each(['EMITIDO','EM_ASSINATURA','ENVIADO_CLIENTE','ACEITO'])('preserva %s sem depender da data', status => {
    expect(templateInicial({status})).toBe('LEGADO');
  });
  it('preserva book reaberto que já teve emissão', () => {
    expect(templateInicial({status:'EM_MONTAGEM', revisao:1})).toBe('LEGADO');
    expect(templateInicial({status:'EM_MONTAGEM', revisoes:[{}]})).toBe('LEGADO');
    expect(templateInicial({status:'EM_MONTAGEM', emitidoEm:new Date()})).toBe('LEGADO');
  });
  it('mantém o modelo já escolhido em emissões e revisões futuras', () => {
    expect(usaTemplateNovo({templateVisual:'TORG_2026',status:'ACEITO',revisao:2})).toBe(true);
    expect(usaTemplateNovo({templateVisual:'LEGADO',status:'EM_MONTAGEM'})).toBe(false);
    expect(usaTemplateNovo({})).toBe(false);
  });
});
