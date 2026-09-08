import {beforeEach,it,expect,vi} from 'vitest';
import * as XLSX from 'xlsx';
import {mockPrisma} from '@/testes/apoio/prisma';
const mocks=vi.hoisted(()=>({role:vi.fn()}));
vi.mock('@/lib/session',()=>({requireRole:mocks.role}));
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
import {POST} from '@/app/api/expedicao/terceiros/importar-itens/route';
const request=f=>new Request('http://localhost/api/expedicao/terceiros/importar-itens',{method:'POST',body:f});
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({id:'u'});mockPrisma.oP.findUnique.mockResolvedValue({numero:'097'});mockPrisma.pecaConjunto.findMany.mockResolvedValue([{marca:'0012',qte:10,pesoUnitKg:20}]);});
it('confere uma lista sem gravar, com catálogo restrito à OP e incluindo destino nulo',async()=>{
 const f=new FormData();f.set('opId','op097');f.set('texto','Marca\tQuantidade\n0012\t2');const r=await POST(request(f));expect(r.status).toBe(200);expect((await r.json()).linhas[0].item).toMatchObject({marca:'0012',qte:2,pesoTotal:40});
 expect(mockPrisma.pecaConjunto.findMany.mock.calls[0][0].where).toEqual({opId:'op097',OR:[{destino:null},{destino:{not:'CANCELADA'}}]});expect(mockPrisma.romaneioTerceiro.create).not.toHaveBeenCalled();
});
it('preserva marca numérica formatada com zeros no XLSX e quantidade numérica',async()=>{
 const ws=XLSX.utils.aoa_to_sheet([['Marca','Quantidade'],[12,3]]);ws.A2.z='0000';const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Itens');const f=new FormData();f.set('opId','op097');f.set('arquivo',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})]),'itens.xlsx');const r=await POST(request(f));expect(r.status).toBe(200);expect((await r.json()).linhas[0].item).toMatchObject({marca:'0012',qte:3,pesoTotal:60});
});
it('lê CSV com aspas e vírgula decimal sem confundir peso unitário com total',async()=>{
 const f=new FormData();f.set('opId','op097');f.set('arquivo',new Blob(['Marca;Quantidade;Peso unitário (kg)\n0012;2;"12,50"']),'itens.csv');const r=await POST(request(f));expect(r.status).toBe(200);const j=await r.json();expect(j.linhas[0].item).toMatchObject({marca:'0012',qte:2,pesoTotal:25});
});
it('rejeita extensão inválida e falta de OP',async()=>{
 const f=new FormData();expect((await POST(request(f))).status).toBe(400);f.set('opId','op097');f.set('arquivo',new Blob(['texto']),'teste.pdf');expect((await POST(request(f))).status).toBe(400);
});
it('exige permissão antes de ler os dados',async()=>{
 mocks.role.mockRejectedValue(new Error('Forbidden'));expect((await POST(request(new FormData()))).status).toBe(403);expect(mockPrisma.oP.findUnique).not.toHaveBeenCalled();
});
