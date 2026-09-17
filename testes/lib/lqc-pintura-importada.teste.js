import { it, expect } from 'vitest';
import { calcularCamadasPinturaConsulta, custoCamada } from '@/lib/lqc';
const area = 18375.049628590088;
const c = () => ({ resumos: [{ areaM2: area, perda:45, cor:'' }], tintas: [
 { camada:'PRIMER', cor:'CINZA', solidos:95, peliculaSeca:180, precoLitro:50.891925, precoKg:1.667639294606178, origemPrecoKg:'INDUSTRIALIZACAO', perda:45, precoDiluente:27.53025, areaImportada:area },
 ...[['CINZA 5B 5/1',46.720625],['AZUL 10B4/10',46.328275],['AMARELO SEG 5Y 8/12',54.6812]].map(([cor,precoLitro])=>({camada:'ACABAMENTO',cor,precoLitro,solidos:65,peliculaSeca:60,perda:45,precoDiluente:27.53025,areaImportada:area}))
] });
it('calcula primer sem arredondar rendimento antes do consumo',()=>{
 expect(custoCamada(c().tintas[0],area).total).toBe(365721.79);
});
it('mostra as quatro demãos importadas mesmo sem distribuição por cor',()=>{
 const dados=c(); const antes=JSON.stringify(dados);
 const linhas=calcularCamadasPinturaConsulta(dados);
 expect(linhas.map(x=>x.total)).toEqual([365721.79,165308.18,164098.20,189857.99]);
 expect(linhas.every(x=>x.referenciaImportada)).toBe(true);
 expect(JSON.stringify(dados)).toBe(antes);
});
it('reduz a referência ao retirar áreas do escopo, sem manter o custo integral',()=>{
 const dados=c();dados.resumos=[{areaM2:area/2,perda:45},{areaM2:area/2,perda:45,ativo:false}];
 expect(calcularCamadasPinturaConsulta(dados)[1].total).toBe(82654.09);
});
it('respeita destino explícito e não ressuscita cor sem área no modo por consumo',()=>{
 const dados=c(); dados.tintas[1].estruturaEscopo='inexistente';
 expect(calcularCamadasPinturaConsulta(dados)[1].total).toBe(0);
 dados.tintas[0].precoKg=null;
 expect(calcularCamadasPinturaConsulta(dados)[2].total).toBe(0);
});
