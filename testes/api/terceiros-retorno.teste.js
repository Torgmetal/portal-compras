import {vi,describe,it,expect,beforeEach} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn()}));
import {requireRole} from '@/lib/session';
import {POST} from '@/app/api/expedicao/terceiros/[id]/retorno/route';
const rom={id:'r1',opRefId:'op1',opRefNumero:'097',updatedAt:new Date(),status:'ENVIADO',itens:[{marca:'M1',qte:10,pesoTotal:100,destino:'SOLDA'}],retornos:[]};
const body={data:'2026-09-07',chave:'c5fb54bb-c0ea-46d4-ae1f-eb4cec921e39',itens:[{marca:'M1',qte:3,destino:'SOLDA'}]};
const call=b=>POST(new Request('http://localhost/api/expedicao/terceiros/r1/retorno',{method:'POST',body:JSON.stringify(b)}),{params:{id:'r1'}});
beforeEach(()=>{vi.clearAllMocks();requireRole.mockResolvedValue({id:'u1',name:'PCP'});db.romaneioTerceiro.findUnique.mockResolvedValue(rom);db.romaneioTerceiro.findMany.mockResolvedValue([]);db.mesOrdem.groupBy.mockResolvedValue([]);db.romaneioTerceiro.updateMany.mockResolvedValue({count:1});});
describe('baixa de terceiros',()=>{
 it('recusa usuário sem permissão antes de consultar romaneio',async()=>{requireRole.mockRejectedValue(Error('Unauthorized'));expect((await call(body)).status).toBe(401);expect(db.romaneioTerceiro.findUnique).not.toHaveBeenCalled()});
 it('valida saldo novamente no servidor',async()=>{expect((await call({...body,itens:[{marca:'M1',qte:11,destino:'SOLDA'}]})).status).toBe(400);expect(db.romaneioTerceiro.updateMany).not.toHaveBeenCalled()});
 it('grava retorno parcial e mantém referência do início da produção',async()=>{expect((await call(body)).status).toBe(200);expect(db.romaneioTerceiro.updateMany.mock.calls[0][0].data).toMatchObject({status:'PARCIAL',pesoRetornadoKg:30,retornos:[{itens:[{qte:3,producaoInicio:0,destino:'SOLDA'}]}]})});
 it('não repete gravação no retry da mesma confirmação',async()=>{db.romaneioTerceiro.findUnique.mockResolvedValue({...rom,retornos:[{chave:body.chave}]});expect((await call(body)).status).toBe(200);expect(db.romaneioTerceiro.updateMany).not.toHaveBeenCalled()});
 it('bloqueia documento duplicado mesmo com chave nova',async()=>{const hash='a'.repeat(64);db.romaneioTerceiro.findUnique.mockResolvedValue({...rom,retornos:[{documentoHash:hash}]});expect((await call({...body,documentoHash:hash})).status).toBe(400)});
 it('conflito de versão não retorna sucesso',async()=>{db.romaneioTerceiro.updateMany.mockResolvedValue({count:0});expect((await call(body)).status).toBe(400);expect(db.auditLog.create).not.toHaveBeenCalled()});
});

it('salva destinos distintos para a mesma marca e mantém prazo original',async()=>{
 const itens=[{marca:'M1',qte:3,destino:'SOLDA'},{marca:'M1',qte:2,destino:'PINTURA'}];
 expect((await call({...body,itens})).status).toBe(200);
 const data=db.romaneioTerceiro.updateMany.mock.calls[0][0].data;
 expect(data).toMatchObject({status:'PARCIAL',pesoRetornadoKg:50,retornos:[{itens:[{qte:3,destino:'SOLDA',producaoInicio:0},{qte:2,destino:'PINTURA',producaoInicio:0}]}]});
 expect(data).not.toHaveProperty('dataPrevRetorno');
});
it('recusa excesso agregado entre setores antes de gravar',async()=>{
 expect((await call({...body,itens:[{marca:'M1',qte:6,destino:'SOLDA'},{marca:'M1',qte:5,destino:'PINTURA'}]})).status).toBe(400);
 expect(db.romaneioTerceiro.updateMany).not.toHaveBeenCalled();
});
