import {vi,it,expect,beforeEach} from 'vitest';
import * as XLSX from 'xlsx';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:db}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u1'})}));
import {POST} from '@/app/api/expedicao/terceiros/[id]/importar-retorno/route';
beforeEach(()=>{db.romaneioTerceiro.findUnique.mockResolvedValue({opRefNumero:'097',itens:[{marca:'M1',qte:10,pesoTotal:100}],retornos:[]})});
it('lê XLSX real e cruza OP e marca sem gravar',async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['OP','Marca','Quantidade'],['097','M1',3],['098','M1',2]]),'Retorno');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const form=new FormData();form.append('arquivo',new File([buffer],'retorno.xlsx'));const res=await POST(new Request('http://localhost',{method:'POST',body:form}),{params:{id:'r1'}});const j=await res.json();expect(res.status).toBe(200);expect(j.linhas[0].erro).toBe('');expect(j.linhas[1].erro).toContain('OP');expect(j.documentoHash).toHaveLength(64);expect(db.romaneioTerceiro.updateMany).not.toHaveBeenCalled()});
it('PDF sem serviço disponível informa alternativa, não inventa linhas',async()=>{const key=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;try{const form=new FormData();form.append('arquivo',new File(['%PDF-1.7'],'r.pdf'));const res=await POST(new Request('http://localhost',{method:'POST',body:form}),{params:{id:'r1'}});expect(res.status).toBe(400);expect((await res.json()).error).toContain('planilha')}finally{if(key)process.env.ANTHROPIC_API_KEY=key}});
