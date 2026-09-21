import { it, expect } from 'vitest';
import { calcularCamadasPinturaConsulta, calcularLqc, custoCamada } from '@/lib/lqc';
const area = 18375.049628590088;
const c = () => ({ resumos: [{ areaM2: area, perda:45, cor:'' }], tintas: [
 { camada:'PRIMER', cor:'CINZA', solidos:95, peliculaSeca:180, precoLitro:50.891925, precoKg:1.667639294606178, origemPrecoKg:'INDUSTRIALIZACAO', perda:45, precoDiluente:27.53025, areaImportada:area },
 ...[['CINZA 5B 5/1',46.720625],['AZUL 10B4/10',46.328275],['AMARELO SEG 5Y 8/12',54.6812]].map(([cor,precoLitro])=>({camada:'ACABAMENTO',cor,precoLitro,solidos:65,peliculaSeca:60,perda:45,precoDiluente:27.53025,areaImportada:area}))
] });
it('calcula primer sem arredondar rendimento antes do consumo',()=>{
 expect(custoCamada(c().tintas[0],area).total).toBe(365721.79);
});
it('não inventa área de acabamento quando falta distribuir as cores',()=>{
 const dados=c(); const antes=JSON.stringify(dados);
 const linhas=calcularCamadasPinturaConsulta(dados);
 expect(linhas.map(x=>x.total)).toEqual([365721.79,0,0,0]);
 expect(JSON.stringify(dados)).toBe(antes);
});
it('segue a cor escolhida e as áreas ativas apesar do total importado',()=>{
 const dados=c();dados.resumos=[
  {areaM2:100,perda:45,cor:'CINZA 5B 5/1',pesoTotal:1000},
  {areaM2:200,perda:45,cor:'AZUL 10B4/10',pesoTotal:2000},
  {areaM2:50,perda:45,cor:'AMARELO SEG 5Y 8/12',pesoTotal:500},
  {areaM2:80,perda:45,cor:'AZUL 10B4/10',ativo:false},
 ];
 const totalAntes=calcularLqc(dados).grupos.tintas.total.subtotal;
 expect(calcularCamadasPinturaConsulta(dados).map(x=>x.areaM2)).toEqual([350,100,200,50]);
 expect(calcularCamadasPinturaConsulta(dados)[2].total).toBe(custoCamada(dados.tintas[2],200).total);
 dados.resumos[0].cor='AZUL 10B4/10';
 expect(calcularCamadasPinturaConsulta(dados).map(x=>x.areaM2)).toEqual([350,0,300,50]);
 expect(calcularLqc(dados).grupos.tintas.total.subtotal).toBe(totalAntes);
});
it('respeita a área selecionada para primer sem usar a cor final como cor de fundo',()=>{
 const dados=c();dados.resumos=[{id:'a',areaM2:100,perda:45,cor:'AZUL 10B4/10'},{id:'b',areaM2:200,perda:45,cor:'AMARELO SEG 5Y 8/12'}];
 dados.tintas[0].areaEscopo='a';
 expect(calcularCamadasPinturaConsulta(dados)[0].areaM2).toBe(100);
});
it('respeita destino explícito e não ressuscita cor sem área no modo por consumo',()=>{
 const dados=c(); dados.tintas[1].estruturaEscopo='inexistente';
 expect(calcularCamadasPinturaConsulta(dados)[1].total).toBe(0);
 dados.tintas[0].precoKg=null;
 expect(calcularCamadasPinturaConsulta(dados)[2].total).toBe(0);
});
