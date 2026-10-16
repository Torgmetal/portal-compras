import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ listar: vi.fn(), drive: vi.fn(), findMany: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/sharepoint',()=>({listChildrenByPath:m.listar}));
vi.mock('@/lib/projetos-databook',()=>({resolveServidorDriveId:m.drive}));
vi.mock('@/lib/prisma',()=>{const prisma={documentoQualidade:{findMany:m.findMany,create:m.create},auditLog:{create:m.audit}};prisma.$transaction=async fn=>fn(prisma);return {prisma};});
import { importarProcedimentos, procedimentoDoTipo } from '@/lib/importar-procedimentos';
const base='/Administrativo/SGQ ISO 9001-2015/08 Procedimentos e Formulários do SGQ';
beforeEach(()=>{vi.clearAllMocks();m.drive.mockResolvedValue('drive');m.findMany.mockResolvedValue([]);m.create.mockImplementation(async({data})=>({id:'novo',...data}));m.audit.mockResolvedValue({});});
describe('procedimentos vigentes',()=>{
 it('importa a revisão numérica maior da pasta atual e nunca entra em Obsoleto',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[
 {name:'PO 05 - Pintura - R4',folder:{}},{name:'PO 05 - Pintura - R10',folder:{}},{name:'Obsoleto',folder:{}}
 ]:[{id:'pdf10',name:'PO 05 - Pintura - R10.pdf',file:{}}]);
 await importarProcedimentos({userId:'qualidade'});
 expect(m.listar.mock.calls.map(c=>c[1])).toEqual(expect.arrayContaining([base,base+'/PO 05 - Pintura - R10']));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({nome:'PO-05 Pintura - R10',sharepointItemId:'pdf10'})}));
 });
 it('preserva o registro da revisão anterior ao cadastrar a nova',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[{name:'PO 05 - Pintura - R4',folder:{}}]:[{id:'pdf4',name:'PO 05 - Pintura - R4.pdf',file:{}}]);
 m.findMany.mockResolvedValue([{id:'antigo',nome:'PO-05 Pintura - R3',numeroDocumento:'PO-05'}]);
 await importarProcedimentos();expect(m.create).toHaveBeenCalled();
 });
 it('o relatório seleciona R10 em vez de R4 independentemente da ordem do banco',async()=>{
 m.findMany.mockResolvedValue([{id:'r4',nome:'PO-05 Pintura - R4',numeroDocumento:'PO-05'},{id:'r10',nome:'PO-05 Pintura - R10',numeroDocumento:'PO-05'}]);
 expect((await procedimentoDoTipo('PINTURA')).id).toBe('r10');
 });
 it('não oculta falhas de acesso ao SGQ como importação vazia',async()=>{
 m.listar.mockRejectedValue(new Error('SharePoint indisponível'));await expect(importarProcedimentos()).rejects.toThrow('SharePoint indisponível');
 });
});
it('consulta o SGQ ao criar relatório e importa somente o PO aplicável',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[{name:'PO 05 - Pintura - R4',folder:{}},{name:'PO 04 - Dimensional - R3',folder:{}}]:[{id:'pdf4',name:'PO 05 - Pintura - R4.pdf',file:{}}]);
 m.findMany.mockResolvedValue([]);
 await procedimentoDoTipo('PINTURA',{sincronizar:true});
 expect(m.listar.mock.calls.map(c=>c[1])).toEqual([base,base+'/PO 05 - Pintura - R4']);
});
it('recusa PDF explicitamente anterior ao nome da pasta',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[{name:'PO 05 - Pintura - R4',folder:{}}]:[{id:'pdf3',name:'PO 05 - Pintura - R3.pdf',file:{}}]);
 const out=await importarProcedimentos();expect(out.semPdf).toEqual(['PO 05 - Pintura - R4']);expect(m.create).not.toHaveBeenCalled();
});
it('não usa o cadastro antigo se o procedimento não existe na pasta atual',async()=>{
 m.listar.mockResolvedValue([]);await expect(procedimentoDoTipo('PINTURA',{sincronizar:true})).rejects.toThrow(/não encontrados/);
});
it('usa revisão maior declarada pelo PDF quando a pasta ainda tem o nome anterior',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[{name:'PO 02 - Fabricação - R5',folder:{}}]:[{id:'pdf6',name:'PO-02-Fabricação R6.pdf',file:{}}]);
 await importarProcedimentos();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({nome:'PO-02 Fabricação - R6',observacao:'Revisão R6'})}));
});
it('também encontra novas revisões PI-QUA na pasta dos procedimentos complementares',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[]:path.endsWith('/Procedimentos')?[{name:'END',folder:{}}]:path.endsWith('/END')?[{name:'PI-QUA-003 - Ultrassom - R2.pdf',id:'us2',file:{}}]:[]);
 await importarProcedimentos({numeros:['PI-QUA-003']});expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({numeroDocumento:'PI-QUA-003',nome:'PI-QUA-003 Ultrassom - R2',sharepointItemId:'us2'})}));
});
it('não confunde formulário ou outro PO de revisão maior com o procedimento da pasta',async()=>{
 m.listar.mockImplementation(async(_,path)=>path===base?[{name:'PO 05 - Pintura - R4',folder:{}}]:[{id:'form',name:'FO-05 - Registro - R8.pdf',file:{}},{id:'outro',name:'PO-04 Dimensional - R9.pdf',file:{}},{id:'pdf4',name:'PO-05 Pintura - R4.pdf',file:{}}]);
 await importarProcedimentos({numeros:['PO-05']});expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({sharepointItemId:'pdf4',nome:'PO-05 Pintura - R4'})}));
});
