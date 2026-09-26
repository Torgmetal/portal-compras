import {expect,it,vi,afterEach,beforeEach} from 'vitest';
vi.mock('@/lib/sharepoint',()=>({getAccessToken:vi.fn().mockResolvedValue('teste')}));
vi.mock('@/lib/estudo-comercial',()=>({lerEstudoComercial:vi.fn().mockResolvedValue({aco:{},custos:{}})}));
// ⚠⚠ A ORIGEM DEIXOU DE SER UMA BUSCA (26/09/2026): `root/search(q={nome})` devolve HTTP 500 neste
// drive desde 22–23/09, e gerar OP a partir da LQC parou sem avisar ninguém. Agora o arquivo vem
// da varredura de pastas — a paginação, que estes testes cobriam aqui, é de `sharepoint-arvore`.
vi.mock('@/lib/lqc-sharepoint',()=>({
 varrerPastasDeLqc:vi.fn(),
 lerNomeLqc:(n)=>{const m=String(n).match(/^LQC-(\d{3})-(\d{2})/i);return m?{numero:Number(m[1]),ano:Number(m[2]),revisao:0,variante:null}:null;},
}));
import {varrerPastasDeLqc} from '@/lib/lqc-sharepoint';
import {lerFonteLqc,prepararOpConferida} from '@/lib/lqc-op-servidor';
const naPasta=(...arquivos)=>varrerPastasDeLqc.mockResolvedValue({arquivos,semEstudos:[],pastas:1});
const lqc=(id,nome)=>({id,nome,caminho:'/Comercial/1. Orçamento/ORÇAMENTOS_2026/2. Concluidos/123-26-OS1/5.Estudos'});
beforeEach(()=>{varrerPastasDeLqc.mockReset();});
const e={id:'e',numero:123,ano:2026,updatedAt:new Date('2026-09-16'),cliente:'Cliente',orcamento:{id:'o',numero:'123-26',valor:950},composicao:{origemSharePoint:'LQC-123-26-OS1-R00.xlsx',resumos:[{area:'A',pesoTotal:100,precoKg:5}]}};
const json=j=>new Response(JSON.stringify(j),{headers:{'content-type':'application/json'}});
afterEach(()=>vi.unstubAllGlobals());
it('seleciona o nome EXATO e usa metadados frescos antes e depois do download',async()=>{
 naPasta(lqc('outra','LQC-123-26-OS2-R00.xlsx'),lqc('certa',e.composicao.origemSharePoint));
 const f=vi.fn().mockResolvedValueOnce(json({id:'certa',name:e.composicao.origemSharePoint,eTag:'v1'}))
 .mockResolvedValueOnce(new Response('arquivo')).mockResolvedValueOnce(json({eTag:'v1'}));
 vi.stubGlobal('fetch',f);const fonte=await lerFonteLqc(e);
 expect(fonte.arquivo).toMatchObject({id:'certa',etag:'v1'});expect(fonte.arquivo.sha256).toHaveLength(64);
 expect(f.mock.calls[1][0]).toContain('/items/certa/content');
});
it('⚠ procura no ANO DO NOME da planilha, não no ano corrente',async()=>{
 // A varredura é por pasta de ano; a busca antiga era do drive inteiro. "LQC-123-26" → 2026.
 naPasta(lqc('certa',e.composicao.origemSharePoint));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json({id:'certa',name:e.composicao.origemSharePoint,eTag:'v1'}))
 .mockResolvedValueOnce(new Response('arquivo')).mockResolvedValueOnce(json({eTag:'v1'})));
 await lerFonteLqc(e);
 expect(varrerPastasDeLqc).toHaveBeenCalledWith(2026);
});
it('não escolhe silenciosamente entre duas cópias nem baixa uma OS diferente',async()=>{
 naPasta(lqc('1',e.composicao.origemSharePoint),lqc('2',e.composicao.origemSharePoint));
 const f=vi.fn();vi.stubGlobal('fetch',f);
 await expect(lerFonteLqc(e)).rejects.toThrow(/mais de uma/);expect(f).not.toHaveBeenCalled();
});
it('⚠ o MESMO item listado duas vezes não vira "duas cópias" — o de-dup é pelo id',async()=>{
 naPasta(lqc('1',e.composicao.origemSharePoint),lqc('1',e.composicao.origemSharePoint));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json({id:'1',name:e.composicao.origemSharePoint,eTag:'v1'}))
 .mockResolvedValueOnce(new Response('arquivo')).mockResolvedValueOnce(json({eTag:'v1'})));
 await expect(lerFonteLqc(e)).resolves.toMatchObject({arquivo:{id:'1'}});
});
it('recusa arquivo alterado durante o download',async()=>{
 naPasta(lqc('1',e.composicao.origemSharePoint));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json({id:'1',name:e.composicao.origemSharePoint,eTag:'v1'}))
 .mockResolvedValueOnce(new Response('arquivo')).mockResolvedValueOnce(json({eTag:'v2'})));
 await expect(lerFonteLqc(e)).rejects.toThrow(/mudou/);
});
it('não esconde falha do servidor nem usa custos antigos como se estivessem conferidos',async()=>{
 varrerPastasDeLqc.mockRejectedValue(new Error('listar "/Comercial": HTTP 503'));
 await expect(prepararOpConferida(e)).rejects.toThrow(/503/);
});
it('assinatura muda com orçamento mesmo quando a LQC não é editada',async()=>{
 const ler=vi.fn().mockResolvedValue(null);
 const a=await prepararOpConferida(e,ler),b=await prepararOpConferida({...e,orcamento:{...e.orcamento,valor:1000}},ler);
 expect(a.conferencia.codigo).not.toBe(b.conferencia.codigo);
});
