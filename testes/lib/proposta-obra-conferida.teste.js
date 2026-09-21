import { expect,it } from 'vitest';
import { consultaConferida } from '@/lib/proposta-obra-consulta';
const consulta={versao:1,sha256:'hash',conferidoEm:'2026-09-16',conferidoPor:'admin',secoes:[{titulo:'Escopo',paragrafos:['Estruturas.']}],url:'privado'};
it('não libera extração não conferida ou arquivo que mudou',()=>{
 expect(consultaConferida({},'hash')).toBeNull();expect(consultaConferida({consultaObra:consulta},'outro')).toBeNull();expect(consultaConferida({consultaObra:{...consulta,conferidoPor:null}},'hash')).toBeNull();
});
it('retorna somente texto e metadados permitidos da revisão conferida',()=>{
 expect(consultaConferida({consultaObra:consulta},'hash')).toEqual({secoes:consulta.secoes,conferidoEm:consulta.conferidoEm,omissoes:true});
});
it('rejeita payload malformado',()=>expect(consultaConferida({consultaObra:{...consulta,secoes:[{titulo:'X',paragrafos:[{}]}]}},'hash')).toBeNull());
