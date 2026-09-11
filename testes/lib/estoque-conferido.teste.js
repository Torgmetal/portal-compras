import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
import {analisarMaterial} from '@/lib/material-liberacao';
import {materialPorPerfil} from '@/lib/status-compra';
const peca={id:'p',perfil:'CH12.50',qte:1,pesoTotalKg:10};
const lote={importRef:'261234',nome:'CH 12,5',opNumero:'84',numeroCorrida:'C-1',numeroDocumento:'CERT-1'};
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.rMItem.findMany.mockResolvedValue([]);
 mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([{perfil:peca.perfil,rUsado:lote.importRef,estoqueConferido:true}]);
 mockPrisma.documentoQualidade.findMany.mockImplementation(async({where})=>where.opNumero ? [] : [lote]);
});
it('estoque conferido atende uma OP sem nenhum recebimento próprio',async()=>{
 const r=await analisarMaterial('106',[peca]);
 expect(r.porPerfil.get(peca.perfil)).toMatchObject({estado:'NA_OP',rInformado:'261234',estoqueConferido:true});
 const pcp=await materialPorPerfil('106',[peca.perfil]);
 expect(pcp.get(peca.perfil)).toMatchObject({rastreio:'261234',corrida:'C-1',certificado:'CERT-1',deOutraOp:'84'});
});
it('não libera automaticamente material de outra OP sem conferência',async()=>{
 mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([{perfil:peca.perfil,rUsado:lote.importRef,estoqueConferido:false}]);
 const r=await analisarMaterial('106',[peca]);
 expect(r.porPerfil.get(peca.perfil).estado).not.toBe('NA_OP');
});
it('R conferido mas removido do CMR não libera material',async()=>{
 mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
 const r=await analisarMaterial('106',[peca]);
 expect(r.porPerfil.get(peca.perfil).estado).not.toBe('NA_OP');
});
