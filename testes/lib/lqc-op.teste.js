import {expect,it} from 'vitest';
import {prepararOpDaLqc} from '@/lib/lqc-op';
const estudo = {id:'lqc',numero:312,ano:2026,cliente:'Cliente',obra:'Obra',updatedAt:new Date('2026-09-16'),orcamento:{id:'orc',numero:'312-26',valor:950},composicao:{resumos:[{area:'Área A',pesoTotal:100,classificacao:'LEVE',precoKg:5}],fixadoresRsKg:.3,bdi:{margem:10}}};
it('separa verba de compra do valor de venda negociado',()=>{
 const p=prepararOpDaLqc(estudo);
 expect(p.valorContrato).toBe(950);
 expect(p.itens.reduce((s,i)=>s+i.valorVerba,0)).toBe(530);
 expect(p.form.cliente).toBe('Cliente');
 expect(p.form.descricao).toContain('Área A');
 expect(p.precoCalculado).not.toBe(950);
});
it('não permite gerar segunda OP para orçamento já vinculado',()=>{
 expect(()=>prepararOpDaLqc({...estudo,orcamento:{...estudo.orcamento,opId:'op'}})).toThrow(/OP/);
});
it('exige orçamento vinculado para manter rastreabilidade da conversão',()=>{
 expect(()=>prepararOpDaLqc({...estudo,orcamento:null})).toThrow(/orçamento/);
});

import {vi} from 'vitest';
import {criarOpComOrigemLqc} from '@/lib/lqc-op-criar';
function banco() {
 const tx={estudoFabricacao:{findUnique:vi.fn().mockResolvedValue(estudo)},orcamento:{updateMany:vi.fn().mockResolvedValue({count:1})},auditLog:{create:vi.fn()}};
 return {tx,prisma:{$transaction:vi.fn(fn=>fn(tx))}};
}
it('recusa conversão de uma prévia desatualizada antes de criar a OP',async()=>{
 const {prisma}=banco(),criar=vi.fn();
 await expect(criarOpComOrigemLqc(prisma,{estudoId:'lqc',atualizadoEm:'antigo',userId:'u'},criar)).rejects.toThrow(/mudou/);
 expect(criar).not.toHaveBeenCalled();
});
it('vincula orçamento e audita na mesma transação da OP',async()=>{
 const {prisma,tx}=banco(),criar=vi.fn().mockResolvedValue({id:'op',numero:'123'});
 await criarOpComOrigemLqc(prisma,{estudoId:'lqc',atualizadoEm:estudo.updatedAt.toISOString(),userId:'u'},criar);
 expect(criar).toHaveBeenCalledWith(tx,expect.objectContaining({estudoId:'lqc'}));
 expect(tx.orcamento.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'orc',opId:null}}));
 expect(tx.auditLog.create).toHaveBeenCalled();
});
it('aborta a transação se outra requisição já converteu o orçamento',async()=>{
 const {prisma,tx}=banco();tx.orcamento.updateMany.mockResolvedValue({count:0});
 await expect(criarOpComOrigemLqc(prisma,{estudoId:'lqc',atualizadoEm:estudo.updatedAt.toISOString(),userId:'u'},async()=>({id:'op'}))).rejects.toThrow(/vinculado/);
 expect(tx.auditLog.create).not.toHaveBeenCalled();
});
it('preserva categoria e faturamento direto dos itens comerciais',()=>{
 const p=prepararOpDaLqc({...estudo,composicao:{...estudo.composicao,itensComerciais:{TELHA_SIMPLES:{qtd:10,preco:100}},faturamento:{itensComerciais:'DIRETO'}}});
 expect(p.itens.find(i=>i.categoria==='TELHAS')).toMatchObject({valorVerba:1000,faturamentoDireto:true});
});
