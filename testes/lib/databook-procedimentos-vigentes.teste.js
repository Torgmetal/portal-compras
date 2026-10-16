import { describe,it,expect,vi,beforeEach } from 'vitest';
import { mockPrisma as p } from '@/testes/apoio/prisma';
const trava=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/cron-trava',()=>({comTravaDeCron:trava}));
vi.mock('@/lib/prisma',()=>({prisma:p}));
const imp=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/importar-procedimentos',async(importOriginal)=>({...await importOriginal(),importarProcedimentos:imp}));
import { sincronizarProcedimentosDataBook } from '@/lib/databook-procedimentos';
beforeEach(()=>{vi.clearAllMocks();trava.mockImplementation(async(_p,_key,fn)=>fn());imp.mockResolvedValue({semPdf:[]});p.auditLog.create.mockResolvedValue({});p.dataBookGeracao.findFirst.mockResolvedValue(null);});
describe('última revisão no livro em montagem',()=>{
 it('troca o vínculo antigo e inclui o procedimento da pintura sem mexer nos demais anexos',async()=>{
 p.dataBookQualidade.findUnique.mockResolvedValue({id:'book',status:'EM_MONTAGEM',secoes:[{id:'s',numero:'14',estado:'ANEXADO',documentos:[{documentoId:'velho'},{documentoId:'tinta'}]}]});
 p.documentoQualidade.findMany.mockResolvedValueOnce([{id:'novo',nome:'PO-05 Pintura - R4',numeroDocumento:'PO-05',arquivoNome:'p.pdf'}]).mockResolvedValueOnce([{id:'velho',nome:'PO-05 Pintura - R3'},{id:'tinta',nome:'Sistema de Pintura OP94'}]);
 await sincronizarProcedimentosDataBook('book',{userId:'u'});
 expect(p.dataBookSecaoDoc.deleteMany).toHaveBeenCalledWith({where:{secaoId:'s',documentoId:{in:['velho']}}});
 expect(p.dataBookSecaoDoc.createMany).toHaveBeenCalledWith({data:[{secaoId:'s',documentoId:'novo'}],skipDuplicates:true});
 });
 it('livro emitido não sincroniza nem altera vínculos',async()=>{
 p.dataBookQualidade.findUnique.mockResolvedValue({id:'book',status:'EMITIDO',emitidoEm:new Date()});
 await sincronizarProcedimentosDataBook('book');expect(imp).not.toHaveBeenCalled();expect(p.dataBookSecaoDoc.deleteMany).not.toHaveBeenCalled();
 });
 it('recusa mudar o roteiro com uma geração em andamento',async()=>{
 p.dataBookQualidade.findUnique.mockResolvedValue({id:'book',status:'EM_MONTAGEM',secoes:[]});p.dataBookGeracao.findFirst.mockResolvedValue({id:'job'});
 await expect(sincronizarProcedimentosDataBook('book')).rejects.toThrow(/geração/i);expect(imp).not.toHaveBeenCalled();
 });
});

it('recusa outra chamada quando a reserva está ocupada',async()=>{
 trava.mockResolvedValueOnce(null);
 await expect(sincronizarProcedimentosDataBook('book')).rejects.toThrow(/em andamento/);
 expect(p.dataBookQualidade.findUnique).not.toHaveBeenCalled();
});
it('só finaliza/enfileira após atualizar os vínculos, ainda sob a reserva',async()=>{
 const eventos=[];
 trava.mockImplementationOnce(async(_p,key,fn)=>{expect(key).toBe('databook-procedimentos:book');eventos.push('reservar');const out=await fn();eventos.push('soltar');return out;});
 p.dataBookQualidade.findUnique.mockResolvedValue({id:'book',status:'EM_MONTAGEM',secoes:[]});
 p.documentoQualidade.findMany.mockResolvedValue([]);
 imp.mockImplementationOnce(async()=>{eventos.push('sincronizar');return {semPdf:[]};});
 const out=await sincronizarProcedimentosDataBook('book',{finalizar:async()=>{eventos.push('enfileirar');return 'job';}});
 expect(out).toBe('job');expect(eventos).toEqual(['reservar','sincronizar','enfileirar','soltar']);
});
