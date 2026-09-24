import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/relatorio-render',()=>({gerarPDFdoRelatorio:vi.fn().mockResolvedValue(Buffer.from('pdf'))}));
vi.mock('@/lib/relatorio-dimensional',()=>({garantirDesenhos:vi.fn(),baixarDesenho:vi.fn()}));
vi.mock('@/lib/assinatura-cadastro',()=>({completarImagens:vi.fn(async a=>a)}));
import {pdfDoRelatorio} from '@/lib/relatorio-pdf-fonte';
import {gerarPDFdoRelatorio} from '@/lib/relatorio-render';
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({id:'r1',tipo:'PINTURA',codigo:'RIP-102-001',opNumero:'102',revisao:0,status:'EMITIDO',resultadoInspecao:'APROVADO',envioAssinaturaId:'e1'});
 mockPrisma.envioAssinatura.findUnique.mockResolvedValue({id:'e1',revisao:0,status:'EM_ANDAMENTO',assinaturas:[{assinadoEm:null}]});
 mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
 mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
 mockPrisma.oP.findFirst.mockResolvedValue({});
});
it('PDF para o livro recusa pendência antes de renderizar',async()=>{
 await expect(pdfDoRelatorio('r1',{exigirOp:'102',exigirLiberado:true})).rejects.toMatchObject({status:409});
 expect(gerarPDFdoRelatorio).not.toHaveBeenCalled();
});
it('PDF individual continua disponível para revisar e assinar',async()=>{
 await pdfDoRelatorio('r1');
 expect(gerarPDFdoRelatorio).toHaveBeenCalledOnce();
});
it('PDF aprovado e assinado pode entrar no livro',async()=>{
 mockPrisma.envioAssinatura.findUnique.mockResolvedValue({id:'e1',revisao:0,status:'CONCLUIDO',assinaturas:[{assinadoEm:new Date()}]});
 await pdfDoRelatorio('r1',{exigirOp:'102',exigirLiberado:true});
 expect(gerarPDFdoRelatorio).toHaveBeenCalledOnce();
});
