import {melhorArranjo} from '@/lib/carga/arranjo';
import {montarUnidades} from '@/lib/carga/unidades';
import {it,expect} from 'vitest';
import {empacotar,novoContexto} from '@/lib/carga/empacotar';
import {PERFIS} from '@/lib/carga/premissas';
import {montarCaibros} from '@/lib/carga/cena-carga';
import {recalcularMontagem} from '@/lib/carga/montagem-manual';
import {caixaOrientada,orientarPeca} from '@/lib/carga/geometria';
const veic={chave:'teste',C:4000,L:2400,alturaUtil:2500,pesoMax:10000};
const u=(id,extra={})=>({id,tipo:'PECA',C:3000,L:700,A:300,kg:500,classe:1,...extra});
const ctx=()=>novoContexto({veiculos:{teste:veic}});
it('uma caixa não entra suspensa quando o assoalho já está ocupado',()=>{
 const itens=[u('base',{C:3900,L:2200}),u('caixa',{tipo:'CAIXA',C:1200,L:800,classe:2})];
 const cs=empacotar(itens,'teste',PERFIS.recomendado,ctx(),[],'empilhar');
 expect(itens[1].y).toBe(0);expect(cs).toHaveLength(2);
});

it('não desenha madeira flutuante nem preenche desníveis de apoio silenciosamente',()=>{
 const cima={...u('cima'),x:0,y:500,z:0,fx:3000,fz:700};
 expect(montarCaibros(cima,100,[])).toHaveLength(0);
 expect(montarCaibros(cima,100,[{...u('baixo'),x:0,y:0,z:0,fx:3000,fz:700}])).toHaveLength(0);
});
it('uma pequena interseção não conta como base suficiente na montagem manual',()=>{
 const base={...u('base'),x:0,y:0,z:0,volume:1};
 const cima={...u('caixa',{tipo:'CAIXA',L:1200}),x:0,y:400,z:650,volume:2};
 const c=recalcularMontagem({veiculo:veic,itens:[base,cima],passos:['base','caixa'],romaneio:[]});
 expect(c.verificacoes.some(v=>v.id==='caixa'&&v.tipo==='apoio')).toBe(true);
});
it('longarina em V deita pela geometria, mantendo viga reta com a alma vertical',()=>{
 const pts=[];for(let x=0;x<=2800;x+=100)for(const y of [Math.abs(x-1400)*.3,Math.abs(x-1400)*.3+180])for(const z of [0,164])pts.push(x,y,z);
 const obb=caixaOrientada(pts),o=orientarPeca('LONGARINA',obb.dimsEixos,obb);
 expect(o.A).toBe(164);expect(o.L).toBeGreaterThan(500);
 expect(orientarPeca('VIGA',[2800,600,164],null).A).toBe(600);
 expect(orientarPeca('LONGARINA',obb.dimsEixos,obb,'almaVertical').A).toBeGreaterThan(500);
});


it('duas caixas largas cabem no mesmo assoalho sem a centralização fragmentar o espaço',()=>{
 const itens=[u('a',{tipo:'CAIXA',C:3900,L:1100,rotulo:'a'}),u('b',{tipo:'CAIXA',C:3900,L:1100,rotulo:'b'})];
 const c=ctx();c.porId=new Map(itens.map(u=>[u.id,u]));c.frete={teste:100};
 expect(melhorArranjo(itens,PERFIS.recomendado,c,[],'teste').cargas).toHaveLength(1);
});
it('um perfil girado 45 graus não vira um quadrado de apoio',()=>{
 const base={...u('base',{C:3000,L:100,kg:1000}),x:0,y:0,z:0,volume:1,rotacaoManual:{x:0,y:45,z:0}};
 const cima={...u('cima',{C:1000,L:1000,A:100,kg:100}),x:1000,y:400,z:1000,volume:2};
 const c=recalcularMontagem({veiculo:veic,itens:[base,cima],passos:['base','cima'],romaneio:[]});
 expect(c.verificacoes.some(v=>v.tipo==='apoio'&&v.id==='cima')).toBe(true);
 expect(montarCaibros(c.itens[1],100,[c.itens[0]])).toHaveLength(0);
});

