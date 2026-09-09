import {beforeEach,describe,expect,it,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u1',name:'Comercial',email:'comercial@example.test'})}));
vi.mock('@/lib/email',()=>({sendEmail:vi.fn().mockResolvedValue({ok:true})}));
import {sendEmail} from '@/lib/email';
import {POST,GET} from '@/app/api/comercial/estudos/cotacao/route';
import {GET as getPublico} from '@/app/api/consulta-tinta/[token]/route';
import {POST as salvarFicha,PUT as vincular} from '@/app/api/comercial/produtos/tintas/route';
const fornecedores=[{id:'f1',razaoSocial:'Distribuidor A',email:'a@example.test',categorias:['TINTA'],fabricanteTinta:'WEG'},{id:'f2',razaoSocial:'Distribuidor B',email:'b@example.test',categorias:['TINTA'],fabricanteTinta:'Jotun'}];
const ficha={id:'w',fabricante:'WEG',produto:'WEG produto',categoria:'TINTA',tipo:'PRIMER',solidosVol:80,secaMin:80,secaMax:150,boletimRevisao:'R1',boletimData:'2026-08-01',boletimNome:'weg.pdf',boletimUrl:'https://files.example.test/weg.pdf',conferidoEm:'2026-08-01',ativo:true};
const j={...ficha,id:'j',fabricante:'Jotun',produto:'Jotun produto',boletimNome:'jotun.pdf',boletimUrl:'https://files.example.test/jotun.pdf'};
const body={estudoId:'e',tipo:'TINTA',fornecedorIds:['f1','f2'],snapshot:{camadas:[{id:'d',camada:'Primer',tipo:'PRIMER',solidos:80,peliculaSeca:100,areaM2:120,perda:35,produto:'ADULTERADO',custo:10}],assunto:'Consulta teste',mensagem:'Confirmar aplicação',prazoResposta:'2026-09-15'}};
const req=b=>new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.fornecedor.findMany.mockResolvedValue(fornecedores);
 mockPrisma.produtoTinta.findMany.mockResolvedValue([ficha,j]);
 mockPrisma.produtoTinta.findFirst.mockResolvedValue(null);
 mockPrisma.estudoFabricacao.findUnique.mockResolvedValue({numero:1,ano:2026,orcamento:{cliente:'Cliente',obra:'Obra'}});
 mockPrisma.cotacaoEstudo.create.mockImplementation(async({data})=>({id:'cot',fornecedores:data.fornecedores.create.map((f,i)=>({...f,id:`cf${i}`}))}));
 mockPrisma.cotacaoEstudoFornecedor.update.mockResolvedValue({});
 mockPrisma.auditLog.create.mockResolvedValue({});
});
describe('prévia e envio reais com serviços mockados',()=>{
 it('prévia sem escrita ou e-mail; cada HTML contém somente seu fabricante',async()=>{
  const r=await POST(req({...body,previa:true}));expect(r.status).toBe(200);
  const p=await r.json();expect(p.destinatarios).toHaveLength(2);expect(p.confirmacao).toMatch(/^[a-f0-9]{64}$/);
  expect(p.destinatarios[0].mensagem.html).toContain('WEG produto');expect(p.destinatarios[0].mensagem.html).not.toContain('Jotun');
  expect(p.destinatarios[1].mensagem.html).toContain('Jotun produto');expect(p.destinatarios[1].mensagem.html).not.toContain('WEG');
  expect(JSON.stringify(p)).not.toMatch(/ADULTERADO|custo/);expect(sendEmail).not.toHaveBeenCalled();expect(mockPrisma.cotacaoEstudo.create).not.toHaveBeenCalled();
 });
 it('requer revisão e invalida confirmação quando ficha muda',async()=>{
  expect((await POST(req(body))).status).toBe(409);
  const p=await (await POST(req({...body,previa:true}))).json();
  mockPrisma.produtoTinta.findMany.mockResolvedValue([{...ficha,boletimRevisao:'R2'},j]);
  expect((await POST(req({...body,confirmacao:p.confirmacao}))).status).toBe(409);expect(sendEmail).not.toHaveBeenCalled();
 });
 it('congela o snapshot individual e envia só aos selecionados',async()=>{
  mockPrisma.fornecedor.findMany.mockResolvedValue([fornecedores[1]]);
  const b={...body,fornecedorIds:['f2']};const p=await (await POST(req({...b,previa:true}))).json();
  expect((await POST(req({...b,confirmacao:p.confirmacao}))).status).toBe(200);
  expect(sendEmail).toHaveBeenCalledTimes(1);const email=sendEmail.mock.calls[0][0];expect(email.to).toBe('b@example.test');expect(email.html).not.toContain('WEG');expect(email.html).toContain('35% de perda');
  const criado=mockPrisma.cotacaoEstudo.create.mock.calls[0][0].data;
  expect(criado.fornecedores.create[0].snapshot.camadas[0].boletim.revisao).toBe('R1');expect(criado.fornecedores.create[0].snapshot.camadas[0].produto).toBe('Jotun produto');
 });
 it('rejeita fabricante adulterado, fornecedor ausente e família errada',async()=>{
  expect((await POST(req({...body,escolhas:{'f2:d':'w'},previa:true}))).status).toBe(400);
  mockPrisma.fornecedor.findMany.mockResolvedValue([fornecedores[0]]);expect((await POST(req({...body,previa:true}))).status).toBe(400);
  mockPrisma.fornecedor.findMany.mockResolvedValue([{...fornecedores[0],categorias:['PARAFUSOS']}]);expect((await POST(req({...body,fornecedorIds:['f1'],previa:true}))).status).toBe(400);
 });
 it('GET oferece fabricante e catálogo persistidos',async()=>{
  const r=await GET(new Request('http://localhost/api?tipo=TINTA'));
  const p=await r.json();expect(p.boletins[0].id).toBe('w');expect(p.fornecedores[1].fabricanteTinta).toBe('Jotun');
 });
 it('consulta pública lê snapshot próprio sem dados do envelope comum',async()=>{
  mockPrisma.cotacaoEstudoFornecedor.findUnique.mockResolvedValue({nome:'Distribuidor B',snapshot:{versao:2,camadas:[{produto:'Jotun produto'}]},cotacao:{tipo:'TINTA',estudoId:'e',snapshot:{camadas:[{produto:'WEG produto'}],custo:100}}});
  const r=await getPublico(null,{params:Promise.resolve({token:'t'})});const p=await r.json();expect(p.consulta.camadas[0].produto).toBe('Jotun produto');expect(JSON.stringify(p)).not.toMatch(/WEG|custo/);
 });
});
describe('cadastro conferido e vínculo',()=>{
 it('salva revisão conferida e preserva PDF/dados anteriores no histórico',async()=>{
  mockPrisma.produtoTinta.findUnique.mockResolvedValue(ficha);mockPrisma.produtoTinta.update.mockImplementation(async({data})=>({...data,id:'w'}));
  const r=await salvarFicha(req({...ficha,boletimRevisao:'R2',conferido:true}));expect(r.status).toBe(200);
  const dados=mockPrisma.produtoTinta.update.mock.calls[0][0].data;expect(dados.historicoBoletins[0].boletimRevisao).toBe('R1');expect(dados.historicoBoletins[0].boletimUrl).toBe(ficha.boletimUrl);expect(dados.conferidoEm).toBeInstanceOf(Date);
 });
 it('rejeita duplicata fabricante/produto sem id e exige revisão do registro existente',async()=>{
  mockPrisma.produtoTinta.findFirst.mockResolvedValue({id:'w'});
  const {id,...nova}=ficha;
  const r=await salvarFicha(req({...nova,fabricante:'weg',produto:'weg produto',boletimRevisao:'R2',conferido:true}));
  expect(r.status).toBe(409);expect(mockPrisma.produtoTinta.create).not.toHaveBeenCalled();
 });
 it('bloqueia cadastro sem conferência e vínculo a fornecedor de outra família',async()=>{
  expect((await salvarFicha(req({...ficha,conferido:false}))).status).toBe(400);
  mockPrisma.fornecedor.findUnique.mockResolvedValue({...fornecedores[0],ativo:true,categorias:['PARAFUSOS']});
  expect((await vincular(req({fornecedorId:'f1',fabricanteTinta:'Jotun'}))).status).toBe(404);
 });
});
