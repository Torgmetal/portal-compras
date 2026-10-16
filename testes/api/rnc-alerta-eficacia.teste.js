import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
const m=vi.hoisted(()=>({send:vi.fn(),cron:vi.fn(),user:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/email',()=>({sendEmail:m.send}));
vi.mock('@/lib/cron-auth',()=>({temCronSecret:m.cron}));
vi.mock('@/lib/session',()=>({requireRole:m.user}));
vi.mock('@/lib/db-retry',()=>({aquecerBanco:vi.fn()}));
vi.mock('@/lib/cron-monitor',()=>({registrarExecucao:vi.fn()}));
vi.mock('@/lib/cron-trava',()=>({comTravaDeCron:async(_p,_job,fn)=>fn()}));
import {GET} from '@/app/api/cron/rnc-abertas/route';
const req=()=>new Request('http://localhost/api/cron/rnc-abertas');
const registro={id:'r1',numero:18,ano:2026,tipo:'INTERNA',data:new Date('2026-08-17T12:00:00Z'),status:'EM_ACAO',updatedAt:new Date('2026-09-01'),descricao:'Falha <teste>',opNumero:'T70'};
let logs, lote;
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));logs=[];lote=null;m.cron.mockReturnValue(true);m.send.mockResolvedValue({ok:true,id:'mail1'});m.user.mockResolvedValue({email:'admin@teste.local'});mockPrisma.naoConformidade.findMany.mockResolvedValue([registro]);mockPrisma.emailNotificacao.findMany.mockResolvedValue([{email:'qualidade@teste.local'}]);mockPrisma.auditLog.findMany.mockImplementation(async()=>logs);
mockPrisma.auditLog.findFirst.mockImplementation(async()=>lote?.diff.estado==='CONFIRMADO'?null:lote);
mockPrisma.auditLog.create.mockImplementation(async({data})=>{lote={id:'lote1',...data};return lote;});
mockPrisma.auditLog.update.mockImplementation(async({data})=>{Object.assign(lote,data);return lote;});mockPrisma.auditLog.createMany.mockImplementation(async({data})=>{logs.push(...data);return{count:data.length};});});
afterEach(()=>vi.useRealTimers());
it('não envia cobrança antes dos 60 dias, inclusive RNC antiga sem movimento',async()=>{vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));const r=await GET(req());expect(await r.json()).toMatchObject({enviado:false});expect(m.send).not.toHaveBeenCalled();});
it('avisa uma vez no final do prazo e não repete na execução seguinte',async()=>{const a=await GET(req());expect(await a.json()).toMatchObject({enviado:true,avisadas:1});const b=await GET(req());expect(await b.json()).toMatchObject({enviado:false});expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0].html).toContain('Falha &lt;teste&gt;');expect(m.send.mock.calls[0][0].subject).toContain('eficácia');});
it('falha de envio não consome aviso; próxima execução tenta novamente',async()=>{m.send.mockResolvedValueOnce({ok:false,error:'indisponível'});expect(await(await GET(req())).json()).toMatchObject({enviado:false});expect(await(await GET(req())).json()).toMatchObject({enviado:true,avisadas:1});expect(m.send).toHaveBeenCalledTimes(2);});
it('não encerra automaticamente nem envia para RNC já encerrada',async()=>{mockPrisma.naoConformidade.findMany.mockResolvedValue([{...registro,status:'ENCERRADA'}]);expect(await(await GET(req())).json()).toMatchObject({enviado:false});expect(m.send).not.toHaveBeenCalled();expect(mockPrisma.naoConformidade.update).not.toHaveBeenCalled();});
it('prévia manual não envia email nem consome o aviso da equipe',async()=>{m.cron.mockReturnValue(false);expect(await(await GET(req())).json()).toMatchObject({modo:'previa',enviado:false});expect(m.send).not.toHaveBeenCalled();expect(logs).toHaveLength(0);});
it('recupera vencimentos antigos ainda não avisados, após intervalo sem cron',async()=>{vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));expect(await(await GET(req())).json()).toMatchObject({enviado:true,avisadas:1});});

it('recupera o mesmo envio após confirmação falhar, mesmo com outra RNC vencendo',async()=>{
 mockPrisma.auditLog.createMany.mockRejectedValueOnce(new Error('banco indisponível'));
 expect((await GET(req())).status).toBe(500);
 mockPrisma.naoConformidade.findMany.mockResolvedValue([registro,{...registro,id:'r2',numero:19}]);
 expect(await(await GET(req())).json()).toMatchObject({enviado:true,avisadas:1});
 const [primeiro,segundo]=m.send.mock.calls.map(c=>c[0]);
 expect(segundo.idempotencyKey).toBe(primeiro.idempotencyKey);
 expect(segundo.html).toBe(primeiro.html);
 expect(segundo.html).not.toContain('RNC-019/26');
});
it('envio incerto além da janela do provedor exige verificação em vez de reenviar',async()=>{
 mockPrisma.auditLog.createMany.mockRejectedValueOnce(new Error('banco indisponível'));
 await GET(req());vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
 expect(await(await GET(req())).json()).toMatchObject({ok:false,enviado:false});
 expect(m.send).toHaveBeenCalledTimes(1);
});

it('timeout sem confirmação não é tratado como rejeição e não reenvia após 24h',async()=>{
 m.send.mockResolvedValueOnce({ok:false,indeterminado:true,error:'timeout'});
 await GET(req());vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
 expect(await(await GET(req())).json()).toMatchObject({ok:false,enviado:false});
 expect(m.send).toHaveBeenCalledTimes(1);
});
it('recusa posterior não apaga a incerteza de uma tentativa anterior',async()=>{
 m.send.mockResolvedValueOnce({ok:false,indeterminado:true,error:'timeout'});
 await GET(req());vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
 m.send.mockResolvedValueOnce({ok:false,indeterminado:false,error:'429'});
 await GET(req());vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
 expect(await(await GET(req())).json()).toMatchObject({ok:false,enviado:false});
 expect(m.send).toHaveBeenCalledTimes(2);
});
