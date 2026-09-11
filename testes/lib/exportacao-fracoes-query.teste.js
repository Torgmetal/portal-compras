import { expect, it } from 'vitest';
import { lerFracoesExportacao } from '@/lib/exportacao-fracoes';
it('query ausente mantém protocolo antigo',()=>expect(lerFracoesExportacao(null)).toBeUndefined());
it('lê a seleção JSON',()=>expect(lerFracoesExportacao('[{"id":"p","inicio":1,"quantidade":2}]')).toEqual([{id:'p',inicio:1,quantidade:2}]));
it.each(['null','[]','{}','[','[{"id":"p","inicio":0.5,"quantidade":2}]','[{"id":"p","inicio":0,"quantidade":0}]'])('rejeita JSON inválido %s',valor=>expect(()=>lerFracoesExportacao(valor)).toThrow());
