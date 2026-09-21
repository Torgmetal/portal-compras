import {it,expect} from 'vitest';
import {superficieSuperior} from '@/lib/carga/apoio-malha';
import {orientarPeca} from '@/lib/carga/geometria';
import {montarUnidades} from '@/lib/carga/unidades';
import {novoContexto,empacotar} from '@/lib/carga/empacotar';
import {PERFIS} from '@/lib/carga/premissas';
const malha=(largura=1000)=>({pos:[0,100,0,2000,100,0,2000,100,largura,0,100,largura,0,0,0],idx:[0,1,2,0,2,3]});
const orientacao={C:2000,L:1000,A:100,perm:{X:0,Y:1,Z:2}};
it('diferencia uma superfície plana de um perfil estreito dentro da caixa externa',()=>{
 expect(superficieSuperior(malha(),orientacao).plana).toBe(true);
 expect(superficieSuperior(malha(100),orientacao).plana).toBe(false);
});
it('deita conjunto sem família de perfil e conserva alma da viga',()=>{
 expect(orientarPeca('SE-038',[1950,642,168],null).A).toBe(168);
 expect(orientarPeca('VIGA',[1950,642,168],null).A).toBe(642);
});
it('painel solto largo exige avaliação especial, sem inventar cavalete automático',()=>{
 const un=montarUnidades([{id:'a',marca:'T102B34',desc:'SE-024',C:6092,L:2742,A:346,kg:800}],PERFIS.recomendado,'topo',novoContexto());
 expect(un[0].transporte).toBe('especial');expect(un[0].emPe).not.toBe(true);
});
it('não permite empilhar sobre superfície vazada mesmo quando as caixas externas encaixam',()=>{
 const veic={chave:'teste',C:4100,L:2400,alturaUtil:2500,pesoMax:10000};
 const itens=[{id:'a',tipo:'PECA',C:3900,L:2200,A:300,kg:500,classe:1,topoVazado:true},{id:'b',tipo:'PECA',C:2000,L:1000,A:100,kg:100,classe:1}];
 expect(empacotar(itens,'teste',PERFIS.recomendado,novoContexto({veiculos:{teste:veic}}),[],'empilhar')).toHaveLength(2);
 expect(itens[1].y).toBe(0);
});
it('não usa as laterais nem uma superfície inclinada como topo horizontal',()=>{
 const m=malha();m.pos[7]=40;
 expect(superficieSuperior(m,orientacao).plana).toBe(false);
});
it('leva a restrição dos membros para o pacote, sem transformar vãos em apoio',()=>{
 const unidades=montarUnidades([0,1].map(i=>({id:String(i),marca:'T102A1',desc:'VIGA',C:3000,L:300,A:200,kg:100,topoVazado:true})),PERFIS.recomendado,'topo',novoContexto());
 expect(unidades).toHaveLength(1);expect(unidades[0].tipo).toBe('PACOTE');expect(unidades[0].topoVazado).toBe(true);
});
