import {beforeEach,describe,expect,it,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u',name:'Comercial'})}));
vi.mock('@/lib/extrair-boletim',()=>({extrairBoletim:vi.fn()}));
vi.mock('@vercel/blob/client',()=>({handleUpload:vi.fn()}));
import {extrairBoletim} from '@/lib/extrair-boletim';
import {handleUpload} from '@vercel/blob/client';
import {requireRole} from '@/lib/session';
import {POST} from '@/app/api/qualidade/tintas/route';
import {POST as upload} from '@/app/api/comercial/produtos/tintas/upload-token/route';
const req=(b)=>new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const tinta={fabricante:'Jotun',produto:'Primer',categoria:'TINTA',diluente:'Diluente 17',diluenteId:null};
beforeEach(()=>{vi.clearAllMocks();extrairBoletim.mockResolvedValue([tinta]);mockPrisma.produtoTinta.findFirst.mockResolvedValue(null);mockPrisma.produtoTinta.create.mockImplementation(async({data})=>({...data,id:'t'}));mockPrisma.auditLog.create.mockResolvedValue({});});
describe('rascunho de boletim e vínculos de diluente',()=>{
 it('leitura opcional retorna rascunho sem gravar produto',async()=>{
  const r=await POST(req({arquivo:'JVBERg==',somenteExtrair:true}));expect(r.status).toBe(200);expect((await r.json()).tintas[0].produto).toBe('Primer');expect(mockPrisma.produtoTinta.create).not.toHaveBeenCalled();expect(mockPrisma.produtoTinta.update).not.toHaveBeenCalled();
 });
 it('falha IA não grava um cadastro parcial',async()=>{
  extrairBoletim.mockRejectedValue(new Error('API unavailable'));const r=await POST(req({arquivo:'JVBERg==',somenteExtrair:true}));expect(r.status).toBe(422);expect(mockPrisma.produtoTinta.create).not.toHaveBeenCalled();
 });
 it('código de diluente igual entre fabricantes não gera vínculo cruzado',async()=>{
  mockPrisma.produtoTinta.findMany.mockResolvedValue([{id:'weg17',produto:'Diluente 17',fabricante:'WEG'},{id:'jotun17',produto:'Diluente 17',fabricante:'Jotun'}]);
  const r=await POST(req({arquivo:'JVBERg=='}));expect(r.status).toBe(200);expect(mockPrisma.produtoTinta.update).toHaveBeenCalledWith({where:{id:'t'},data:{diluenteId:'jotun17'}});
 });
 it('reimportação preserva revisão antiga e exige nova conferência',async()=>{
  const anterior={id:'t',...tinta,boletimRevisao:'R1',boletimUrl:'https://example.test/a.pdf',conferidoEm:'2026-08-01'};
  mockPrisma.produtoTinta.findFirst.mockResolvedValue(anterior);mockPrisma.produtoTinta.findMany.mockResolvedValue([]);mockPrisma.produtoTinta.update.mockImplementation(async({data})=>({...data,id:'t'}));
  const r=await POST(req({arquivo:'JVBERg=='}));expect(r.status).toBe(200);const data=mockPrisma.produtoTinta.update.mock.calls[0][0].data;expect(data.conferidoEm).toBeNull();expect(data.historicoBoletins[0].boletimRevisao).toBe('R1');
 });
});
describe('upload PDF dedicado',()=>{
 it('aceita funções do catálogo e restringe caminho/tipo do documento',async()=>{
  handleUpload.mockImplementation(async(args)=>{
   expect(await args.onBeforeGenerateToken('boletins-tinta/123-boletim.pdf')).toMatchObject({allowedContentTypes:['application/pdf']});
   await expect(args.onBeforeGenerateToken('estudos/documento.pdf')).rejects.toThrow(/Caminho/);return {ok:true};
  });
  expect((await upload(req({}))).status).toBe(200);expect(requireRole).toHaveBeenCalledWith(['ADMIN','COMERCIAL','QUALIDADE','COMPRAS']);
 });
});
