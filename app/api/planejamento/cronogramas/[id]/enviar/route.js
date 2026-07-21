// GET  /api/planejamento/cronogramas/[id]/enviar — quem dá pra escolher: setores
//      da Torg (lista fixa) + contatos do cliente já registrados NA OP + histórico.
// POST — envia o cronograma em PDF (anexo) e REGISTRA na OP os contatos do
//      cliente usados, pra virem prontos no próximo envio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { gerarCronogramaPDF } from "@/lib/cronograma-pdf";
import { gerarCronogramaMSProjectXML } from "@/lib/cronograma-msproject-xml";
import { CONTATOS_TAREFAS } from "@/lib/contatos-tarefas";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const normEmail = (e) => String(e || "").trim().toLowerCase();

async function carregar(id) {
  return prisma.cronograma.findUnique({
    where: { id },
    include: {
      tarefas: true,
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
    setores: CONTATOS_TAREFAS,
    clientes: [...registrados, ...doCadastro],
    temOp: !!c.op?.id,
    historico: c.envios.map((e) => ({
      id: e.id, createdAt: e.createdAt, por: e.createdBy?.name || "—", enviados: e.enviados,
      destinatarios: Array.isArray(e.destinatarios) ? e.destinatarios : [],
    })),
  });
}

const schema = z.object({
  destinatarios: z.array(z.object({
    nome: z.string().optional().nullable(),
    email: z.string().email(),
    tipo: z.enum(["SETOR", "CLIENTE"]).default("SETOR"),
  })).min(1, "Escolha ao menos um destinatário."),
  mensagem: z.string().max(2000).optional().nullable(),
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

  // dedupe por e-mail
  const porEmail = new Map();
  for (const d of body.destinatarios) {
    const em = normEmail(d.email);
    if (em && !porEmail.has(em)) porEmail.set(em, { nome: (d.nome || "").trim() || null, email: em, tipo: d.tipo });
  }
  const destinatarios = [...porEmail.values()];

  // Vão os DOIS anexos: o PDF (visão de Gantt, pra leitura) e o XML do MS
  // Project (MSPDI), que o cliente abre no Project dele pra validar/comparar.
  let pdf, xml;
  try { pdf = await gerarCronogramaPDF(c, c.tarefas); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }
  try { xml = gerarCronogramaMSProjectXML(c, c.tarefas); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o XML do MS Project: " + (e?.message || "erro") }, { status: 500 }); }

  const op = c.opNumero || c.op?.numero || "";
  const cliente = c.op?.cliente ? ` · ${c.op.cliente}` : "";
  const assunto = `Cronograma ${op}${cliente}${c.titulo ? ` — ${c.titulo}` : ""}`;
  const periodo = `${fmtD(c.dataInicio)} a ${fmtD(c.dataFim)}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1F3C;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Cronograma — OP ${escapeHtml(op)}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Torg Metal · Estruturas Metálicas</p>
      </div>
      <div style="height:4px;background:#F4801F;"></div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
        ${body.mensagem ? `<p style="margin:0 0 14px;white-space:pre-wrap;line-height:1.55;">${escapeHtml(body.mensagem)}</p>` : `<p style="margin:0 0 14px;line-height:1.55;">Segue em anexo o cronograma atualizado${c.op?.cliente ? ` da obra ${escapeHtml(c.op.cliente)}` : ""}.</p>`}
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#576D7E;width:110px;">Obra</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(c.titulo || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#576D7E;">OP</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(op)}</td></tr>
          ${c.op?.refCliente ? `<tr><td style="padding:6px 0;color:#576D7E;">Ref. do cliente</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(c.op.refCliente)}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#576D7E;">Período</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(periodo)}</td></tr>
        </table>
        <p style="font-size:12px;color:#576D7E;margin:14px 0 0;border-top:1px solid #e5e7eb;padding-top:12px;">
          Seguem dois anexos:<br>
          • <b>${escapeHtml(pdf.filename)}</b> — o cronograma em PDF (visão de Gantt).<br>
          • <b>${escapeHtml(xml.filename)}</b> — o mesmo cronograma em XML do MS Project. Para abrir: <i>Arquivo → Abrir</i> e selecione o .xml.<br>
          <span style="display:inline-block;margin-top:10px;">Enviado por ${escapeHtml(user.name || "Planejamento Torg")} — pode responder este e-mail em caso de dúvida.</span>
        </p>
      </div>
    </div>`;

  const anexo = [
    { filename: pdf.filename, content: Buffer.from(pdf.bytes).toString("base64") },
    { filename: xml.filename, content: Buffer.from(xml.xml, "utf8").toString("base64") },
  ];
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
    data: { cronogramaId: c.id, destinatarios, mensagem: body.mensagem || null, assunto, enviados: ok, createdById: user.id },
  });
  await prisma.cronogramaRevisao.create({
    data: {
      cronogramaId: c.id,
      tipo: "TAREFA_ALTERADA",
      descricao: `Cronograma enviado para ${ok} destinatário${ok === 1 ? "" : "s"}${destinatarios.some((d) => d.tipo === "CLIENTE") ? " (incluindo o cliente)" : ""}`,
      diff: { destinatarios: destinatarios.map((d) => d.email), assunto },
      createdById: user.id,
    },
  }).catch(() => {});
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_CRONOGRAMA", entity: "Cronograma", entityId: c.id, diff: { enviados: ok, total: destinatarios.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true, enviados: ok, total: destinatarios.length, registrados });
}
