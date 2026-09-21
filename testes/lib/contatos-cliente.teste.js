import { expect, it } from 'vitest';
import { atualizarContatosCliente, contatoParaEnvioAutomatico } from '@/lib/contatos-cliente';
it('preserva função, telefones e a restrição da matriz ao editar nome', () => {
 const anterior = {nome:'Nome', email:'a@tmsa.ind.br', funcao:'Engenharia',telefone:'123',celular:'456',apenasConsulta:true};
 expect(atualizarContatosCliente([anterior],[{nome:'Nome novo',email:' A@TMSA.IND.BR '}])).toEqual([{...anterior,nome:'Nome novo'}]);
});
it('deduplica e respeita remoções explícitas sem importar campos extras', () => {
 expect(atualizarContatosCliente([{email:'b@tmsa.ind.br'}],[{nome:'A',email:'a@tmsa.ind.br',apenasConsulta:false},{nome:'B',email:'A@TMSA.IND.BR'}])).toEqual([{nome:'B',email:'a@tmsa.ind.br'}]);
});
it('não seleciona a matriz automaticamente; mantém comportamento dos contatos anteriores', () => {
 expect(contatoParaEnvioAutomatico({apenasConsulta:true})).toBe(false);
 expect(contatoParaEnvioAutomatico({nome:'Existente'})).toBe(true);
});
it('preserva a identidade da matriz quando o e-mail é corrigido', () => {
 const anterior={nome:'A',email:'a@tmsa.ind.br',funcao:'Qualidade',telefone:'123',apenasConsulta:true};
 expect(atualizarContatosCliente([anterior],[{nome:'A',email:'novo@tmsa.ind.br',emailAnterior:'a@tmsa.ind.br'}])).toEqual([{...anterior,email:'novo@tmsa.ind.br'}]);
});
