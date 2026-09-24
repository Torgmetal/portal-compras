import {expect,it} from 'vitest';
import {ocupacaoDaMalha} from '@/lib/carga/ocupacao-real';
const o={C:400,L:400,A:200,perm:{X:0,Y:1,Z:2}};
it('não ocupa o vão entre longarinas e conserva as cotas reais',()=>{
 const pos=[0,100,0,400,100,0,400,100,60,0,100,60,0,200,340,400,200,340,400,200,400,0,200,400];
 const r=ocupacaoDaMalha({pos,idx:[0,1,2,0,2,3,4,5,6,4,6,7]},o);
 expect(r.celulas.some(c=>c.z===150)).toBe(false);
 expect(r.celulas.some(c=>c.max===200)).toBe(true);
 expect(r.celulas.some(c=>c.max===100)).toBe(true);
});
it('inclui triângulos finos e faces inclinadas sem deixar furos por amostragem',()=>{
 const r=ocupacaoDaMalha({pos:[0,0,0,400,200,0,400,200,10],idx:[0,1,2]},o);
 expect(r.celulas.length).toBeGreaterThan(0);expect(Math.max(...r.celulas.map(c=>c.max))).toBe(200);
});
import {encaixarNoPiso} from '@/lib/carga/encaixe-piso';
it('intercala peças em L no piso sem ocupar seus vazios nem perder peças',()=>{
 const ocupacao={celulas:[{x:0,z:0,C:800,L:100,min:0,max:100},{x:0,z:100,C:100,L:600,min:0,max:100}]};
 const us=[0,1].map(i=>({id:String(i),tipo:'PECA',C:800,L:700,A:100,kg:100,ocupacao}));
 const cs=encaixarNoPiso(us,{chave:'teste',C:1200,L:1000,alturaUtil:2000,pesoMax:1000});
 expect(cs).toHaveLength(1);expect(cs[0].itens).toHaveLength(2);
});
it('empilha caixas compatíveis em apenas duas camadas, com a maior e mais pesada no piso',()=>{
 const us=[200,100,50].map((kg,i)=>({id:String(i),tipo:'CAIXA',C:900,L:700,A:200,kg}));
 const cs=encaixarNoPiso(us,{chave:'teste',C:1100,L:900,alturaUtil:2000,pesoMax:1000});
 expect(cs).toHaveLength(2);expect(cs[0].itens[1].y).toBe(300);expect(cs[1].itens[0].y).toBe(0);
});
