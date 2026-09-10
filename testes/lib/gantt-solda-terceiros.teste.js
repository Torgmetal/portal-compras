import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:db,prismaDirect:db}));
vi.mock('@/lib/fila-setor',()=>({filasSemProgramacao:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/produzido-setor',()=>({lerProduzidoPorSetor:vi.fn().mockResolvedValue(()=>0)}));
import {aplicarRemanejo,lotesProgramados} from '@/lib/gantt-pcp';

let p;
beforeEach(()=>{
 vi.clearAllMocks();
 p={id:'c67',marca:'T67D48',opId:'op67',opNumero:'T67D',op:{numero:'067'},qte:1,pesoTotalKg:25,
  status:'TERCEIRIZADO',terceirizado:true,terceirizadoRecebidoEm:null,
  conjuntoCroquis:[{croquiId:'cr1',croqui:{qte:1,qteProduzida:1}}]};
 db.pecaConjunto.findMany.mockImplementation(async({where})=>{
  if(where.id || where.marca)return [p];
  return where.soldaDiaProgramado && p.soldaDiaProgramado ? [p] : [];
 });
 db.pecaConjunto.updateMany.mockImplementation(async({data})=>{Object.assign(p,data);return {count:1};});
 db.romaneioTerceiro.findMany.mockResolvedValue([]);
 db.liberacaoProducao.findMany.mockResolvedValue([]);
 db.grdLiberacao.findMany.mockResolvedValue([]);
 db.oP.findMany.mockImplementation(async({where})=>where.pcpNoQuadro===false ? [] : [{numero:'067'}]);
});

it('mantém a Solda na bancada ao reler o Gantt após salvar uma marca recebida do terceiro',async()=>{
 Object.assign(p,{status:'SOLDA',terceirizadoRecebidoEm:new Date('2026-09-09')});
 await aplicarRemanejo([{setor:'SOLDA',ids:[p.id],recurso:'SOLDA 1',dia:'2026-09-12'}],{name:'PCP'});
 const lotes=await lotesProgramados();
 expect(lotes).toContainEqual(expect.objectContaining({setor:'SOLDA',op:'067',recurso:'SOLDA 1',pecas:1,itens:[expect.objectContaining({id:p.id})]}));
 expect(p.terceirizado).toBe(true); // programação não altera o cadastro/recebimento
});

it('não reapresenta programação antiga da Solda após despacho para terceiro sem romaneio',async()=>{
 Object.assign(p,{destino:'TERCEIRO',soldaDiaProgramado:new Date('2026-09-12'),soldaBancada:'SOLDA 1'});
 const lotes=await lotesProgramados();
 expect(lotes.flatMap(l=>l.itens).some(i=>i.id===p.id)).toBe(false);
});

it('continua ocultando do Gantt a Solda de peça que tem saldo em romaneio de terceiro',async()=>{
 Object.assign(p,{soldaDiaProgramado:new Date('2026-09-12'),soldaBancada:'SOLDA 1',terceirizado:false});
 db.romaneioTerceiro.findMany.mockResolvedValue([{id:'r1',numero:1,status:'ENVIADO',opRefNumero:'067',itens:[{marca:p.marca,qte:1}],retornos:[]}]);
 db.conjuntoCroqui.findMany.mockResolvedValue([{conjuntoId:p.id,croquiId:'cr1'}]);
 const lotes=await lotesProgramados();
 expect(lotes.filter(l=>l.setor==='SOLDA').flatMap(l=>l.itens).some(i=>i.id===p.id)).toBe(false);
});
