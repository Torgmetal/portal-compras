import {describe,it,expect,vi,beforeEach} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import fs from 'node:fs';
import {mockPrisma} from '../apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/databook-ficha-r',()=>({fichasPorR:async()=>new Map(),comFicha:d=>d}));
vi.mock('@/lib/databook-arquivo',()=>({resolverDriveServidor:async()=>null,baixarDocumento:vi.fn()}));
vi.mock('@/lib/databook-lpc',()=>({montarSecaoLpc:async()=>({conjuntos:[]})}));
vi.mock('@/lib/relatorio-form-pdf',()=>({imagemAssinada:vi.fn()}));
import {gerarDataBookPDF} from '../../lib/databook-pdf';
import {extractText} from 'unpdf';
const book={id:'demo',opNumero:'122',cliente:'TMSA · Exemplo de validação',obra:'Exemplo de obra para conferência visual',revisao:0,status:'EM_MONTAGEM',secoes:[],assinaturas:[]};
beforeEach(()=>{mockPrisma.oP.findFirst.mockResolvedValue({refCliente:'TPR-701 e TPR-702',referencias:[{rotulo:'TPR',codigo:'701'},{rotulo:'TPR',codigo:'702'}]});});
describe('PDF com template persistido',()=>{
  it.each(['TORG_2026','LEGADO'])('gera %s preservando identificação e conteúdo',async templateVisual=>{
    mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({...book,templateVisual});
    const out=await gerarDataBookPDF('demo',{anexos:false});
    const pdf=await PDFDocument.load(out.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    const txt=await extractText(new Uint8Array(out.bytes),{mergePages:true});
    expect(txt.text).toContain('TMSA');
    expect(txt.text).toContain(templateVisual==='LEGADO'?'DATA BOOK':'Data book');
    expect(txt.text).toContain('ASSINATURAS');
    if(process.env.GERAR_PREVIA_TEMPLATE){fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync(`tmp/pdfs/databook-${templateVisual}.pdf`,out.bytes);}
  });
  it('preserva referências extensas sem cortar os códigos',async()=>{
    mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({...book,templateVisual:'TORG_2026'});
    const referencias=Array.from({length:30},(_,i)=>({rotulo:'TAG',codigo:`IDENTIFICACAO-EXTENSA-DO-CLIENTE-${i}-XYZ`}));
    mockPrisma.oP.findFirst.mockResolvedValue({referencias});
    const out=await gerarDataBookPDF('demo',{anexos:false});
    const txt=await extractText(new Uint8Array(out.bytes),{mergePages:true});
    for(const r of referencias)expect(txt.text.replace(/\s/g,'')).toContain(r.codigo);
  });
});