it('empilha uma caixa menor e mais leve sobre uma caixa maior no piso',()=>{
 const itens=[u('base',{tipo:'CAIXA',C:3900,L:2200,kg:500}),u('cima',{tipo:'CAIXA',C:2000,L:1000,kg:200})];
 const cs=empacotar(itens,'teste',PERFIS.recomendado,ctx(),[],'empilhar');
 expect(cs).toHaveLength(1);expect(itens[1].y).toBe(400);expect(itens[1].sobre).toEqual(['base']);
});
it('não empilha caixa pesada sobre caixa mais leve nem cria uma terceira camada',()=>{
 const leves=[u('base',{tipo:'CAIXA',C:3900,L:2200,kg:100}),u('cima',{tipo:'CAIXA',C:3900,L:2200,kg:200})];
 expect(empacotar(leves,'teste',PERFIS.recomendado,ctx(),[],'empilhar')).toHaveLength(2);
 const tres=[500,300,100].map((kg,i)=>u(`c${i}`,{tipo:'CAIXA',C:3900,L:2200,kg}));
 expect(empacotar(tres,'teste',PERFIS.recomendado,ctx(),[],'empilhar')).toHaveLength(2);
 expect(tres[2].y).toBe(0);
});
it('a detecção de longarina em V não impõe a mesma restrição aos pórticos',()=>{
 const obb={eixo:2,ang:16,min:[0,0,0],dimsEixos:[2895,1134,494],baseEmV:true};
 expect(orientarPeca('PORTICO',obb.dimsEixos,obb).baseEmV).toBe(false);
 expect(orientarPeca('LONGARINA',[2800,617,164],{...obb,dimsEixos:[2800,617,164]}).baseEmV).toBe(true);
});
it('dimensiona cada caixa pelo conteúdo dela, sem herdar o vazio da caixa anterior',()=>{
 const pecas=[{id:'a',marca:'T107A1',desc:'ITEM',C:1800,L:800,A:550,kg:50},{id:'b',marca:'T107A2',desc:'ITEM',C:300,L:300,A:200,kg:10}];
 const caixas=montarUnidades(pecas,PERFIS.recomendado,'topo',novoContexto({prefixo:'T107'})).filter(u=>u.tipo==='CAIXA');
 expect(caixas).toHaveLength(2);expect(caixas[1].C).toBeLessThan(1000);expect(caixas[1].L).toBeLessThan(600);
 for(const c of caixas)for(const m of c.membros){expect(m.dx+m.C).toBeLessThanOrEqual(c.C-40);expect(m.dz+m.L).toBeLessThanOrEqual(c.L-40);}
 expect(caixas.flatMap(c=>c.membros.map(m=>m.id)).sort()).toEqual(['a','b']);
});
it('a longarina em V deitada pode usar uma base nivelada e larga, sem reservar piso à força',()=>{
 const itens=[u('base',{C:3900,L:2200,kg:800}),u('v',{C:2800,L:617,A:164,kg:55,baseEmV:true,almaVertical:false})];
 expect(empacotar(itens,'teste',PERFIS.recomendado,ctx(),[],'empilhar')).toHaveLength(1);
 expect(itens[1].y).toBe(400);expect(itens[1].sobre).toEqual(['base']);
});
it('considera o peso combinado das caixas que compartilham a mesma base',()=>{
 const itens=[u('base',{tipo:'CAIXA',C:3900,L:2200,kg:500}),...['a','b'].map(id=>u(id,{tipo:'CAIXA',C:1800,L:1000,kg:300}))];
 const cs=empacotar(itens,'teste',PERFIS.recomendado,ctx(),[],'empilhar');
 expect(cs).toHaveLength(2);expect(itens.filter(p=>p.y>0)).toHaveLength(1);
});
it('avisa no ajuste manual quando a soma das caixas ultrapassa o critério da base',()=>{
 const base={...u('base',{tipo:'CAIXA',C:3900,L:2200,kg:500}),x:0,y:0,z:0,volume:1};
 const a={...u('a',{tipo:'CAIXA',C:1800,L:1000,kg:300}),x:0,y:400,z:0,volume:2};
 const b={...u('b',{tipo:'CAIXA',C:1800,L:1000,kg:300}),x:1900,y:400,z:0,volume:3};
 const c=recalcularMontagem({veiculo:veic,itens:[base,a,b],passos:['base','a','b'],romaneio:[]});
 expect(c.verificacoes.filter(v=>v.tipo==='caixa'&&v.texto.includes('sem base compatível'))).toHaveLength(2);
});
it('prefere a base inteira a avançar a pilha para fora do apoio disponível',()=>{
 const itens=[u('vizinho',{C:600,L:2200,A:100}),u('base',{C:2800,L:1000,kg:600}),u('cima',{C:2500,L:900,kg:200})];
 empacotar(itens,'teste',PERFIS.recomendado,ctx(),[],'empilhar');
 const [,b,a]=itens;expect(a.y).toBe(400);
 expect(a.x).toBeGreaterThanOrEqual(b.x);expect(a.x+a.fx).toBeLessThanOrEqual(b.x+b.fx);
 expect(a.z).toBeGreaterThanOrEqual(b.z);expect(a.z+a.fz).toBeLessThanOrEqual(b.z+b.fz);
});
it('refina a grade antes de abrir uma segunda viagem por poucos centímetros',()=>{
 const itens=[u('a',{tipo:'CAIXA',C:3900,L:1343,A:1600,rotulo:'a'}),u('b',{tipo:'CAIXA',C:3900,L:880,A:1600,rotulo:'b'})];
 const c=ctx();c.porId=new Map(itens.map(u=>[u.id,u]));c.frete={teste:100};
 expect(melhorArranjo(itens,PERFIS.recomendado,c,[],'teste').cargas).toHaveLength(1);
 expect(c.cel).toBe(100);
});
