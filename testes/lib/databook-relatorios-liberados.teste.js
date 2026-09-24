import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{relatorioInspecao:{findMany:vi.fn()},envioAssinatura:{findMany:vi.fn()}}}));
import {prisma} from '@/lib/prisma';
import {relatorioLiberado,filtrarRelatoriosLiberados} from '@/lib/databook-relatorios-liberados';
const rel={id:'r1',documentoId:'d1',opNumero:'102',status:'EMITIDO',resultadoInspecao:'APROVADO',revisao:0,envioAssinaturaId:'e1'};
const envio={id:'e1',revisao:0,status:'CONCLUIDO',assinaturas:[{assinadoEm:new Date(),revisaoPedidaEm:null}]};
beforeEach(()=>{vi.clearAllMocks();prisma.relatorioInspecao.findMany.mockResolvedValue([rel]);prisma.envioAssinatura.findMany.mockResolvedValue([envio]);});
describe('Data Book exige aprovação e assinaturas da revisão vigente',()=>{
 it('aceita apenas o relatório emitido, aprovado e totalmente assinado',()=>expect(relatorioLiberado(rel,envio)).toBe(true));
 it.each([null,'REPROVADO','REC'])('recusa resultado %s mesmo assinado',resultadoInspecao=>expect(relatorioLiberado({...rel,resultadoInspecao},envio)).toBe(false));
 it('não aceita rascunho, ausência de envio ou ausência de assinantes',()=>{
 expect(relatorioLiberado({...rel,status:'RASCUNHO'},envio)).toBe(false);
 expect(relatorioLiberado(rel,null)).toBe(false);
 expect(relatorioLiberado(rel,{...envio,assinaturas:[]})).toBe(false);
 });
 it('recusa assinatura parcial, revisão pedida e assinatura de revisão anterior',()=>{
 expect(relatorioLiberado(rel,{...envio,assinaturas:[...envio.assinaturas,{assinadoEm:null}]})).toBe(false);
 expect(relatorioLiberado(rel,{...envio,status:'REVISAO_PEDIDA'})).toBe(false);
 expect(relatorioLiberado({...rel,revisao:1},envio)).toBe(false);
 });
 it('filtra pendentes já vinculados, mantendo outros documentos',async()=>{
 prisma.envioAssinatura.findMany.mockResolvedValue([{...envio,assinaturas:[]}]);
 const certificado={id:'c1',origem:'importacao_planilha'};
 expect(await filtrarRelatoriosLiberados([{id:'d1',origem:'inspecao_campo',opNumero:'102'},certificado])).toEqual([certificado]);
 });
 it('recusa origem inspeção sem relatório correspondente',async()=>{
 prisma.relatorioInspecao.findMany.mockResolvedValue([]);
 expect(await filtrarRelatoriosLiberados([{id:'perdido',origem:'inspecao_campo',opNumero:'102'}])).toEqual([]);
 });
 it('erro no banco não libera documentos silenciosamente',async()=>{
 prisma.relatorioInspecao.findMany.mockRejectedValue(new Error('offline'));
 await expect(filtrarRelatoriosLiberados([{id:'d1',origem:'inspecao_campo'}])).rejects.toThrow('offline');
 });
});

it('cópia no servidor não contorna assinatura pendente',async()=>{
 prisma.relatorioInspecao.findMany.mockResolvedValue([{...rel,codigo:'RIP-102-001'}]);
 prisma.envioAssinatura.findMany.mockResolvedValue([{...envio,assinaturas:[]}]);
 expect(await filtrarRelatoriosLiberados([{id:'externo',nome:'RIP-102-001 - Relatório de pintura',origem:'servidor',opNumero:'102'}])).toEqual([]);
});
it('URL de revisão anterior não herda assinaturas atuais',async()=>{
 expect(await filtrarRelatoriosLiberados([{id:'d1',origem:'inspecao_campo',opNumero:'102',arquivoUrl:'/api/qualidade/inspecoes/r1/pdf?revisao=1'}])).toEqual([]);
});
