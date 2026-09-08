// GET  /api/planejamento/cronogramas/[id]/enviar — quem dá pra escolher: setores
//      da Torg (lista fixa) + contatos do cliente já registrados NA OP + histórico.
// POST — envia o cronograma em PDF (anexo) e REGISTRA na OP os contatos do
//      cliente usados, pra virem prontos no próximo envio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { aplicarAvancoSyneco } from "@/lib/cronograma-syneco";
import { opcoesEnvioCronogramaSchema } from "@/lib/cronograma-envio";
import { prepararPacoteCronograma } from "@/lib/cronograma-envio-pacote";
import { getContatosTarefas } from "@/lib/contatos-tarefas";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const normEmail = (e) => String(e || "").trim().toLowerCase();

async function carregar(id) {
  return prisma.cronograma.findUnique({
    where: { id },
    include: {
      tarefas: { orderBy: [{ uidMpp: "asc" }, { id: "asc" }] },
      op: { select: { id: true, numero: true, cliente: true, refCliente: true, clienteContato: true, clienteEmail: true, clienteContatos: true } },
      envios: { orderBy: { createdAt: "desc" }, take: 5, include: { createdBy: { select: { name: true } } } },
    },
  });
}

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const c = await carregar(params.id);
  if (!c) return NextResponse.json({ error: "Cronograma não encontrado" }, { status: 404 });

  // Contatos do cliente: os já registrados na OP + o contato "legado" do cadastro
  // da OP (clienteContato/clienteEmail), pra não obrigar a redigitar na 1ª vez.
  const registrados = Array.isArray(c.op?.clienteContatos) ? c.op.clienteContatos : [];
  const vistos = new Set(registrados.map((x) => normEmail(x.email)));
  const doCadastro = [];
  if (c.op?.clienteEmail && !vistos.has(normEmail(c.op.clienteEmail))) {
    doCadastro.push({ nome: c.op.clienteContato || c.op.cliente || "Cliente", email: c.op.clienteEmail, doCadastro: true });
  }

  return NextResponse.json({
    cronograma: { id: c.id, titulo: c.titulo, opNumero: c.opNumero, cliente: c.op?.cliente || null, dataInicio: c.dataInicio, dataFim: c.dataFim, tarefas: c.tarefas.length },
    tipoEnvioSugerido: c.envios.some(e => e.enviados > 0) ? "ANDAMENTO" : "INICIAL",
    temLinhaBase: c.tarefas.some(t => t.dataInicioBase && t.dataFimBase),
    setores: await getContatosTarefas(),
    clientes: [...registrados, ...doCadastro],
    temOp: !!c.op?.id,
    historico: c.envios.map((e) => ({
      id: e.id, assunto: e.assunto, createdAt: e.createdAt, por: e.createdBy?.name || "—", enviados: e.enviados,
      destinatarios: Array.isArray(e.destinatarios) ? e.destinatarios : [],
    })),
  });
}

const schema = z.object({
  acao: z.enum(["PREVIA", "ENVIAR"]).default("ENVIAR"),
  opcoes: opcoesEnvioCronogramaSchema,
  previaHash: z.string().max(64).optional(),
  destinatarios: z.array(z.object({
    nome: z.string().optional().nullable(),
    email: z.string().email(),
    tipo: z.enum(["SETOR", "CLIENTE"]).default("SETOR"),
  })).max(100).default([]),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const c = await carregar(params.id);
  if (!c) return NextResponse.json({ error: "Cronograma não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  if (body.acao === "ENVIAR" && !body.destinatarios.length) return NextResponse.json({ error: "Escolha ao menos um destinatário." }, { status: 400 });

  // dedupe por e-mail
  const porEmail = new Map();
  for (const d of body.destinatarios) {
    const em = normEmail(d.email);
    if (em && !porEmail.has(em)) porEmail.set(em, { nome: (d.nome || "").trim() || null, email: em, tipo: d.tipo });
  }
  const destinatarios = [...porEmail.values()];

  // Vão os DOIS anexos: o PDF (visão de Gantt, pra leitura) e o XML do MS
  // Project (MSPDI), que o cliente abre no Project dele pra validar/comparar.
  // Mesmo avanço do Syneco que a tela mostra, nos DOIS anexos (senão saem com o % defasado).
  c.tarefas = await aplicarAvancoSyneco(prisma, c.op?.id, c.op?.numero, c.tarefas);
  let pacote;
  try { pacote = await prepararPacoteCronograma(c, c.tarefas, body.opcoes, user); }
  catch { return NextResponse.json({ error: "Não foi possível preparar os anexos. Confira as datas do cronograma e tente novamente." }, { status: 422 }); }
  if (body.acao === "PREVIA") {
    return NextResponse.json({ assunto: pacote.assunto, html: pacote.html, anexos: pacote.anexos, previaHash: pacote.hash }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!body.previaHash || body.previaHash !== pacote.hash) {
    return NextResponse.json({ error: "O cronograma ou as opções mudaram. Confira novamente a prévia antes de enviar." }, { status: 409 });
  }
  const { assunto, html } = pacote;
  const anexo = pacote.anexos.map(({ filename, content }) => ({ filename, content }));
  let ok = 0;
  for (const d of destinatarios) {
    const r = await sendEmail({
      to: d.email,
      subject: assunto,
      html,
      attachments: anexo,
      replyTo: user.email || undefined,
    });
    if (r.ok) ok++;
  }

  // Registra na OP os contatos do CLIENTE usados — assim o próximo envio já vem
  // com eles marcados e ninguém precisa redigitar.
  let registrados = 0;
  if (c.op?.id) {
    const atuais = Array.isArray(c.op.clienteContatos) ? c.op.clienteContatos : [];
    const vistos = new Set(atuais.map((x) => normEmail(x.email)));
    const novos = destinatarios
      .filter((d) => d.tipo === "CLIENTE" && !vistos.has(d.email))
      .map((d) => ({ nome: d.nome || "", email: d.email }));
    if (novos.length) {
      await prisma.oP.update({ where: { id: c.op.id }, data: { clienteContatos: [...atuais, ...novos] } });
      registrados = novos.length;
    }
  }

  await prisma.cronogramaEnvio.create({
    data: { cronogramaId: c.id, destinatarios, mensagem: body.opcoes.mensagem || null, assunto, enviados: ok, createdById: user.id },
  });
  await prisma.cronogramaRevisao.create({
    data: {
      cronogramaId: c.id,
      tipo: "ENVIO_CRONOGRAMA",
      descricao: `Cronograma enviado para ${ok} destinatário${ok === 1 ? "" : "s"}${destinatarios.some((d) => d.tipo === "CLIENTE") ? " (incluindo o cliente)" : ""}`,
      diff: { destinatarios: destinatarios.map((d) => d.email), assunto, tipoEnvio: body.opcoes.tipoEnvio, revisao: body.opcoes.revisao || null, resumoAlteracoes: body.opcoes.resumoAlteracoes || null, previaHash: pacote.hash },
      createdById: user.id,
    },
  }).catch(() => {});
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_CRONOGRAMA", entity: "Cronograma", entityId: c.id, diff: { enviados: ok, total: destinatarios.length, tipoEnvio: body.opcoes.tipoEnvio, revisao: body.opcoes.revisao || null, previaHash: pacote.hash } },
  }).catch(() => {});

  return NextResponse.json({ success: ok > 0, enviados: ok, total: destinatarios.length, registrados, ...(ok === 0 ? { error: "Nenhum e-mail foi enviado. Verifique a configuração do serviço de e-mail antes de tentar novamente." } : {}) }, { status: ok > 0 ? 200 : 502 });
}
