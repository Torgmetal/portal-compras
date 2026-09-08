import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks=vi.hoisted(()=>({
  requireRole:vi.fn(),sendEmail:vi.fn(),pacote:vi.fn(),sync:vi.fn(),contatos:vi.fn(),
  prisma:{cronograma:{findUnique:vi.fn()},cronogramaEnvio:{create:vi.fn()},cronogramaRevisao:{create:vi.fn()},auditLog:{create:vi.fn()},oP:{update:vi.fn()}},
}));
vi.mock("@/lib/session",()=>({requireRole:mocks.requireRole}));
vi.mock("@/lib/email",()=>({sendEmail:mocks.sendEmail}));
vi.mock("@/lib/cronograma-envio-pacote",()=>({prepararPacoteCronograma:mocks.pacote}));
vi.mock("@/lib/cronograma-syneco",()=>({aplicarAvancoSyneco:mocks.sync}));
vi.mock("@/lib/contatos-tarefas",()=>({getContatosTarefas:mocks.contatos}));
vi.mock("@/lib/prisma",()=>({prisma:mocks.prisma}));
import {POST} from "@/app/api/planejamento/cronogramas/[id]/enviar/route";
const opcoes={tipoEnvio:"ANDAMENTO",tituloCliente:"Galpão"};
const request=body=>new Request("http://localhost/api/planejamento/cronogramas/c1/enviar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const call=body=>POST(request(body),{params:{id:"c1"}});
beforeEach(()=>{
 vi.clearAllMocks();mocks.requireRole.mockResolvedValue({id:"u1",name:"Vitor",email:"teste@example.com"});
 mocks.prisma.cronograma.findUnique.mockResolvedValue({id:"c1",tarefas:[],op:null});
 mocks.sync.mockResolvedValue([]);mocks.pacote.mockResolvedValue({hash:"hash-valido",assunto:"Atualização de andamento",html:"<p>Olá</p>",anexos:[{filename:"Cronograma.pdf",content:"cGRm",contentType:"application/pdf"},{filename:"Cronograma.xml",content:"eG1s",contentType:"application/xml"}]});
 mocks.sendEmail.mockResolvedValue({ok:true});mocks.prisma.cronogramaEnvio.create.mockResolvedValue({});mocks.prisma.cronogramaRevisao.create.mockResolvedValue({});mocks.prisma.auditLog.create.mockResolvedValue({});
});
describe("conferência e confirmação do envio",()=>{
 it("prévia é somente leitura, não envia nem grava contatos ou histórico",async()=>{
  const r=await call({acao:"PREVIA",opcoes});expect(r.status).toBe(200);expect((await r.json()).anexos).toHaveLength(2);
  expect(mocks.sendEmail).not.toHaveBeenCalled();expect(mocks.prisma.cronogramaEnvio.create).not.toHaveBeenCalled();expect(mocks.prisma.cronogramaRevisao.create).not.toHaveBeenCalled();expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();expect(mocks.prisma.oP.update).not.toHaveBeenCalled();
 });
 it.each([undefined,"antiga"])("recusa confirmação ausente/desatualizada: %s",async hash=>{
  const r=await call({acao:"ENVIAR",opcoes,previaHash:hash,destinatarios:[{email:"cliente@example.com"}]});expect(r.status).toBe(409);expect(mocks.sendEmail).not.toHaveBeenCalled();
 });
 it("envia o pacote conferido e registra o tipo sem criar alteração de tarefa",async()=>{
  const r=await call({acao:"ENVIAR",opcoes,previaHash:"hash-valido",destinatarios:[{email:"cliente@example.com"},{email:"CLIENTE@example.com"}]});expect(r.status).toBe(200);expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  expect(mocks.sendEmail.mock.calls[0][0].attachments).toHaveLength(2);expect(mocks.prisma.cronogramaRevisao.create.mock.calls[0][0].data.tipo).toBe("ENVIO_CRONOGRAMA");expect(mocks.prisma.auditLog.create.mock.calls[0][0].data.diff.tipoEnvio).toBe("ANDAMENTO");
 });
 it("não relata sucesso se nenhum e-mail foi enviado",async()=>{
  mocks.sendEmail.mockResolvedValue({ok:false});const r=await call({opcoes,previaHash:"hash-valido",destinatarios:[{email:"cliente@example.com"}]});expect(r.status).toBe(502);expect((await r.json()).success).toBe(false);
 });
 it("nega sem permissão antes de acessar dados",async()=>{
  mocks.requireRole.mockRejectedValue(new Error("Unauthorized"));expect((await call({acao:"PREVIA",opcoes})).status).toBe(401);expect(mocks.prisma.cronograma.findUnique).not.toHaveBeenCalled();
 });
 it("valida o tipo e os campos de revisão antes de preparar anexos",async()=>{
  expect((await call({acao:"PREVIA",opcoes:{tipoEnvio:"REVISAO",tituloCliente:"Obra"}})).status).toBe(400);expect(mocks.pacote).not.toHaveBeenCalled();
 });
});
