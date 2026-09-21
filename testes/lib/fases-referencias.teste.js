import {it,expect} from 'vitest';
import {fasesReferenciasSchema,moverFase} from '@/lib/fases-referencias';
const tabela={empresas:['TMSA','Vale'],fases:[{fase:'A',descricao:'Apoios',referencias:['100','200']},{fase:'B',descricao:'Treliça',referencias:['101','201']}]};
it('ordena a prioridade preservando as correspondências',()=>{const r=moverFase(tabela.fases,1,-1);expect(r.map(x=>x.fase)).toEqual(['B','A']);expect(r[0].referencias).toEqual(['101','201']);expect(tabela.fases[0].fase).toBe('A');});
it('recusa fase ou empresa duplicada e referência sem coluna',()=>{expect(fasesReferenciasSchema.safeParse({...tabela,fases:[tabela.fases[0],{...tabela.fases[1],fase:'a'}]}).success).toBe(false);expect(fasesReferenciasSchema.safeParse({...tabela,empresas:['Vale','VALE']}).success).toBe(false);expect(fasesReferenciasSchema.safeParse({...tabela,empresas:['Vale']}).success).toBe(false);});
it('permite cadastrar fase antes de saber os códigos do cliente',()=>{expect(fasesReferenciasSchema.parse({empresas:['TMSA'],fases:[{fase:' a ',descricao:'Apoios',referencias:['']}]}).fases[0].fase).toBe('A');});
