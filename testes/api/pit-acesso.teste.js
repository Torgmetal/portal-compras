import {it,expect,vi} from 'vitest';
vi.mock('@/lib/session',()=>({requireUser:vi.fn()}));
vi.mock('@/lib/diretoria',()=>({temAcessoDiretoria:vi.fn(async email=>email==='diretor@empresa.com')}));
import {podeGerenciarPit,requireGestaoPit} from '@/lib/pit-acesso';
import {requireUser} from '@/lib/session';
it('somente Qualidade ou Diretoria, sem conceder por ADMIN genérico',async()=>{expect(await podeGerenciarPit({tipo:'ADMIN',email:'admin@empresa.com'})).toBe(false);expect(await podeGerenciarPit({modulos:['QUALIDADE']})).toBe(true);expect(await podeGerenciarPit({email:'diretor@empresa.com'})).toBe(true);});
it('recusa gravação do comercial',async()=>{requireUser.mockResolvedValue({modulos:['COMERCIAL']});await expect(requireGestaoPit()).rejects.toThrow('Forbidden');});
