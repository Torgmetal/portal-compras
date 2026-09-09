import { describe, it, expect } from 'vitest';
import { candidatosBoletim, criarSnapshotTinta, snapshotPublicoTinta } from '@/lib/cotacao-tinta-snapshot';
const dem = { id:'d1',camada:'Primer',tipo:'PRIMER',areaM2:100,peliculaSeca:100,solidos:80,perda:20,cor:'Cinza' };
const weg = {id:'w1',fabricante:'WEG',produto:'WEG Primer',tipo:'PRIMER',categoria:'TINTA',solidosVol:80,secaMin:80,secaMax:150,ativo:true,conferidoEm:'2026-09-09',boletimUrl:'https://a.public.blob.vercel-storage.com/weg.pdf',boletimNome:'weg.pdf',boletimRevisao:'R1'};
const jotun = {...weg,id:'j1',fabricante:'Jotun',produto:'Jotun Primer',boletimUrl:'https://a.public.blob.vercel-storage.com/jotun.pdf',boletimNome:'jotun.pdf'};
describe('consulta isolada por fabricante e revisão conferida',()=>{
 it('não infere fabricante do nome do fornecedor',()=>expect(candidatosBoletim({nome:'WEG'},dem,[weg])).toEqual([]));
 it('considera somente fabricante explicitamente vinculado, revisão conferida e requisitos completos',()=>{
   expect(candidatosBoletim({fabricanteTinta:'Jotun'},dem,[weg,jotun,{...jotun,id:'sem',conferidoEm:null}]).map(x=>x.id)).toEqual(['j1']);
   expect(candidatosBoletim({fabricanteTinta:'Jotun'},{...dem,solidos:0},[jotun])).toEqual([]);
   expect(candidatosBoletim({fabricanteTinta:'Jotun'},{...dem,peliculaSeca:200},[jotun])).toEqual([]);
 });
 it('rejeita boletim de concorrente injetado',()=>expect(()=>criarSnapshotTinta({id:'f',fabricanteTinta:'Jotun'},{camadas:[dem]},[weg,jotun],{'f:d1':'w1'})).toThrow(/boletim/i));
 it('mantém correspondência parcial, demãos escolhidas e perdas independentes sem custo ou produto adulterado',()=>{
   const s=criarSnapshotTinta({id:'f',fabricanteTinta:'Jotun'},{custo:500,fabricante:'WEG',camadas:[{...dem,produto:'WEG adulterado',custo:300},{...dem,id:'d2',tipo:'ACABAMENTO',perda:35,areaM2:80}]},[weg,jotun],{});
   expect(s.camadas[0].produto).toBe('Jotun Primer');
   expect(s.camadas[1].produto).toBe('Fornecedor deverá especificar');
   expect(s.camadas.map(x=>x.perda)).toEqual([20,35]);
   expect(JSON.stringify(s)).not.toMatch(/WEG|custo/);
   expect(s.camadas[0].boletim.revisao).toBe('R1');
 });
 it('sem fabricante vinculado envia apenas requisitos',()=>{
   const s=criarSnapshotTinta({id:'f',nome:'WEG'},{camadas:[dem]},[weg],{});
   expect(s.camadas[0].boletim).toBeNull();
 });
 it('token recebe somente snapshot próprio e legado omite produtos não isolados',()=>{
   expect(snapshotPublicoTinta({snapshot:{versao:2,camadas:[dem]},cotacao:{snapshot:{segredo:'outro'}}})).toEqual({versao:2,camadas:[dem]});
   const s=snapshotPublicoTinta({snapshot:null,cotacao:{snapshot:{custo:23,fabricante:'WEG',camadas:[{...dem,produto:'WEG',boletim:weg}]}}});
   expect(JSON.stringify(s)).not.toMatch(/WEG|custo/);
 });
});
