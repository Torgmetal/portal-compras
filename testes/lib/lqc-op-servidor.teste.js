import {expect,it,vi,afterEach} from 'vitest';
vi.mock('@/lib/sharepoint',()=>({getAccessToken:vi.fn().mockResolvedValue('teste')}));
vi.mock('@/lib/estudo-comercial',()=>({lerEstudoComercial:vi.fn().mockResolvedValue({aco:{},custos:{}})}));
import {lerFonteLqc,prepararOpConferida} from '@/lib/lqc-op-servidor';
const e={id:'e',numero:123,ano:2026,updatedAt:new Date('2026-09-16'),cliente:'Cliente',orcamento:{id:'o',numero:'123-26',valor:950},composicao:{origemSharePoint:'LQC-123-26-OS1-R00.xlsx',resumos:[{area:'A',pesoTotal:100,precoKg:5}]}};
const json=j=>new Response(JSON.stringify(j),{headers:{'content-type':'application/json'}});
afterEach(()=>vi.unstubAllGlobals());
it('segue paginação, seleciona nome exato e usa metadados frescos antes/depois do download',async()=>{
 const f=vi.fn().mockResolvedValueOnce(json({value:[{id:'outra',name:'LQC-123-26-OS2-R00.xlsx'}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/next'}))
 .mockResolvedValueOnce(json({value:[{id:'certa',name:e.composicao.origemSharePoint,eTag:'indice-antigo'}]}))
 .mockResolvedValueOnce(json({id:'certa',name:e.composicao.origemSharePoint,eTag:'v1'}))
 .mockResolvedValueOnce(new Response('arquivo'))
 .mockResolvedValueOnce(json({eTag:'v1'}));
 vi.stubGlobal('fetch',f);const fonte=await lerFonteLqc(e);
 expect(fonte.arquivo).toMatchObject({id:'certa',etag:'v1'});expect(fonte.arquivo.sha256).toHaveLength(64);
 expect(f.mock.calls[3][0]).toContain('/items/certa/content');
});
it('não escolhe silenciosamente entre duas cópias nem baixa uma OS diferente',async()=>{
 const item={id:'1',name:e.composicao.origemSharePoint};
 const f=vi.fn().mockResolvedValue(json({value:[item,{...item,id:'2'}]}));vi.stubGlobal('fetch',f);
 await expect(lerFonteLqc(e)).rejects.toThrow(/mais de uma/);expect(f).toHaveBeenCalledTimes(1);
});
it('recusa arquivo alterado durante o download',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(json({value:[{id:'1',name:e.composicao.origemSharePoint}]}))
 .mockResolvedValueOnce(json({id:'1',name:e.composicao.origemSharePoint,eTag:'v1'})).mockResolvedValueOnce(new Response('arquivo')).mockResolvedValueOnce(json({eTag:'v2'})));
 await expect(lerFonteLqc(e)).rejects.toThrow(/mudou/);
});
it('não esconde falha do servidor nem usa custos antigos como se estivessem conferidos',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
 await expect(prepararOpConferida(e)).rejects.toThrow(/SharePoint/);
});
it('assinatura muda com orçamento mesmo quando a LQC não é editada',async()=>{
 const ler=vi.fn().mockResolvedValue(null);
 const a=await prepararOpConferida(e,ler),b=await prepararOpConferida({...e,orcamento:{...e.orcamento,valor:1000}},ler);
 expect(a.conferencia.codigo).not.toBe(b.conferencia.codigo);
});
