import {expect,it} from 'vitest';
import {prepararOpDaLqc} from '@/lib/lqc-op';
import {conferirCustosLqc, validarPreenchimentoLqc} from '@/lib/lqc-op-conferencia';
const e={id:'e',numero:123,ano:2026,updatedAt:new Date('2026-09-16'),cliente:'Cliente',obra:'OS 01',orcamento:{id:'o',numero:'123-26',valor:950},composicao:{resumos:[{area:'A',pesoTotal:100,precoKg:5}],fixadoresRsKg:.3}};
const previa=()=>prepararOpDaLqc(e);
const fonte=()=>({aco:{pesoKg:100,itens:[{area:'A',pesoKg:100}]},custos:{total:530,grupos:[{item:'1.1',descricao:'MATÉRIA PRIMA',subtotal:500,itens:[{descricao:'A',pesoKg:100,precoKg:5,subtotal:500}]},{item:'1.2',descricao:'FIXADORES',subtotal:30},{item:'1.3',descricao:'TINTAS',subtotal:0},{item:'2',descricao:'TERCEIROS',subtotal:0},{item:'3.1',descricao:'FABRICAÇÃO',subtotal:0},{item:'3.2',descricao:'PINTURA',subtotal:0},{item:'3.3',descricao:'PRÉ-MONTAGEM',subtotal:0}]}});
it('traz peso e custo unitário do aço sem converter base de fixadores em quantidade física',()=>{
 const p=previa();expect(p.itens[0]).toMatchObject({tipo:'ESTRUTURA',unidade:'KG',qtdContratada:100,cmcMedio:5,valorVerba:500});
 expect(p.itens[1]).toMatchObject({tipo:'VERBA',qtdContratada:null,valorVerba:30});
 expect(p.resumoCustos).toMatchObject({compras:530,internos:0,total:530});
});
it('confere custo da OS com a planilha sem usar o preço contratado como custo',()=>{
 const c=conferirCustosLqc(previa(),fonte());expect(c.ok).toBe(true);expect(c.linhas.find(l=>l.chave==='custo').portal).toBe(530);
});
it('detecta custos diferentes mesmo quando o total permanece igual',()=>{
 const d=fonte();d.custos.grupos[0].subtotal=490;d.custos.grupos[1].subtotal=40;
 expect(conferirCustosLqc(previa(),d).ok).toBe(false);
});
it('não apresenta informação ausente como valor zero conferido',()=>{
 const d=fonte();d.custos.grupos=d.custos.grupos.filter(g=>g.item!=='1.3');
 expect(conferirCustosLqc(previa(),d).linhas.find(l=>l.chave==='tintas').status).toBe('ausente');
 expect(conferirCustosLqc(previa(),d).ok).toBe(false);
});
it('aceita um centavo de arredondamento e sinaliza a diferença',()=>{
 const d=fonte();d.custos.total=530.01;const c=conferirCustosLqc(previa(),d);
 expect(c.ok).toBe(true);expect(c.linhas.find(l=>l.chave==='custo').status).toBe('arredondamento');
});
it('confere peso por área para não aceitar escopos compensados',()=>{
 const d=fonte();d.aco.itens=[{area:'OUTRA OS',pesoKg:100}];expect(conferirCustosLqc(previa(),d).ok).toBe(false);
});
it('impede salvar valores, quantidade ou fonte diferentes da conferência',()=>{
 const p={...previa(),conferencia:{ok:true,codigo:'fonte1'}};
 const body={itens:p.itens,valorContrato:950,conferenciaCodigo:'fonte1'};
 expect(()=>validarPreenchimentoLqc(p,body)).not.toThrow();
 expect(()=>validarPreenchimentoLqc(p,{...body,conferenciaCodigo:'fonte2'})).toThrow(/mudou/);
 expect(()=>validarPreenchimentoLqc(p,{...body,valorContrato:999})).toThrow(/contratado/);
 expect(()=>validarPreenchimentoLqc(p,{...body,itens:p.itens.map((i,n)=>n===0?{...i,qtdContratada:90}:i)})).toThrow(/custos/);
 expect(()=>validarPreenchimentoLqc({...p,conferencia:{ok:false}},body)).toThrow(/conferência/);
});

it('compara o custo completo quando existem itens comerciais além da industrialização',()=>{
 const p=prepararOpDaLqc({...e,composicao:{...e.composicao,itensComerciais:{TELHA_SIMPLES:{qtd:10,preco:100}}}});
 const d=fonte();d.comercial={totalGeral:{material:1530,mdoTerceirizada:0,industrializacao:0}};
 expect(conferirCustosLqc(p,d).ok).toBe(true);
 expect(conferirCustosLqc(p,d).linhas.find(l=>l.chave==='extras')).toMatchObject({portal:1000,planilha:1000});
});

it('detecta serviços compensados entre si mesmo com subtotal correto',()=>{
 const p=prepararOpDaLqc({...e,composicao:{...e.composicao,terceiros:[{descricao:'Inspeção',base:'verba',precoUnit:20,quantidade:1},{descricao:'Cálculo',base:'verba',precoUnit:30,quantidade:1}]}});
 const d=fonte();d.custos.grupos.find(g=>g.item==='2').subtotal=50;
 d.custos.grupos.push({item:'2.1',subtotal:50,itens:[{descricao:'Inspeção',subtotal:10},{descricao:'Cálculo',subtotal:40}]});d.custos.total=580;
 const c=conferirCustosLqc(p,d);expect(c.linhas.find(l=>l.chave==='terceirizados').status).toBe('confere');expect(c.ok).toBe(false);
});
