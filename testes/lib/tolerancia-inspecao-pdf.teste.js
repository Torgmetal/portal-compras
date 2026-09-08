import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {PDFPage} from 'pdf-lib';
vi.mock('@/lib/relatorio-form-pdf',()=>({imagemAssinada:vi.fn()}));
vi.mock('@/lib/vista-desenho',()=>({recortarVista:vi.fn()}));
import {gerarDimensionalPDF} from '@/lib/relatorio-dimensional-pdf';
import {linhasReprovadas} from '@/lib/revisao-inspecao';
it.each(['DIMENSIONAL','PRE_MONTAGEM'])('imprime a tolerância editada no PDF %s e respeita o novo limite',async tipo=>{
 const spy=vi.spyOn(PDFPage.prototype,'drawText');
 try{
  const linhas=[{marca:'C1',descricao:'Cota A',letra:'A',projetoMm:100,encontradoMm:104,tolerancia:'± 5'}];
  const bytes=await gerarDimensionalPDF({rel:{tipo,codigo:'QA-097-001',opNumero:'097',titulo:'Validação local',criadoEm:new Date('2026-09-08'),linhas,resultados:{},marcas:['C1'],desenhos:[]}});
  expect(spy.mock.calls.some(([t])=>t==='± 5')).toBe(true);
  const delta=spy.mock.calls.find(([t])=>t==='+4');expect(delta[1].color).toMatchObject({red:244/255,green:128/255,blue:31/255});
  expect(linhasReprovadas(linhas)).toEqual([]);
  if(process.env.PDF_QA_DIR){fs.mkdirSync(process.env.PDF_QA_DIR,{recursive:true});fs.writeFileSync(`${process.env.PDF_QA_DIR}/${tipo}.pdf`,bytes);}
 }finally{spy.mockRestore();}
});
