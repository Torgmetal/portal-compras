import { expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { assinarConsultaProposta,assinaturaConsultaValida } from '@/lib/proposta-obra-assinatura';
const arquivo={id:'documento',driveId:'drive',consultaObra:{versao:1,sha256:'sha',conferidoEm:'2026-09-16',conferidoPor:'conferente',secoes:[{titulo:'Escopo',paragrafos:['Fabricação.']}]}};
const assinado=()=>({...arquivo,consultaObra:{...arquivo.consultaObra,assinatura:assinarConsultaProposta('op122',arquivo,arquivo.consultaObra,'segredo-teste')}});
it('rejeita conteúdo alterado mesmo com hash original e metadados forjados',()=>{
 const a=assinado();expect(assinaturaConsultaValida('op122',a,'segredo-teste')).toBe(true);
 a.consultaObra.secoes=[{titulo:'Escopo',paragrafos:['R$ 100.000,00']}];expect(assinaturaConsultaValida('op122',a,'segredo-teste')).toBe(false);
});
it('vincula assinatura à OP, ao arquivo e à biblioteca',()=>{
 const a=assinado();expect(assinaturaConsultaValida('outra',a,'segredo-teste')).toBe(false);expect(assinaturaConsultaValida('op122',{...a,id:'outro'},'segredo-teste')).toBe(false);expect(assinaturaConsultaValida('op122',{...a,driveId:'outro'},'segredo-teste')).toBe(false);
});
it('sem segredo, assinatura ou com chave trocada fica fechado',()=>{
 expect(assinaturaConsultaValida('op122',arquivo,'segredo-teste')).toBe(false);expect(assinaturaConsultaValida('op122',assinado(),'')).toBe(false);expect(assinaturaConsultaValida('op122',assinado(),'outra-chave')).toBe(false);
});
