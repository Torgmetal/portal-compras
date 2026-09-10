import {it,expect,vi} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{}}));
const carregar=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/gantt-pcp',()=>({CAMPO:{JATO:{}},lotesProgramados:carregar}));
import {listaSemBancada} from '@/lib/lista-posto';
it('lista todas as datas e OPs sem bancada, mantendo frações e excluindo postos atribuídos',async()=>{
 const lote=(op,recurso,dia,q,f=0)=>({setor:'JATO',op,recurso,dia,obra:'Obra '+op,itens:[{id:op,m:'M'+op,q,kg:q*10,f,pf:'Perfil'}]});
 carregar.mockResolvedValue([lote('107',null,'2026-09-10',4,1),lote('112',null,'2026-10-01',6),lote('112','JATO_MANUAL','2026-09-10',8)]);
 const r=await listaSemBancada('JATO');
 expect(r.linhas).toHaveLength(2);expect(r.total.pecas).toBe(9);expect(r.total.kg).toBe(90);expect(r.total.ops).toEqual(['107','112']);
});
